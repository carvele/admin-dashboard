import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import debounce from 'lodash.debounce';
import { useAuth } from '../../context/AuthContext';
import {
  Calendar,
  Search,
  Filter,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Trash2,
  CalendarCheck,
  UserCheck,
  Shirt,
  MessageSquare,
} from 'lucide-react';
import StatusBadge from '../../components/StatusBadge';
import SkeletonTable from '../../components/SkeletonTable';
import {
  getPaginatedReservations,
  adjustInventoryForReservation,
  updateReservation,
  deleteReservation,
  createReservation,
} from '../../services/reservationService';
import { subscribeToCustomers } from '../../services/customerService';
import { subscribeToProducts } from '../../services/productService';
import { logAction } from '../../services/staffService';
import { can } from '../../utils/permissions';
import { toast } from 'sonner';
import './Reservations.css';

const parseDate = (d) => {
  if (!d) return new Date();
  if (d.toDate) return d.toDate();
  if (d.seconds) return new Date(d.seconds * 1000);
  return new Date(d);
};

const CountdownTimer = ({ targetDate }) => {
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    const calc = () => {
      const diff = parseDate(targetDate) - new Date();
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
  return (
    <span className="countdown-text">
      <Clock size={12} /> {timeLeft}
    </span>
  );
};

const Reservations = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  const fetchReservations = async (loadMore = false, signal = null) => {
    if (loadMore) setLoadingMore(true);
    else setLoading(true);
    try {
      const PAGE_SIZE = 20;
      const result = await getPaginatedReservations(PAGE_SIZE, loadMore ? lastDoc : null);

      if (signal?.aborted) return;

      setReservations((prev) => {
        const d = loadMore ? [...prev, ...result.data] : result.data;
        const unique = [];
        const seen = new Set();
        d.forEach((r) => {
          if (!seen.has(r.id)) {
            unique.push(r);
            seen.add(r.id);
          }
        });
        return unique;
      });
      setLastDoc(result.lastVisible);
      setHasMore(result.hasMore);
    } catch (e) {
      toast.error('Failed to load reservations');
    } finally {
      if (loadMore) setLoadingMore(false);
      else setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchReservations(false, controller.signal);
    const unsubC = subscribeToCustomers((data) => {
      // Filter for app customers only (exclude staff)
      setCustomers(data.filter((u) => !u.role || u.role === 'customer'));
    });
    const unsubP = subscribeToProducts((data) => {
      setProducts(data);
    });
    return () => {
      controller.abort();
      unsubC();
      unsubP();
    };
  }, []);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const debouncedSearch = useCallback(
    debounce((val) => setSearchTerm(val), 400),
    []
  );

  const handleSearchChange = (e) => {
    setSearchInput(e.target.value);
    debouncedSearch(e.target.value);
  };

  const [statusFilter, setStatusFilter] = useState('All');
  const [viewMode, setViewMode] = useState('table');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rescheduleModal, setRescheduleModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [viewModal, setViewModal] = useState(null);

  const [newRes, setNewRes] = useState({
    customer: '',
    customerId: '',
    outfit: '',
    size: 'M',
    date: '',
    deposit: false,
  });
  const [newDate, setNewDate] = useState('');

  const filteredReservations = reservations.filter((r) => {
    const cust = r.customerName || r.customer || '';
    const matchesSearch =
      cust.toLowerCase().includes((searchTerm || '').toLowerCase()) ||
      (r.id || '').toLowerCase().includes((searchTerm || '').toLowerCase());
    const matchesStatus = statusFilter === 'All' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // --- Stock adjustment helper ---
  const adjustStock = async (outfit, size, delta) => {
    await adjustInventoryForReservation(outfit, size, delta);
  };

  // --- LIFECYCLE ACTIONS ---
  // Lifecycle: Pending → Confirmed → Fitting → Completed | Cancelled
  const handleAction = async (id, action) => {
    const res = reservations.find((r) => r.id === id);
    if (!res) return;

    try {
      if (action === 'confirm') {
        await updateReservation(res.docId, {
          status: 'Confirmed',
          staff: user?.name || 'Staff',
          assigned_staff_id: user?.uid || '',
          countdown: false,
        });
        await adjustStock(res.productName || res.outfit, res.size, -1); // Deduct stock on confirm
        toast.success(`Reservation ${id} confirmed — stock reserved`);
      } else if (action === 'fitting') {
        await updateReservation(res.docId, { status: 'Fitting' });
        toast.success(`Reservation ${id} — fitting session started`);
      } else if (action === 'complete') {
        await updateReservation(res.docId, { status: 'Completed' });
        // Release reserved stock (item returned or purchased)
        await adjustStock(res.productName || res.outfit, res.size, 1);
        toast.success(`Reservation ${id} completed — stock released`);
      } else if (action === 'cancel') {
        await updateReservation(res.docId, { status: 'Cancelled', countdown: false });
        // Only restore stock if it was confirmed (stock was deducted)
        if (res.status === 'Confirmed' || res.status === 'Fitting') {
          await adjustStock(res.productName || res.outfit, res.size, 1);
        }
        toast.error(`Reservation ${id} cancelled`);
      }
      const actionLabels = {
        confirm: 'Confirmed',
        fitting: 'Started Fitting',
        complete: 'Completed',
        cancel: 'Cancelled',
      };
      await logAction(user, `${actionLabels[action]} reservation`, { reservationId: id });
    } catch (e) {
      toast.error('Failed to update reservation');
    }
  };

  const handleReschedule = async (e) => {
    e.preventDefault();
    if (!newDate) {
      toast.error('Select a new date');
      return;
    }

    const conflict = reservations.some(
      (r) =>
        r.id !== rescheduleModal.id &&
        r.status !== 'Cancelled' &&
        r.status !== 'Completed' &&
        (r.productName || r.outfit) === (rescheduleModal.productName || rescheduleModal.outfit) &&
        r.size === rescheduleModal.size &&
        Math.abs(parseDate(r.reservationDate || r.date) - new Date(newDate)) < 2 * 60 * 60 * 1000,
    );
    if (
      conflict &&
      !window.confirm(
        'Warning: This outfit/size is already reserved within 2 hours of the new time. Proceed anyway?',
      )
    )
      return;
    try {
      await updateReservation(rescheduleModal.docId, {
        reservationDate: new Date(newDate),
        countdown: true,
      });
      await logAction(user, 'Rescheduled reservation', {
        reservationId: rescheduleModal.id,
        newDate,
      });
      toast.success(`Reservation ${rescheduleModal.id} rescheduled`);
      setRescheduleModal(null);
      setNewDate('');
    } catch (e) {
      toast.error('Failed to reschedule');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteReservation(deleteConfirm.docId);
      await logAction(user, 'Deleted reservation', {
        reservationId: deleteConfirm.id,
        customer: deleteConfirm.customerName || deleteConfirm.customer,
      });
      toast.success(`Reservation ${deleteConfirm.id} deleted`);
      setDeleteConfirm(null);
    } catch (e) {
      toast.error('Failed to delete');
    }
  };

  const handleCreateReservation = async (e) => {
    e.preventDefault();

    const conflict = reservations.some(
      (r) =>
        r.status !== 'Cancelled' &&
        r.status !== 'Completed' &&
        (r.productName || r.outfit) === newRes.outfit &&
        r.size === newRes.size &&
        Math.abs(parseDate(r.reservationDate || r.date) - new Date(newRes.date)) <
          2 * 60 * 60 * 1000,
    );
    if (
      conflict &&
      !window.confirm(
        'Warning: This outfit/size is already reserved within 2 hours of this time. Proceed anyway?',
      )
    )
      return;

    // Find the customer_id FK from the selected customer name
    const matchedCustomer = customers.find(
      (c) => (c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim()) === newRes.customer,
    );
    const customerId = matchedCustomer?.docId || matchedCustomer?.id || '';

    const mockId = `RES-${String(reservations.length + 1).padStart(3, '0')}`;
    // Find productId and imageUrl if possible
    const matchedProduct = products.find((p) => p.name === newRes.outfit);
    try {
      await createReservation({
        id: mockId,
        customerName: newRes.customer,
        customerId: customerId, // FK to users collection (matches Android field name)
        productName: newRes.outfit,
        productId: matchedProduct?.id || '',
        imageUrl: matchedProduct?.images?.[0] || '',
        reservationDate: new Date(newRes.date),
        status: 'Pending',
        staff: 'Unassigned',
        assigned_staff_id: '', // Will be set on Confirm
        countdown: true,
        size: newRes.size,
        deposit: newRes.deposit,
        timestamp: Date.now(),
        rentalPrice: matchedProduct?.price || 0,
      });
      await logAction(user, 'Created new reservation', { customer: newRes.customer, customerId });
      setIsModalOpen(false);
      toast.success('Reservation created successfully');
      setNewRes({ customer: '', customerId: '', outfit: '', size: 'M', date: '', deposit: false });
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
            <button
              className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
            >
              List View
            </button>
            <button
              className={`toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}
              onClick={() => setViewMode('calendar')}
            >
              Calendar
            </button>
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
            <input
              type="text"
              placeholder="Search by ID or customer name..."
              value={searchInput}
              onChange={handleSearchChange}
              className="input-field pl-10"
            />
          </div>
          <div className="flex-center gap-2">
            <select
              className="input-field"
              style={{ width: 'auto', minWidth: 150 }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Fitting">Fitting</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-4"><SkeletonTable columns={7} rows={5} /></div>
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
                {filteredReservations.map((res) => {
                  const rDate = parseDate(res.reservationDate || res.date);
                  return (
                    <tr key={res.id}>
                      <td className="font-mono text-sm">{res.id}</td>
                      <td className="font-medium">{res.customerName || res.customer}</td>
                      <td>
                        <div>{res.productName || res.outfit}</div>
                        <div className="text-secondary text-sm">Size: {res.size}</div>
                      </td>
                      <td>
                        <div>{rDate.toLocaleDateString()}</div>
                        <div className="text-secondary text-sm">
                          {rDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        {res.countdown && res.status === 'Pending' && (
                          <CountdownTimer targetDate={res.reservationDate || res.date} />
                        )}
                      </td>
                      <td>
                        <StatusBadge status={res.status} />
                      </td>
                      <td className="text-secondary">{res.staff}</td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="action-icon view"
                            title="View Details"
                            onClick={() => setViewModal(res)}
                          >
                            <Eye size={16} />
                          </button>
                          {/* Lifecycle: Pending → Confirmed → Fitting → Completed */}
                          {res.status === 'Pending' && (
                            <>
                              <button
                                className="action-icon approve"
                                title="Confirm Booking"
                                onClick={() => handleAction(res.id, 'confirm')}
                              >
                                <CheckCircle size={16} />
                              </button>
                              <button
                                className="action-icon reject"
                                title="Cancel"
                                onClick={() => handleAction(res.id, 'cancel')}
                              >
                                <XCircle size={16} />
                              </button>
                            </>
                          )}
                          {res.status === 'Confirmed' && (
                            <>
                              {products.find(
                                (p) =>
                                  p.id === res.productId ||
                                  p.name === (res.productName || res.outfit),
                              )?.isAlterable ? (
                                <button
                                  className="action-icon approve"
                                  title="Start Fitting"
                                  onClick={() => handleAction(res.id, 'fitting')}
                                >
                                  <Shirt size={16} />
                                </button>
                              ) : (
                                <button
                                  className="action-icon approve"
                                  title="Mark Completed"
                                  onClick={() => handleAction(res.id, 'complete')}
                                >
                                  <CalendarCheck size={16} />
                                </button>
                              )}
                              <button
                                className="action-icon reject"
                                title="Cancel"
                                onClick={() => handleAction(res.id, 'cancel')}
                              >
                                <XCircle size={16} />
                              </button>
                            </>
                          )}
                          {res.status === 'Fitting' && (
                            <button
                              className="action-icon approve"
                              title="Mark Completed"
                              onClick={() => handleAction(res.id, 'complete')}
                            >
                              <CalendarCheck size={16} />
                            </button>
                          )}
                          {(res.status === 'Pending' || res.status === 'Confirmed') && (
                            <button
                              className="action-icon reschedule"
                              title="Reschedule"
                              onClick={() => {
                                setRescheduleModal(res);
                                setNewDate(res.date);
                              }}
                            >
                              <Calendar size={16} />
                            </button>
                          )}
                          {can(user?.role, 'delete_reservation') && (
                            <button
                              className="action-icon reject"
                              title="Delete"
                              onClick={() => setDeleteConfirm(res)}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredReservations.length === 0 && (
                  <tr>
                    <td colSpan="7" className="text-center py-8 text-secondary">
                      No reservations found
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
                  onClick={() => fetchReservations(true)}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
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
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Reservation</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>
                &times;
              </button>
            </div>
            <form className="modal-body" onSubmit={handleCreateReservation}>
              <div className="form-group">
                <label className="label">Customer</label>
                <input
                  type="text"
                  className="input-field"
                  list="customers-list"
                  value={newRes.customer}
                  onChange={(e) => setNewRes({ ...newRes, customer: e.target.value })}
                  placeholder="Select or enter customer name..."
                  required
                />
                <datalist id="customers-list">
                  {customers.map((c) => (
                    <option
                      key={c.id}
                      value={
                        c.name ||
                        (c.firstName
                          ? `${c.firstName} ${c.lastName || ''}`.trim()
                          : c.first_name
                            ? `${c.first_name} ${c.last_name || ''}`.trim()
                            : c.email || 'User')
                      }
                    />
                  ))}
                </datalist>
              </div>
              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="label">Selected Outfit</label>
                  <select
                    className="input-field"
                    value={newRes.outfit}
                    onChange={(e) => setNewRes({ ...newRes, outfit: e.target.value })}
                  >
                    <option value="" disabled>
                      Select a product...
                    </option>
                    {products.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group flex-1">
                  <label className="label">Size</label>
                  <select
                    className="input-field"
                    value={newRes.size}
                    onChange={(e) => setNewRes({ ...newRes, size: e.target.value })}
                  >
                    {(() => {
                      const selected = products.find((p) => p.name === newRes.outfit);
                      const sizes = selected?.sizes || ['XS', 'S', 'M', 'L', 'XL'];
                      return sizes.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ));
                    })()}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="label">Reservation Date & Time</label>
                <input
                  type="datetime-local"
                  className="input-field"
                  value={newRes.date}
                  onChange={(e) => setNewRes({ ...newRes, date: e.target.value })}
                  required
                />
              </div>
              <div className="form-group checkbox-group">
                <input
                  type="checkbox"
                  id="deposit"
                  checked={newRes.deposit}
                  onChange={(e) => setNewRes({ ...newRes, deposit: e.target.checked })}
                />
                <label htmlFor="deposit">Security Deposit Paid</label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create Reservation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== RESCHEDULE MODAL ===== */}
      {rescheduleModal && (
        <div className="modal-overlay" onClick={() => setRescheduleModal(null)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 400 }}
          >
            <div className="modal-header">
              <h2>Reschedule {rescheduleModal.id}</h2>
              <button className="close-btn" onClick={() => setRescheduleModal(null)}>
                &times;
              </button>
            </div>
            <form className="modal-body" onSubmit={handleReschedule}>
              <p className="text-secondary">
                Current:{' '}
                {parseDate(
                  rescheduleModal.reservationDate || rescheduleModal.date,
                ).toLocaleString()}
              </p>
              <div className="form-group">
                <label className="label">New Date & Time</label>
                <input
                  type="datetime-local"
                  className="input-field"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  required
                />
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setRescheduleModal(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Confirm Reschedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== VIEW DETAILS MODAL ===== */}
      {viewModal && (
        <div className="modal-overlay" onClick={() => setViewModal(null)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 480 }}
          >
            <div className="modal-header">
              <h2>Reservation Details</h2>
              <button className="close-btn" onClick={() => setViewModal(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              {/* Lifecycle Progress Indicator */}
              <div className="lifecycle-progress">
                {(() => {
                  const isAlterable = products.find(
                    (p) =>
                      p.id === viewModal.productId ||
                      p.name === (viewModal.productName || viewModal.outfit),
                  )?.isAlterable;
                  const steps = isAlterable
                    ? ['Pending', 'Confirmed', 'Fitting', 'Completed']
                    : ['Pending', 'Confirmed', 'Completed'];
                  const statusOrder = isAlterable
                    ? { Pending: 0, Confirmed: 1, Fitting: 2, Completed: 3, Cancelled: -1 }
                    : { Pending: 0, Confirmed: 1, Completed: 2, Cancelled: -1 };
                  return steps.map((step, i) => {
                    const current = statusOrder[viewModal.status] ?? -1;
                    const stepIdx = statusOrder[step];
                    const isCancelled = viewModal.status === 'Cancelled';
                    const isActive = !isCancelled && stepIdx <= current;
                    return (
                      <div
                        key={step}
                        className={`lifecycle-step ${isActive ? 'active' : ''} ${isCancelled ? 'cancelled' : ''}`}
                      >
                        <div className={`lifecycle-dot ${isActive ? 'filled' : ''}`}>
                          {isActive ? '✓' : i + 1}
                        </div>
                        <span className="lifecycle-label">{step}</span>
                        {i < steps.length - 1 && (
                          <div
                            className={`lifecycle-line ${isActive && stepIdx < current ? 'filled' : ''}`}
                          />
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
              {viewModal.status === 'Cancelled' && (
                <div
                  style={{
                    textAlign: 'center',
                    color: 'var(--stock-low)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                  }}
                >
                  This reservation was cancelled
                </div>
              )}
              <div className="detail-row">
                <span className="detail-label">ID</span>
                <span className="font-mono">{viewModal.id}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Customer</span>
                <strong>{viewModal.customerName || viewModal.customer}</strong>
              </div>
              <div className="detail-row">
                <span className="detail-label">Outfit</span>
                {viewModal.productName || viewModal.outfit}
              </div>
              <div className="detail-row">
                <span className="detail-label">Size</span>
                <span className="size-badge">{viewModal.size}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Date</span>
                {parseDate(viewModal.reservationDate || viewModal.date).toLocaleString()}
              </div>
              <div className="detail-row">
                <span className="detail-label">Status</span>
                <StatusBadge status={viewModal.status} />
              </div>
              <div className="detail-row">
                <span className="detail-label">Staff</span>
                {viewModal.staff || 'Unassigned'}
              </div>
              {viewModal.deposit && (
                <div className="detail-row">
                  <span className="detail-label">Deposit</span>
                  <span className="text-success">Paid ✓</span>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button
                className="btn-primary flex-center gap-2"
                onClick={() => {
                  const cName = viewModal.customerName || viewModal.customer;
                  const pName = viewModal.productName || viewModal.outfit;
                  const dDate = parseDate(
                    viewModal.reservationDate || viewModal.date,
                  ).toLocaleDateString();
                  const resId = (viewModal.id || viewModal.docId || '').slice(-6).toUpperCase();
                  const size = viewModal.size || 'N/A';
                  const status =
                    (viewModal.status || 'Pending').charAt(0).toUpperCase() +
                    (viewModal.status || 'pending').slice(1);
                  const deposit = viewModal.deposit ? '✓ Paid' : '✗ Unpaid';
                  const prefill = [
                    `Hi ${cName}! 👋`,
                    ``,
                    `Here's a summary of your reservation:`,
                    `━━━━━━━━━━━━━━━━━━`,
                    `📋 Reservation #${resId}`,
                    `👗 Item: ${pName}`,
                    `📐 Size: ${size}`,
                    `📅 Date: ${dDate}`,
                    `📊 Status: ${status}`,
                    `💰 Deposit: ${deposit}`,
                    `━━━━━━━━━━━━━━━━━━`,
                    ``,
                    `Please let us know if you have any questions!`,
                    `— JezSy Collection`,
                  ].join('\n');
                  navigate('/messages', {
                    state: {
                      buyerId: viewModal.customerId || '',
                      buyerName: cName,
                      prefillMessage: prefill,
                    },
                  });
                }}
              >
                <MessageSquare size={16} /> Message Buyer
              </button>
              <button className="btn-outline" onClick={() => setViewModal(null)}>
                Close
              </button>
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
            <h2>Delete Reservation?</h2>
            <p className="text-secondary mt-2">
              Remove <strong>{deleteConfirm.id}</strong> for{' '}
              {deleteConfirm.customerName || deleteConfirm.customer}? This cannot be undone.
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
    </div>
  );
};

export default Reservations;
