 
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useCallback } from 'react';
import debounce from 'lodash.debounce';
import {
  Search,
  Mail,
  Phone,
  ShoppingBag,
  Ruler,
  Edit,
  Trash2,
  Save,
  Clock,
  Star,
  TrendingUp,
  Calendar,
  Heart,
  Users,
} from 'lucide-react';
import { logAction } from '../../services/staffService';
import { getLogsForTarget } from '../../lib/supabaseService';
import HistoryTimeline from '../../components/HistoryTimeline';
import {
  updateCustomer,
  deleteCustomer,
  sendNotification,
  getPaginatedCustomers,
  getCustomerMeasurements,
  saveCustomerMeasurements,
  getCustomerStatsBatch,
  ENGAGEMENT_FORMULA,
} from '../../services/customerService';
import { toast } from 'sonner';
import {
  getAvatarColor,
  getUserDisplayName,
  formatRelativeTime,
  formatCurrency,
  formatDate,
  getHealthLabel,
} from '../../utils/helpers';
import { can } from '../../utils/permissions';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePresence } from '../../hooks/usePresence';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/PageHeader';
import SkeletonTable from '../../components/SkeletonTable';
import ConfirmDialog from '../../components/ConfirmDialog';
import './Customers.css';

// ── Component ────────────────────────────────────────────────

const Customers = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const onlineUsers = usePresence(user?.uid, (user?.role || 'staff').toLowerCase());
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [msgModal, setMsgModal] = useState(null);
  const [msgText, setMsgText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  const fetchCustomers = async (loadMore = false, signal = null) => {
    if (loadMore) setLoadingMore(true);
    else setLoading(true);

    try {
      const PAGE_SIZE = 20;
      // Fetch without orderBy so Firestore doesn't drop legacy documents missing the field
      const result = await getPaginatedCustomers(PAGE_SIZE, loadMore ? lastDoc : null);

      if (signal?.aborted) return;

      const appUsers = result.data.filter((u) => !u.role || u.role === 'customer');

      // Engagement figures aren't columns on `profiles` — derive them from real
      // reservation/wardrobe data (batched: 2 queries for the whole page).
      let enriched = appUsers;
      try {
        const stats = await getCustomerStatsBatch(appUsers.map((u) => u.docId ?? u.id));
        enriched = appUsers.map((u) => ({ ...u, ...(stats[u.docId ?? u.id] ?? {}) }));
      } catch (statsErr) {
        // Never let a stats failure blank out the customer list itself.
        console.error('Failed to load customer stats:', statsErr?.message ?? statsErr);
      }

      if (signal?.aborted) return;

      // Sort newly joined users to the top locally
      enriched.sort((a, b) => {
        const timeA = new Date(a.createdAt ?? 0).getTime() || 0;
        const timeB = new Date(b.createdAt ?? 0).getTime() || 0;
        return timeB - timeA;
      });
      setCustomers((prev) => {
        const d = loadMore ? [...prev, ...enriched] : enriched;
        const unique = [];
        const seen = new Set();
        d.forEach((user) => {
          if (!seen.has(user.id)) {
            unique.push(user);
            seen.add(user.id);
          }
        });
        return unique;
      });
      setLastDoc(result.lastVisible);
      setHasMore(result.hasMore);
    } catch (e) {
      console.error('Failed to load customers API Error:', e);
      toast.error('Failed to load customers: ' + e.message);
    } finally {
      if (loadMore) setLoadingMore(false);
      else setLoading(false);
    }
  };

  React.useEffect(() => {
    const controller = new AbortController();
    fetchCustomers(false, controller.signal);
    return () => {
      controller.abort();
    };
    // Intentionally mount-only: fetchCustomers closes over lastDoc, which it
    // sets after every fetch. Tracking it here would re-run this effect (and
    // re-fetch page 1) every time lastDoc changes -- the "Load More" button
    // at line ~600 is the only place pagination should advance.
     
  }, []);

  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  // debounce(...) only closes over the stable setSearchTerm setter, so an
  // empty dep array is correct; eslint can't statically verify that through
  // the debounce() call wrapper.
   
  const debouncedSearch = useCallback(
    debounce((val) => setSearchTerm(val), 300),
    []
  );

  React.useEffect(() => {
    return () => {
      debouncedSearch.cancel?.();
    };
  }, [debouncedSearch]);

  const handleSearchChange = (e) => {
    setSearchInput(e.target.value);
    debouncedSearch(e.target.value);
  };

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [custHistory, setCustHistory] = useState([]);
  const [custHistoryLoading, setCustHistoryLoading] = useState(false);

  React.useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const id = sp.get('id');
    const str = sp.get('search');
    
    if (str && !searchInput) {
      setSearchInput(str);
      setSearchTerm(str);
    }
    
    if (id && customers.length > 0 && !selectedCustomer) {
      const c = customers.find(x => (x.docId || x.id) === id);
      if (c) {
        setSelectedCustomer(c);
        const newParams = new URLSearchParams(location.search);
        newParams.delete('id');
        const newSearch = newParams.toString();
        navigate(`/customers${newSearch ? '?' + newSearch : ''}`, { replace: true });
      }
    }
  }, [location.search, customers.length, selectedCustomer, searchInput, navigate]);
  // Body metrics live in `user_measurements`, not on the profile row — load them
  // separately whenever a customer profile is opened.
  const [custMeasurements, setCustMeasurements] = useState(null);

  React.useEffect(() => {
    if (!selectedCustomer?.docId) {
      setCustMeasurements(null);
      return;
    }
    let cancelled = false;
    getCustomerMeasurements(selectedCustomer.docId)
      .then((row) => { if (!cancelled) setCustMeasurements(row); })
      .catch(() => { if (!cancelled) setCustMeasurements(null); });
    return () => { cancelled = true; };
  }, [selectedCustomer?.docId]);

  // Load the account history feed whenever a customer profile is opened
  React.useEffect(() => {
    if (!selectedCustomer?.docId) {
      setCustHistory([]);
      return;
    }
    let cancelled = false;
    setCustHistoryLoading(true);
    getLogsForTarget('profile', selectedCustomer.docId)
      .then((logs) => {
        if (cancelled) return;
        setCustHistory(
          logs.map((l) => ({
            id: l.id,
            typeLabel: `📝 ${l.action}`,
            note: l.details?.note || null,
            actorName: l.userName,
            timestamp: l.timestamp,
          })),
        );
      })
      .finally(() => { if (!cancelled) setCustHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [selectedCustomer?.docId]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  // `profiles` has no status column — customer state is derived from is_blocked.
  const statusLabel = (c) => (c?.isBlocked ? 'Inactive' : 'Active');

  const filteredCustomers = customers.filter(
    (c) =>
      getUserDisplayName(c)
        .toLowerCase()
        .includes((searchTerm || '').toLowerCase()) ||
      (c.email || '').toLowerCase().includes((searchTerm || '').toLowerCase()),
  );

  // Stats
  const totalCustomers = customers.length;
  // There is no presence/last_online column anywhere in the schema, so a live
  // "online now" figure is not derivable — this reports real recent activity
  // (a reservation in the last 30 days) instead of a value that was always 0.
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const activeCount = customers.filter(
    (c) => c.lastActivity && Date.now() - new Date(c.lastActivity).getTime() < THIRTY_DAYS,
  ).length;
  const newThisMonth = customers.filter((c) => {
    const joined = new Date(c.createdAt ?? 0);
    const now = new Date();
    return joined.getMonth() === now.getMonth() && joined.getFullYear() === now.getFullYear();
  }).length;
  const avgEngagement =
    customers.length > 0
      ? Math.round(
          customers.reduce((sum, c) => sum + (c.engagementScore || 0), 0) / customers.length,
        )
      : 0;

  // --- EDIT CUSTOMER ---
  const startEdit = () => {
    const m = custMeasurements?.measurements || {};
    setEditForm({
      name: getUserDisplayName(selectedCustomer),
      email: selectedCustomer.email,
      phone: selectedCustomer.phone,
      status: selectedCustomer.isBlocked ? 'Inactive' : 'Active',
      // Read canonical jsonb keys, falling back to any legacy admin-written keys
      topBust: m.bust ?? m.topBust ?? '',
      underBust: m.underBust ?? '',
      waist: m.waist ?? '',
      hip: m.hips ?? m.hip ?? '',
      neck: m.neck ?? m.neckBase ?? '',
      shoulderWidth: m.shoulderWidth ?? '',
      armLength: m.armLength ?? '',
      backLength: m.torsoLength ?? m.backLength ?? '',
      insideLegLength: m.inseam ?? m.insideLegLength ?? '',
      height: custMeasurements?.height ?? '',
      weight: custMeasurements?.weight ?? '',
    });
    setIsEditing(true);
  };

  const handleEditSave = async () => {
    const toNum = (v) => (v === '' || v === null || v === undefined ? null : parseFloat(v));

    // Split the single display name back into first/last (last token = surname).
    const nameParts = (editForm.name || '').trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : (nameParts[0] || '');
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

    // Real `profiles` columns only. Status maps to the is_blocked flag
    // (Active = not blocked, Inactive = blocked) — there is no status column.
    const profileUpdates = {
      firstName,
      lastName,
      email: editForm.email,
      phone: editForm.phone,
      isBlocked: editForm.status === 'Inactive',
    };

    // Body metrics → user_measurements. Merge onto the existing jsonb so any
    // keys the admin form doesn't surface (confidence, etc.) survive.
    const measurements = {
      ...(custMeasurements?.measurements || {}),
      bust: toNum(editForm.topBust),
      underBust: toNum(editForm.underBust),
      waist: toNum(editForm.waist),
      hips: toNum(editForm.hip),
      neck: toNum(editForm.neck),
      shoulderWidth: toNum(editForm.shoulderWidth),
      armLength: toNum(editForm.armLength),
      torsoLength: toNum(editForm.backLength),
      inseam: toNum(editForm.insideLegLength),
    };
    const height = toNum(editForm.height);
    const weight = toNum(editForm.weight);

    try {
      await updateCustomer(selectedCustomer.docId, profileUpdates);
      await saveCustomerMeasurements(selectedCustomer.docId, { height, weight, measurements });

      // Audit: record which profile fields actually changed (from → to)
      const changes = {};
      const beforeName = getUserDisplayName(selectedCustomer);
      if (editForm.name !== beforeName) changes.name = { from: beforeName ?? null, to: editForm.name };
      ['email', 'phone'].forEach((f) => {
        if (profileUpdates[f] !== undefined && profileUpdates[f] !== selectedCustomer[f]) {
          changes[f] = { from: selectedCustomer[f] ?? null, to: profileUpdates[f] };
        }
      });
      const beforeStatus = selectedCustomer.isBlocked ? 'Inactive' : 'Active';
      if (editForm.status !== beforeStatus) {
        changes.status = { from: beforeStatus, to: editForm.status };
      }
      await logAction(user, 'Updated customer profile', {
        targetType: 'profile',
        targetId: selectedCustomer.docId,
        customerName: editForm.name,
        changes,
      });

      // Reflect changes locally without a refetch
      const patched = { ...selectedCustomer, firstName, lastName, name: undefined, email: editForm.email, phone: editForm.phone, isBlocked: profileUpdates.isBlocked };
      setSelectedCustomer(patched);
      setCustMeasurements({ ...(custMeasurements || {}), height, weight, measurements });
      setCustomers((prev) => prev.map((c) => (c.id === selectedCustomer.id ? { ...c, ...patched } : c)));
      setIsEditing(false);
      toast.success(`Updated ${editForm.name}`);
    } catch (e) {
      toast.error('Failed to update customer: ' + (e?.message || 'unknown error'));
    }
  };

  // --- DELETE CUSTOMER ---
  const handleDelete = async () => {
    try {
      await deleteCustomer(deleteConfirm.docId);
      await logAction(user, 'Archived customer account', {
        targetType: 'profile',
        targetId: deleteConfirm.docId,
        customerName: getUserDisplayName(deleteConfirm),
      });
      toast.success(`Removed customer ${getUserDisplayName(deleteConfirm)}`);
      setDeleteConfirm(null);
      setSelectedCustomer(null);
    } catch {
      toast.error('Failed to delete customer');
    }
  };

  // --- SEND MESSAGE ---
  const handleSendMessage = async () => {
    if (!msgText.trim()) return;
    setSendingMsg(true);
    try {
      await sendNotification(
        msgModal.docId,
        getUserDisplayName(msgModal),
        msgText
      );
      await logAction(user, 'Sent notification to customer', {
        targetType: 'profile',
        targetId: msgModal.docId,
        customerName: getUserDisplayName(msgModal),
      });
      toast.success('Message sent successfully');
      setMsgModal(null);
      setMsgText('');
    } catch {
      toast.error('Failed to send message');
    } finally {
      setSendingMsg(false);
    }
  };

  const getCustomerTags = (cust) => {
    const tags = [];
    if ((cust.totalSpent || 0) >= 50000) tags.push({ label: '💎 VIP', color: 'var(--status-pending-text)', bg: 'var(--status-pending-bg)' });
    if ((cust.reservationCount || 0) >= 5) tags.push({ label: '🔁 Frequent', color: 'var(--status-completed-text)', bg: 'var(--status-completed-bg)' });
    if (cust.hasMeasurements || (cust.topBust && cust.waist)) tags.push({ label: '📏 Fit Profile', color: 'var(--status-approved-text)', bg: 'var(--status-approved-bg)' });
    if (cust.isBlocked) tags.push({ label: '⛔ Blocked', color: 'var(--status-cancelled-text)', bg: 'var(--status-cancelled-bg)' });
    return tags;
  };

  return (
    <div className="page-container">
      <PageHeader
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Customers' }]}
        title="App Customers"
        subtitle="View registered app users, profiles, and engagement metrics"
        category="PEOPLE"
      />

      {/* ===== STATS ROW ===== */}
      <div className="customer-stats-row">
        <div className="cstat-card">
          <div
            className="cstat-icon"
            style={{ background: 'linear-gradient(135deg, #6366F1, #818CF8)' }}
          >
            <ShoppingBag size={18} />
          </div>
          <div>
            <p className="cstat-value">{totalCustomers}</p>
            <p className="cstat-label">Total Customers</p>
          </div>
        </div>
        <div className="cstat-card">
          <div
            className="cstat-icon"
            style={{ background: 'linear-gradient(135deg, #10B981, #34D399)' }}
          >
            <Clock size={18} />
          </div>
          <div>
            <p className="cstat-value">{activeCount}</p>
            <p className="cstat-label">Active (30 days)</p>
          </div>
        </div>
        <div className="cstat-card">
          <div
            className="cstat-icon"
            style={{ background: 'linear-gradient(135deg, #D4AF37, #F5D76E)' }}
          >
            <Star size={18} />
          </div>
          <div>
            <p className="cstat-value">{newThisMonth}</p>
            <p className="cstat-label">New This Month</p>
          </div>
        </div>
        <div className="cstat-card">
          <div
            className="cstat-icon"
            style={{ background: 'linear-gradient(135deg, #F97316, #FB923C)' }}
          >
            <TrendingUp size={18} />
          </div>
          <div>
            <p className="cstat-value">{avgEngagement}%</p>
            <p className="cstat-label">Avg. Engagement</p>
          </div>
        </div>
      </div>

      {/* ===== TABLE ===== */}
      <div className="card">
        <div className="card-toolbar">
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input
              id="customers-search-input"
              name="customersSearch"
              type="text"
              placeholder="Search by name or email..."
              aria-label="Search by name or email"
              autoComplete="off"
              value={searchInput}
              onChange={handleSearchChange}
              className="input-field pl-10"
            />
          </div>
        </div>

        <div className="table-container">
          {loading ? (
            <div className="p-4"><SkeletonTable columns={6} rows={5} /></div>
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th title="Last time customer opened or engaged with the mobile app">Last Seen</th>
                    <th>Engagement</th>
                    <th>Lifetime Value</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((cust) => (
                    <tr key={cust.id} className="table-row-hover">
                      <td>
                        <div className="flex-center gap-3 customer-cell">
                          <div className="avatar-wrap">
                            {cust.profileImageUrl ? (
                              <img 
                                src={cust.profileImageUrl} 
                                alt="avatar" 
                                className="avatar" 
                                style={{ objectFit: 'cover' }} 
                              />
                            ) : (
                              <div
                                className="avatar"
                                style={{ backgroundColor: getAvatarColor(getUserDisplayName(cust)) }}
                              >
                                {getUserDisplayName(cust)
                                  .split(' ')
                                  .map((n) => n[0])
                                  .join('')
                                  .substring(0, 2)
                                  .toUpperCase()}
                              </div>
                            )}
                            <span
                              className={`online-dot ${
                                onlineUsers[cust.id || cust.docId]
                                  ? 'online'
                                  : 'offline'
                              }`}
                              title={
                                onlineUsers[cust.id || cust.docId]
                                  ? 'Online'
                                  : (cust.lastSeen || cust.lastActivity)
                                    ? `Last seen ${formatRelativeTime(cust.lastSeen || cust.lastActivity)}`
                                    : 'Offline'
                              }
                            ></span>
                          </div>
                          <div>
                            <p className="font-medium">{getUserDisplayName(cust)}</p>
                            <p className="text-secondary text-sm">{cust.email}</p>
                            {getCustomerTags(cust).length > 0 && (
                              <div className="customer-tags">
                                {getCustomerTags(cust).map(tag => (
                                  <span key={tag.label} className="cust-tag" style={{ color: tag.color, backgroundColor: tag.bg }}>
                                    {tag.label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="last-online-cell">
                          <span className="last-online-text">
                            {onlineUsers[cust.id || cust.docId]
                              ? <span style={{color: 'var(--success)'}}>Online now</span>
                              : (cust.lastSeen || cust.lastActivity) 
                                ? formatRelativeTime(cust.lastSeen || cust.lastActivity) 
                                : '-'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="engagement-chips">
                          <span className="eng-chip">
                            <ShoppingBag size={12} /> {cust.reservationCount || 0}
                          </span>
                          <span className="eng-chip">
                            <Heart size={12} /> {cust.wardrobeCount || 0}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`lifetime-value ${(cust.totalSpent || 0) > 50000 ? 'high-value' : ''}`}
                        >
                          {formatCurrency(cust.totalSpent)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`status-chip status-chip-${statusLabel(cust).toLowerCase()}`}
                        >
                          {statusLabel(cust)}
                        </span>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="btn-outline small"
                            onClick={() => {
                              setSelectedCustomer(cust);
                              setIsEditing(false);
                            }}
                          >
                            View
                          </button>
                          {can(user?.role, 'delete_customer') && (
                            <button
                              className="btn-outline small text-danger"
                              title="Request Account Deactivation"
                              onClick={() => {
                                setDeleteConfirm(cust);
                              }}
                            >
                              Deactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredCustomers.length === 0 && (
                    <tr>
                      <td colSpan="6" className="text-center py-8">
                        <div style={{ padding: '2rem' }}>
                          <Users size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
                          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
                            No Customers Yet
                          </h3>
                          <p
                            className="text-secondary"
                            style={{ maxWidth: '320px', margin: '0 auto', fontSize: '0.85rem' }}
                          >
                            Customers appear here when they sign up via the mobile app or are added
                            through reservations.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {hasMore && (
                <div
                  className="flex-center py-4"
                  style={{ borderTop: '1px solid var(--border-light)' }}
                >
                  <button
                    className="btn-outline"
                    onClick={() => fetchCustomers(true)}
                    disabled={loadingMore}
                  >
                    {loadingMore ? 'Loading...' : 'Load More'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ===== CUSTOMER PROFILE MODAL ===== */}
      {selectedCustomer && (
        <div
          className="modal-overlay"
          onClick={() => {
            setSelectedCustomer(null);
            setIsEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setSelectedCustomer(null);
              setIsEditing(false);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="modal-content profile-modal" onClick={(e) => e.stopPropagation()} role="presentation">
            <div className="modal-header">
              <h2>Customer Profile</h2>
              <div className="flex-center gap-2">
                {!isEditing ? (
                  <>
                    <button className="btn-outline small flex-center gap-1" onClick={startEdit}>
                      <Edit size={14} /> Edit
                    </button>
                    <button
                      className="icon-btn-small text-danger"
                      onClick={() => setDeleteConfirm(selectedCustomer)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn-outline small" onClick={() => setIsEditing(false)}>
                      Cancel
                    </button>
                    <button
                      className="btn-primary small flex-center gap-1"
                      onClick={handleEditSave}
                    >
                      <Save size={14} /> Save
                    </button>
                  </>
                )}
                <button
                  className="close-btn"
                  onClick={() => {
                    setSelectedCustomer(null);
                    setIsEditing(false);
                  }}
                >
                  &times;
                </button>
              </div>
            </div>
            <div className="profile-body">
              <div className="profile-sidebar">
                {selectedCustomer.profileImageUrl ? (
                  <img 
                    src={selectedCustomer.profileImageUrl} 
                    alt="avatar" 
                    className="profile-avatar-large" 
                    style={{ objectFit: 'cover' }} 
                  />
                ) : (
                  <div
                    className="profile-avatar-large"
                    style={{ backgroundColor: getAvatarColor(getUserDisplayName(selectedCustomer)) }}
                  >
                    {getUserDisplayName(selectedCustomer)
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .substring(0, 2)
                      .toUpperCase()}
                  </div>
                )}
                {isEditing ? (
                  <>
                    <input autoComplete="off" id="field_jtcus83" name="field_jtcus83"
                      type="text"
                      className="input-field mt-3"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                    <select autoComplete="off" id="field_3rsf05m" name="field_3rsf05m"
                      className="input-field mt-2"
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    >
                      <option>Active</option>
                      <option>Inactive</option>
                    </select>
                  </>
                ) : (
                  <>
                    <h3 className="profile-name-lg">{getUserDisplayName(selectedCustomer)}</h3>
                    <span
                      className={`status-chip status-chip-${statusLabel(selectedCustomer).toLowerCase()} mb-2`}
                    >
                      {statusLabel(selectedCustomer)}
                    </span>
                    {(() => {
                      const tags = [];
                      if ((selectedCustomer.totalSpent || 0) >= 50000) tags.push({ label: '💎 VIP', color: 'var(--status-pending-text)', bg: 'var(--status-pending-bg)' });
                      if ((selectedCustomer.reservationCount || 0) >= 5) tags.push({ label: '🔁 Frequent', color: 'var(--status-completed-text)', bg: 'var(--status-completed-bg)' });
                      if (custMeasurements && Object.values(custMeasurements).some(v => v)) tags.push({ label: '📏 Fit Profile', color: 'var(--status-approved-text)', bg: 'var(--status-approved-bg)' });
                      if (selectedCustomer.isBlocked) tags.push({ label: '⛔ Blocked', color: 'var(--status-cancelled-text)', bg: 'var(--status-cancelled-bg)' });
                      if (tags.length === 0) return null;
                      return (
                        <div className="customer-tags mt-2">
                          {tags.map(tag => (
                            <span key={tag.label} className="cust-tag" style={{ color: tag.color, backgroundColor: tag.bg }}>{tag.label}</span>
                          ))}
                        </div>
                      );
                    })()}
                    <p className="member-since">
                      <Calendar size={13} /> Member since {formatDate(selectedCustomer.createdAt || selectedCustomer.joinedAt)}
                    </p>
                    <p className="last-seen-tag">
                      <Clock size={13} /> Last activity{' '}
                      {selectedCustomer.lastActivity
                        ? formatRelativeTime(selectedCustomer.lastActivity)
                        : '— none yet'}
                    </p>
                  </>
                )}

                <div className="profile-contact">
                  {isEditing ? (
                    <>
                      <input autoComplete="off"
                        id="customer-edit-email"
                        name="customer-email"
                        type="email"
                        className="input-field"
                        placeholder="Email"
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      />
                      <input autoComplete="off"
                        id="customer-edit-phone"
                        name="customer-phone"
                        type="text"
                        className="input-field mt-2"
                        placeholder="Phone"
                        value={editForm.phone}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      />
                    </>
                  ) : (
                    <>
                      <div className="contact-item">
                        <Mail size={16} /> <span>{selectedCustomer.email}</span>
                      </div>
                      <div className="contact-item">
                        <Phone size={16} /> <span>{selectedCustomer.phone || 'Not provided'}</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="profile-stats">
                  <div className="p-stat">
                    <h4>{selectedCustomer.reservationCount || 0}</h4>
                    <p>Reservations</p>
                  </div>
                  <div className="p-stat">
                    <h4>{selectedCustomer.wardrobeCount || 0}</h4>
                    <p>Saved Items</p>
                  </div>
                </div>

                {!isEditing && (
                  <button 
                    className="btn-primary w-full mt-4 flex-center gap-2"
                    onClick={() => setMsgModal(selectedCustomer)}
                  >
                    <Mail size={16} /> Send Message
                  </button>
                )}
              </div>

              <div className="profile-main">
                {/* Health Score */}
                <div className="profile-section">
                  <h4 className="section-title flex-center gap-2 justify-start">
                    <TrendingUp size={18} /> Customer Health Score
                  </h4>
                  <div className="health-score-wrap">
                    <div className="health-bar-bg">
                      <div
                        className="health-bar-fill"
                        style={{
                          width: `${selectedCustomer.engagementScore || 0}%`,
                          background: `linear-gradient(90deg, ${getHealthLabel(selectedCustomer.engagementScore || 0).color}, ${getHealthLabel(selectedCustomer.engagementScore || 0).color}88)`,
                        }}
                      ></div>
                    </div>
                    <div className="health-meta">
                      <span className="health-score-num">
                        {selectedCustomer.engagementScore || 0}/100
                      </span>
                      <span
                        className="health-label"
                        style={{
                          color: getHealthLabel(selectedCustomer.engagementScore || 0).color,
                        }}
                      >
                        {getHealthLabel(selectedCustomer.engagementScore || 0).label}
                      </span>
                    </div>
                    <p className="text-secondary text-xs mt-1" title={ENGAGEMENT_FORMULA}>
                      {ENGAGEMENT_FORMULA}
                    </p>
                  </div>
                </div>

                {/* Lifetime Value & Preferred Sizes */}
                <div className="profile-section">
                  <h4 className="section-title flex-center gap-2 justify-start">
                    <ShoppingBag size={18} /> Purchase Summary
                  </h4>
                  <div className="purchase-summary-grid">
                    <div className="purchase-stat">
                      <span className="purchase-stat-label">Lifetime Spend</span>
                      <span className="purchase-stat-value">
                        {formatCurrency(selectedCustomer.totalSpent)}
                      </span>
                    </div>
                    <div className="purchase-stat">
                      <span className="purchase-stat-label">Preferred Sizes</span>
                      <div className="size-chips">
                        {(selectedCustomer.preferredSizes || []).length > 0 ? (
                          selectedCustomer.preferredSizes.map((s) => (
                            <span key={s} className="size-chip">
                              {s}
                            </span>
                          ))
                        ) : (
                          <span className="text-secondary text-sm">None yet</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Measurements – Full Android AI Scanner profile */}
                <div className="profile-section">
                  <h4 className="section-title flex-center gap-2 justify-start">
                    <Ruler size={18} /> Saved Measurements
                  </h4>
                  {isEditing ? (
                    <div className="measurements-grid">
                      <div className="measure-box">
                        <span>Bust</span>
                        <input autoComplete="off" id="cust-measure-topBust" name="topBust" type="number" className="input-field" value={editForm.topBust || ''}
                          onChange={(e) => setEditForm({ ...editForm, topBust: e.target.value })}
                          placeholder="—"
                        />
                      </div>
                      <div className="measure-box">
                        <span>Under Bust</span>
                        <input autoComplete="off" id="cust-measure-underBust" name="underBust" type="number" className="input-field" value={editForm.underBust || ''}
                          onChange={(e) => setEditForm({ ...editForm, underBust: e.target.value })}
                          placeholder="—"
                        />
                      </div>
                      <div className="measure-box">
                        <span>Waist</span>
                        <input autoComplete="off" id="cust-measure-waist" name="waist" type="number" className="input-field" value={editForm.waist || ''}
                          onChange={(e) => setEditForm({ ...editForm, waist: e.target.value })}
                          placeholder="—"
                        />
                      </div>
                      <div className="measure-box">
                        <span>Hips</span>
                        <input autoComplete="off" id="cust-measure-hip" name="hip" type="number" className="input-field" value={editForm.hip || ''}
                          onChange={(e) => setEditForm({ ...editForm, hip: e.target.value })}
                          placeholder="—"
                        />
                      </div>
                      <div className="measure-box">
                        <span>Neck</span>
                        <input autoComplete="off" id="cust-measure-neck" name="neck" type="number" className="input-field" value={editForm.neck || ''}
                          onChange={(e) => setEditForm({ ...editForm, neck: e.target.value })}
                          placeholder="—"
                        />
                      </div>
                      <div className="measure-box">
                        <span>Shoulder</span>
                        <input autoComplete="off" id="cust-measure-shoulderWidth" name="shoulderWidth" type="number" className="input-field" value={editForm.shoulderWidth || ''}
                          onChange={(e) =>
                            setEditForm({ ...editForm, shoulderWidth: e.target.value })
                          }
                          placeholder="—"
                        />
                      </div>
                      <div className="measure-box">
                        <span>Arm Length</span>
                        <input autoComplete="off" id="cust-measure-armLength" name="armLength" type="number" className="input-field" value={editForm.armLength || ''}
                          onChange={(e) => setEditForm({ ...editForm, armLength: e.target.value })}
                          placeholder="—"
                        />
                      </div>
                      <div className="measure-box">
                        <span>Back Length</span>
                        <input autoComplete="off" id="cust-measure-backLength" name="backLength" type="number" className="input-field" value={editForm.backLength || ''}
                          onChange={(e) => setEditForm({ ...editForm, backLength: e.target.value })}
                          placeholder="—"
                        />
                      </div>
                      <div className="measure-box">
                        <span>Inside Leg</span>
                        <input autoComplete="off" id="cust-measure-insideLegLength" name="insideLegLength" type="number" className="input-field" value={editForm.insideLegLength || ''}
                          onChange={(e) =>
                            setEditForm({ ...editForm, insideLegLength: e.target.value })
                          }
                          placeholder="—"
                        />
                      </div>
                      <div className="measure-box">
                        <span>Height (cm)</span>
                        <input autoComplete="off" id="cust-measure-height" name="height" type="number" className="input-field" value={editForm.height || ''}
                          onChange={(e) => setEditForm({ ...editForm, height: e.target.value })}
                          placeholder="—"
                        />
                      </div>
                      <div className="measure-box">
                        <span>Weight (kg)</span>
                        <input autoComplete="off" id="cust-measure-weight" name="weight" type="number" className="input-field" value={editForm.weight || ''}
                          onChange={(e) => setEditForm({ ...editForm, weight: e.target.value })}
                          placeholder="—"
                        />
                      </div>
                    </div>
                  ) : (
                    (() => {
                      const m = custMeasurements?.measurements || {};
                      const height = custMeasurements?.height;
                      const weight = custMeasurements?.weight;
                      const hasMeasurements =
                        m && Object.keys(m).some((k) => m[k] !== null && m[k] !== undefined && m[k] !== '');

                      if (!hasMeasurements && !height && !weight) {
                        return <div className="empty-state">No AI scan or measurements saved yet.</div>;
                      }

                      const rows = [
                        { label: 'Bust', value: m.bust ?? m.topBust },
                        { label: 'Under Bust', value: m.underBust },
                        { label: 'Waist', value: m.waist },
                        { label: 'Hips', value: m.hips ?? m.hip },
                        { label: 'Neck', value: m.neck ?? m.neckBase },
                        { label: 'Shoulder', value: m.shoulderWidth },
                        { label: 'Back / Torso', value: m.torsoLength ?? m.backLength },
                        { label: 'Arm Length', value: m.armLength },
                        { label: 'Inseam', value: m.inseam ?? m.insideLegLength ?? m.legLength },
                        { label: 'Height', value: height, unit: 'cm' },
                        { label: 'Weight', value: weight, unit: 'kg' },
                      ].filter((r) => r.value !== undefined && r.value !== null && r.value !== '');

                      return (
                        <div className="measurements-grid">
                          {rows.map((r) => (
                            <div className="measure-box" key={r.label}>
                              <span>{r.label}</span>
                              <strong>
                                {r.value}
                                {r.unit ? r.unit : '"'}
                              </strong>
                            </div>
                          ))}
                        </div>
                      );
                    })()
                  )}
                </div>

                {/* Account History */}
                <div className="profile-section">
                  <h4 className="section-title flex-center gap-2 justify-start">
                    <Calendar size={18} /> Account History
                  </h4>
                  <HistoryTimeline
                    entries={custHistory}
                    loading={custHistoryLoading}
                    emptyText="No account activity recorded for this customer yet."
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== DELETE CONFIRM ===== */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Delete Customer?"
        message={`Remove ${getUserDisplayName(deleteConfirm)}? This cannot be undone.`}
        confirmText="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* ===== SEND MESSAGE MODAL ===== */}
      {msgModal && (
        <div
          className="modal-overlay"
          onClick={() => setMsgModal(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setMsgModal(null);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }} role="presentation">
            <div className="modal-header">
              <h2>Message {getUserDisplayName(msgModal)}</h2>
              <button className="close-btn" onClick={() => setMsgModal(null)}>&times;</button>
            </div>
            <div className="p-4">
              <p className="text-secondary text-sm mb-4">
                This message will appear in the customer&apos;s mobile app inbox.
              </p>
              <textarea autoComplete="off" id="field_kztk09z" name="field_kztk09z"
                className="input-field w-full"
                style={{ minHeight: 120, resize: 'vertical' }}
                placeholder="Type your message here..."
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
              ></textarea>
              <div className="modal-footer justify-end mt-4 px-0">
                <button className="btn-outline" onClick={() => setMsgModal(null)} disabled={sendingMsg}>
                  Cancel
                </button>
                <button 
                  className="btn-primary flex-center gap-2" 
                  onClick={handleSendMessage}
                  disabled={sendingMsg || !msgText.trim()}
                >
                  {sendingMsg ? 'Sending...' : <><Mail size={16} /> Send Message</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
