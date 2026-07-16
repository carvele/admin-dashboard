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
import {
  updateCustomer,
  deleteCustomer,
  sendNotification,
  getPaginatedCustomers,
} from '../../services/customerService';
import { toast } from 'sonner';
import {
  getAvatarColor,
  getUserDisplayName,
  formatRelativeTime,
  isOnline,
  formatCurrency,
  formatDate,
  getHealthLabel,
} from '../../utils/helpers';
import { can } from '../../utils/permissions';
import { useAuth } from '../../context/AuthContext';
import SkeletonTable from '../../components/SkeletonTable';
import './Customers.css';

// ── Component ────────────────────────────────────────────────

const Customers = () => {
  const { user } = useAuth();
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
      
      // Sort newly joined users to the top locally
      appUsers.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || a.joinedAt?.toMillis?.() || a.lastOnline || 0;
        const timeB = b.createdAt?.toMillis?.() || b.joinedAt?.toMillis?.() || b.lastOnline || 0;
        return timeB - timeA;
      });
      setCustomers((prev) => {
        const d = loadMore ? [...prev, ...appUsers] : appUsers;
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
  }, []);

  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useCallback(
    debounce((val) => setSearchTerm(val), 300),
    []
  );

  const handleSearchChange = (e) => {
    setSearchInput(e.target.value);
    debouncedSearch(e.target.value);
  };

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  const filteredCustomers = customers.filter(
    (c) =>
      getUserDisplayName(c)
        .toLowerCase()
        .includes((searchTerm || '').toLowerCase()) ||
      (c.email || '').toLowerCase().includes((searchTerm || '').toLowerCase()),
  );

  // Stats
  const totalCustomers = customers.length;
  const activeCount = customers.filter((c) => isOnline(c.lastOnline)).length;
  const newThisMonth = customers.filter((c) => {
    // Android writes 'createdAt'; admin-created users may have 'joinedAt'
    const rawTs = c.createdAt || c.joinedAt;
    const joined =
      rawTs?.toDate?.() ||
      (rawTs?.seconds ? new Date(rawTs.seconds * 1000) : new Date(rawTs || 0));
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
    const m = selectedCustomer.measurements || {};
    setEditForm({
      name: getUserDisplayName(selectedCustomer),
      email: selectedCustomer.email,
      phone: selectedCustomer.phone,
      status: selectedCustomer.status,
      topBust: m.topBust || m.bust || '',
      underBust: m.underBust || '',
      waist: m.waist || '',
      hip: m.hip || m.hips || '',
      neck: m.neckBase || m.neck || '',
      shoulderWidth: m.shoulderWidth || '',
      armLength: m.armLength || '',
      backLength: m.backLength || '',
      insideLegLength: m.insideLegLength || '',
      height: selectedCustomer.user_height_cm || selectedCustomer.height || m.height || '',
      weight: selectedCustomer.user_weight_kg || '',
    });
    setIsEditing(true);
  };

  const handleEditSave = async () => {
    const toNum = (v) => (v ? parseFloat(v) : null);
    const updated = {
      name: editForm.name,
      email: editForm.email,
      phone: editForm.phone,
      status: editForm.status,
      user_height_cm: toNum(editForm.height),
      user_weight_kg: toNum(editForm.weight),
      measurements: {
        ...(selectedCustomer.measurements || {}),
        topBust: toNum(editForm.topBust),
        underBust: toNum(editForm.underBust),
        waist: toNum(editForm.waist),
        hip: toNum(editForm.hip),
        neckBase: toNum(editForm.neck),
        neck: toNum(editForm.neck),
        shoulderWidth: toNum(editForm.shoulderWidth),
        armLength: toNum(editForm.armLength),
        backLength: toNum(editForm.backLength),
        insideLegLength: toNum(editForm.insideLegLength),
      },
    };
    try {
      await updateCustomer(selectedCustomer.docId, updated);
      setSelectedCustomer({ ...selectedCustomer, ...updated });
      setIsEditing(false);
      toast.success(`Updated ${editForm.name}`);
    } catch (e) {
      toast.error('Failed to update customer');
    }
  };

  // --- DELETE CUSTOMER ---
  const handleDelete = async () => {
    try {
      await deleteCustomer(deleteConfirm.docId);
      toast.success(`Removed customer ${getUserDisplayName(deleteConfirm)}`);
      setDeleteConfirm(null);
      setSelectedCustomer(null);
    } catch (e) {
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
      toast.success('Message sent successfully');
      setMsgModal(null);
      setMsgText('');
    } catch (e) {
      toast.error('Failed to send message');
    } finally {
      setSendingMsg(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header d-flex justify-between align-center">
        <div>
          <h1 className="page-title">App Customers</h1>
          <p className="page-subtitle">
            View registered app users, profiles, and engagement metrics
          </p>
        </div>
      </div>

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
            <p className="cstat-label">Online Now</p>
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
              type="text"
              placeholder="Search by name or email..."
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
                    <th>Last Online</th>
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
                              className={`online-dot ${isOnline(cust.lastOnline) ? 'online online-pulse' : 'offline'}`}
                            ></span>
                          </div>
                          <div>
                            <p className="font-medium">{getUserDisplayName(cust)}</p>
                            <p className="text-secondary text-sm">{cust.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="last-online-cell">
                          <span
                            className={`last-online-text ${isOnline(cust.lastOnline) ? 'text-online' : ''}`}
                          >
                            {formatRelativeTime(cust.lastOnline)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="engagement-chips">
                          <span className="eng-chip">
                            <ShoppingBag size={12} /> {cust.reservations || 0}
                          </span>
                          <span className="eng-chip">
                            <Heart size={12} /> {cust.wardrobeItems || 0}
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
                          className={`status-chip status-chip-${(cust.status || 'active').toLowerCase()}`}
                        >
                          {cust.status || 'Active'}
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
                              className="icon-btn-small text-danger"
                              title="Delete"
                              onClick={() => setDeleteConfirm(cust)}
                            >
                              <Trash2 size={15} />
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
        >
          <div className="modal-content profile-modal" onClick={(e) => e.stopPropagation()}>
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
                    <input
                      type="text"
                      className="input-field mt-3"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                    <select
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
                      className={`status-chip status-chip-${(selectedCustomer.status || 'active').toLowerCase()} mb-2`}
                    >
                      {selectedCustomer.status || 'Active'}
                    </span>
                    <p className="member-since">
                      <Calendar size={13} /> Member since {formatDate(selectedCustomer.createdAt || selectedCustomer.joinedAt)}
                    </p>
                    <p className="last-seen-tag">
                      <Clock size={13} /> Last seen{' '}
                      {formatRelativeTime(selectedCustomer.lastOnline)}
                    </p>
                  </>
                )}

                <div className="profile-contact">
                  {isEditing ? (
                    <>
                      <input
                        type="email"
                        className="input-field"
                        placeholder="Email"
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      />
                      <input
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
                    <h4>{selectedCustomer.reservations || 0}</h4>
                    <p>Reservations</p>
                  </div>
                  <div className="p-stat">
                    <h4>{selectedCustomer.wardrobeItems || 0}</h4>
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
                        <input
                          type="number"
                          className="input-field"
                          value={editForm.topBust}
                          onChange={(e) => setEditForm({ ...editForm, topBust: e.target.value })}
                          placeholder="—"
                        />
                      </div>
                      <div className="measure-box">
                        <span>Under Bust</span>
                        <input
                          type="number"
                          className="input-field"
                          value={editForm.underBust || ''}
                          onChange={(e) => setEditForm({ ...editForm, underBust: e.target.value })}
                          placeholder="—"
                        />
                      </div>
                      <div className="measure-box">
                        <span>Waist</span>
                        <input
                          type="number"
                          className="input-field"
                          value={editForm.waist}
                          onChange={(e) => setEditForm({ ...editForm, waist: e.target.value })}
                          placeholder="—"
                        />
                      </div>
                      <div className="measure-box">
                        <span>Hips</span>
                        <input
                          type="number"
                          className="input-field"
                          value={editForm.hip}
                          onChange={(e) => setEditForm({ ...editForm, hip: e.target.value })}
                          placeholder="—"
                        />
                      </div>
                      <div className="measure-box">
                        <span>Neck</span>
                        <input
                          type="number"
                          className="input-field"
                          value={editForm.neck || ''}
                          onChange={(e) => setEditForm({ ...editForm, neck: e.target.value })}
                          placeholder="—"
                        />
                      </div>
                      <div className="measure-box">
                        <span>Shoulder</span>
                        <input
                          type="number"
                          className="input-field"
                          value={editForm.shoulderWidth || ''}
                          onChange={(e) =>
                            setEditForm({ ...editForm, shoulderWidth: e.target.value })
                          }
                          placeholder="—"
                        />
                      </div>
                      <div className="measure-box">
                        <span>Arm Length</span>
                        <input
                          type="number"
                          className="input-field"
                          value={editForm.armLength || ''}
                          onChange={(e) => setEditForm({ ...editForm, armLength: e.target.value })}
                          placeholder="—"
                        />
                      </div>
                      <div className="measure-box">
                        <span>Back Length</span>
                        <input
                          type="number"
                          className="input-field"
                          value={editForm.backLength || ''}
                          onChange={(e) => setEditForm({ ...editForm, backLength: e.target.value })}
                          placeholder="—"
                        />
                      </div>
                      <div className="measure-box">
                        <span>Inside Leg</span>
                        <input
                          type="number"
                          className="input-field"
                          value={editForm.insideLegLength || ''}
                          onChange={(e) =>
                            setEditForm({ ...editForm, insideLegLength: e.target.value })
                          }
                          placeholder="—"
                        />
                      </div>
                      <div className="measure-box">
                        <span>Height (cm)</span>
                        <input
                          type="number"
                          className="input-field"
                          value={editForm.height}
                          onChange={(e) => setEditForm({ ...editForm, height: e.target.value })}
                          placeholder="—"
                        />
                      </div>
                      <div className="measure-box">
                        <span>Weight (kg)</span>
                        <input
                          type="number"
                          className="input-field"
                          value={editForm.weight || ''}
                          onChange={(e) => setEditForm({ ...editForm, weight: e.target.value })}
                          placeholder="—"
                        />
                      </div>
                    </div>
                  ) : (
                    (() => {
                      const m = selectedCustomer.measurements || {};
                      const hasMeasurements = 
                        selectedCustomer.measurements !== undefined && 
                        selectedCustomer.measurements !== null &&
                        Object.keys(selectedCustomer.measurements).length > 0;
                        
                      if (!hasMeasurements && !selectedCustomer.user_height_cm && !selectedCustomer.user_weight_kg) {
                        return <div className="empty-state">No AI scan or measurements saved yet.</div>;
                      }

                      const rows = [
                        { label: 'Bust (Top)', value: m.topBust ?? m.bust },
                        { label: 'Under Bust', value: m.underBust },
                        { label: 'Waist', value: m.waist },
                        { label: 'Hips', value: m.hip ?? m.hips },
                        { label: 'Neck', value: m.neck },
                        { label: 'Neck Base', value: m.neckBase },
                        { label: 'Shoulder', value: m.shoulderWidth },
                        { label: 'Back Length', value: m.backLength },
                        { label: 'Arm Length', value: m.armLength },
                        { label: 'Sleeve (CB)', value: m.sleeveLengthCenterBack },
                        { label: 'Inside Leg', value: m.insideLegLength },
                        {
                          label: 'Height',
                          value: selectedCustomer.user_height_cm ?? selectedCustomer.height ?? m.height,
                          unit: 'cm',
                        },
                        { label: 'Weight', value: selectedCustomer.user_weight_kg, unit: 'kg' },
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
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== DELETE CONFIRM ===== */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 380, textAlign: 'center', padding: '2rem' }}
          >
            <div className="delete-icon-wrap">
              <Trash2 size={32} />
            </div>
            <h2>Delete Customer?</h2>
            <p className="text-secondary mt-2">
              Remove <strong>{getUserDisplayName(deleteConfirm)}</strong>? This cannot be undone.
            </p>
            <div className="modal-footer justify-center mt-4">
              <button className="btn-outline" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
              <button className="btn-danger" onClick={handleDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ===== SEND MESSAGE MODAL ===== */}
      {msgModal && (
        <div className="modal-overlay" onClick={() => setMsgModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h2>Message {getUserDisplayName(msgModal)}</h2>
              <button className="close-btn" onClick={() => setMsgModal(null)}>&times;</button>
            </div>
            <div className="p-4">
              <p className="text-secondary text-sm mb-4">
                This message will appear in the customer's mobile app inbox.
              </p>
              <textarea
                className="input-field w-full"
                style={{ minHeight: 120, resize: 'vertical' }}
                placeholder="Type your message here..."
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                autoFocus
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
