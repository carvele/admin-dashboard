import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getStaffProfile,
  updateStaffProfile,
  updateStaffStatus,
  getStaffStatusHistory,
} from '../../services/staffService';
import { toast } from 'sonner';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Save,
  Loader,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Briefcase,
  AlertTriangle,
  X,
} from 'lucide-react';
import HistoryTimeline from '../../components/HistoryTimeline';
import { getLogsForTarget } from '../../lib/supabaseService';
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
    <div className="sp-modal-overlay" onClick={onCancel}>
      <div className="sp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sp-modal-header">
          <AlertTriangle size={20} className="sp-modal-icon" />
          <h3>{title}</h3>
          <button className="sp-modal-close" onClick={onCancel}><X size={18} /></button>
        </div>
        <div className="sp-modal-body">
          <p className="sp-modal-desc">{description}</p>
          <label className="sp-label">
            Change Note <span className="sp-required">*</span>
          </label>
          <textarea
            className="sp-textarea"
            rows={3}
            placeholder="Briefly explain the reason for this change…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            autoFocus
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
  const canEditPersonal = isAdminUnlocked || isOwnProfile;

  return (
    <div className="page-container sp-page">
      {/* ── Page Header ── */}
      <div className="sp-page-header">
        <button className="sp-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} /> Back
        </button>
        <div className="sp-page-title">
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
                <label className="sp-label">First Name</label>
                <input
                  className="input-field"
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  disabled={!canEditPersonal}
                />
              </div>
              <div className="sp-field">
                <label className="sp-label">Last Name</label>
                <input
                  className="input-field"
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  disabled={!canEditPersonal}
                />
              </div>
              <div className="sp-field">
                <label className="sp-label"><Mail size={14} /> Email</label>
                <input className="input-field" value={profile.email ?? ''} disabled readOnly />
              </div>
              <div className="sp-field">
                <label className="sp-label"><Phone size={14} /> Phone</label>
                <input
                  className="input-field"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  disabled={!canEditPersonal}
                  placeholder="e.g. 09xx-xxx-xxxx"
                />
              </div>
              <div className="sp-field">
                <label className="sp-label">Gender</label>
                <select
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
                <label className="sp-label"><Calendar size={14} /> Date of Birth</label>
                <div className="sp-dob-row">
                  <input
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
                <label className="sp-label">Address Line</label>
                <input
                  className="input-field"
                  value={form.address_line}
                  onChange={(e) => setForm({ ...form, address_line: e.target.value })}
                  disabled={!canEditPersonal}
                  placeholder="House/Unit #, Street Name"
                />
              </div>
              <div className="sp-field">
                <label className="sp-label">Barangay</label>
                <input
                  className="input-field"
                  value={form.barangay}
                  onChange={(e) => setForm({ ...form, barangay: e.target.value })}
                  disabled={!canEditPersonal}
                />
              </div>
              <div className="sp-field">
                <label className="sp-label">City / Municipality</label>
                <input
                  className="input-field"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  disabled={!canEditPersonal}
                />
              </div>
              <div className="sp-field">
                <label className="sp-label">Province</label>
                <input
                  className="input-field"
                  value={form.province}
                  onChange={(e) => setForm({ ...form, province: e.target.value })}
                  disabled={!canEditPersonal}
                />
              </div>
              <div className="sp-field">
                <label className="sp-label">ZIP Code</label>
                <input
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
            </div>

            {/* ── History Timeline ── */}
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
    </div>
  );
};

export default StaffProfile;
