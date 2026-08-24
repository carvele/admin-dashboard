import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clock3, Laptop, Pencil, RefreshCw, ShieldAlert, ShieldCheck, Trash2, X, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { PageHeader } from '../../components/PageHeader';
import { toast } from 'sonner';
import './DeviceManagement.css';

const STATUS_FILTERS = [
  { key: 'all', label: 'All devices' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'revoked', label: 'Revoked' },
];

const formatDate = (value) => {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
};

const DeviceManagement = () => {
  const [devices, setDevices] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  const loadDevices = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('devices')
      .select('fingerprint, name, status, staff_email, staff_name, user_agent, last_seen, failed_attempts, lockout_until, updated_at')
      .order('last_seen', { ascending: false });
    if (error) {
      toast.error('Unable to load registered devices.');
      setLoading(false);
      return;
    }
    setDevices(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDevices();
    const channel = supabase
      .channel('admin-device-management')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, loadDevices)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadDevices]);

  const counts = useMemo(() => devices.reduce((result, device) => {
    result.all += 1;
    if (result[device.status] !== undefined) result[device.status] += 1;
    return result;
  }, { all: 0, pending: 0, approved: 0, revoked: 0 }), [devices]);

  const filteredDevices = useMemo(() => statusFilter === 'all'
    ? devices
    : devices.filter((device) => device.status === statusFilter), [devices, statusFilter]);

  const updateStatus = async (device, status) => {
    setBusyId(device.fingerprint);
    const { error } = await supabase.from('devices').update({ status, updated_at: new Date().toISOString() }).eq('fingerprint', device.fingerprint);
    setBusyId(null);
    if (error) {
      toast.error('Device status could not be updated.');
      return;
    }
    toast.success(`Device ${status}.`);
    await loadDevices();
  };

  const deleteDevice = async (device) => {
    const displayName = device.name || device.staff_name || device.fingerprint.slice(0, 12);
    if (!window.confirm(`Are you sure you want to delete "${displayName}"? This device will need to re-register on its next visit.`)) {
      return;
    }
    setBusyId(device.fingerprint);
    const { error } = await supabase.from('devices').delete().eq('fingerprint', device.fingerprint);
    setBusyId(null);
    if (error) {
      toast.error('Device could not be deleted.');
      return;
    }
    toast.success('Device deleted.');
    await loadDevices();
  };

  const pruneRevoked = async () => {
    if (counts.revoked === 0) return;
    if (!window.confirm(`Delete all ${counts.revoked} revoked device(s)? This action cannot be undone.`)) {
      return;
    }
    setLoading(true);
    const { error } = await supabase.from('devices').delete().eq('status', 'revoked');
    if (error) {
      toast.error('Failed to prune revoked devices.');
    } else {
      toast.success(`Pruned ${counts.revoked} revoked device(s).`);
    }
    await loadDevices();
  };

  const handleStartEdit = (device) => {
    setEditingId(device.fingerprint);
    setEditName(device.name || '');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const handleSaveName = async (device) => {
    const trimmed = editName.trim();
    setBusyId(device.fingerprint);
    const { error } = await supabase
      .from('devices')
      .update({ name: trimmed || null, updated_at: new Date().toISOString() })
      .eq('fingerprint', device.fingerprint);
    setBusyId(null);
    if (error) {
      toast.error('Failed to update device nickname.');
      return;
    }
    toast.success('Device nickname updated.');
    setEditingId(null);
    setEditName('');
    await loadDevices();
  };

  const statusIcon = (status) => status === 'approved'
    ? <ShieldCheck size={15} />
    : status === 'revoked' ? <XCircle size={15} /> : <Clock3 size={15} />;

  return (
    <div className="page-container">
      <PageHeader
        category="SECURITY"
        title="Device Management"
        subtitle="Review and control which devices can access the admin dashboard."
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {counts.revoked > 0 && (
              <button className="btn-outline" onClick={pruneRevoked} disabled={loading} style={{ color: 'var(--stock-low)' }}>
                <Trash2 size={16} /> Prune Revoked ({counts.revoked})
              </button>
            )}
            <button className="btn-outline" onClick={loadDevices} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
            </button>
          </div>
        }
      />

      <div className="device-stats">
        {STATUS_FILTERS.map((filter) => (
          <button key={filter.key} className={`device-stat-card ${statusFilter === filter.key ? 'active' : ''}`} onClick={() => setStatusFilter(filter.key)}>
            <span className="text-secondary">{filter.label}</span>
            <strong>{counts[filter.key]}</strong>
          </button>
        ))}
      </div>

      <section className="card">
        <div className="card-header flex-between">
          <div><h2 className="section-title">Registered devices</h2><p className="text-secondary">Changes take effect on the next device status check.</p></div>
          <ShieldAlert size={20} className="text-secondary" aria-label="Device access controls" />
        </div>
        {loading ? <div className="empty-state"><RefreshCw className="spin" /> Loading devices…</div> : filteredDevices.length === 0 ? (
          <div className="empty-state"><Laptop size={36} /><span>No devices in this view.</span></div>
        ) : (
          <div className="device-list">
            {filteredDevices.map((device) => (
              <article className="device-item" key={device.fingerprint}>
                <div className="device-icon-wrap"><Laptop size={22} /></div>
                <div className="device-info">
                  <div className="device-name-row">
                    {editingId === device.fingerprint ? (
                      <div className="edit-name-flow">
                        <input
                          type="text"
                          className="input-field small-input"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Device nickname..."
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveName(device);
                            if (e.key === 'Escape') handleCancelEdit();
                          }}
                        />
                        <button
                          type="button"
                          className="icon-btn-save"
                          onClick={() => handleSaveName(device)}
                          title="Save nickname"
                          aria-label="Save nickname"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn-cancel"
                          onClick={handleCancelEdit}
                          title="Cancel"
                          aria-label="Cancel"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <h4>{device.name || device.staff_name || 'Unnamed device'}</h4>
                        <button
                          type="button"
                          className="edit-icon-btn"
                          onClick={() => handleStartEdit(device)}
                          title="Edit nickname"
                          aria-label="Edit nickname"
                        >
                          <Pencil size={13} />
                        </button>
                      </>
                    )}
                  </div>
                  <div className="device-meta">{device.staff_email || 'Unassigned staff'} · Last seen {formatDate(device.last_seen)}</div>
                  <div className="device-fp">Fingerprint <code>{device.fingerprint}</code></div>
                  <div className="device-meta">{device.user_agent || 'Browser details unavailable'}</div>
                </div>
                <div className="device-actions">
                  <span className={`device-status status-${device.status || 'pending'}`}>{statusIcon(device.status)} {device.status || 'pending'}</span>
                  <div className="device-btns">
                    {device.status !== 'approved' && (
                      <button className="btn-sm btn-approve" disabled={busyId === device.fingerprint} onClick={() => updateStatus(device, 'approved')}>
                        <Check size={14} /> Approve
                      </button>
                    )}
                    {device.status !== 'revoked' && (
                      <button className="btn-sm btn-revoke" disabled={busyId === device.fingerprint} onClick={() => updateStatus(device, 'revoked')}>
                        <XCircle size={14} /> Revoke
                      </button>
                    )}
                    <button
                      className="btn-sm btn-delete"
                      disabled={busyId === device.fingerprint}
                      onClick={() => deleteDevice(device)}
                      title="Delete device"
                      aria-label="Delete device"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default DeviceManagement;

