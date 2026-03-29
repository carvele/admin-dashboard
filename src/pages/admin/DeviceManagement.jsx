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
import {
  subscribeToCollection,
  updateDocument,
  deleteDocument,
  logAction,
  setDocument,
} from '../../firebase/firestore';
import './DeviceManagement.css';

const DeviceManagement = () => {
  const { user } = useAuth();
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
    const unsub = subscribeToCollection('devices', (data) => {
      // Sort so pending devices are at the top
      setDevices(
        data.sort((a, b) => {
          if (a.status === 'pending' && b.status !== 'pending') return -1;
          if (a.status !== 'pending' && b.status === 'pending') return 1;
          return (b.lastAccess?.seconds || 0) - (a.lastAccess?.seconds || 0);
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

  const formatLastAccess = (timestamp) => {
    if (!timestamp || !timestamp.toDate) return 'Unknown';
    const date = timestamp.toDate();
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

  const approveDevice = async (id) => {
    try {
      await updateDocument('devices', id, { status: 'approved' });
      const device = devices.find((d) => d.id === id);
      await logAction(user, 'Approved device access', { deviceId: id, deviceName: device?.name });
      toast.success('Device approved successfully');
    } catch (e) {
      toast.error('Failed to approve device');
    }
  };

  const revokeDevice = async (id) => {
    try {
      await updateDocument('devices', id, { status: 'revoked' });
      const device = devices.find((d) => d.id === id);
      await logAction(user, 'Revoked device access', { deviceId: id, deviceName: device?.name });
      toast.warning('Device access revoked');
    } catch (e) {
      toast.error('Failed to revoke device');
    }
  };

  const removeDevice = async (id) => {
    if (!window.confirm('Are you sure you want to remove this device?')) return;
    try {
      const device = devices.find((d) => d.id === id);
      await deleteDocument('devices', id);
      await logAction(user, 'Removed device', { deviceId: id, deviceName: device?.name });
      toast.success('Device removed');
    } catch (e) {
      toast.error('Failed to remove device');
    }
  };

  const startEditing = (device) => {
    setEditingId(device.id);
    setNewName(device.name);
  };

  const saveName = async (id) => {
    if (!newName.trim()) {
      toast.error('Device name cannot be empty');
      return;
    }
    try {
      await updateDocument('devices', id, { name: newName.trim() });
      await logAction(user, 'Renamed device', {
        deviceId: id,
        oldName: devices.find((d) => d.id === id)?.name,
        newName: newName.trim(),
      });
      setEditingId(null);
      toast.success('Device renamed successfully');
    } catch (e) {
      toast.error('Failed to rename device');
    }
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
              <div key={device.id} className="device-item">
                <div className="device-icon-wrap">{getDeviceIcon(device.type)}</div>
                <div className="device-info">
                  {editingId === device.id ? (
                    <div className="edit-name-flow">
                      <input
                        type="text"
                        className="input-field small-input"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        autoFocus
                      />
                      <button className="icon-btn-save" onClick={() => saveName(device.id)}>
                        <Check size={16} />
                      </button>
                      <button className="icon-btn-cancel" onClick={() => setEditingId(null)}>
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="device-name-row">
                      <h4>{device.name}</h4>
                      <button className="edit-icon-btn" onClick={() => startEditing(device)}>
                        <Edit2 size={12} />
                      </button>
                    </div>
                  )}
                  <p className="device-meta">
                    {detectPlatform(device.userAgent)} ·{' '}
                    {(device.userAgent || 'Unknown device').substring(0, 50)} · Last seen{' '}
                    {formatLastAccess(device.lastAccess)}
                  </p>
                  <p className="device-meta" style={{ color: 'var(--accent)', fontWeight: 500 }}>
                    👤 Owned by: {device.staffName || device.staffEmail || 'Unknown staff'}
                  </p>
                  <p className="device-fp">
                    Fingerprint: <code>{device.id}</code>
                  </p>
                </div>
                <div className="device-actions">
                  {getStatusBadge(device.status)}
                  <div className="device-btns">
                    {device.status === 'pending' && (
                      <button
                        className="btn-sm btn-approve"
                        onClick={() => approveDevice(device.id)}
                      >
                        <CheckCircle size={14} /> Approve
                      </button>
                    )}
                    {device.status === 'approved' && (
                      <button className="btn-sm btn-revoke" onClick={() => revokeDevice(device.id)}>
                        <XCircle size={14} /> Revoke
                      </button>
                    )}
                    {device.status === 'revoked' && (
                      <button
                        className="btn-sm btn-approve"
                        onClick={() => approveDevice(device.id)}
                      >
                        <CheckCircle size={14} /> Re-approve
                      </button>
                    )}
                    <button className="btn-sm btn-delete" onClick={() => removeDevice(device.id)}>
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
