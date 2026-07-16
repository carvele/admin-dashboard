import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Eye, EyeOff, LogIn, UserPlus, Shield, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { sanitizeText } from '../../utils/validation';
import { toast } from 'sonner';
import './Login.css';

const Login = () => {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoadingUI, setIsLoadingUI] = useState(false);
  const [error, setError] = useState('');

  // Admin creation modal state
  const [showAdminCreate, setShowAdminCreate] = useState(false);
  const [adminForm, setAdminForm] = useState({
    adminEmail: '',
    adminPassword: '',
    staffName: '',
    staffEmail: '',
    staffRole: 'Sales Staff'
  });
  const [isAdminCreating, setIsAdminCreating] = useState(false);
  const [adminError, setAdminError] = useState('');

  // Auto-redirect if somehow already logged in
  React.useEffect(() => {
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
      // Removed immediate navigate() to prevent race conditions with AuthContext's async fetching
    } catch {
      setError('Invalid credentials. Please try again.');
    } finally {
      setIsLoadingUI(false);
    }
  };

  const handleAdminCreateAccount = async (e) => {
    e.preventDefault();
    if (!adminForm.adminEmail || !adminForm.adminPassword || !adminForm.staffName || !adminForm.staffEmail) {
      setAdminError('Please fill in all fields.');
      return;
    }

    setAdminError('');
    setIsAdminCreating(true);

    try {
      // 1. Sign in the super admin to verify credentials + get a fresh JWT
      const { data: adminSignIn, error: signInErr } = await supabase.auth.signInWithPassword({
        email: adminForm.adminEmail.trim(),
        password: adminForm.adminPassword,
      });
      if (signInErr) throw new Error('Invalid super admin credentials.');

      // 2. Verify admin/owner role in profiles table
      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', adminSignIn.user.id)
        .maybeSingle();
      if (profErr || !profile || !['admin', 'owner'].includes(profile.role)) {
        await supabase.auth.signOut();
        throw new Error('Unauthorized. Only Super Admins can use this tool.');
      }

      // 3. Call Edge Function to create new staff account
      const token = adminSignIn.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-staff-account`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            name: sanitizeText(adminForm.staffName),
            email: adminForm.staffEmail.toLowerCase().trim(),
            role: adminForm.staffRole === 'Admin' ? 'admin' : 'staff',
          }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? 'Failed to create account.');

      // 4. Sign back out (so current user sees a clean login form)
      await supabase.auth.signOut();

      toast.success(`Invite sent to ${adminForm.staffEmail}. They will receive an email to set their password.`, { duration: 6000 });
      setShowAdminCreate(false);
      setAdminForm({ adminEmail: '', adminPassword: '', staffName: '', staffEmail: '', staffRole: 'Sales Staff' });
    } catch (err) {
      console.error(err);
      let msg = 'Failed to create account.';
      if (err.message?.includes('Unauthorized')) msg = err.message;
      else if (err.message?.includes('credentials')) msg = 'Invalid admin credentials.';
      else if (err.message?.includes('already registered')) msg = 'Staff email is already registered.';
      else if (err.message) msg = err.message;
      setAdminError(msg);
    } finally {
      setIsAdminCreating(false);
    }
  };

  return (
    <div className="login-page">
      {/* Left brand panel */}
      <div className="login-left">
        <div className="login-brand">
          <div className="brand-logo">JC</div>
          <h1>JezSy Collection</h1>
          <p>Fashion Management System</p>
        </div>
        <div className="login-testimonial">
          <blockquote>"Style is a way to say who you are without having to speak."</blockquote>
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

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label className="label">Email Address</label>
              <input
                type="email"
                className="input-field"
                placeholder="admin@jezsy.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="label">Password</label>
              <div className="password-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input-field"
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
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <Link
                to="/forgot-password"
                style={{
                  color: 'var(--gold)',
                  textDecoration: 'none',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                }}
              >
                Forgot Password?
              </Link>
            </div>
          </form>

          <p className="login-footnote">
            Access strictly monitored. Unrecognized devices require owner approval.<br />
            <button 
               type="button" 
               className="text-gold font-medium bg-transparent border-none cursor-pointer hover:underline mt-2 flex items-center justify-center w-full gap-1"
               onClick={() => setShowAdminCreate(true)}
            >
               <Shield size={14} /> Super Admin: Quick Staff Registration
            </button>
          </p>
        </div>
      </div>

      {/* Admin Creation Overlay */}
      {showAdminCreate && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '16px', padding: '2rem', maxWidth: '400px', width: '100%',
            position: 'relative', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
          }}>
            <button 
              onClick={() => setShowAdminCreate(false)}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#6b7280' }}
            >
              <X size={20} />
            </button>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={20} className="text-gold" /> Admin Action
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>Authorize with your Super Admin credentials to instantiate a new staff account instantly.</p>
            
            <form onSubmit={handleAdminCreateAccount}>
              <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid #e5e7eb' }}>
                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                   <input type="email" className="input-field" placeholder="Super Admin Email" value={adminForm.adminEmail} onChange={(e)=>setAdminForm({...adminForm, adminEmail: e.target.value})} required />
                </div>
                <div className="form-group">
                   <input type="password" className="input-field" placeholder="Super Admin Password" value={adminForm.adminPassword} onChange={(e)=>setAdminForm({...adminForm, adminPassword: e.target.value})} required autoComplete="new-password" />
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#9ca3af', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>New Staff Details</p>
                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                   <input type="text" className="input-field" placeholder="Staff Full Name" value={adminForm.staffName} onChange={(e)=>setAdminForm({...adminForm, staffName: e.target.value})} required />
                </div>
                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                   <input type="email" className="input-field" placeholder="Staff Email Address" value={adminForm.staffEmail} onChange={(e)=>setAdminForm({...adminForm, staffEmail: e.target.value})} required />
                </div>
                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                   <select className="input-field" value={adminForm.staffRole} onChange={(e)=>setAdminForm({...adminForm, staffRole: e.target.value})}>
                     <option value="Sales Staff">Sales Staff</option>
                     <option value="Admin">Admin</option>
                   </select>
                </div>
              </div>

              {adminError && <div style={{ fontSize: '0.875rem', color: '#ef4444', marginBottom: '1rem', textAlign: 'center', backgroundColor: '#fef2f2', padding: '0.5rem', borderRadius: '0.5rem' }}>{adminError}</div>}
              
              <button type="submit" className="btn-primary w-full" disabled={isAdminCreating}>
                {isAdminCreating ? 'Authorizing & Inviting...' : <><UserPlus size={18} /> Authorize & Send Invite</>}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
