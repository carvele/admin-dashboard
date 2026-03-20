import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Calendar, Search, Filter, Plus, CheckCircle, XCircle, Clock, Eye, Trash2, CalendarCheck } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { subscribeToCollection, addDocument, updateDocument, deleteDocument, logAction } from '../firebase/firestore';
import { toast } from 'sonner';
import './Reservations.css';

const CountdownTimer = ({ targetDate }) => {
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    const calc = () => {
      const diff = new Date(targetDate) - new Date();
      if (diff > 0) {
        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff / 1000 / 60) % 60);
        return `${h}h ${m}m`;
      }
      return 'Due now';
    };
    setTimeLeft(calc());
    const timer = setInterval(() => setTimeLeft(calc()), 60000);
    return () => clearInterval(timer);
  }, [targetDate]);
  return <span className="countdown-text"><Clock size={12} /> {timeLeft}</span>;
};

const Reservations = () => {
  const { user } = useAuth();
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeToCollection('reservations', (data) => {
      setReservations(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [viewMode, setViewMode] = useState('table');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rescheduleModal, setRescheduleModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [viewModal, setViewModal] = useState(null);

  const [newRes, setNewRes] = useState({ customer: '', outfit: 'Summer Breeze Set', size: 'M', date: '', deposit: false });
  const [newDate, setNewDate] = useState('');

  const filteredReservations = reservations.filter(r => {
    const matchesSearch = (r.customer || '').toLowerCase().includes((searchTerm || '').toLowerCase()) || (r.id || '').toLowerCase().includes((searchTerm || '').toLowerCase());
    const matchesStatus = statusFilter === 'All' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // --- ACTIONS ---
  const handleAction = async (id, action) => {
    const res = reservations.find(r => r.id === id);
    if (!res) return;
    
    try {
      if (action === 'approve') {
        await updateDocument('reservations', res.docId, { status: 'Approved', staff: user?.name || 'Staff', countdown: false });
        toast.success(`Reservation ${id} approved`);
      } else if (action === 'reject') {
        await updateDocument('reservations', res.docId, { status: 'Cancelled', countdown: false });
        toast.error(`Reservation ${id} rejected`);
      } else if (action === 'complete') {
        await updateDocument('reservations', res.docId, { status: 'Completed' });
        toast.success(`Reservation ${id} marked as completed`);
      }
      await logAction(user, `${action === 'approve' ? 'Approved' : action === 'reject' ? 'Cancelled' : 'Completed'} reservation`, { reservationId: id });
    } catch (e) {
      toast.error('Failed to update reservation');
    }
  };

  const handleReschedule = async (e) => {
    e.preventDefault();
    if (!newDate) { toast.error('Select a new date'); return; }
    try {
      await updateDocument('reservations', rescheduleModal.docId, { date: newDate, countdown: true });
      await logAction(user, 'Rescheduled reservation', { reservationId: rescheduleModal.id, newDate });
      toast.success(`Reservation ${rescheduleModal.id} rescheduled`);
      setRescheduleModal(null);
      setNewDate('');
    } catch (e) {
      toast.error('Failed to reschedule');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDocument('reservations', deleteConfirm.docId);
      await logAction(user, 'Deleted reservation', { reservationId: deleteConfirm.id, customer: deleteConfirm.customer });
      toast.success(`Reservation ${deleteConfirm.id} deleted`);
      setDeleteConfirm(null);
    } catch (e) {
      toast.error('Failed to delete');
    }
  };

  const handleCreateReservation = async (e) => {
    e.preventDefault();
    const mockId = `RES-${String(reservations.length + 1).padStart(3, '0')}`;
    try {
      await addDocument('reservations', {
        id: mockId, // Note: storing custom ID field for UI display purposes, though doc.id is unique
        customer: newRes.customer,
        outfit: newRes.outfit,
        date: newRes.date,
        status: 'Pending',
        staff: 'Unassigned',
        countdown: true,
        size: newRes.size
      });
      await logAction(user, 'Created new reservation', { customer: newRes.customer });
      setIsModalOpen(false);
      toast.success('Reservation created successfully');
      setNewRes({ customer: '', outfit: 'Summer Breeze Set', size: 'M', date: '', deposit: false });
    } catch (e) {
      toast.error('Failed to create reservation');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header d-flex justify-between align-center">
        <div>
          <h1 className="page-title">Reservation Management</h1>
          <p className="page-subtitle">Manage customer bookings and outfit try-ons</p>
        </div>
        <div className="header-actions">
          <div className="view-toggle">
            <button className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}>List View</button>
            <button className={`toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`} onClick={() => setViewMode('calendar')}>Calendar</button>
          </div>
          <button className="btn-primary flex-center gap-2" onClick={() => setIsModalOpen(true)}>
            <Plus size={18} /> New Reservation
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-toolbar">
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input type="text" placeholder="Search by ID or customer name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="input-field pl-10" />
          </div>
          <div className="flex-center gap-2">
            <select className="input-field" style={{width: 'auto', minWidth: 150}} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="All">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-secondary">Loading reservations...</div>
        ) : viewMode === 'table' ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Customer</th>
                  <th>Outfit & Size</th>
                  <th>Date & Time</th>
                  <th>Status</th>
                  <th>Assigned Staff</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredReservations.map(res => (
                  <tr key={res.id}>
                    <td className="font-mono text-sm">{res.id}</td>
                    <td className="font-medium">{res.customer}</td>
                    <td>
                      <div>{res.outfit}</div>
                      <div className="text-secondary text-sm">Size: {res.size}</div>
                    </td>
                    <td>
                      <div>{new Date(res.date).toLocaleDateString()}</div>
                      <div className="text-secondary text-sm">
                        {new Date(res.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                      {res.countdown && res.status === 'Pending' && <CountdownTimer targetDate={res.date} />}
                    </td>
                    <td><StatusBadge status={res.status} /></td>
                    <td className="text-secondary">{res.staff}</td>
                    <td>
                      <div className="action-buttons">
                        <button className="action-icon view" title="View Details" onClick={() => setViewModal(res)}><Eye size={16} /></button>
                        {res.status === 'Pending' && (
                          <>
                            <button className="action-icon approve" title="Approve" onClick={() => handleAction(res.id, 'approve')}><CheckCircle size={16} /></button>
                            <button className="action-icon reject" title="Reject" onClick={() => handleAction(res.id, 'reject')}><XCircle size={16} /></button>
                          </>
                        )}
                        {res.status === 'Approved' && (
                          <button className="action-icon approve" title="Mark Completed" onClick={() => handleAction(res.id, 'complete')}><CalendarCheck size={16} /></button>
                        )}
                        {(res.status === 'Pending' || res.status === 'Approved') && (
                          <button className="action-icon reschedule" title="Reschedule" onClick={() => { setRescheduleModal(res); setNewDate(res.date); }}>
                            <Calendar size={16} />
                          </button>
                        )}
                        <button className="action-icon reject" title="Delete" onClick={() => setDeleteConfirm(res)}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredReservations.length === 0 && (
                  <tr><td colSpan="7" className="text-center py-8 text-secondary">No reservations found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="calendar-placeholder-view">
            <Calendar size={48} className="text-secondary mb-4" />
            <h3>Calendar View</h3>
            <p className="text-secondary">Interactive scheduling calendar is initialized here.</p>
          </div>
        )}
      </div>

      {/* ===== NEW RESERVATION MODAL ===== */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Reservation</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>&times;</button>
            </div>
            <form className="modal-body" onSubmit={handleCreateReservation}>
              <div className="form-group">
                <label className="label">Customer Name</label>
                <input type="text" className="input-field" value={newRes.customer} onChange={e => setNewRes({...newRes, customer: e.target.value})} required />
              </div>
              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="label">Selected Outfit</label>
                  <select className="input-field" value={newRes.outfit} onChange={e => setNewRes({...newRes, outfit: e.target.value})}>
                    <option>Summer Breeze Set</option><option>Midnight Gala Gown</option><option>Classic Silk Blouse</option><option>Velvet Blazer</option>
                  </select>
                </div>
                <div className="form-group flex-1">
                  <label className="label">Size</label>
                  <select className="input-field" value={newRes.size} onChange={e => setNewRes({...newRes, size: e.target.value})}>
                    <option>XS</option><option>S</option><option>M</option><option>L</option><option>XL</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="label">Reservation Date & Time</label>
                <input type="datetime-local" className="input-field" value={newRes.date} onChange={e => setNewRes({...newRes, date: e.target.value})} required />
              </div>
              <div className="form-group checkbox-group">
                <input type="checkbox" id="deposit" checked={newRes.deposit} onChange={e => setNewRes({...newRes, deposit: e.target.checked})} />
                <label htmlFor="deposit">Security Deposit Paid</label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create Reservation</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== RESCHEDULE MODAL ===== */}
      {rescheduleModal && (
        <div className="modal-overlay" onClick={() => setRescheduleModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: 400}}>
            <div className="modal-header">
              <h2>Reschedule {rescheduleModal.id}</h2>
              <button className="close-btn" onClick={() => setRescheduleModal(null)}>&times;</button>
            </div>
            <form className="modal-body" onSubmit={handleReschedule}>
              <p className="text-secondary">Current: {new Date(rescheduleModal.date).toLocaleString()}</p>
              <div className="form-group">
                <label className="label">New Date & Time</label>
                <input type="datetime-local" className="input-field" value={newDate} onChange={e => setNewDate(e.target.value)} required />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setRescheduleModal(null)}>Cancel</button>
                <button type="submit" className="btn-primary">Confirm Reschedule</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== VIEW DETAILS MODAL ===== */}
      {viewModal && (
        <div className="modal-overlay" onClick={() => setViewModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: 420}}>
            <div className="modal-header">
              <h2>Reservation Details</h2>
              <button className="close-btn" onClick={() => setViewModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="detail-row"><span className="detail-label">ID</span><span className="font-mono">{viewModal.id}</span></div>
              <div className="detail-row"><span className="detail-label">Customer</span><strong>{viewModal.customer}</strong></div>
              <div className="detail-row"><span className="detail-label">Outfit</span>{viewModal.outfit}</div>
              <div className="detail-row"><span className="detail-label">Size</span><span className="size-badge">{viewModal.size}</span></div>
              <div className="detail-row"><span className="detail-label">Date</span>{new Date(viewModal.date).toLocaleString()}</div>
              <div className="detail-row"><span className="detail-label">Status</span><StatusBadge status={viewModal.status} /></div>
              <div className="detail-row"><span className="detail-label">Staff</span>{viewModal.staff}</div>
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setViewModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== DELETE CONFIRM ===== */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: 380, textAlign: 'center', padding: '2rem'}}>
            <div className="delete-icon-wrap"><Trash2 size={32} /></div>
            <h2>Delete Reservation?</h2>
            <p className="text-secondary mt-2">Remove <strong>{deleteConfirm.id}</strong> for {deleteConfirm.customer}? This cannot be undone.</p>
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

export default Reservations;
