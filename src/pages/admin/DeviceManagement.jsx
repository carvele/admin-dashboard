import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clock3, Laptop, RefreshCw, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
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

  const statusIcon = (status) => status === 'approved'
    ? <ShieldCheck size={15} />
    : status === 'revoked' ? <XCircle size={15} /> : <Clock3 size={15} />;

  return (
    <div className="page-container">
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Device Management</h1>
          <p className="text-secondary">Review and control which devices can access the admin dashboard.</p>
        </div>
        <button className="btn-outline" onClick={loadDevices} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

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
                  <div className="device-name-row"><h4>{device.name || device.staff_name || 'Unnamed device'}</h4></div>
                  <div className="device-meta">{device.staff_email || 'Unassigned staff'} · Last seen {formatDate(device.last_seen)}</div>
                  <div className="device-fp">Fingerprint <code>{device.fingerprint}</code></div>
                  <div className="device-meta">{device.user_agent || 'Browser details unavailable'}</div>
                </div>
                <div className="device-actions">
                  <span className={`device-status status-${device.status || 'pending'}`}>{statusIcon(device.status)} {device.status || 'pending'}</span>
                  <div className="device-btns">
                    {device.status !== 'approved' && <button className="btn-sm btn-approve" disabled={busyId === device.fingerprint} onClick={() => updateStatus(device, 'approved')}><Check size={14} /> Approve</button>}
                    {device.status !== 'revoked' && <button className="btn-sm btn-revoke" disabled={busyId === device.fingerprint} onClick={() => updateStatus(device, 'revoked')}><XCircle size={14} /> Revoke</button>}
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
