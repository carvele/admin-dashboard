import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getStaffProfile,
  updateStaffProfile,
  updateStaffStatus,
  updateStaffRole,
  getStaffStatusHistory,
  sendPasswordResetEmail,
} from '../../services/staffService';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabaseClient';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Save,
  Loader,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Briefcase,
  AlertTriangle,
  Lock,
  Eye,
  EyeOff,
  X,
} from 'lucide-react';
import HistoryTimeline from '../../components/HistoryTimeline';
import { getLogsForTarget } from '../../lib/supabaseService';
import MfaSettings from '../settings/MfaSettings';
import ConfirmDialog from '../../components/ConfirmDialog';
import './StaffProfile.css';

// ── helpers ──────────────────────────────────────────────────

const computeAge = (dob) => {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
};

const EMPLOYMENT_OPTS = [
  { value: 'active',     label: 'Active',      color: 'status-active' },
  { value: 'on_leave',   label: 'On Leave',    color: 'status-leave' },
  { value: 'resigned',   label: 'Resigned',    color: 'status-resigned' },
  { value: 'terminated', label: 'Terminated',  color: 'status-terminated' },
];

const statusMeta = (val) =>
  EMPLOYMENT_OPTS.find((o) => o.value === val) ?? { label: val ?? 'Unknown', color: 'status-unknown' };

const formatValue = (type, val) => {
  if (val === null || val === undefined) return '—';
  if (type === 'block_status') return val === 'true' ? 'Blocked' : 'Unblocked';
  return statusMeta(val).label;
};

const actorName = (entry) => {
  const c = entry.changer;
  if (!c) return 'System';
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Unknown';
};

// ── Status Change Modal ───────────────────────────────────────

const StatusChangeModal = ({ title, description, onConfirm, onCancel, loading }) => {
  const [note, setNote] = useState('');
  return (
    <div
      className="sp-modal-overlay"
      role="button"
      tabIndex={0}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="sp-modal">
        <div className="sp-modal-header">
          <AlertTriangle size={20} className="sp-modal-icon" />
          <h3>{title}</h3>
          <button className="sp-modal-close" onClick={onCancel}><X size={18} /></button>
        </div>
        <div className="sp-modal-body">
          <p className="sp-modal-desc">{description}</p>
          <label className="sp-label" htmlFor="sp-change-note">
            Change Note <span className="sp-required">*</span>
          </label>
          <textarea autoComplete="off"
            id="sp-change-note"
            className="sp-textarea"
            rows={3}
            placeholder="Briefly explain the reason for this change…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="sp-modal-footer">
          <button className="sp-btn-outline" onClick={onCancel}>Cancel</button>
          <button
            className="sp-btn-primary"
            disabled={!note.trim() || loading}
            onClick={() => onConfirm(note.trim())}
          >
            {loading ? <Loader size={16} className="spin" /> : 'Confirm Change'}
          </button>
        </div>
      </div>
    </div>
  );
};



// ── History Timeline adapters ───────────────────────────────────
// The staff account has two audit trails: staff_status_history (employment/
// block changes via the update_staff_status RPC) and the generic logs table
// (invite/archive/reactivate/role changes via logAction). Both map onto the
// shared HistoryTimeline's entry shape and merge into one time-sorted feed.

const toTimelineEntries = (statusHistory, logs) =>
  [
    ...statusHistory.map((entry) => ({
      id: `sh-${entry.id}`,
      dotVariant: entry.change_type === 'block_status' ? 'block' : 'status',
      typeLabel: entry.change_type === 'block_status' ? '🔒 Block Status' : '💼 Employment Status',
      previousValue: formatValue(entry.change_type, entry.previous_value),
      newValue: formatValue(entry.change_type, entry.new_value),
      note: entry.note,
      actorName: actorName(entry),
      timestamp: entry.effective_date,
    })),
    ...logs.map((l) => ({
      id: `log-${l.id}`,
      typeLabel: `📝 ${l.action}`,
      note: l.details?.note || null,
      actorName: l.userName,
      timestamp: l.timestamp,
    })),
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

// ── Main Component ────────────────────────────────────────────

const StaffProfile = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdminUnlocked } = useAuth();

  const isOwnProfile = user?.uid === id;
  const canViewPage = isAdminUnlocked || isOwnProfile;

  const [profile, setProfile]       = useState(null);
  const [history, setHistory]       = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [histLoading, setHistLoading] = useState(true);
  const [saving, setSaving]         = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);

  // Section 1 form state
  const [form, setForm] = useState({
    first_name: '', last_name: '', phone: '', gender: '',
    date_of_birth: '', address_line: '', city: '',
    province: '', zip_code: '', barangay: '',
  });

  // Status change modal
  const [pendingChange, setPendingChange] = useState(null); // { type, value }
  const [resetSending, setResetSending] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Change password (own profile only)
  const [pwForm, setPwForm] = useState({ newPw: '', confirmPw: '' });
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  const isCallerAdminOrOwner = ['admin', 'owner'].includes((user?.role || '').toLowerCase());
  const [roleUpdating, setRoleUpdating] = useState(false);
  const [roleConfirm, setRoleConfirm] = useState(null); // 'admin' | 'staff' | null
  const [rolePassword, setRolePassword] = useState('');
  const [showRolePassword, setShowRolePassword] = useState(false);

  // ── Load data ────────────────────────────────────────────────
  const loadProfile = useCallback(async () => {
    if (!canViewPage) { navigate('/dashboard'); return; }
    try {
      const data = await getStaffProfile(id);
      if (!data) { toast.error('Staff member not found.'); navigate('/staff'); return; }
      setProfile(data);
      setForm({
        first_name:   data.firstName   ?? '',
        last_name:    data.lastName    ?? '',
        phone:        data.phone       ?? '',
        gender:       data.gender      ?? '',
        date_of_birth: data.dateOfBirth ? data.dateOfBirth.substring(0, 10) : '',
        address_line: data.addressLine ?? '',
        city:         data.city        ?? '',
        province:     data.province    ?? '',
        zip_code:     data.zipCode     ?? '',
        barangay:     data.barangay    ?? '',
      });
    } catch (err) {
      toast.error('Failed to load profile: ' + err.message);
    } finally {
      setPageLoading(false);
    }
  }, [id, canViewPage, navigate]);

  const loadHistory = useCallback(async () => {
    try {
      const [rows, logs] = await Promise.all([
        getStaffStatusHistory(id),
        getLogsForTarget('profile', id),
      ]);
      setHistory(toTimelineEntries(rows, logs));
    } catch { /* non-fatal */ } finally {
      setHistLoading(false);
    }
  }, [id]);

  useEffect(() => { loadProfile(); }, [loadProfile]);
  useEffect(() => { if (!pageLoading) loadHistory(); }, [pageLoading, loadHistory]);

  // ── Save personal info ────────────────────────────────────────
  const handleSavePersonalInfo = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateStaffProfile(id, form);
      setProfile((prev) => ({ ...prev, ...form }));
      toast.success('Personal information updated.');
    } catch (err) {
      toast.error('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Status change flow ────────────────────────────────────────
  // Change password handler (own profile only)
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwForm.newPw.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    if (pwForm.newPw !== pwForm.confirmPw) {
      toast.error('Passwords do not match.');
      return;
    }
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwForm.newPw });
      if (error) throw error;
      setPwForm({ newPw: '', confirmPw: '' });
      setShowNewPw(false);
      setShowConfirmPw(false);
      toast.success('Password changed successfully!');
    } catch (err) {
      toast.error(err.message || 'Failed to change password.');
    } finally {
      setPwSaving(false);
    }
  };

  const requestStatusChange = (type, value) => {
    if (!isAdminUnlocked) return;
    if (isOwnProfile) {
      toast.error('You cannot modify your own employment or block status.');
      return;
    }
    setPendingChange({ type, value });
  };

  const confirmStatusChange = async (note) => {
    if (!pendingChange) return;
    setStatusSaving(true);
    try {
      const newStatus = pendingChange.type === 'employment_status'
        ? pendingChange.value
        : profile.employmentStatus;
      const newBlocked = pendingChange.type === 'block_status'
        ? pendingChange.value
        : profile.isBlocked;

      await updateStaffStatus(id, newStatus, newBlocked, note);
      setProfile((prev) => ({
        ...prev,
        employmentStatus: newStatus,
        isBlocked: newBlocked,
      }));
      await loadHistory();
      toast.success('Status updated successfully.');
    } catch (err) {
      toast.error('Failed to update status: ' + err.message);
    } finally {
      setStatusSaving(false);
      setPendingChange(null);
    }
  };

  const handleConfirmRoleChange = async () => {
    if (!roleConfirm) return;
    const targetRole = roleConfirm;

    if (targetRole === 'admin') {
      if (!rolePassword.trim()) {
        toast.error('Please enter your owner password to authorize this promotion.');
        return;
      }
      setRoleUpdating(true);
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: user?.email,
        password: rolePassword.trim(),
      });
      if (authErr) {
        setRoleUpdating(false);
        toast.error('Incorrect password. Promotion not authorized.');
        return;
      }
    } else {
      setRoleUpdating(true);
    }

    try {
      await updateStaffRole(id, targetRole);
      toast.success(`Role updated to ${targetRole === 'admin' ? 'Administrator' : 'Sales Staff'}.`);
      setProfile((prev) => ({ ...prev, role: targetRole }));
      await loadHistory();
      setRolePassword('');
      setShowRolePassword(false);
      setRoleConfirm(null);
    } catch (err) {
      console.error('[StaffProfile] Role change error:', err);
      toast.error(err.message || 'Failed to update role.');
    } finally {
      setRoleUpdating(false);
    }
  };

  const executePasswordReset = async () => {
    if (resetSending || !profile?.email) return;
    try {
      setResetSending(true);
      await sendPasswordResetEmail(profile.email);
      toast.success(`Password reset link sent to ${profile.email}`);
      setShowResetConfirm(false);
    } catch (err) {
      toast.error(err.message || 'Failed to send password reset link');
    } finally {
      setResetSending(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────
  if (pageLoading) {
    return (
      <div className="sp-loading-screen">
        <Loader size={32} className="spin" />
        <p>Loading profile…</p>
      </div>
    );
  }
  if (!profile) return null;

  const age         = computeAge(form.date_of_birth || profile.dateOfBirth);
  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email;
  const meta        = statusMeta(profile.employmentStatus);
  const canEditPersonal = isOwnProfile;

  return (
    <div className="page-container sp-page">
      {/* ── Page Header ── */}
      <div className="sp-page-header">
        <button className="sp-back-btn" onClick={() => isAdminUnlocked ? navigate('/staff') : navigate('/dashboard')}>
          <ArrowLeft size={18} /> Back
        </button>
        
          <div className="sp-page-title">
            <nav className="flex items-center gap-2 mb-1 text-sm font-medium text-gray-500" style={{ fontSize: '0.8rem', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
              <span role="button" tabIndex={0} onKeyDown={(e) => { if(e.key==='Enter') e.target.click(); }} onClick={() => isAdminUnlocked ? navigate('/staff') : navigate('/dashboard')} style={{ cursor: 'pointer', transition: 'color 0.2s' }} className="hover:text-accent">
                {isAdminUnlocked ? 'Team Management' : 'Dashboard'}
              </span>
              <span style={{ opacity: 0.5 }}>/</span>
              <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>Profile Details</span>
            </nav>

          <div className="sp-hero-avatar">
            {displayName[0]?.toUpperCase() ?? 'S'}
          </div>
          <div>
            <h1 className="page-title sp-name">{displayName}</h1>
            <p className="page-subtitle">{profile.email}</p>
          </div>
        </div>
      </div>

      <div className="sp-grid">
        {/* ══════════════════════════════════════════════════════ */}
        {/* SECTION 1 — Personal Information                       */}
        {/* ══════════════════════════════════════════════════════ */}
        <section className="card sp-section">
          <div className="sp-section-header">
            <User size={18} />
            <h2>Personal Information</h2>
            {!canEditPersonal && (
              <span className="sp-readonly-badge">Read-only</span>
            )}
          </div>

          <form onSubmit={handleSavePersonalInfo} className="sp-form">
            <div className="sp-form-grid">
              <div className="sp-field">
                <label className="sp-label" htmlFor="sp-first-name">First Name</label>
                <input autoComplete="off"
                  id="sp-first-name"
                  className="input-field"
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  disabled={!canEditPersonal}
                />
              </div>
              <div className="sp-field">
                <label className="sp-label" htmlFor="sp-last-name">Last Name</label>
                <input autoComplete="off"
                  id="sp-last-name"
                  className="input-field"
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  disabled={!canEditPersonal}
                />
              </div>
              <div className="sp-field">
                <label className="sp-label" htmlFor="sp-email"><Mail size={14} /> Email</label>
                <input autoComplete="off" id="sp-email" className="input-field" value={profile.email ?? ''} disabled readOnly />
              </div>
              <div className="sp-field">
                <label className="sp-label" htmlFor="sp-phone"><Phone size={14} /> Phone</label>
                <input autoComplete="off"
                  id="sp-phone"
                  className="input-field"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  disabled={!canEditPersonal}
                  placeholder="e.g. 09xx-xxx-xxxx"
                />
              </div>
              <div className="sp-field">
                <label className="sp-label" htmlFor="sp-gender">Gender</label>
                <select autoComplete="off"
                  id="sp-gender"
                  className="input-field"
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                  disabled={!canEditPersonal}
                >
                  <option value="">— select —</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="non_binary">Non-binary</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>
              <div className="sp-field">
                <label className="sp-label" htmlFor="sp-dob"><Calendar size={14} /> Date of Birth</label>
                <div className="sp-dob-row">
                  <input autoComplete="off"
                    id="sp-dob"
                    type="date"
                    className="input-field"
                    value={form.date_of_birth}
                    onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                    disabled={!canEditPersonal}
                  />
                  {age !== null && (
                    <span className="sp-age-badge">{age} yrs</span>
                  )}
                </div>
              </div>
            </div>

            {/* Address subsection */}
            <div className="sp-subsection-title">
              <MapPin size={15} /> Address
            </div>
            <div className="sp-form-grid">
              <div className="sp-field sp-field-full">
                <label className="sp-label" htmlFor="sp-address-line">Address Line</label>
                <input autoComplete="off"
                  id="sp-address-line"
                  className="input-field"
                  value={form.address_line}
                  onChange={(e) => setForm({ ...form, address_line: e.target.value })}
                  disabled={!canEditPersonal}
                  placeholder="House/Unit #, Street Name"
                />
              </div>
              <div className="sp-field">
                <label className="sp-label" htmlFor="sp-barangay">Barangay</label>
                <input autoComplete="off"
                  id="sp-barangay"
                  className="input-field"
                  value={form.barangay}
                  onChange={(e) => setForm({ ...form, barangay: e.target.value })}
                  disabled={!canEditPersonal}
                />
              </div>
              <div className="sp-field">
                <label className="sp-label" htmlFor="sp-city">City / Municipality</label>
                <input autoComplete="off"
                  id="sp-city"
                  className="input-field"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  disabled={!canEditPersonal}
                />
              </div>
              <div className="sp-field">
                <label className="sp-label" htmlFor="sp-province">Province</label>
                <input autoComplete="off"
                  id="sp-province"
                  className="input-field"
                  value={form.province}
                  onChange={(e) => setForm({ ...form, province: e.target.value })}
                  disabled={!canEditPersonal}
                />
              </div>
              <div className="sp-field">
                <label className="sp-label" htmlFor="sp-zip">ZIP Code</label>
                <input autoComplete="off"
                  id="sp-zip"
                  className="input-field"
                  value={form.zip_code}
                  onChange={(e) => setForm({ ...form, zip_code: e.target.value })}
                  disabled={!canEditPersonal}
                  maxLength={10}
                />
              </div>
            </div>

            {canEditPersonal && (
              <div className="sp-form-actions">
                <button type="submit" className="btn-primary flex-center gap-2" disabled={saving}>
                  {saving ? <Loader size={16} className="spin" /> : <Save size={16} />}
                  {saving ? 'Saving…' : 'Save Personal Info'}
                </button>
              </div>
            )}
          </form>
        </section>

        {/* ══════════════════════════════════════════════════════ */}
        {/* SECTION 2 — Employment & Status (admin/owner only)     */}
        {/* ══════════════════════════════════════════════════════ */}
        {isAdminUnlocked && (
          <section className="sp-section sp-hr-card">
            <div className="sp-section-header sp-hr-header">
              <Briefcase size={18} />
              <h2>Employment &amp; Status</h2>
              <span className="sp-admin-badge">Admin Only</span>
            </div>

            {isOwnProfile && (
              <div className="sp-self-warning">
                <AlertTriangle size={16} />
                You cannot modify your own employment or block status.
              </div>
            )}

            <div className="sp-status-controls">
              {/* ── Employment Status ── */}
              <div className="sp-status-block">
                <div className="sp-status-label">Employment Status</div>
                <div className={`sp-status-badge ${meta.color}`}>{meta.label}</div>
                {!isOwnProfile && (
                  <div className="sp-status-actions">
                    {EMPLOYMENT_OPTS.filter((o) => o.value !== profile.employmentStatus).map((opt) => (
                      <button
                        key={opt.value}
                        className={`sp-status-btn ${opt.color}`}
                        onClick={() => requestStatusChange('employment_status', opt.value)}
                      >
                        → {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Blocklist ── */}
              <div className="sp-status-block">
                <div className="sp-status-label">Blocklist Status</div>
                {profile.isBlocked
                  ? <div className="sp-status-badge status-blocked"><ShieldAlert size={14} /> Blocked</div>
                  : <div className="sp-status-badge status-clear"><ShieldCheck size={14} /> Clear</div>
                }
                {!isOwnProfile && (
                  <button
                    className={`sp-block-toggle ${profile.isBlocked ? 'sp-btn-unblock' : 'sp-btn-block'}`}
                    onClick={() => requestStatusChange('block_status', !profile.isBlocked)}
                  >
                    {profile.isBlocked ? 'Remove from Blocklist' : 'Add to Blocklist'}
                  </button>
                )}
              </div>

              {/* ── Role & Permissions ── */}
              <div className="sp-status-block">
                <div className="sp-status-label">Assigned Role</div>
                <div className="sp-status-badge status-active" style={{ textTransform: 'capitalize' }}>
                  <Shield size={14} style={{ marginRight: '4px' }} />
                  {profile.role === 'admin' ? 'Administrator' : profile.role === 'owner' ? 'Store Owner' : 'Sales Staff'}
                </div>
                {isCallerAdminOrOwner && !isOwnProfile && profile?.role !== 'owner' && profile?.employmentStatus === 'active' && !profile?.isBlocked && (
                  <div className="sp-status-actions">
                    {profile.role === 'staff' ? (
                      <button
                        className="sp-status-btn status-active"
                        disabled={roleUpdating}
                        onClick={() => setRoleConfirm('admin')}
                      >
                        {roleUpdating ? <Loader size={14} className="spin" /> : '→ Promote to Admin'}
                      </button>
                    ) : (
                      <button
                        className="sp-status-btn status-warning"
                        disabled={roleUpdating}
                        onClick={() => setRoleConfirm('staff')}
                      >
                        {roleUpdating ? <Loader size={14} className="spin" /> : '→ Demote to Sales Staff'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* 🔒 Security Actions */}
              <div className="sp-status-block" style={{ gridColumn: '1 / -1', marginTop: '1rem' }}>
                <div className="sp-status-label">Security Actions</div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="sp-btn-outline"
                    disabled={resetSending}
                    onClick={() => setShowResetConfirm(true)}
                  >
                    {resetSending ? (
                      <><Loader size={16} className="spin" style={{ marginRight: '8px' }} /> Sending...</>
                    ) : (
                      <><Mail size={16} style={{ marginRight: '8px' }} /> Send Password Reset Link</>
                    )}
                  </button>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Sends an email with a secure link to choose a new password.
                  </span>
                </div>
              </div>
            </div>

            {/* 🕒 History Timeline 🕒 */}
            <div className="sp-history-section">
              <div className="sp-history-title">
                <Clock size={16} /> Status Change History
              </div>
              <HistoryTimeline entries={history} loading={histLoading} emptyText="No status changes recorded yet." />
            </div>
          </section>
        )}

        {/* For non-admin viewing own profile: show read-only status badge */}
        {!isAdminUnlocked && isOwnProfile && profile.employmentStatus && (
          <section className="card sp-section sp-readonly-status">
            <div className="sp-section-header">
              <Briefcase size={18} /> <h2>Employment Status</h2>
            </div>
            <div className={`sp-status-badge ${meta.color}`}>{meta.label}</div>
          </section>
        )}

        {/* Change Password — visible only on own profile */}
        {isOwnProfile && (
          <section className="card sp-section">
            <div className="sp-section-header">
              <Lock size={18} />
              <h2>Change Password</h2>
            </div>
            <form onSubmit={handleChangePassword} className="sp-form">
              <div className="sp-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="sp-field">
                  <label className="sp-label" htmlFor="sp-new-pw">New Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="sp-new-pw"
                      type={showNewPw ? 'text' : 'password'}
                      autoComplete="new-password"
                      className="input-field"
                      placeholder="At least 8 characters"
                      value={pwForm.newPw}
                      onChange={(e) => setPwForm({ ...pwForm, newPw: e.target.value })}
                      required
                      style={{ paddingRight: '2.5rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw(!showNewPw)}
                      style={{ position: 'absolute', right: '0.65rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}
                      aria-label={showNewPw ? 'Hide password' : 'Show password'}
                    >
                      {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="sp-field">
                  <label className="sp-label" htmlFor="sp-confirm-pw">Confirm New Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="sp-confirm-pw"
                      type={showConfirmPw ? 'text' : 'password'}
                      autoComplete="new-password"
                      className="input-field"
                      placeholder="Re-enter new password"
                      value={pwForm.confirmPw}
                      onChange={(e) => setPwForm({ ...pwForm, confirmPw: e.target.value })}
                      required
                      style={{ paddingRight: '2.5rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPw(!showConfirmPw)}
                      style={{ position: 'absolute', right: '0.65rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}
                      aria-label={showConfirmPw ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="sp-form-actions">
                <button type="submit" className="btn-primary flex-center gap-2" disabled={pwSaving}>
                  {pwSaving ? <Loader size={16} className="spin" /> : <Lock size={16} />}
                  {pwSaving ? 'Saving...' : 'Change Password'}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Two-Factor Authentication (TOTP) — visible on own profile */}
        {isOwnProfile && <MfaSettings />}
      </div>

      {/* ── Confirmation Modal ── */}
      {pendingChange && (
        <StatusChangeModal
          title="Confirm Status Change"
          description={
            pendingChange.type === 'employment_status'
              ? `Change employment status to "${statusMeta(pendingChange.value).label}".`
              : pendingChange.value
                ? 'Add this staff member to the blocklist.'
                : 'Remove this staff member from the blocklist.'
          }
          onConfirm={confirmStatusChange}
          onCancel={() => setPendingChange(null)}
          loading={statusSaving}
        />
      )}

      {/* ── Role Change Confirmation Modal ── */}
      {roleConfirm && (
        <div
          className="sp-modal-overlay"
          role="button"
          tabIndex={0}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setRoleConfirm(null);
              setRolePassword('');
              setShowRolePassword(false);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setRoleConfirm(null);
              setRolePassword('');
              setShowRolePassword(false);
            }
          }}
        >
          <div className="sp-modal">
            <div className="sp-modal-header">
              <Shield size={22} className="sp-modal-icon" style={{ color: 'var(--accent, #d97706)' }} />
              <h3>{roleConfirm === 'admin' ? 'Confirm Promotion to Administrator' : 'Confirm Demotion to Sales Staff'}</h3>
              <button
                className="sp-modal-close"
                onClick={() => {
                  setRoleConfirm(null);
                  setRolePassword('');
                  setShowRolePassword(false);
                }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="sp-modal-body">
              <p style={{ marginBottom: '0.75rem', lineHeight: 1.5 }}>
                Are you sure you want to change <strong>{displayName}</strong>&apos;s role to{' '}
                <strong>{roleConfirm === 'admin' ? 'Administrator' : 'Sales Staff'}</strong>?
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {roleConfirm === 'admin'
                  ? 'Administrators have access to management tools, inventory, and staff management.'
                  : 'Sales staff have access to POS, order fulfillment, and storefront operations.'}
              </p>

              {roleConfirm === 'admin' && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (rolePassword.trim() && !roleUpdating) {
                      handleConfirmRoleChange();
                    }
                  }}
                  autoComplete="on"
                  style={{
                    background: 'var(--surface-hover, var(--beige))',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '1rem',
                    marginTop: '1rem',
                  }}
                >
                  {/* Hidden username field prevents browser password managers from associating external inputs with this password */}
                  <input
                    type="text"
                    name="username"
                    autoComplete="username"
                    value={user?.email || ''}
                    readOnly
                    tabIndex={-1}
                    aria-hidden="true"
                    style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
                  />
                  <label
                    className="sp-label"
                    htmlFor="sp-promote-pw"
                    style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: 'var(--text-primary)' }}
                  >
                    Password Confirmation <span className="sp-required" style={{ color: 'var(--color-danger, #ef4444)' }}>*</span>
                  </label>
                  <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                    Enter your password to authorize promoting this staff member to Administrator:
                  </p>
                  <div style={{ position: 'relative', maxWidth: '320px' }}>
                    <input
                      id="sp-promote-pw"
                      name="current-password"
                      type={showRolePassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Enter owner password"
                      className="input-field"
                      style={{ paddingRight: '2.5rem', width: '100%' }}
                      value={rolePassword}
                      onChange={(e) => setRolePassword(e.target.value)}
                      disabled={roleUpdating}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && rolePassword.trim() && !roleUpdating) {
                          e.preventDefault();
                          handleConfirmRoleChange();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowRolePassword(!showRolePassword)}
                      tabIndex={-1}
                      style={{
                        position: 'absolute',
                        right: '0.75rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      aria-label={showRolePassword ? 'Hide password' : 'Show password'}
                    >
                      {showRolePassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </form>
              )}
            </div>
            <div className="sp-modal-footer">
              <button
                className="btn-outline"
                onClick={() => {
                  setRoleConfirm(null);
                  setRolePassword('');
                  setShowRolePassword(false);
                }}
                disabled={roleUpdating}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={(roleConfirm === 'admin' && !rolePassword.trim()) || roleUpdating}
                onClick={handleConfirmRoleChange}
              >
                {roleUpdating ? <Loader size={16} className="spin" /> : roleConfirm === 'admin' ? 'Authorize & Promote' : 'Confirm Change'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Send Password Reset Link"
        message={`Send a password reset link to ${profile?.email}?`}
        confirmText="Send Reset Link"
        cancelText="Cancel"
        isDestructive={false}
        severity="LOW"
        isLoading={resetSending}
        onConfirm={executePasswordReset}
        onCancel={() => {
          if (!resetSending) setShowResetConfirm(false);
        }}
      />
    </div>
  );
};

export default StaffProfile;
