import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, XCircle, RefreshCw, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

const PendingDeviceView = () => {
  const { deviceStatus, deviceFingerprint, logout, isAdminUnlocked, recheckDeviceStatus } = useAuth();
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);

  const isRevoked = deviceStatus === 'revoked';

  const handleCheckAgain = async () => {
    setChecking(true);
    try {
      await recheckDeviceStatus();
    } finally {
      setChecking(false);
    }
  };

  const handleCopyId = async () => {
    if (!deviceFingerprint) return;
    try {
      await navigator.clipboard.writeText(deviceFingerprint);
      setCopied(true);
      toast.success('Device ID copied to clipboard');
      setTimeout(() => setCopied(false), 2200);
    } catch {
      toast.error('Failed to copy Device ID');
    }
  };

  // If the owner has successfully used their role to bypass
  if (isAdminUnlocked) {
    return null;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        backgroundColor: 'var(--cream)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
        boxSizing: 'border-box',
      }}
    >
      <div
        className="card text-center"
        style={{
          maxWidth: 480,
          width: '100%',
          padding: '2.75rem 2.25rem',
          borderRadius: '16px',
          boxShadow: '0 20px 40px -15px rgba(28, 28, 28, 0.08), 0 0 1px 1px rgba(28, 28, 28, 0.05)',
          backgroundColor: '#ffffff',
        }}
      >
        {/* Icon Badge */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            backgroundColor: isRevoked ? 'rgba(239, 68, 68, 0.1)' : 'rgba(217, 119, 6, 0.1)',
            border: isRevoked ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid rgba(217, 119, 6, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem auto',
          }}
        >
          {isRevoked ? (
            <XCircle size={36} style={{ color: '#ef4444' }} />
          ) : (
            <Shield size={36} style={{ color: 'var(--accent, #b8860b)' }} />
          )}
        </div>

        {/* Title */}
        <h1
          className="text-2xl font-bold mb-2 font-serif"
          style={{ color: 'var(--charcoal)', letterSpacing: '-0.01em' }}
        >
          {isRevoked ? 'Device Access Revoked' : 'Device Pending Approval'}
        </h1>

        {/* Subtitle */}
        <p className="text-secondary mb-6 text-sm" style={{ lineHeight: 1.6, maxWidth: 400, margin: '0 auto 1.75rem auto' }}>
          {isRevoked
            ? 'Access from this device has been revoked by an administrator. Please contact your store manager or owner with your Device ID to restore access.'
            : 'To ensure boutique and customer data security, all new devices must be approved by an administrator before accessing the dashboard.'}
        </p>

        {/* Device ID Display Box */}
        <div
          className="mb-6 p-4 rounded text-left border"
          style={{
            backgroundColor: 'var(--cream-bg, #fcfbf9)',
            borderColor: 'var(--border, rgba(0,0,0,0.08))',
          }}
        >
          <div className="flex-between align-center mb-2">
            <span
              className="text-xs font-semibold uppercase text-secondary"
              style={{ letterSpacing: '0.05em' }}
            >
              Your Device ID
            </span>
            <span
              className="text-xs px-2.5 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: isRevoked ? 'rgba(239, 68, 68, 0.1)' : 'rgba(217, 119, 6, 0.12)',
                color: isRevoked ? '#dc2626' : '#b45309',
              }}
            >
              {isRevoked ? 'Revoked' : 'Pending Approval'}
            </span>
          </div>

          <div
            className="flex-between align-center gap-2 p-2.5 rounded bg-white border"
            style={{ borderColor: 'rgba(0, 0, 0, 0.08)' }}
          >
            <code
              className="text-xs font-mono select-all"
              style={{
                color: 'var(--charcoal)',
                wordBreak: 'break-all',
                letterSpacing: '0.02em',
                lineHeight: 1.4,
              }}
            >
              {deviceFingerprint || 'Loading device identifier…'}
            </code>
            <button
              type="button"
              onClick={handleCopyId}
              className="btn-outline small flex-center gap-1 flex-shrink-0"
              style={{
                padding: '0.35rem 0.65rem',
                fontSize: '0.75rem',
                minWidth: '68px',
                justifyContent: 'center',
              }}
              title="Copy Device ID"
            >
              {copied ? (
                <>
                  <Check size={13} style={{ color: '#10b981' }} />
                  <span style={{ color: '#10b981' }}>Copied</span>
                </>
              ) : (
                <>
                  <Copy size={13} />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          <p className="text-xs text-secondary mt-2 mb-0" style={{ fontSize: '0.74rem' }}>
            Provide this ID to your store administrator so they can approve your device in Team &amp; Device Management.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            className="btn-primary flex-1 flex-center justify-center gap-2"
            onClick={handleCheckAgain}
            disabled={checking}
          >
            <RefreshCw size={15} className={checking ? 'spin' : ''} />
            <span>{checking ? 'Checking…' : 'Check Status'}</span>
          </button>
          <button
            type="button"
            className="btn-outline flex-1 flex-center justify-center gap-2"
            onClick={logout}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};

export default PendingDeviceView;

