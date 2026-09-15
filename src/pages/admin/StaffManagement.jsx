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
  CheckCircle2,
  Mail,
  AlertTriangle,
} from 'lucide-react';
import {
  subscribeToStaff,
  updateStaffStatus,
  updateStaffRole,
  resendStaffInvite,
} from '../../services/staffService';
import { supabase } from '../../lib/supabaseClient';
import { toast } from 'sonner';
import ConfirmDialog from '../../components/ConfirmDialog';
import PageHeader from '../../components/PageHeader';
import './StaffManagement.css';

const EMPLOYMENT_STATUS_META = {
  active:     { label: 'Active',      cls: 'emp-active' },
  invited:    { label: 'Invited',     cls: 'emp-invited' },
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
  const [historyNotes, setHistoryNotes] = useState({});

  // ── Reactivate modal ──────────────────────────────────────────────────────
  const [reactivateMember, setReactivateMember] = useState(null);
  const [reactivateNote, setReactivateNote] = useState('');
  const [reactivating, setReactivating] = useState(false);

  // ── Create / Invitation Modal ────────────────────────────────────────────
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', role: 'staff' });
  const [creating, setCreating] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState(null);

  // ── Resend Invite State ───────────────────────────────────────────────────
  const [resendingEmail, setResendingEmail] = useState(null);
  const [resendConfirm, setResendConfirm] = useState(null);

  // ── Subscribe to ALL staff (including deleted) ────────────────────────────
  useEffect(() => {
    const unsub = subscribeToStaff((data) => {
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
  const getDisplayRole = (role) => {
    if (role === 'owner') return 'Owner';
    if (role === 'admin') return 'Admin';
    return 'Sales Staff';
  };

  const filteredActive = activeStaff
    .filter(
      (s) =>
        (roleFilter === 'all' || s.role === roleFilter) &&
        (getDisplayName(s).toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.email || '').toLowerCase().includes(searchTerm.toLowerCase())),
    )
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const filteredArchived = archivedStaff
    .filter(
      (s) =>
        (roleFilter === 'all' || s.role === roleFilter) &&
        (getDisplayName(s).toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.email || '').toLowerCase().includes(searchTerm.toLowerCase())),
    )
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

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
            role: 'staff',
          }),
        },
      );
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || 'Failed to create staff account');
        return;
      }

      // Advance to Step 2: Show Invitation Confirmation Card
      setCreatedCredentials({
        email: result.email || createForm.email,
        role: 'Sales Staff',
        emailSent: Boolean(result.emailSent),
        deliveryStatus: result.deliveryStatus || (result.emailSent ? 'sent' : 'failed'),
        emailError: result.emailError || null,
      });

      if (result.emailSent) {
        toast.success(`Staff invitation sent to ${createForm.email}!`);
      } else {
        toast.warning(`Account provisioned, but invite email delivery failed: ${result.emailError || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Staff creation error:', err);
      toast.error('Failed to create staff account: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
    setCreateForm({ email: '', role: 'staff' });
    setCreatedCredentials(null);
  };

  const handleResendInvite = async () => {
    if (!resendConfirm) return;
    const member = resendConfirm;
    setResendingEmail(member.id);
    try {
      const result = await resendStaffInvite(member.id);
      if (result.emailSent) {
        toast.success(`Invitation resent to ${member.email}`);
      } else {
        toast.warning(`Invitation regenerated, but email dispatch failed: ${result.emailError || 'Unknown error'}`);
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to resend invitation');
    } finally {
      setResendingEmail(null);
      setResendConfirm(null);
    }
  };

  const confirmRoleToggle = async () => {
    if (!roleToggleConfirm) return;
    const member = roleToggleConfirm;
    const newRole = member.role === 'admin' ? 'staff' : 'admin';
    const name = getDisplayName(member);
    try {
      await updateStaffRole(member.id, newRole);
      toast.success(`${name} is now ${newRole === 'admin' ? 'Admin' : 'Sales Staff'}`);
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
    if (member.employmentStatus === 'invited') {
      toast.error('Role cannot be changed while account is pending activation.');
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
      const { error: archiveError } = await supabase.rpc('set_staff_archive_state', {
        target_user_id: reactivateMember.id,
        archived: false,
        change_note: reactivateNote.trim(),
      });
      if (archiveError) throw archiveError;

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

    return filteredActive.map((member) => {
      const isInvited = member.employmentStatus === 'invited';
      const isDeliveryFailed = member.inviteDeliveryStatus === 'failed';

      return (
        <tr key={member.id} className="staff-table-row">
          <td>
            <div className="member-info">
              <div
                className={`staff-avatar ${member.role === 'owner' ? 'avatar-owner' : (member.role === 'admin' ? 'avatar-admin' : 'avatar-staff')}`}
              >
                {(getDisplayName(member) || 'U')[0].toUpperCase()}
              </div>
              <div className="member-details">
                <div className="member-name">{getDisplayName(member)}</div>
                <div className="member-email-row">
                  <span className="member-email">{member.email}</span>
                  {isInvited && isDeliveryFailed && (
                    <span className="emp-badge emp-failed" title="Invitation email delivery failed. Click Resend to retry.">
                      <AlertTriangle size={10} /> Delivery Failed
                    </span>
                  )}
                  {isInvited && !isDeliveryFailed && (
                    <span className="emp-badge emp-pending-invite" title="Staff member has not activated their account yet">
                      <Mail size={10} /> Invite Sent
                    </span>
                  )}
                </div>
              </div>
            </div>
          </td>
          <td>
            <div
              className={`role-chip ${member.role === 'owner' ? 'owner-chip' : (member.role === 'admin' ? 'admin-chip' : 'staff-chip')}`}
              onClick={() => toggleRole(member)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleRole(member);
                }
              }}
              role="button"
              tabIndex={0}
              style={{ cursor: member.role === 'owner' || isInvited ? 'default' : 'pointer' }}
              title={
                member.role === 'owner'
                  ? 'Master owner role locked'
                  : isInvited
                  ? 'Role cannot be modified until account is activated'
                  : 'Click to change role'
              }
            >
              {member.role === 'owner' && <Crown size={13} className="owner-crown-icon" />}
              {member.role === 'admin' && <ShieldCheck size={13} className="admin-shield-icon" />}
              {member.role === 'staff' && <Shield size={13} className="staff-shield-icon" />}
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
              {member.role !== 'owner' && isInvited && (
                <button
                  type="button"
                  className="icon-btn-small staff-action-btn staff-resend-btn"
                  onClick={() => setResendConfirm(member)}
                  disabled={resendingEmail === member.id}
                  title="Resend invitation email"
                  aria-label="Resend invitation email"
                >
                  <Mail size={16} />
                </button>
              )}
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
      );
    });
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
              onClick={() => {
                setIsCreateModalOpen(true);
              }}
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
              <option value="admin">Admin</option>
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

      {/* ── Two-Step Create Staff / Credentials Modal ── */}
      {isCreateModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content staff-modal-content" style={{ maxWidth: createdCredentials ? 540 : 500 }}>
            {!createdCredentials ? (
              <>
                <div className="modal-header">
                  <div>
                    <h2>Invite Staff Member</h2>
                    <p className="modal-subtitle">Send a secure workforce invitation link</p>
                  </div>
                  <button
                    type="button"
                    className="close-btn"
                    onClick={handleCloseCreateModal}
                    disabled={creating}
                  >
                    &times;
                  </button>
                </div>
                <form onSubmit={handleCreateAccount} className="modal-body">
                  <div className="form-group">
                    <label className="label" htmlFor="create-staff-email">
                      Staff Email Address <span style={{ color: 'var(--color-danger)' }}>*</span>
                    </label>
                    <input
                      id="create-staff-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="e.g. staff.member@example.com"
                      className="input-field"
                      value={createForm.email}
                      onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                      required
                      disabled={creating}
                    />
                  </div>
                  <div className="form-group">
                    <label className="label" htmlFor="create-staff-role">
                      Access Role
                    </label>
                    <select
                      autoComplete="off"
                      id="create-staff-role"
                      className="input-field"
                      value="staff"
                      disabled
                    >
                      <option value="staff">Sales Staff</option>
                    </select>
                    <p className="text-secondary text-xs" style={{ marginTop: '0.35rem' }}>
                      Workforce invitations are scoped to Sales Staff. Admin privileges may be granted after account activation.
                    </p>
                  </div>
                  <div className="staff-invite-info-callout">
                    <Mail size={18} className="text-secondary" style={{ flexShrink: 0, marginTop: 2 }} />
                    <p>
                      A secure invitation link will be emailed to the recipient. The link allows them to set their password and activate their staff account within 24 hours.
                    </p>
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={handleCloseCreateModal}
                      disabled={creating}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn-primary" disabled={creating}>
                      {creating ? 'Sending Invitation...' : 'Send Invitation'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              /* Step 2: Invitation Sent Card */
              <div className="credentials-card-step">
                <div className="modal-header">
                  <div className="flex-center gap-2">
                    <div className="cred-success-icon-wrap">
                      <CheckCircle2 size={22} className="text-success" />
                    </div>
                    <div>
                      <h2>Invitation Dispatched</h2>
                      <p className="modal-subtitle">Workforce account created and invitation link generated</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="close-btn"
                    onClick={handleCloseCreateModal}
                  >
                    &times;
                  </button>
                </div>

                <div className="modal-body credentials-card-body">
                  <div className="credentials-display-box">
                    <div className="cred-field-row">
                      <span className="cred-field-label">Invited Email:</span>
                      <span className="cred-field-value font-mono">{createdCredentials.email}</span>
                    </div>
                    <div className="cred-field-row">
                      <span className="cred-field-label">Assigned Role:</span>
                      <span className="cred-field-value">{createdCredentials.role}</span>
                    </div>
                    <div className="cred-field-row">
                      <span className="cred-field-label">Delivery Status:</span>
                      <span className="cred-field-value">
                        {createdCredentials.emailSent ? (
                          <span className="text-success flex-center gap-1" style={{ display: 'inline-flex' }}>
                            <CheckCircle2 size={14} /> Dispatched via Email
                          </span>
                        ) : (
                          <span className="text-danger flex-center gap-1" style={{ display: 'inline-flex' }}>
                            <AlertTriangle size={14} /> Delivery Failed ({createdCredentials.emailError || 'Failed to dispatch'})
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="staff-invite-info-callout" style={{ marginTop: '1rem' }}>
                    <Shield size={16} style={{ color: 'var(--color-gold)', flexShrink: 0, marginTop: 2 }} />
                    <p>
                      {createdCredentials.emailSent
                        ? 'The staff member has received a secure invitation email with a link to activate their account and set their password. The link expires in 24 hours.'
                        : 'The account was provisioned in invited status, but the invitation email could not be sent. You can retry delivery anytime using the Resend button in the staff list.'}
                    </p>
                  </div>

                  <div className="modal-footer" style={{ borderTop: 'none', padding: '1rem 0 0 0' }}>
                    <button
                      type="button"
                      className="btn-primary w-full text-center"
                      onClick={handleCloseCreateModal}
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            )}
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
        isOpen={!!resendConfirm}
        title="Resend Invitation?"
        message={`Resend a fresh invitation email to ${getDisplayName(resendConfirm)} (${resendConfirm?.email})? Any previous invitation link will be invalidated.`}
        confirmText={resendingEmail ? 'Sending...' : 'Resend Invite'}
        onConfirm={handleResendInvite}
        onCancel={() => setResendConfirm(null)}
      />

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
