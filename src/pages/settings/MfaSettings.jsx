import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, ShieldAlert, Smartphone, Copy, Check, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import './MfaSettings.css';

const MfaSettings = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState([]);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollData, setEnrollData] = useState(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const fetchFactors = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      setFactors(data?.all || []);
    } catch (err) {
      console.error('Failed to list MFA factors:', err);
      toast.error('Failed to load MFA configuration.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFactors();
  }, [fetchFactors]);

  const verifiedFactor = factors.find(
    (f) => f.factor_type === 'totp' && f.status === 'verified'
  );

  const handleStartEnroll = async () => {
    setIsSubmitting(true);
    try {
      // Clean up any existing unverified factors first so we don't hit limits
      const unverified = factors.filter(
        (f) => f.factor_type === 'totp' && f.status === 'unverified'
      );
      for (const factor of unverified) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        issuer: 'JezSy Collection',
        friendlyName: user?.email || 'Authenticator App',
      });

      if (error) throw error;

      setEnrollData(data);
      setIsEnrolling(true);
      setVerifyCode('');
    } catch (err) {
      console.error('MFA enroll error:', err);
      toast.error(err.message || 'Failed to start MFA enrollment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    const cleanCode = verifyCode.replace(/\s+/g, '').trim();
    if (cleanCode.length !== 6) {
      toast.error('Please enter a valid 6-digit code.');
      return;
    }

    if (!enrollData?.id) {
      toast.error('Enrollment session expired. Please try again.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrollData.id,
        code: cleanCode,
      });

      if (error) throw error;

      toast.success('Two-factor authentication successfully enabled!');
      setIsEnrolling(false);
      setEnrollData(null);
      setVerifyCode('');
      await fetchFactors();
    } catch (err) {
      console.error('MFA verification error:', err);
      toast.error(err.message || 'Invalid verification code. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelEnroll = async () => {
    if (enrollData?.id) {
      try {
        await supabase.auth.mfa.unenroll({ factorId: enrollData.id });
      } catch (err) {
        console.warn('Failed to clean up unverified factor:', err);
      }
    }
    setIsEnrolling(false);
    setEnrollData(null);
    setVerifyCode('');
    await fetchFactors();
  };

  const handleUnenroll = async (factorId) => {
    if (!window.confirm('Are you sure you want to disable Two-Factor Authentication? Your account will be less secure.')) {
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      toast.success('Two-factor authentication has been disabled.');
      await fetchFactors();
    } catch (err) {
      console.error('MFA unenroll error:', err);
      toast.error(err.message || 'Failed to disable MFA.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopySecret = () => {
    if (!enrollData?.totp?.secret) return;
    navigator.clipboard.writeText(enrollData.totp.secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2500);
    toast.info('Secret key copied to clipboard.');
  };

  if (loading) {
    return (
      <div className="mfa-loading-box">
        <Loader2 size={24} className="animate-spin text-secondary" />
        <span>Checking Two-Factor Authentication status...</span>
      </div>
    );
  }

  return (
    <div className="mfa-section-box">
      <div className="mfa-header">
        <div className="mfa-header-title">
          <Smartphone size={20} className="text-secondary" />
          <h4 className="mb-0">Two-Factor Authentication (TOTP)</h4>
        </div>
        {verifiedFactor ? (
          <span className="mfa-badge mfa-badge-enabled">
            <ShieldCheck size={14} /> Enabled
          </span>
        ) : (
          <span className="mfa-badge mfa-badge-disabled">
            <ShieldAlert size={14} /> Disabled
          </span>
        )}
      </div>

      <p className="mfa-description">
        Protect your workforce account with time-based one-time passwords (TOTP) from an authenticator app
        such as Google Authenticator, Microsoft Authenticator, or 1Password.
      </p>

      {/* State A: Verified Factor Exists */}
      {verifiedFactor && !isEnrolling && (
        <div className="mfa-active-box">
          <div className="mfa-active-info">
            <ShieldCheck size={28} className="text-success" />
            <div>
              <div className="font-semibold text-sm">Authenticator App Active</div>
              <div className="text-xs text-secondary mt-0.5">
                Factor ID: {verifiedFactor.id.slice(0, 8)}... • Enrolled on{' '}
                {new Date(verifiedFactor.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn-danger-outline mfa-action-btn"
            onClick={() => handleUnenroll(verifiedFactor.id)}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            <span>Disable 2FA</span>
          </button>
        </div>
      )}

      {/* State B: Not Enrolled, Not Currently Setting Up */}
      {!verifiedFactor && !isEnrolling && (
        <div className="mfa-cta-box">
          <button
            type="button"
            className="btn-primary mfa-action-btn"
            onClick={handleStartEnroll}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin mr-2" /> Initializing...
              </>
            ) : (
              <>
                <ShieldCheck size={16} className="mr-2" /> Set up Two-Factor Authentication
              </>
            )}
          </button>
        </div>
      )}

      {/* State C: Active Enrollment Modal / Flow */}
      {isEnrolling && enrollData && (
        <div className="mfa-enroll-container">
          <div className="mfa-step-block">
            <span className="mfa-step-badge">Step 1</span>
            <span className="mfa-step-label">Scan this QR code in your authenticator app</span>
          </div>

          <div className="mfa-qr-wrapper">
            {enrollData.totp?.qr_code && (
              <img
                src={enrollData.totp.qr_code}
                alt="Authenticator QR Code"
                className="mfa-qr-image"
              />
            )}
          </div>

          <div className="mfa-manual-key-box">
            <span className="text-xs text-secondary block mb-1">
              Can&apos;t scan the QR code? Enter this secret key manually:
            </span>
            <div className="mfa-secret-row">
              <code className="mfa-secret-code">{enrollData.totp?.secret}</code>
              <button
                type="button"
                className="btn-text small flex-center gap-1"
                onClick={handleCopySecret}
                title="Copy Secret"
              >
                {copiedSecret ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div className="mfa-verify-form">
            <div className="mfa-step-block mt-3">
              <span className="mfa-step-badge">Step 2</span>
              <span className="mfa-step-label">Enter the 6-digit verification code from the app</span>
            </div>

            <div className="mfa-input-row">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoComplete="one-time-code"
                placeholder="000000"
                className="input-field mfa-code-input"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (verifyCode.trim().length === 6 && !isSubmitting) {
                      handleVerify();
                    }
                  }
                }}
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="btn-primary"
                onClick={handleVerify}
                disabled={isSubmitting || verifyCode.trim().length !== 6}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-2" /> Verifying...
                  </>
                ) : (
                  'Verify & Activate'
                )}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleCancelEnroll}
                disabled={isSubmitting}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MfaSettings;
