import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  UserPlus,
  UserMinus,
  Shield,
  ShieldCheck,
  Search,
  Trash2,
  Crown,
  Eye,
  ShieldAlert,
  Archive,
  ArchiveRestore,
} from 'lucide-react';
import {
  subscribeToStaff,
  updateStaffStatus,
  logAction,
} from '../../services/staffService';
import { supabase } from '../../lib/supabaseClient';
import { toast } from 'sonner';
import ConfirmDialog from '../../components/ConfirmDialog';
import './StaffManagement.css';

const EMPLOYMENT_STATUS_META = {
  active:     { label: 'Active',      cls: 'emp-active' },
  on_leave:   { label: 'On Leave',    cls: 'emp-leave' },
  resigned:   { label: 'Resigned',    cls: 'emp-resigned' },
  terminated: { label: 'Terminated',  cls: 'emp-terminated' },
};

const StaffManagement = () => {
  const { user, isAdminUnlocked } = useAuth();
  const navigate = useNavigate();

  // ── Data ────────────────────────────────────────────────────
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── UI state ─────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState('active'); // 'active' | 'archived'
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const [roleToggleConfirm, setRoleToggleConfirm] = useState(null);
  const [removeConfirm, setRemoveConfirm] = useState(null);

  // ── Archived-tab extras ──────────────────────────────────────
  // Map<staffId, latestNote> — loaded once when switching to archived tab
  const [historyNotes, setHistoryNotes] = useState({});

  // ── Reactivate modal ─────────────────────────────────────────
  const [reactivateMember, setReactivateMember] = useState(null);
  const [reactivateNote, setReactivateNote] = useState('');
  const [reactivating, setReactivating] = useState(false);

  // ── Create modal ─────────────────────────────────────────────
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', role: 'staff' });

  // ── Subscribe to ALL staff (including deleted) ───────────────
  useEffect(() => {
    const unsub = subscribeToStaff((data) => {
      setStaff(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Fetch latest history notes when Archived tab is opened ───
  useEffect(() => {
    if (viewMode !== 'archived') return;

    const fetchNotes = async () => {
      try {
        // log_staff_status_change() (DB trigger) writes a separate row per
        // changed field -- employment_status and block_status can each get
        // their own row from the same update_staff_status() call, sharing
        // the same note text and near-identical timestamp. Scoping to
        // employment_status here matters when they *don't* share a note: an
        // archived member whose block status was toggled afterward, in a
        // separate action with its own note, would otherwise show that
        // later, unrelated block-status note as their "Archive Reason".
        const { data, error } = await supabase
          .from('staff_status_history')
          .select('staff_id, note, created_at')
          .eq('change_type', 'employment_status')
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Keep only the most-recent note per staff member
        const noteMap = {};
        (data ?? []).forEach((h) => {
          if (!noteMap[h.staff_id]) noteMap[h.staff_id] = h.note;
        });
        setHistoryNotes(noteMap);
      } catch (err) {
        console.error('[StaffManagement] Failed to fetch history notes:', err);
      }
    };

    fetchNotes();
  }, [viewMode, staff]);

  // ── Derived lists ─────────────────────────────────────────────
  const activeStaff   = staff.filter((s) => s.deleted !== true);
  const archivedStaff = staff.filter((s) => s.deleted === true);

  const getDisplayName = (m) =>
    m ? ([m.firstName, m.lastName].filter(Boolean).join(' ') || m.email || 'Unknown') : 'Unknown';
  const getDisplayRole = (role) =>
    role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Staff';

  const filteredActive = activeStaff.filter(
    (s) =>
      (roleFilter === 'all' || s.role === roleFilter) &&
      (getDisplayName(s).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.email || '').toLowerCase().includes(searchTerm.toLowerCase())),
  );

  const filteredArchived = archivedStaff.filter(
    (s) =>
      (roleFilter === 'all' || s.role === roleFilter) &&
      (getDisplayName(s).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.email || '').toLowerCase().includes(searchTerm.toLowerCase())),
  );

  // ── Actions: Active tab ───────────────────────────────────────

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
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
            email: createForm.email.toLowerCase().trim(),
            role: createForm.role,
          }),
        },
      );
      const result = await res.json();
      if (!res.ok) {
        if (result.error?.includes('already registered') || res.status === 409) {
          toast.error('This email is already registered.');
        } else {
          toast.error('Failed to create account: ' + (result.error ?? 'Unknown error'));
        }
        return;
      }
      await logAction(user, 'Invited new staff account', {
        targetType: 'profile',
        targetId: result.userId,
        email: createForm.email,
        role: createForm.role,
      });
      toast.success(
        `Invite sent to ${createForm.email}. They'll verify their email via the link and set a password before their account is activated — they'll appear here once that's done.`,
        { duration: 7000 },
      );
      setIsCreateModalOpen(false);
      setCreateForm({ email: '', role: 'staff' });
    } catch (err) {
      console.error('Staff creation error:', err);
      toast.error('Failed to create staff account: ' + err.message);
    }
  };

  const confirmRoleToggle = async () => {
    if (!roleToggleConfirm) return;
    const member = roleToggleConfirm;
    const newRole = member.role === 'admin' ? 'staff' : 'admin';
    const name = getDisplayName(member);
    try {
      const { error } = await supabase.rpc('update_staff_role', {
        target_user_id: member.id,
        new_role: newRole,
      });
      if (error) throw error;
      // update_staff_role now logs this itself server-side (guaranteed,
      // not dependent on this client call succeeding) -- see
      // jezsy-mobile-app's audit_log_hardening migration.
      toast.success(`${name} is now ${newRole}`);
    } catch {
      toast.error('Failed to update role');
    } finally {
      setRoleToggleConfirm(null);
    }
  };

  const confirmRemove = async () => {
    if (!removeConfirm) return;
    const member = removeConfirm;
    const name = getDisplayName(member);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ deleted: true, updated_at: new Date().toISOString() })
        .eq('id', member.id);
      if (error) throw error;
      await logAction(user, 'Archived staff member', {
        targetType: 'profile',
        targetId: member.id,
        staffName: name,
      });
      toast.success(`${name} has been archived`);
    } catch {
      toast.error('Failed to archive staff member');
    } finally {
      setRemoveConfirm(null);
    }
  };

  const toggleRole = async (member) => {
    if (member.role === 'owner') {
      toast.error('The Owner role cannot be downgraded. It is permanent.');
      return;
    }
    setRoleToggleConfirm(member);
  };

  const handleRemove = async (member) => {
    if (member.role === 'owner') {
      toast.error('The master Owner account cannot be removed.');
      return;
    }
    setRemoveConfirm(member);
  };

  // ── Actions: Archived tab ─────────────────────────────────────

  const openReactivateModal = (member) => {
    setReactivateMember(member);
    setReactivateNote('');
  };

  const handleReactivate = async (e) => {
    e.preventDefault();
    if (!reactivateNote.trim()) {
      toast.error('A reactivation note is required.');
      return;
    }
    if (!reactivateMember) return;

    setReactivating(true);
    try {
      // 1. Update employment_status → 'active' via the secured RPC (writes audit log)
      await updateStaffStatus(reactivateMember.id, 'active', false, reactivateNote.trim());

      // 2. Flip the soft-delete flag back
      const { error } = await supabase
        .from('profiles')
        .update({ deleted: false, updated_at: new Date().toISOString() })
        .eq('id', reactivateMember.id);
      if (error) throw error;

      await logAction(user, 'Reactivated archived staff account', {
        targetType: 'profile',
        targetId: reactivateMember.id,
        staffName: getDisplayName(reactivateMember),
        note: reactivateNote.trim(),
      });

      toast.success(`${getDisplayName(reactivateMember)} has been reactivated.`);
      setReactivateMember(null);
      setReactivateNote('');
    } catch (err) {
      toast.error('Failed to reactivate account: ' + err.message);
    } finally {
      setReactivating(false);
    }
  };

  // ── Shared table rows ─────────────────────────────────────────

  const renderActiveRows = () => {
    if (loading) {
      return (
        <tr>
          <td colSpan="6" className="text-center py-8">Loading team...</td>
        </tr>
      );
    }
    if (filteredActive.length === 0) {
      return (
        <tr>
          <td colSpan="6">
            <div className="empty-state flex-col flex-center gap-3 p-8">
              <div className="icon-bg-large bg-light text-secondary mb-2 rounded-full p-4">
                <UserMinus size={48} opacity={0.5} />
              </div>
              <h3 className="text-lg font-medium">No staff members found</h3>
              <p className="text-secondary text-center max-w-sm">
                There are no active staff members matching your current search.
              </p>
              {searchTerm && (
                <button className="btn-outline mt-2" onClick={() => setSearchTerm('')}>
                  Clear Search
                </button>
              )}
            </div>
          </td>
        </tr>
      );
    }

    return filteredActive.map((member) => (
      <tr key={member.id}>
        <td>
          <div className="member-info">
            <div
              className="avatar small-av"
              style={{ backgroundColor: 'var(--color-gold)', color: 'white' }}
            >
              {(getDisplayName(member) || 'U')[0]}
            </div>
            <div>
              <div className="font-medium">{getDisplayName(member)}</div>
              <div className="text-secondary text-xs">{member.email}</div>
            </div>
          </div>
        </td>
        <td>
          <div
            className={`role-chip ${member.role === 'owner' ? 'owner-chip' : ''}`}
            onClick={() => toggleRole(member)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleRole(member);
              }
            }}
            role="button"
            tabIndex={0}
            style={{ cursor: member.role === 'owner' ? 'default' : 'pointer' }}
            title={member.role === 'owner' ? 'Role locked' : 'Click to toggle role'}
          >
            {member.role === 'owner' && <Crown size={14} style={{ color: 'var(--color-gold)' }} />}
            {member.role === 'admin' && <ShieldCheck size={14} className="text-success" />}
            {member.role === 'staff' && <Shield size={14} className="text-secondary" />}
            <span style={{ fontWeight: member.role === 'owner' ? 700 : 500 }}>
              {getDisplayRole(member.role)}
            </span>
          </div>
        </td>
        <td>
          {(() => {
            const es = member.employmentStatus;
            const m = EMPLOYMENT_STATUS_META[es];
            return es
              ? <span className={`emp-badge ${m?.cls ?? ''}`}>{m?.label ?? es}</span>
              : <span className="text-secondary text-sm">—</span>;
          })()}
        </td>
        <td>
          {member.isBlocked
            ? <span className="emp-badge emp-blocked"><ShieldAlert size={12} /> Blocked</span>
            : <span className="emp-badge emp-clear"><ShieldCheck size={12} /> Clear</span>
          }
        </td>
        <td className="text-secondary text-sm">
          {member.createdAt ? new Date(member.createdAt).toLocaleDateString() : 'N/A'}
        </td>
        <td className="text-right" style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', alignItems: 'center' }}>
          <button
            className="icon-btn-small"
            onClick={() => navigate(`/staff/${member.id}`)}
            title="View Profile"
          >
            <Eye size={16} />
          </button>
          {member.role !== 'owner' && (
            <button
              className="icon-btn-small text-danger"
              onClick={() => handleRemove(member)}
              title="Archive Staff Member"
            >
              <Trash2 size={16} />
            </button>
          )}
        </td>
      </tr>
    ));
  };

  const renderArchivedRows = () => {
    if (loading) {
      return (
        <tr>
          <td colSpan="7" className="text-center py-8">Loading archived members...</td>
        </tr>
      );
    }
    if (filteredArchived.length === 0) {
      return (
        <tr>
          <td colSpan="7">
            <div className="empty-state flex-col flex-center gap-3 p-8">
              <div className="icon-bg-large bg-light text-secondary mb-2 rounded-full p-4">
                <Archive size={48} opacity={0.5} />
              </div>
              <h3 className="text-lg font-medium">No archived members</h3>
              <p className="text-secondary text-center max-w-sm">
                Archived staff will appear here. Use the archive action on the Active tab to move someone here.
              </p>
            </div>
          </td>
        </tr>
      );
    }

    return filteredArchived.map((member) => (
      <tr key={member.id} style={{ opacity: 0.85 }}>
        <td>
          <div className="member-info">
            <div
              className="avatar small-av"
              style={{ backgroundColor: 'var(--color-muted, #aaa)', color: 'white' }}
            >
              {(getDisplayName(member) || 'U')[0]}
            </div>
            <div>
              <div className="font-medium">{getDisplayName(member)}</div>
              <div className="text-secondary text-xs">{member.email}</div>
            </div>
          </div>
        </td>
        <td>
          <div className={`role-chip ${member.role === 'owner' ? 'owner-chip' : ''}`}>
            {member.role === 'owner' && <Crown size={14} style={{ color: 'var(--color-gold)' }} />}
            {member.role === 'admin' && <ShieldCheck size={14} className="text-secondary" />}
            {member.role === 'staff' && <Shield size={14} className="text-secondary" />}
            <span>{getDisplayRole(member.role)}</span>
          </div>
        </td>
        <td>
          {(() => {
            const es = member.employmentStatus;
            const m = EMPLOYMENT_STATUS_META[es];
            return es
              ? <span className={`emp-badge ${m?.cls ?? ''}`}>{m?.label ?? es}</span>
              : <span className="text-secondary text-sm">—</span>;
          })()}
        </td>
        <td className="text-secondary text-sm" style={{ maxWidth: 200 }}>
          {historyNotes[member.id]
            ? <span title={historyNotes[member.id]} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {historyNotes[member.id]}
              </span>
            : <span className="text-secondary" style={{ fontStyle: 'italic' }}>No note</span>
          }
        </td>
        <td className="text-secondary text-sm">
          {member.createdAt ? new Date(member.createdAt).toLocaleDateString() : 'N/A'}
        </td>
        <td className="text-secondary text-sm">
          {member.updatedAt ? new Date(member.updatedAt).toLocaleDateString() : 'N/A'}
        </td>
        <td className="text-right" style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', alignItems: 'center' }}>
          <button
            className="icon-btn-small"
            onClick={() => navigate(`/staff/${member.id}`)}
            title="View Profile"
          >
            <Eye size={16} />
          </button>
          {isAdminUnlocked && (
            <button
              className="icon-btn-small text-success"
              onClick={() => openReactivateModal(member)}
              title="Reactivate Account"
            >
              <ArchiveRestore size={16} />
            </button>
          )}
        </td>
      </tr>
    ));
  };

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="page-container">
      <div className="page-header d-flex justify-between align-center">
        <div>
          <h1 className="page-title">Team Management</h1>
          <p className="page-subtitle">Create and manage staff accounts for the admin dashboard</p>
        </div>
        {viewMode === 'active' && (
          <button
            className="btn-primary flex-center gap-2"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <UserPlus size={18} /> Invite Staff Member
          </button>
        )}
      </div>

      <div className="card">
        {/* ── Tab toggle ── */}
        <div className="archive-toggle-row" style={{ margin: '1rem 1.5rem 0.5rem 1.5rem' }}>
          <button
            className={`archive-toggle-btn ${viewMode === 'active' ? 'active' : ''}`}
            onClick={() => setViewMode('active')}
          >
            Active ({activeStaff.length})
          </button>
          <button
            className={`archive-toggle-btn ${viewMode === 'archived' ? 'active' : ''}`}
            onClick={() => setViewMode('archived')}
          >
            <Archive size={14} /> Archived ({archivedStaff.length})
          </button>
        </div>

        {/* ── Search and Filter ── */}
        <div className="card-toolbar" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>
          <select 
            className="input-field" 
            value={roleFilter} 
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{ minWidth: '150px' }}
          >
            <option value="all">All Roles</option>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="staff">Staff</option>
          </select>
        </div>

        {/* ── Table ── */}
        <div className="table-container">
          {viewMode === 'active' ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Employment</th>
                  <th>Blocked</th>
                  <th>Added</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>{renderActiveRows()}</tbody>
            </table>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Status at Archive</th>
                  <th>Archive Reason</th>
                  <th>Added</th>
                  <th>Archived</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>{renderArchivedRows()}</tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Create Staff Modal ── */}
      {isCreateModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h2>Invite Staff Member</h2>
              <button className="close-btn" onClick={() => setIsCreateModalOpen(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateAccount} className="modal-body">
              <div className="form-group">
                <label className="label" htmlFor="create-staff-email">Email Address</label>
                <input
                  id="create-staff-email"
                  type="email"
                  className="input-field"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="create-staff-role">Access Role</label>
                <select
                  id="create-staff-role"
                  className="input-field"
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                >
                  <option value="staff">Sales Staff</option>
                  <option value="admin">Admin (Full Access)</option>
                </select>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '-0.25rem' }}>
                We&apos;ll email a verification link to this address. Once they click it and set a
                password, their account activates and they&apos;ll appear in Team Management.
              </p>
              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setIsCreateModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">Send Invite</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Reactivate Modal ── */}
      {reactivateMember && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h2>Reactivate Staff Account</h2>
              <button
                className="close-btn"
                onClick={() => setReactivateMember(null)}
                disabled={reactivating}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleReactivate} className="modal-body">
              <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                You are reactivating{' '}
                <strong style={{ color: 'var(--charcoal)' }}>{getDisplayName(reactivateMember)}</strong>.
                Their employment status will be set to <strong>Active</strong> and their account will
                become visible on the Active tab again.
              </p>
              <div className="form-group">
                <label className="label" htmlFor="reactivate-note">
                  Reactivation Note <span style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <textarea
                  id="reactivate-note"
                  className="input-field"
                  rows={3}
                  placeholder="e.g. Rehired for seasonal position, starting 2026-08-01"
                  value={reactivateNote}
                  onChange={(e) => setReactivateNote(e.target.value)}
                  required
                  style={{ resize: 'vertical' }}
                />
                <p className="text-secondary text-xs" style={{ marginTop: '0.3rem' }}>
                  This note will be stored in the status history audit log.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setReactivateMember(null)}
                  disabled={reactivating}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={reactivating}>
                  {reactivating ? 'Reactivating…' : 'Reactivate Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!roleToggleConfirm}
        title="Change Role?"
        message={`Are you sure you want to change the role of ${getDisplayName(roleToggleConfirm)} to ${roleToggleConfirm?.role === 'admin' ? 'Staff' : 'Admin'}?`}
        confirmText="Change Role"
        onConfirm={confirmRoleToggle}
        onCancel={() => setRoleToggleConfirm(null)}
      />

      <ConfirmDialog
        isOpen={!!removeConfirm}
        title="Archive Staff Member?"
        message={`Are you sure you want to archive ${getDisplayName(removeConfirm)}?`}
        confirmText="Archive"
        onConfirm={confirmRemove}
        onCancel={() => setRemoveConfirm(null)}
      />
    </div>
  );
};

export default StaffManagement;
