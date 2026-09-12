import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clock3, Laptop, Pencil, RefreshCw, Scissors, ShieldAlert, ShieldCheck, Trash2, X, XCircle } from 'lucide-react';
import {
  getDevicesSnapshot,
  subscribeToDevices,
  updateDeviceStatus,
  deleteDevice as apiDeleteDevice,
  renameDevice as apiRenameDevice,
  pruneInactiveDevices,
} from '../../services/deviceService';
import { PageHeader } from '../../components/PageHeader';
import { toast } from 'sonner';
import ConfirmDialog from '../../components/ConfirmDialog';
import './DeviceManagement.css';

const STATUS_FILTERS = [
  { key: 'all', label: 'All devices' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'revoked', label: 'Revoked' },
];

const STALE_DAYS = 30;

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

  // Inline rename state
  const [editingFp, setEditingFp] = useState(null);
  const [editingName, setEditingName] = useState('');

  // Confirm dialogs
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [pruneConfirmOpen, setPruneConfirmOpen] = useState(false);
  const [pruneLoading, setPruneLoading] = useState(false);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDevicesSnapshot(201);
      // Realtime trimming contract: cap snapshot at 200
      setDevices(data.slice(0, 200));
    } catch {
      toast.error('Unable to load registered devices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
    const unsub = subscribeToDevices(loadDevices);
    return () => {
      unsub();
    };
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
    try {
      await updateDeviceStatus(device, status);
      toast.success(`Device ${status}.`);
      await loadDevices();
    } catch (err) {
      toast.error(err?.message || 'Device status could not be updated.');
    } finally {
      setBusyId(null);
    }
  };

  // ── Single device deletion ──
  const deleteDevice = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.fingerprint);
    try {
      await apiDeleteDevice(deleteTarget);
      toast.success('Device permanently removed.');
      setDeleteTarget(null);
      await loadDevices();
    } catch (err) {
      toast.error(err?.message || 'Device could not be deleted.');
    } finally {
      setBusyId(null);
    }
  };

  // ── Inline rename ──
  const startEditing = (device) => {
    setEditingFp(device.fingerprint);
    setEditingName(device.name || device.staff_name || '');
  };

  const cancelEditing = () => {
    setEditingFp(null);
    setEditingName('');
  };

  const saveNickname = async (device) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      toast.error('Device name cannot be empty.');
      return;
    }
    setBusyId(device.fingerprint);
    try {
      await apiRenameDevice(device, trimmed);
      toast.success('Device name updated.');
      cancelEditing();
      await loadDevices();
    } catch (err) {
      toast.error(err?.message || 'Failed to update device name.');
    } finally {
      setBusyId(null);
    }
  };

  // ── Prune inactive (revoked OR stale > 30 days) ──
  const pruneInactive = async () => {
    setPruneLoading(true);
    try {
      await pruneInactiveDevices(STALE_DAYS);
      toast.success('Inactive and revoked devices pruned.');
      setPruneConfirmOpen(false);
      await loadDevices();
    } catch {
      toast.error('Some devices could not be pruned. Please try again.');
    } finally {
      setPruneLoading(false);
    }
  };

  const statusIcon = (status) => status === 'approved'
    ? <ShieldCheck size={15} />
    : status === 'revoked' ? <XCircle size={15} /> : <Clock3 size={15} />;

  return (
    <div className="page-container">
      <PageHeader
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Device Management' }]}
        category="SECURITY"
        title="Device Management"
        subtitle="Review and control which devices can access the admin dashboard."
        actions={
          <div className="device-header-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn-outline btn-prune" onClick={() => setPruneConfirmOpen(true)} disabled={loading}>
              <Scissors size={16} /> Prune Inactive
            </button>
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
                    {editingFp === device.fingerprint ? (
                      <div className="edit-name-flow">
                        <input autoComplete="off"
                          id="device-nickname-input"
                          name="deviceNickname"
                          type="text"
                          className="input-field small-input"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveNickname(device);
                            if (e.key === 'Escape') cancelEditing();
                          }}
                          aria-label="Device nickname"
                        />
                        <button className="icon-btn-save" onClick={() => saveNickname(device)} disabled={busyId === device.fingerprint} aria-label="Save name">
                          <Check size={16} />
                        </button>
                        <button className="icon-btn-cancel" onClick={cancelEditing} aria-label="Cancel editing">
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <h4>{device.name || device.staff_name || 'Unnamed device'}</h4>
                        <button className="edit-icon-btn" onClick={() => startEditing(device)} aria-label="Rename device">
                          <Pencil size={14} />
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
                    {device.status !== 'approved' && <button className="btn-sm btn-approve" disabled={busyId === device.fingerprint} onClick={() => updateStatus(device, 'approved')}><Check size={14} /> Approve</button>}
                    {device.status !== 'revoked' && <button className="btn-sm btn-revoke" disabled={busyId === device.fingerprint} onClick={() => updateStatus(device, 'revoked')}><XCircle size={14} /> Revoke</button>}
                    <button className="btn-sm btn-delete" disabled={busyId === device.fingerprint} onClick={() => setDeleteTarget(device)} aria-label="Delete device">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Confirm: delete single device */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Device"
        message={`Permanently remove "${deleteTarget?.name || deleteTarget?.staff_name || 'this device'}" from the device registry? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
        isLoading={busyId === deleteTarget?.fingerprint}
        onConfirm={deleteDevice}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Confirm: prune inactive devices */}
      <ConfirmDialog
        isOpen={pruneConfirmOpen}
        title="Prune Inactive Devices"
        message={`This will permanently delete all revoked devices and any device not seen in the last ${STALE_DAYS} days. Active and recently seen devices are never affected.`}
        confirmText="Prune Now"
        cancelText="Cancel"
        isDestructive={true}
        isLoading={pruneLoading}
        onConfirm={pruneInactive}
        onCancel={() => setPruneConfirmOpen(false)}
      />
    </div>
  );
};

export default DeviceManagement;

