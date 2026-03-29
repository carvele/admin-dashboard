import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../firebase/config';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import './ForgotPassword.css';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle, loading, success, error
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMsg('Please enter your email address.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    try {
      await sendPasswordResetEmail(auth, email.trim(), {
        url: `${window.location.origin}/login`,
      });
      setStatus('success');

      // Auto redirect back to login after 5 seconds
      setTimeout(() => {
        navigate('/login');
      }, 5000);
    } catch (err) {
      console.error('Password reset error:', err);
      setStatus('error');

      // Map common Firebase auth errors to user-friendly messages
      let message = 'Failed to send reset email. Please try again.';
      if (err.code === 'auth/user-not-found') {
        message = 'No account found with this email address.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'Please enter a valid email address.';
      }
      setErrorMsg(message);
    }
  };

  return (
    <div className="forgot-password-page">
      {/* Left brand panel (same styling as login) */}
      <div className="forgot-password-left">
        <div className="forgot-password-brand">
          <div className="brand-logo">JC</div>
          <h1>JezSy Collection</h1>
          <p>Fashion Management System</p>
        </div>
        <div className="forgot-password-testimonial">
          <blockquote>"Security and style perfectly balanced."</blockquote>
          <cite>— Admin Portal</cite>
        </div>
        <div className="forgot-password-left-shapes">
          <div className="shape shape-1"></div>
          <div className="shape shape-2"></div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="forgot-password-right">
        <div className="forgot-password-form-wrapper">
          <div className="forgot-password-header">
            <h2>Reset Password</h2>
            <p>Enter your email address to receive a secure password reset link.</p>
          </div>

          {status === 'success' && (
            <div className="forgot-password-success">
              <CheckCircle2 size={40} style={{ margin: '0 auto 10px', display: 'block' }} />
              Reset link sent! Please check your inbox for instructions.
              <br />
              <br />
              <small>Redirecting to login...</small>
            </div>
          )}

          {status === 'error' && <div className="forgot-password-error">{errorMsg}</div>}

          {status !== 'success' && (
            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-group">
                <label className="label">Email Address</label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="admin@jezsy.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status === 'loading'}
                  autoFocus
                />
              </div>

              <button
                type="submit"
                className="btn-primary reset-btn"
                disabled={status === 'loading'}
              >
                {status === 'loading' ? (
                  <span className="loading-dots">
                    Sending<span>...</span>
                  </span>
                ) : (
                  <>
                    <Mail size={18} /> Send Reset Link
                  </>
                )}
              </button>
            </form>
          )}

          <div className="forgot-password-footer">
            <Link to="/login" className="back-link">
              <ArrowLeft size={16} /> Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
