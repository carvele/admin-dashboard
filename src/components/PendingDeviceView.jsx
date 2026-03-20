import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, MonitorSmartphone, XCircle } from 'lucide-react';

const PendingDeviceView = () => {
  const { deviceStatus, deviceFingerprint, logout, isAdminUnlocked } = useAuth();

  // If the owner has successfully used their role to bypass
  if (isAdminUnlocked) {
    return null;
  }

  return (
    <div className="flex-center" style={{ minHeight: '100vh', backgroundColor: 'var(--cream)', padding: '2rem' }}>
      <div className="card text-center" style={{ maxWidth: 480, width: '100%', padding: '3rem 2rem' }}>
        
        {deviceStatus === 'revoked' ? (
          <div className="mb-4 text-danger">
            <XCircle size={64} style={{ margin: '0 auto' }} />
          </div>
        ) : (
          <div className="mb-4" style={{ color: 'var(--charcoal)' }}>
            <Shield size={64} style={{ margin: '0 auto' }} />
          </div>
        )}

        <h1 className="mb-2 text-2xl" style={{ color: 'var(--charcoal)' }}>
          {deviceStatus === 'revoked' ? 'Device Access Revoked' : 'Device Pending Approval'}
        </h1>
        
        <p className="text-secondary mb-4 line-height-relaxed">
          {deviceStatus === 'revoked' 
            ? "This device has been permanently blocked by an administrator from accessing the dashboard."
            : "To ensure system security, all devices must be explicitly approved before accessing JezSy Collection data."
          }
        </p>

        <div className="mb-6 p-4 rounded bg-white text-left shadow-sm border">
          <p className="text-sm text-secondary font-medium mb-1">Your Device ID</p>
          <div className="flex-between align-center">
            <code className="text-lg" style={{ color: 'var(--accent)' }}>{deviceFingerprint || 'Loading...'}</code>
            <MonitorSmartphone size={20} className="text-secondary" />
          </div>
        </div>

        <div className="flex gap-3 justify-center">
          <button className="btn-outline flex-1" onClick={logout}>Sign Out</button>
        </div>

      </div>
    </div>
  );
};

export default PendingDeviceView;
