import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import './Login.css';

const Login = () => {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoadingUI, setIsLoadingUI] = useState(false);
  const [error, setError] = useState('');

  // Admin creation modal state removed per security audit

  // Auto-redirect if somehow already logged in & ensure form state is clean
  React.useEffect(() => {
    setForm({ email: '', password: '' });
    setError('');
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email.trim()) {
      setError('Please enter your email.');
      return;
    }
    if (!form.password) {
      setError('Please enter your password.');
      return;
    }

    setIsLoadingUI(true);
    setError('');
    try {
      await login(form.email.trim(), form.password);
      setForm({ email: '', password: '' });
    } catch (err) {
      const errMsg = err?.message || '';
      if (errMsg.includes('Invalid credentials') || errMsg.includes('invalid_credentials') || errMsg.includes('Invalid login')) {
        setError('Invalid email or password. Please check your credentials.');
      } else if (errMsg.includes('deactivated') || errMsg.includes('no longer has access')) {
        setError('This account has been deactivated. Please contact the store owner.');
      } else if (errMsg.includes('Email not confirmed')) {
        setError('Please confirm your email address first.');
      } else if (errMsg.includes('restricted') || errMsg.includes('customer')) {
        setError('This portal is for Staff and Administrators only. Customers must sign in via the mobile app.');
      } else {
        setError(errMsg || 'Sign in failed. Please check your credentials and connection.');
      }
    } finally {
      setIsLoadingUI(false);
    }
  };


  return (
    <div className="login-page">
      {/* Left brand panel */}
      <div className="login-left">
        <div className="login-brand">
          <div className="brand-logo font-serif">JC</div>
          <h1 className="font-serif">JezSy Couture</h1>
          <p className="font-serif accent-pink-text" style={{ fontStyle: 'italic', textTransform: 'none' }}>by Ms. Jholy</p>
        </div>
        <div className="login-testimonial">
          <blockquote>&quot;Style is a way to say who you are without having to speak.&quot;</blockquote>
          <cite>— Rachel Zoe</cite>
        </div>
        <div className="login-left-shapes">
          <div className="shape shape-1"></div>
          <div className="shape shape-2"></div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="login-right">
        <div className="login-form-wrapper">
          <div className="login-header">
            <h2>Welcome back</h2>
            <p>Sign in to your dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form" autoComplete="off">
            <div className="form-group">
              <label className="label" htmlFor="login-email">Email Address</label>
              <input
                id="login-email"
                type="email"
                className="input-field"
                name="email"
                autoComplete="off"
                data-lpignore="true"
                placeholder="Enter email address"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- primary input of the sign-in page
                autoFocus
              />
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label className="label" style={{ marginBottom: 0 }} htmlFor="login-password">Password</label>
              </div>
              <div className="password-wrapper">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="input-field"
                  name="password"
                  autoComplete="new-password"
                  data-lpignore="true"
                  placeholder="Enter password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && <div className="login-error">{error}</div>}

            <button type="submit" className="btn-primary login-btn" disabled={isLoadingUI}>
              {isLoadingUI ? (
                <span className="loading-dots">
                  Signing in<span>...</span>
                </span>
              ) : (
                <>
                  <LogIn size={18} /> Sign In
                </>
              )}
            </button>
          </form>

          <p className="login-footnote">
            Access strictly monitored. Unrecognized devices require owner approval.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
