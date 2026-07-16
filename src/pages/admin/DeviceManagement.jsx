import React, { useState, useEffect } from 'react';
import {
  Monitor,
  Smartphone,
  Tablet,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  Shield,
  Edit2,
  Check,
  X,
  Plus,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import { subscribeToDevices, logAction } from '../../services/staffService';
import { supabase } from '../../lib/supabaseClient';
import './DeviceManagement.css';

const DeviceManagement = () => {
  const { user, deviceFingerprint } = useAuth();
  const [devices, setDevices] = useState([]);
  const [filter, setFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [newName, setNewName] = useState('');

  // Parse platform from userAgent string
  const detectPlatform = (ua) => {
    if (!ua) return 'Unknown';
    if (/Mobi|Android/i.test(ua)) return 'Mobile';
    if (/iPad|tablet/i.test(ua)) return 'Tablet';
    return 'Desktop';
  };

  useEffect(() => {
    const unsub = subscribeToDevices((data) => {
      // Sort so pending devices are at the top
      setDevices(
        [...data].sort((a, b) => {
          if (a.status === 'pending' && b.status !== 'pending') return -1;
          if (a.status !== 'pending' && b.status === 'pending') return 1;
          const aTime = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
          const bTime = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
          return bTime - aTime;
        }),
      );
    });
    return () => unsub();
  }, []);

  const getDeviceIcon = (type) => {
    switch (type) {
      case 'mobile':
        return <Smartphone size={20} />;
      case 'tablet':
        return <Tablet size={20} />;
      default:
        return <Monitor size={20} />;
    }
  };

  const formatLastAccess = (isoOrLegacy) => {
    if (!isoOrLegacy) return 'Unknown';
    const date = typeof isoOrLegacy === 'string' ? new Date(isoOrLegacy)
      : isoOrLegacy.toDate ? isoOrLegacy.toDate() : new Date(isoOrLegacy);
    if (isNaN(date.getTime())) return 'Unknown';
    const diff = Math.floor((new Date() - date) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} mins ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return `${Math.floor(diff / 86400)} days ago`;
  };

  const getStatusBadge = (status) => {
    const config = {
      approved: {
        icon: <CheckCircle size={14} />,
        label: 'Approved',
        className: 'status-approved',
      },
      pending: { icon: <Clock size={14} />, label: 'Pending', className: 'status-pending' },
      revoked: { icon: <XCircle size={14} />, label: 'Revoked', className: 'status-revoked' },
    };
    const s = config[status] || config.pending;
    return (
      <span className={`device-status ${s.className}`}>
        {s.icon} {s.label}
      </span>
    );
  };

  // Devices use fingerprint as PK — direct supabase calls
  const approveDevice = async (fingerprint) => {
    try {
      await supabase.from('devices').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('fingerprint', fingerprint);
      const device = devices.find((d) => d.fingerprint === fingerprint || d.id === fingerprint);
      await logAction(user, 'Approved device access', { deviceId: fingerprint, deviceName: device?.name });
      toast.success('Device approved successfully');
    } catch (e) { toast.error('Failed to approve device'); }
  };

  const revokeDevice = async (fingerprint) => {
    try {
      await supabase.from('devices').update({ status: 'revoked', updated_at: new Date().toISOString() }).eq('fingerprint', fingerprint);
      const device = devices.find((d) => d.fingerprint === fingerprint || d.id === fingerprint);
      await logAction(user, 'Revoked device access', { deviceId: fingerprint, deviceName: device?.name });
      toast.warning('Device access revoked');
    } catch (e) { toast.error('Failed to revoke device'); }
  };

  const removeDevice = async (fingerprint) => {
    if (!window.confirm('Are you sure you want to remove this device?')) return;
    try {
      const device = devices.find((d) => d.fingerprint === fingerprint || d.id === fingerprint);
      await supabase.from('devices').delete().eq('fingerprint', fingerprint);
      await logAction(user, 'Removed device', { deviceId: fingerprint, deviceName: device?.name });
      toast.success('Device removed');
    } catch (e) { toast.error('Failed to remove device'); }
  };

  const startEditing = (device) => {
    setEditingId(device.fingerprint || device.id);
    setNewName(device.name);
  };

  const saveName = async (fingerprint) => {
    if (!newName.trim()) { toast.error('Device name cannot be empty'); return; }
    try {
      const device = devices.find((d) => d.fingerprint === fingerprint || d.id === fingerprint);
      await supabase.from('devices').update({ name: newName.trim(), updated_at: new Date().toISOString() }).eq('fingerprint', fingerprint);
      await logAction(user, 'Renamed device', { deviceId: fingerprint, oldName: device?.name, newName: newName.trim() });
      setEditingId(null);
      toast.success('Device renamed successfully');
    } catch (e) { toast.error('Failed to rename device'); }
  };

  const filtered = filter === 'all' ? devices : devices.filter((d) => d.status === filter);

  const counts = {
    all: devices.length,
    approved: devices.filter((d) => d.status === 'approved').length,
    pending: devices.filter((d) => d.status === 'pending').length,
    revoked: devices.filter((d) => d.status === 'revoked').length,
  };

  return (
    <div className="page-container">
      <div className="page-header d-flex justify-between align-center">
        <div>
          <h1 className="page-title">
            <Shield size={28} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Device Management
          </h1>
          <p className="page-subtitle">
            Approve or revoke devices that can access the admin dashboard
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="device-stats">
        {[
          { key: 'all', label: 'Total Devices', value: counts.all, color: 'var(--color-gold)' },
          {
            key: 'approved',
            label: 'Approved',
            value: counts.approved,
            color: 'var(--color-success)',
          },
          {
            key: 'pending',
            label: 'Pending',
            value: counts.pending,
            color: 'var(--color-warning)',
          },
          { key: 'revoked', label: 'Revoked', value: counts.revoked, color: 'var(--color-danger)' },
        ].map((s) => (
          <div
            key={s.key}
            className={`device-stat-card ${filter === s.key ? 'active' : ''}`}
            onClick={() => setFilter(s.key)}
          >
            <p className="stat-label">{s.label}</p>
            <h3 className="stat-value" style={{ color: s.color }}>
              {s.value}
            </h3>
          </div>
        ))}
      </div>

      {/* Device List */}
      <div className="card">
        <div className="card-header">
          <h3>Registered Devices</h3>
        </div>
        <div className="device-list">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <Monitor size={48} strokeWidth={1} />
              <p>No devices found for this filter.</p>
            </div>
          ) : (
            filtered.map((device) => (
              <div key={device.fingerprint || device.id} className="device-item">
                <div className="device-icon-wrap">{getDeviceIcon(device.type)}</div>
                <div className="device-info">
                  {editingId === (device.fingerprint || device.id) ? (
                    <div className="edit-name-flow">
                      <input
                        type="text"
                        className="input-field small-input"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        autoFocus
                      />
                      <button className="icon-btn-save" onClick={() => saveName(device.fingerprint || device.id)}>
                        <Check size={16} />
                      </button>
                      <button className="icon-btn-cancel" onClick={() => setEditingId(null)}>
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="device-name-row flex-center gap-2">
                      <h4>{device.name}</h4>
                      {(device.fingerprint || device.id) === deviceFingerprint && (
                        <span className="badge badge-success text-xs px-2 py-1 flex-center gap-1" style={{ backgroundColor: 'var(--color-gold)', color: '#000' }}>
                          ⭐ Current
                        </span>
                      )}
                      <button className="edit-icon-btn ml-2" onClick={() => startEditing(device)}>
                        <Edit2 size={12} />
                      </button>
                    </div>
                  )}
                  <p className="device-meta">
                    {detectPlatform(device.userAgent)} ·{' '}
                    {(device.userAgent || 'Unknown device').substring(0, 50)} · Last seen{' '}
                    {formatLastAccess(device.lastSeen)}
                  </p>
                  <p className="device-meta" style={{ color: 'var(--accent)', fontWeight: 500 }}>
                    👤 Owned by: {device.staffName || device.staffEmail || 'Unknown staff'}
                  </p>
                  <p className="device-fp">
                    Fingerprint: <code>{device.fingerprint || device.id}</code>
                  </p>
                </div>
                <div className="device-actions">
                  {getStatusBadge(device.status)}
                  <div className="device-btns">
                    {device.status === 'pending' && (
                      <button
                        className="btn-sm btn-approve"
                        onClick={() => approveDevice(device.fingerprint || device.id)}
                      >
                        <CheckCircle size={14} /> Approve
                      </button>
                    )}
                    {device.status === 'approved' && (
                      <button className="btn-sm btn-revoke" onClick={() => revokeDevice(device.fingerprint || device.id)}>
                        <XCircle size={14} /> Revoke
                      </button>
                    )}
                    {device.status === 'revoked' && (
                      <button
                        className="btn-sm btn-approve"
                        onClick={() => approveDevice(device.fingerprint || device.id)}
                      >
                        <CheckCircle size={14} /> Re-approve
                      </button>
                    )}
                    <button className="btn-sm btn-delete" onClick={() => removeDevice(device.fingerprint || device.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default DeviceManagement;
