import React, { useState } from 'react';
import { Search, Mail, Phone, ShoppingBag, Ruler, Edit, Trash2, Save, Clock, Star, TrendingUp, Calendar, Heart, Users } from 'lucide-react';
import { subscribeToCollection, updateDocument, deleteDocument } from '../../firebase/firestore';
import { toast } from 'sonner';
import { getAvatarColor, getUserDisplayName, formatRelativeTime, isOnline, formatCurrency, formatDate, getHealthLabel } from '../../utils/helpers';
import { can } from '../../utils/permissions';
import { useAuth } from '../../context/AuthContext';
import './Customers.css';

// ── Component ────────────────────────────────────────────────

const Customers = () => {
  const { user } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    const unsub = subscribeToCollection('users', (data) => {
      const appUsers = data.filter(u => !u.role || u.role === 'customer');
      setCustomers(appUsers);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  const filteredCustomers = customers.filter(c =>
    (getUserDisplayName(c)).toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    (c.email || '').toLowerCase().includes((searchTerm || '').toLowerCase())
  );

  // Stats
  const totalCustomers = customers.length;
  const activeCount = customers.filter(c => isOnline(c.lastOnline)).length;
  const newThisMonth = customers.filter(c => {
    const joined = c.joinedAt?.toDate?.() || (c.joinedAt?.seconds ? new Date(c.joinedAt.seconds * 1000) : new Date(c.joinedAt || 0));
    const now = new Date();
    return joined.getMonth() === now.getMonth() && joined.getFullYear() === now.getFullYear();
  }).length;
  const avgEngagement = customers.length > 0 ? Math.round(customers.reduce((sum, c) => sum + (c.engagementScore || 0), 0) / customers.length) : 0;

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
      neck: m.neck || '',
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
    const toNum = (v) => v ? parseFloat(v) : null;
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
        neck: toNum(editForm.neck),
        shoulderWidth: toNum(editForm.shoulderWidth),
        armLength: toNum(editForm.armLength),
        backLength: toNum(editForm.backLength),
        insideLegLength: toNum(editForm.insideLegLength),
      },
    };
    try {
      await updateDocument('users', selectedCustomer.docId, updated);
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
      await deleteDocument('users', deleteConfirm.docId);
      toast.success(`Removed customer ${getUserDisplayName(deleteConfirm)}`);
      setDeleteConfirm(null);
      setSelectedCustomer(null);
    } catch (e) {
      toast.error('Failed to delete customer');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header d-flex justify-between align-center">
        <div>
          <h1 className="page-title">App Customers</h1>
          <p className="page-subtitle">View registered app users, profiles, and engagement metrics</p>
        </div>
      </div>

      {/* ===== STATS ROW ===== */}
      <div className="customer-stats-row">
        <div className="cstat-card">
          <div className="cstat-icon" style={{ background: 'linear-gradient(135deg, #6366F1, #818CF8)' }}><ShoppingBag size={18} /></div>
          <div><p className="cstat-value">{totalCustomers}</p><p className="cstat-label">Total Customers</p></div>
        </div>
        <div className="cstat-card">
          <div className="cstat-icon" style={{ background: 'linear-gradient(135deg, #10B981, #34D399)' }}><Clock size={18} /></div>
          <div><p className="cstat-value">{activeCount}</p><p className="cstat-label">Online Now</p></div>
        </div>
        <div className="cstat-card">
          <div className="cstat-icon" style={{ background: 'linear-gradient(135deg, #D4AF37, #F5D76E)' }}><Star size={18} /></div>
          <div><p className="cstat-value">{newThisMonth}</p><p className="cstat-label">New This Month</p></div>
        </div>
        <div className="cstat-card">
          <div className="cstat-icon" style={{ background: 'linear-gradient(135deg, #F97316, #FB923C)' }}><TrendingUp size={18} /></div>
          <div><p className="cstat-value">{avgEngagement}%</p><p className="cstat-label">Avg. Engagement</p></div>
        </div>
      </div>

      {/* ===== TABLE ===== */}
      <div className="card">
        <div className="card-toolbar">
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input type="text" placeholder="Search by name or email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="input-field pl-10" />
          </div>
        </div>

        <div className="table-container">
          {loading ? (
            <div className="p-8 text-center text-secondary">Loading customers...</div>
          ) : (
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
              {filteredCustomers.map(cust => (
                <tr key={cust.id} className="table-row-hover">
                  <td>
                    <div className="flex-center gap-3 customer-cell">
                      <div className="avatar-wrap">
                        <div className="avatar" style={{backgroundColor: getAvatarColor(getUserDisplayName(cust))}}>
                          {getUserDisplayName(cust).split(' ').map(n=>n[0]).join('').substring(0, 2).toUpperCase()}
                        </div>
                        <span className={`online-dot ${isOnline(cust.lastOnline) ? 'online' : 'offline'}`}></span>
                      </div>
                      <div>
                        <p className="font-medium">{getUserDisplayName(cust)}</p>
                        <p className="text-secondary text-sm">{cust.email}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="last-online-cell">
                      <span className={`last-online-text ${isOnline(cust.lastOnline) ? 'text-online' : ''}`}>
                        {formatRelativeTime(cust.lastOnline)}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="engagement-chips">
                      <span className="eng-chip"><ShoppingBag size={12}/> {cust.reservations || 0}</span>
                      <span className="eng-chip"><Heart size={12}/> {cust.wardrobeItems || 0}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`lifetime-value ${(cust.totalSpent || 0) > 50000 ? 'high-value' : ''}`}>
                      {formatCurrency(cust.totalSpent)}
                    </span>
                  </td>
                  <td>
                    <span className={`status-chip status-chip-${(cust.status || 'active').toLowerCase()}`}>
                      {cust.status || 'Active'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn-outline small" onClick={() => { setSelectedCustomer(cust); setIsEditing(false); }}>View</button>
                      {can(user?.role, 'delete_customer') && (
                        <button className="icon-btn-small text-danger" title="Delete" onClick={() => setDeleteConfirm(cust)}><Trash2 size={15}/></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCustomers.length === 0 && (
                <tr><td colSpan="6" className="text-center py-8">
                  <div style={{padding: '2rem'}}>
                    <Users size={40} style={{opacity: 0.3, marginBottom: '0.75rem'}} />
                    <h3 style={{fontSize: '1rem', marginBottom: '0.5rem'}}>No Customers Yet</h3>
                    <p className="text-secondary" style={{maxWidth: '320px', margin: '0 auto', fontSize: '0.85rem'}}>Customers appear here when they sign up via the mobile app or are added through reservations.</p>
                  </div>
                </td></tr>
              )}
            </tbody>
          </table>
          )}
        </div>
      </div>

      {/* ===== CUSTOMER PROFILE MODAL ===== */}
      {selectedCustomer && (
        <div className="modal-overlay" onClick={() => { setSelectedCustomer(null); setIsEditing(false); }}>
          <div className="modal-content profile-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Customer Profile</h2>
              <div className="flex-center gap-2">
                {!isEditing ? (
                  <>
                    <button className="btn-outline small flex-center gap-1" onClick={startEdit}><Edit size={14}/> Edit</button>
                    <button className="icon-btn-small text-danger" onClick={() => setDeleteConfirm(selectedCustomer)}><Trash2 size={14}/></button>
                  </>
                ) : (
                  <>
                    <button className="btn-outline small" onClick={() => setIsEditing(false)}>Cancel</button>
                    <button className="btn-primary small flex-center gap-1" onClick={handleEditSave}><Save size={14}/> Save</button>
                  </>
                )}
                <button className="close-btn" onClick={() => { setSelectedCustomer(null); setIsEditing(false); }}>&times;</button>
              </div>
            </div>
            <div className="profile-body">
              <div className="profile-sidebar">
                <div className="profile-avatar-large" style={{backgroundColor: getAvatarColor(getUserDisplayName(selectedCustomer))}}>
                  {getUserDisplayName(selectedCustomer).split(' ').map(n=>n[0]).join('').substring(0, 2).toUpperCase()}
                </div>
                {isEditing ? (
                  <>
                    <input type="text" className="input-field mt-3" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                    <select className="input-field mt-2" value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})}>
                      <option>Active</option><option>Inactive</option>
                    </select>
                  </>
                ) : (
                  <>
                    <h3 className="profile-name-lg">{getUserDisplayName(selectedCustomer)}</h3>
                    <span className={`status-chip status-chip-${(selectedCustomer.status || 'active').toLowerCase()} mb-2`}>{selectedCustomer.status || 'Active'}</span>
                    <p className="member-since"><Calendar size={13}/> Member since {formatDate(selectedCustomer.joinedAt)}</p>
                    <p className="last-seen-tag"><Clock size={13}/> Last seen {formatRelativeTime(selectedCustomer.lastOnline)}</p>
                  </>
                )}

                <div className="profile-contact">
                  {isEditing ? (
                    <>
                      <input type="email" className="input-field" placeholder="Email" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} />
                      <input type="text" className="input-field mt-2" placeholder="Phone" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} />
                    </>
                  ) : (
                    <>
                      <div className="contact-item"><Mail size={16} /> <span>{selectedCustomer.email}</span></div>
                      <div className="contact-item"><Phone size={16} /> <span>{selectedCustomer.phone || 'Not provided'}</span></div>
                    </>
                  )}
                </div>

                <div className="profile-stats">
                  <div className="p-stat"><h4>{selectedCustomer.reservations || 0}</h4><p>Reservations</p></div>
                  <div className="p-stat"><h4>{selectedCustomer.wardrobeItems || 0}</h4><p>Saved Items</p></div>
                </div>
              </div>

              <div className="profile-main">
                {/* Health Score */}
                <div className="profile-section">
                  <h4 className="section-title flex-center gap-2 justify-start"><TrendingUp size={18}/> Customer Health Score</h4>
                  <div className="health-score-wrap">
                    <div className="health-bar-bg">
                      <div 
                        className="health-bar-fill" 
                        style={{ 
                          width: `${selectedCustomer.engagementScore || 0}%`,
                          background: `linear-gradient(90deg, ${getHealthLabel(selectedCustomer.engagementScore || 0).color}, ${getHealthLabel(selectedCustomer.engagementScore || 0).color}88)`
                        }}
                      ></div>
                    </div>
                    <div className="health-meta">
                      <span className="health-score-num">{selectedCustomer.engagementScore || 0}/100</span>
                      <span className="health-label" style={{ color: getHealthLabel(selectedCustomer.engagementScore || 0).color }}>
                        {getHealthLabel(selectedCustomer.engagementScore || 0).label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Lifetime Value & Preferred Sizes */}
                <div className="profile-section">
                  <h4 className="section-title flex-center gap-2 justify-start"><ShoppingBag size={18}/> Purchase Summary</h4>
                  <div className="purchase-summary-grid">
                    <div className="purchase-stat">
                      <span className="purchase-stat-label">Lifetime Spend</span>
                      <span className="purchase-stat-value">{formatCurrency(selectedCustomer.totalSpent)}</span>
                    </div>
                    <div className="purchase-stat">
                      <span className="purchase-stat-label">Preferred Sizes</span>
                      <div className="size-chips">
                        {(selectedCustomer.preferredSizes || []).length > 0 
                          ? selectedCustomer.preferredSizes.map(s => <span key={s} className="size-chip">{s}</span>)
                          : <span className="text-secondary text-sm">None yet</span>
                        }
                      </div>
                    </div>
                  </div>
                </div>

                {/* Measurements – Full Android AI Scanner profile */}
                <div className="profile-section">
                  <h4 className="section-title flex-center gap-2 justify-start"><Ruler size={18}/> Saved Measurements</h4>
                  {isEditing ? (
                    <div className="measurements-grid">
                      <div className="measure-box"><span>Bust</span><input type="number" className="input-field" value={editForm.topBust} onChange={e => setEditForm({...editForm, topBust: e.target.value})} placeholder="—" /></div>
                      <div className="measure-box"><span>Under Bust</span><input type="number" className="input-field" value={editForm.underBust || ''} onChange={e => setEditForm({...editForm, underBust: e.target.value})} placeholder="—" /></div>
                      <div className="measure-box"><span>Waist</span><input type="number" className="input-field" value={editForm.waist} onChange={e => setEditForm({...editForm, waist: e.target.value})} placeholder="—" /></div>
                      <div className="measure-box"><span>Hips</span><input type="number" className="input-field" value={editForm.hip} onChange={e => setEditForm({...editForm, hip: e.target.value})} placeholder="—" /></div>
                      <div className="measure-box"><span>Neck</span><input type="number" className="input-field" value={editForm.neck || ''} onChange={e => setEditForm({...editForm, neck: e.target.value})} placeholder="—" /></div>
                      <div className="measure-box"><span>Shoulder</span><input type="number" className="input-field" value={editForm.shoulderWidth || ''} onChange={e => setEditForm({...editForm, shoulderWidth: e.target.value})} placeholder="—" /></div>
                      <div className="measure-box"><span>Arm Length</span><input type="number" className="input-field" value={editForm.armLength || ''} onChange={e => setEditForm({...editForm, armLength: e.target.value})} placeholder="—" /></div>
                      <div className="measure-box"><span>Back Length</span><input type="number" className="input-field" value={editForm.backLength || ''} onChange={e => setEditForm({...editForm, backLength: e.target.value})} placeholder="—" /></div>
                      <div className="measure-box"><span>Inside Leg</span><input type="number" className="input-field" value={editForm.insideLegLength || ''} onChange={e => setEditForm({...editForm, insideLegLength: e.target.value})} placeholder="—" /></div>
                      <div className="measure-box"><span>Height (cm)</span><input type="number" className="input-field" value={editForm.height} onChange={e => setEditForm({...editForm, height: e.target.value})} placeholder="—" /></div>
                      <div className="measure-box"><span>Weight (kg)</span><input type="number" className="input-field" value={editForm.weight || ''} onChange={e => setEditForm({...editForm, weight: e.target.value})} placeholder="—" /></div>
                    </div>
                  ) : (() => {
                    const m = selectedCustomer.measurements || {};
                    const hasMeasurements = m.topBust || m.bust || m.waist || m.hip || m.hips || m.neck || m.shoulderWidth || selectedCustomer.height || selectedCustomer.user_height_cm;
                    if (!hasMeasurements) return <div className="empty-state">No measurements saved yet.</div>;

                    const rows = [
                      { label: 'Bust (Top)', value: m.topBust || m.bust },
                      { label: 'Under Bust', value: m.underBust },
                      { label: 'Waist', value: m.waist },
                      { label: 'Hips', value: m.hip || m.hips },
                      { label: 'Neck', value: m.neck },
                      { label: 'Neck Base', value: m.neckBase },
                      { label: 'Shoulder', value: m.shoulderWidth },
                      { label: 'Back Length', value: m.backLength },
                      { label: 'Arm Length', value: m.armLength },
                      { label: 'Sleeve (CB)', value: m.sleeveLengthCenterBack },
                      { label: 'Inside Leg', value: m.insideLegLength },
                      { label: 'Height', value: selectedCustomer.user_height_cm || selectedCustomer.height || m.height, unit: 'cm' },
                      { label: 'Weight', value: selectedCustomer.user_weight_kg, unit: 'kg' },
                    ].filter(r => r.value);

                    return (
                      <div className="measurements-grid">
                        {rows.map(r => (
                          <div className="measure-box" key={r.label}><span>{r.label}</span><strong>{r.value}{r.unit ? r.unit : '"'}</strong></div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

              </div>
            </div>
          </div>
        </div>
      )}


      {/* ===== DELETE CONFIRM ===== */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: 380, textAlign: 'center', padding: '2rem'}}>
            <div className="delete-icon-wrap"><Trash2 size={32} /></div>
            <h2>Delete Customer?</h2>
            <p className="text-secondary mt-2">Remove <strong>{getUserDisplayName(deleteConfirm)}</strong>? This cannot be undone.</p>
            <div className="modal-footer justify-center mt-4">
              <button className="btn-outline" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
