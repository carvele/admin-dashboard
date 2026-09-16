/* eslint-disable @typescript-eslint/no-unused-vars */
 
import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { KeyRound, CheckCircle2, Eye, EyeOff } from 'lucide-react';
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
  const [isRecoveryFlow, setIsRecoveryFlow] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState('idle'); // idle, saving, success, error
  const [errorMsg, setErrorMsg] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  useEffect(() => {
    let mounted = true;

    // Check for explicit error in URL (e.g. #error=access_denied&error_code=otp_expired)
    const hash = window.location.hash ? window.location.hash.substring(1) : '';
    const hashParams = new URLSearchParams(hash);
    const searchParams = new URLSearchParams(window.location.search);

    const errorParam = hashParams.get('error') || searchParams.get('error');
    const errorDesc = hashParams.get('error_description') || searchParams.get('error_description');
    const errorCode = hashParams.get('error_code') || searchParams.get('error_code');

    if (errorParam || errorCode) {
      setChecking(false);
      setErrorMsg(
        errorDesc
          ? decodeURIComponent(errorDesc.replace(/\+/g, ' '))
          : 'This invite link has expired or was already used. Ask the store owner to send a new one.'
      );
      return;
    }

    const evaluateSession = (currentSession) => {
      if (!mounted || !currentSession) return false;

      const invitedRole =
        currentSession?.user?.app_metadata?.staff_role ||
        currentSession?.user?.user_metadata?.role ||
        currentSession?.user?.user_metadata?.staff_role;

      // As long as there is an active session from an invite
      if (['staff', 'owner', 'admin'].includes(invitedRole) || currentSession.user) {
        setSession(currentSession);
        setChecking(false);
        return true;
      }
      return false;
    };

    // 1. Listen for auth state changes (catches PKCE code exchange or hash token processing)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY' && newSession) {
        // Existing staff resetting their password — profile already exists, skip activation.
        setIsRecoveryFlow(true);
        setSession(newSession);
        setChecking(false);
      } else if (newSession && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED')) {
        evaluateSession(newSession);
      }
    });

    // 2. Check current session immediately
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      if (!mounted) return;
      if (existingSession && evaluateSession(existingSession)) {
        return;
      }

      // If URL has tokens being processed in background (PKCE code or access_token in hash)
      const hasCode = searchParams.has('code');
      const hasHashTokens = hash.includes('access_token=') || hash.includes('refresh_token=');

      if (hasHashTokens) {
        // In PKCE mode, Supabase client might ignore hash tokens. Manually hydrate the session.
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const type = hashParams.get('type');
        
        if (type === 'recovery') setIsRecoveryFlow(true);

        if (accessToken && refreshToken) {
          supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
            .then(({ data, error }) => {
              if (!mounted) return;
              if (data?.session && evaluateSession(data.session)) return;
              if (error) console.error('Manual token hydration error:', error);
              setChecking(false);
            });
          return;
        }
      }

      if (hasCode || hasHashTokens) {
        // We are processing a token; give it 3s to finish exchanging code for session
        // or for the onAuthStateChange event to fire.
        setTimeout(() => {
          if (!mounted) return;
          supabase.auth.getSession().then(({ data: { session: delayedSession } }) => {
            if (delayedSession && evaluateSession(delayedSession)) return;
            // Still no session after 3s? Then the code/token was invalid or expired.
            setChecking(false);
          });
        }, 3000);
      } else {
        // No tokens in URL and no existing session = invalid state, stop checking immediately
        setChecking(false);
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isRecoveryFlow) {
      if (!firstName.trim() || !lastName.trim()) {
        setStatus('error');
        setErrorMsg('First name and last name are required to set up your profile.');
        return;
      }
    }

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

      // 2. Profile row logic
      if (!isRecoveryFlow) {
        // Update the profile with the provided names before activating
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            first_name: firstName.trim(),
            last_name: lastName.trim()
          })
          .eq('id', session.user.id);
          
        if (profileError) {
          console.warn('[SetPassword] profile update warning:', profileError.message);
        }

        try {
          const { error: invokeError } = await supabase.functions.invoke('activate-staff-account');
          if (invokeError) {
            console.warn('[SetPassword] activate-staff-account warning:', invokeError.message);
          }
        } catch (invErr) {
          console.warn('[SetPassword] activate-staff-account invocation error:', invErr);
        }
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
              <p>{errorMsg || 'This invite link has expired or was already used. Ask the store owner to send a new one.'}</p>
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
            <h2>{isRecoveryFlow ? 'Reset your password' : 'Set up your profile'}</h2>
            <p>
              Welcome to JezSy, {session.user.email}. {isRecoveryFlow ? 'Choose a new password.' : 'Please provide your name and choose a password to activate your account.'}
            </p>
          </div>

          {status === 'success' && (
            <div className="set-password-success">
              <CheckCircle2 size={40} style={{ margin: '0 auto 10px', display: 'block' }} />
              {isRecoveryFlow ? 'Password reset successfully!' : 'Account activated! You can now sign in.'}
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
              <div className="form-group" style={{ display: 'none' }}>
                <input
                  id="set-password-email"
                  type="email"
                  name="username"
                  autoComplete="username"
                  value={session.user.email}
                  readOnly
                />
              </div>

              {!isRecoveryFlow && (
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label className="label" htmlFor="first-name">
                      First Name
                    </label>
                    <input
                      id="first-name"
                      type="text"
                      className="input-field"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      disabled={status === 'saving'}
                      placeholder="Jane"
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label className="label" htmlFor="last-name">
                      Last Name
                    </label>
                    <input
                      id="last-name"
                      type="text"
                      className="input-field"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      disabled={status === 'saving'}
                      placeholder="Doe"
                    />
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="label" htmlFor="set-password-new">
                  New Password
                </label>
                <div className="password-input-wrapper">
                  <input
                    id="set-password-new"
                    type={showPassword ? 'text' : 'password'}
                    className="input-field"
                    name="new-password"
                    autoComplete="new-password"
                    placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={status === 'saving'}
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus={isRecoveryFlow}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <small style={{ color: 'var(--text-muted, #777)', fontSize: '0.78rem', display: 'block', marginTop: '6px', marginBottom: '8px' }}>
                  Must contain uppercase, lowercase, a number, and a symbol.
                </small>
              </div>
              <div className="form-group">
                <label className="label" htmlFor="set-password-confirm">
                  Confirm Password
                </label>
                <div className="password-input-wrapper">
                  <input
                    id="set-password-confirm"
                    type={showPassword ? 'text' : 'password'}
                    className="input-field"
                    name="confirm-password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={status === 'saving'}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button 
                type="submit" 
                className="btn-primary reset-btn" 
                disabled={status === 'saving'}
                style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '12px' }}
              >
                {status === 'saving' ? (
                  <span className="loading-dots">
                    {isRecoveryFlow ? 'Saving' : 'Activating'}<span>...</span>
                  </span>
                ) : (
                  <>
                    <KeyRound size={18} /> {isRecoveryFlow ? 'Save Password' : 'Activate Account'}
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
