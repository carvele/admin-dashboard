/* eslint-disable @typescript-eslint/no-unused-vars */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  UserPlus,
  UserMinus,
  Users,
  Shield,
  ShieldCheck,
  Search,
  Trash2,
  Crown,
  Eye,
  ShieldAlert,
  Archive,
  ArchiveRestore,
  X,
  Clock,
} from 'lucide-react';
import {
  subscribeToStaff,
  updateStaffStatus,
  logAction,
} from '../../services/staffService';
import { supabase } from '../../lib/supabaseClient';
import { toast } from 'sonner';
import ConfirmDialog from '../../components/ConfirmDialog';
import PageHeader from '../../components/PageHeader';
import SkeletonTable from '../../components/SkeletonTable';
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

  // ── Data ──────────────────────────────────────────────────────────────────
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState('active'); // 'active' | 'archived'
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const [roleToggleConfirm, setRoleToggleConfirm] = useState(null);
  const [removeConfirm, setRemoveConfirm] = useState(null);

  // ── Archived-tab extras ───────────────────────────────────────────────────
  // Map<staffId, latestNote> — loaded once when switching to archived tab
  const [historyNotes, setHistoryNotes] = useState({});

  // ── Reactivate modal ──────────────────────────────────────────────────────
  const [reactivateMember, setReactivateMember] = useState(null);
  const [reactivateNote, setReactivateNote] = useState('');
  const [reactivating, setReactivating] = useState(false);

  // ── Create modal ──────────────────────────────────────────────────────────
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', role: 'staff' });
  const [creating, setCreating] = useState(false);

  // ── Subscribe to ALL staff (including deleted) ────────────────────────────
  useEffect(() => {
    const unsub = subscribeToStaff((data) => {
      // Realtime trimming contract: cap snapshot at 100
      setStaff(data.slice(0, 100));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Fetch latest history notes when Archived tab is opened ────────────────
  useEffect(() => {
    if (viewMode !== 'archived') return;

    const fetchNotes = async () => {
      try {
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

  // ── Derived lists ─────────────────────────────────────────────────────────
  const activeStaff   = staff.filter((s) => s.deleted !== true);
  const archivedStaff = staff.filter((s) => s.deleted === true);

  const getDisplayName = (m) =>
    m ? ([m.firstName, m.lastName].filter(Boolean).join(' ') || m.email || 'Unknown') : 'Unknown';
  const getDisplayRole = (role) =>
    role === 'owner' ? 'Owner' : 'Sales Staff';

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

  // ── Actions: Active tab ───────────────────────────────────────────────────

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    setCreating(true);
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
            siteUrl: window.location.origin,
          }),
        },
      );
      const result = await res.json();
      if (!res.ok) {
        if (result.error?.includes('already registered') || res.status === 409) {
          toast.error(result.error || 'This email is already registered.');
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

      if (result.resent) {
        toast.success(
          `Previous pending invitation was refreshed. A fresh invite email has been sent to ${createForm.email}!`,
          { duration: 7000 },
        );
      } else {
        toast.success(
          `Invite sent to ${createForm.email}. They'll verify their email via the link and set a password before their account activates.`,
          { duration: 7000 },
        );
      }

      setIsCreateModalOpen(false);
      setCreateForm({ email: '', role: 'staff' });
    } catch (err) {
      console.error('Staff creation error:', err);
      toast.error('Failed to create staff account: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  const confirmRoleToggle = async () => {
    if (!roleToggleConfirm) return;
    const member = roleToggleConfirm;
    const newRole = member.role === 'admin' ? 'staff' : 'admin';
    const name = getDisplayName(member);
    try {
      const { error } = await supabase.rpc('update_staff_role_v2', {
        target_user_id: member.id,
        new_role: newRole,
      });
      if (error) throw error;
      toast.success(`${name} is now ${newRole}`);
    } catch (err) {
      toast.error(err?.message || 'Failed to update role');
    } finally {
      setRoleToggleConfirm(null);
    }
  };

  const confirmRemove = async () => {
    if (!removeConfirm) return;
    const member = removeConfirm;
    const name = getDisplayName(member);
    try {
      const { error } = await supabase.rpc('set_staff_archive_state', {
        target_user_id: member.id,
        archived: true,
        change_note: 'Archived via Staff Management',
      });
      if (error) throw error;
      toast.success(`${name} has been archived`);
    } catch (err) {
      toast.error(err?.message || 'Failed to archive staff member');
    } finally {
      setRemoveConfirm(null);
    }
  };

  const toggleRole = async (member) => {
    if (member.id === user?.uid) {
      toast.error('You cannot change your own role.');
      return;
    }
    if (member.role === 'owner') {
      toast.error('The owner role cannot be modified.');
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

  // ── Actions: Archived tab ─────────────────────────────────────────────────

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
      // 1. Restore the staff account via secured RPC (must happen before status update)
      const { error: archiveError } = await supabase.rpc('set_staff_archive_state', {
        target_user_id: reactivateMember.id,
        archived: false,
        change_note: reactivateNote.trim(),
      });
      if (archiveError) throw archiveError;

      // 2. Update employment_status -> 'active' via secured RPC
      await updateStaffStatus(reactivateMember.id, 'active', false, reactivateNote.trim());

      toast.success(`${getDisplayName(reactivateMember)} has been reactivated.`);
      setReactivateMember(null);
      setReactivateNote('');
    } catch (err) {
      toast.error('Failed to reactivate account: ' + (err?.message || 'unknown error'));
    } finally {
      setReactivating(false);
    }
  };

  // ── Table rows ────────────────────────────────────────────────────────────

  const renderActiveRows = () => {
    if (loading) {
      return (
        <tr>
          <td colSpan="6" className="text-center py-8">
            <div className="staff-loading-wrap">
              <div className="staff-loading-spinner" />
              <span className="text-secondary text-sm">Loading team members...</span>
            </div>
          </td>
        </tr>
      );
    }
    if (filteredActive.length === 0) {
      return (
        <tr>
          <td colSpan="6">
            <div className="staff-empty-state">
              <div className="staff-empty-icon">
                <UserMinus size={32} />
              </div>
              <h4>No staff members found</h4>
              <p className="text-secondary text-sm">
                {searchTerm || roleFilter !== 'all'
                  ? 'There are no active staff members matching your current filters.'
                  : 'No active staff members registered in the system.'}
              </p>
              {(searchTerm || roleFilter !== 'all') && (
                <button
                  type="button"
                  className="btn-outline staff-empty-btn"
                  onClick={() => {
                    setSearchTerm('');
                    setRoleFilter('all');
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          </td>
        </tr>
      );
    }

    return filteredActive.map((member) => (
      <tr key={member.id} className="staff-table-row">
        <td>
          <div className="member-info">
            <div
              className={`staff-avatar ${member.role === 'owner' ? 'avatar-owner' : 'avatar-staff'}`}
            >
              {(getDisplayName(member) || 'U')[0].toUpperCase()}
            </div>
            <div className="member-details">
              <div className="member-name">{getDisplayName(member)}</div>
              <div className="member-email">{member.email}</div>
            </div>
          </div>
        </td>
        <td>
          <div
            className={`role-chip ${member.role === 'owner' ? 'owner-chip' : 'staff-chip'}`}
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
            title={member.role === 'owner' ? 'Master owner role locked' : 'Click to change role'}
          >
            {member.role === 'owner' && <Crown size={13} className="owner-crown-icon" />}
            {member.role !== 'owner' && <Shield size={13} className="staff-shield-icon" />}
            <span className="role-chip-text">
              {getDisplayRole(member.role)}
            </span>
          </div>
        </td>
        <td>
          {(() => {
            const es = member.employmentStatus || 'active';
            const m = EMPLOYMENT_STATUS_META[es] || { label: es, cls: 'emp-active' };
            return (
              <span className={`emp-badge ${m.cls}`}>
                <span className="emp-dot" />
                {m.label}
              </span>
            );
          })()}
        </td>
        <td>
          {member.isBlocked ? (
            <span className="emp-badge emp-blocked">
              <ShieldAlert size={12} /> Blocked
            </span>
          ) : (
            <span className="emp-badge emp-clear">
              <ShieldCheck size={12} /> Clear
            </span>
          )}
        </td>
        <td className="text-secondary text-sm">
          {member.createdAt
            ? new Date(member.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })
            : 'N/A'}
        </td>
        <td className="text-right">
          <div className="staff-actions-cell">
            <button
              type="button"
              className="icon-btn-small staff-action-btn"
              onClick={() => navigate(`/staff/${member.id}`)}
              title="View Staff Profile"
              aria-label="View Staff Profile"
            >
              <Eye size={16} />
            </button>
            {member.role !== 'owner' && (
              <button
                type="button"
                className="icon-btn-small staff-action-btn text-danger"
                onClick={() => handleRemove(member)}
                title="Archive Staff Member"
                aria-label="Archive Staff Member"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </td>
      </tr>
    ));
  };

  const renderArchivedRows = () => {
    if (loading) {
      return (
        <tr>
          <td colSpan="7" className="text-center py-8">
            <div className="staff-loading-wrap">
              <div className="staff-loading-spinner" />
              <span className="text-secondary text-sm">Loading archived members...</span>
            </div>
          </td>
        </tr>
      );
    }
    if (filteredArchived.length === 0) {
      return (
        <tr>
          <td colSpan="7">
            <div className="staff-empty-state">
              <div className="staff-empty-icon">
                <Archive size={32} />
              </div>
              <h4>No archived members</h4>
              <p className="text-secondary text-sm">
                Archived staff will appear here. Use the archive action on the Active tab to move someone here.
              </p>
              {(searchTerm || roleFilter !== 'all') && (
                <button
                  type="button"
                  className="btn-outline staff-empty-btn"
                  onClick={() => {
                    setSearchTerm('');
                    setRoleFilter('all');
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          </td>
        </tr>
      );
    }

    return filteredArchived.map((member) => (
      <tr key={member.id} className="staff-table-row archived-row">
        <td>
          <div className="member-info">
            <div className="staff-avatar avatar-archived">
              {(getDisplayName(member) || 'U')[0].toUpperCase()}
            </div>
            <div className="member-details">
              <div className="member-name">{getDisplayName(member)}</div>
              <div className="member-email">{member.email}</div>
            </div>
          </div>
        </td>
        <td>
          <div className={`role-chip ${member.role === 'owner' ? 'owner-chip' : 'staff-chip'}`}>
            {member.role === 'owner' && <Crown size={13} className="owner-crown-icon" />}
            {member.role !== 'owner' && <Shield size={13} className="staff-shield-icon" />}
            <span className="role-chip-text">{getDisplayRole(member.role)}</span>
          </div>
        </td>
        <td>
          {(() => {
            const es = member.employmentStatus || 'resigned';
            const m = EMPLOYMENT_STATUS_META[es] || { label: es, cls: 'emp-resigned' };
            return (
              <span className={`emp-badge ${m.cls}`}>
                <span className="emp-dot" />
                {m.label}
              </span>
            );
          })()}
        </td>
        <td className="text-secondary text-sm" style={{ maxWidth: 220 }}>
          {historyNotes[member.id] ? (
            <span
              title={historyNotes[member.id]}
              className="archive-note-text"
            >
              {historyNotes[member.id]}
            </span>
          ) : (
            <span className="text-secondary" style={{ fontStyle: 'italic' }}>No note</span>
          )}
        </td>
        <td className="text-secondary text-sm">
          {member.createdAt
            ? new Date(member.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })
            : 'N/A'}
        </td>
        <td className="text-secondary text-sm">
          {member.updatedAt
            ? new Date(member.updatedAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })
            : 'N/A'}
        </td>
        <td className="text-right">
          <div className="staff-actions-cell">
            <button
              type="button"
              className="icon-btn-small staff-action-btn"
              onClick={() => navigate(`/staff/${member.id}`)}
              title="View Staff Profile"
              aria-label="View Staff Profile"
            >
              <Eye size={16} />
            </button>
            {isAdminUnlocked && (
              <button
                type="button"
                className="icon-btn-small staff-action-btn text-success"
                onClick={() => openReactivateModal(member)}
                title="Reactivate Account"
                aria-label="Reactivate Account"
              >
                <ArchiveRestore size={16} />
              </button>
            )}
          </div>
        </td>
      </tr>
    ));
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page-container">
      <PageHeader
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Team Management' }]}
        title="Team Management"
        subtitle="Create and manage staff accounts for the admin dashboard"
        category="ADMINISTRATION"
        actions={
          viewMode === 'active' && (
            <button
              className="btn-primary flex-center gap-2"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <UserPlus size={18} /> Invite Staff Member
            </button>
          )
        }
      />

      <div className="card staff-card">
        {/* Scope Bar: Active vs Archived */}
        <div className="staff-scope-bar">
          <div className="staff-scope-tabs" role="tablist" aria-label="Staff Scope">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'active'}
              className={`staff-scope-tab ${viewMode === 'active' ? 'active' : ''}`}
              onClick={() => setViewMode('active')}
            >
              <Users size={15} />
              <span>Active Team</span>
              <span className="staff-scope-count">{activeStaff.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'archived'}
              className={`staff-scope-tab ${viewMode === 'archived' ? 'active' : ''}`}
              onClick={() => setViewMode('archived')}
            >
              <Archive size={15} />
              <span>Archived</span>
              <span className="staff-scope-count">{archivedStaff.length}</span>
            </button>
          </div>
        </div>

        {/* Toolbar: Search and Filter */}
        <div className="staff-toolbar">
          <div className="staff-search-box">
            <Search size={17} className="staff-search-icon" />
            <input
              id="staff-search-input"
              name="staffSearch"
              type="text"
              placeholder={
                viewMode === 'archived'
                  ? 'Search archived staff by name or email...'
                  : 'Search staff by name or email...'
              }
              aria-label="Search staff by name or email"
              autoComplete="off"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="staff-search-input"
            />
            {searchTerm && (
              <button
                type="button"
                className="staff-search-clear"
                onClick={() => setSearchTerm('')}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="staff-filter-group">
            <select
              autoComplete="off"
              id="staff-role-filter"
              name="staffRoleFilter"
              className="staff-role-select"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              aria-label="Filter by role"
            >
              <option value="all">All Roles</option>
              <option value="owner">Owner</option>
              <option value="staff">Sales Staff</option>
            </select>
            {(searchTerm || roleFilter !== 'all') && (
              <button
                type="button"
                className="staff-reset-btn"
                onClick={() => {
                  setSearchTerm('');
                  setRoleFilter('all');
                }}
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="table-container staff-table-container">
          {viewMode === 'active' ? (
            <table className="table staff-table">
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
            <table className="table staff-table">
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

      {/* Create Staff Modal */}
      {isCreateModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content staff-modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div>
                <h2>Invite Staff Member</h2>
                <p className="modal-subtitle">Send an email invitation to join the admin team</p>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => !creating && setIsCreateModalOpen(false)}
                disabled={creating}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateAccount} className="modal-body">
              <div className="form-group">
                <label className="label" htmlFor="create-staff-email">
                  Email Address <span style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <input
                  id="create-staff-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="e.g. staff.member@gmail.com"
                  className="input-field"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  required
                  disabled={creating}
                />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="create-staff-role">
                  Access Role <span style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <select
                  autoComplete="off"
                  id="create-staff-role"
                  className="input-field"
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                  disabled={creating}
                >
                  <option value="staff">Sales Staff</option>
                  <option value="owner">Owner (Full Access)</option>
                </select>
              </div>
              <div className="staff-invite-info-callout">
                <Shield size={16} className="text-secondary" style={{ flexShrink: 0, marginTop: 2 }} />
                <p>
                  We will email a verification link to this address. Once the invitee clicks the link and creates their password, their profile activates and they will appear in Team Management.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={creating}>
                  {creating ? 'Sending Invite...' : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reactivate Modal */}
      {reactivateMember && (
        <div className="modal-overlay">
          <div className="modal-content staff-modal-content" style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h2>Reactivate Staff Account</h2>
              <button
                type="button"
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
                  autoComplete="off"
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
                  {reactivating ? 'Reactivating...' : 'Reactivate Account'}
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
