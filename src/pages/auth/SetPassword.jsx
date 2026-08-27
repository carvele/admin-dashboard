import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { KeyRound, CheckCircle2 } from 'lucide-react';
import './SetPassword.css';

const MIN_PASSWORD_LENGTH = 8;

// Renders once for a user who just clicked their staff-invite email link.
// Supabase's invite link is itself the email verification step — clicking it
// establishes a session for an account that has no `profiles` row yet. This
// page is where that row gets created, once they choose a password.
const SetPassword = () => {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState('idle'); // idle, saving, success, error
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const loadInvite = async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      // Authoritative role lives in app_metadata (service-role-only). A session
      // without it is not a pending staff invite.
      const invitedRole = currentSession?.user?.app_metadata?.staff_role;

      if (!currentSession || !['staff', 'owner'].includes(invitedRole)) {
        setChecking(false);
        return;
      }

      setSession(currentSession);
      setChecking(false);
    };
    loadInvite();
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setStatus('error');
      setErrorMsg(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setStatus('error');
      setErrorMsg('Passwords do not match.');
      return;
    }

    setStatus('saving');
    setErrorMsg('');

    try {
      // 1. Set the password on their own session (self-service, no elevation).
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) throw passwordError;

      // 2. Create the profile row server-side. The role comes from app_metadata
      //    inside the edge function, never from the client — so this can't be
      //    used to self-assign a higher role.
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/activate-staff-account`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${freshSession?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        },
      );
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Failed to activate your account.');
      }

      // Offer to save the new credential to the browser's password manager, so
      // it autofills on the login step that follows. Best-effort: only Chromium
      // supports the Credential Management API, and it needs a secure context —
      // the readonly email + autocomplete attributes cover other browsers.
      try {
        if (window.PasswordCredential) {
          const cred = new window.PasswordCredential({
            id: session.user.email,
            password,
            name: session.user.email,
          });
          await navigator.credentials.store(cred);
        }
      } catch (credErr) {
        console.warn('Could not offer to save password:', credErr?.message ?? credErr);
      }

      // Sign out the short-lived invite session so they log in cleanly with
      // their new password (and go through the normal device check).
      await supabase.auth.signOut();

      setStatus('success');
      setTimeout(() => navigate('/login', { replace: true }), 3000);
    } catch (err) {
      console.error('Set password error:', err);
      setStatus('error');
      setErrorMsg(err.message || 'Failed to set your password. Please try again.');
    }
  };

  if (checking) {
    return (
      <div className="set-password-page">
        <div className="set-password-right" style={{ flex: 1 }}>
          <div className="flex-center-vh" style={{ minHeight: '300px' }}>
            <div className="loading-spinner"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="set-password-page">
        <div className="set-password-right">
          <div className="set-password-form-wrapper">
            <div className="set-password-header">
              <h2>Invite link invalid</h2>
              <p>This invite link has expired or was already used. Ask the store owner to send a new one.</p>
            </div>
            <Link to="/login" className="btn-primary reset-btn" style={{ textDecoration: 'none', textAlign: 'center' }}>
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="set-password-page">
      <div className="set-password-left">
        <div className="set-password-brand">
          <div className="brand-logo">JC</div>
          <h1>JezSy Collection</h1>
          <p>Fashion Management System</p>
        </div>
        <div className="set-password-testimonial">
          <blockquote>&quot;One last step before you&apos;re in.&quot;</blockquote>
          <cite>— Admin Portal</cite>
        </div>
        <div className="set-password-left-shapes">
          <div className="shape shape-1"></div>
          <div className="shape shape-2"></div>
        </div>
      </div>

      <div className="set-password-right">
        <div className="set-password-form-wrapper">
          <div className="set-password-header">
            <h2>Set your password</h2>
            <p>
              Welcome to JezSy, {session.user.email}. Choose a password to activate your{' '}
              {session.user.app_metadata?.staff_role === 'owner' ? 'Owner (Full Access)' : 'Sales Staff'} account.
            </p>
          </div>

          {status === 'success' && (
            <div className="set-password-success">
              <CheckCircle2 size={40} style={{ margin: '0 auto 10px', display: 'block' }} />
              Account activated! You can now sign in.
              <br />
              <br />
              <small>Redirecting to sign in...</small>
            </div>
          )}

          {status === 'error' && <div className="set-password-error">{errorMsg}</div>}

          {status !== 'success' && (
            <form onSubmit={handleSubmit} className="login-form">
              {/* Read-only email gives the browser/password-manager a username
                  to associate with the new password, so it offers to save it. */}
              <div className="form-group">
                <label className="label" htmlFor="set-password-email">
                  Email
                </label>
                <input
                  id="set-password-email"
                  type="email"
                  className="input-field"
                  name="username"
                  autoComplete="username"
                  value={session.user.email}
                  readOnly
                />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="set-password-new">
                  New Password
                </label>
                <input
                  id="set-password-new"
                  type="password"
                  className="input-field"
                  name="new-password"
                  autoComplete="new-password"
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={status === 'saving'}
                  // Autofocus is appropriate here: this is the primary input of a
                  // just-opened account-activation form (email above is read-only).
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="set-password-confirm">
                  Confirm Password
                </label>
                <input
                  id="set-password-confirm"
                  type="password"
                  className="input-field"
                  name="confirm-password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={status === 'saving'}
                />
              </div>

              <button type="submit" className="btn-primary reset-btn" disabled={status === 'saving'}>
                {status === 'saving' ? (
                  <span className="loading-dots">
                    Activating<span>...</span>
                  </span>
                ) : (
                  <>
                    <KeyRound size={18} /> Activate Account
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default SetPassword;
