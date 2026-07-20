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
  CalendarCheck,
  UserCheck,
  Shirt,
  MessageSquare,
} from 'lucide-react';
import StatusBadge from '../../components/inventory/StatusBadge';
import SkeletonTable from '../../components/SkeletonTable';
import {
  subscribeToReservations,
  adjustInventoryForReservation,
  updateReservation,
  createReservation,
  repairReservationData,
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
  // Staff monitor reservations read-only; only full-access roles act on them.
  const canManage = can(user?.role, 'assign_reservation');
  const navigate = useNavigate();
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    setLoading(true);
    // Real-time Reservations Listener
    const unsubR = subscribeToReservations((data) => {
      console.log('DEBUG: REAL-TIME RESERVATIONS:', data);
      
      // Auto-healing for broken data (Names or Product Names)
      data.forEach(res => {
        const cName = res.customerName || res.customer || '';
        const pName = res.productName || res.outfit || '';
        const isId = (str) => /^[a-zA-Z0-9]{15,30}$/.test(str);
        
        if (isId(cName) || isId(pName) || !cName || !pName) {
          repairReservationData(res);
        }
      });

      setReservations(data);
      setLoading(false);
    });

    const unsubC = subscribeToCustomers((data) => {
      setCustomers(data.filter((u) => !u.role || u.role === 'customer'));
    });

    const unsubP = subscribeToProducts((data) => {
      setProducts(data);
    });

    return () => {
      unsubR();
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

  const filteredReservations = reservations.map(r => {
    // Normalize status to Sentence Case, mapping legacy states to new ones for display if desired
    let displayStatus = r.status ? r.status.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ') : 'Pending';
    if (displayStatus === 'Request Approval') displayStatus = 'Pending';
    if (displayStatus === 'Confirmed') displayStatus = 'To Pay';
    if (displayStatus === 'Fitting') displayStatus = 'To Pickup';
    if (displayStatus === 'Active') displayStatus = 'Completed';

    return {
      ...r,
      displayStatus: displayStatus,
      displayDate: parseDate(r.reservationDate || r.date),
      displayName: r.customerName || r.customer || 'Unknown Customer'
    };
  }).filter((r) => {
    const matchesSearch =
      r.displayName.toLowerCase().includes((searchTerm || '').toLowerCase()) ||
      (r.id || '').toLowerCase().includes((searchTerm || '').toLowerCase());
    
    // Status filter logic
    let matchesStatus = false;
    if (statusFilter === 'All') matchesStatus = true;
    else if (statusFilter.startsWith('Pending')) matchesStatus = r.displayStatus === 'Pending';
    else if (statusFilter.startsWith('To Pickup')) matchesStatus = r.displayStatus === 'To Pickup';
    else if (statusFilter.startsWith('Completed')) matchesStatus = r.displayStatus === 'Completed';
    else matchesStatus = r.displayStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // --- Stock adjustment helper ---
  const adjustStock = async (outfit, size, delta, isConsume = false) => {
    await adjustInventoryForReservation(outfit, size, delta, isConsume);
  };

  // --- LIFECYCLE ACTIONS ---
  // Lifecycle: Pending → To Pay → To Pickup → Active → Completed | Cancelled
  // Also backwards compatible with Confirmed and Fitting
  const handleAction = async (id, action) => {
    const res = reservations.find((r) => r.id === id);
    if (!res) return;

    try {
      if (action === 'approve_pay') {
        await updateReservation(res.docId, { status: 'To Pay' });
        toast.success(`Reservation ${id} approved for payment`);
      } else if (action === 'ready_pickup') {
        await updateReservation(res.docId, {
          status: 'To Pickup',
          staff: user?.name || 'Staff',
          assigned_staff_id: user?.uid || '',
          countdown: false,
        });
        await adjustStock(res.productId || res.productName || res.outfit, res.size, -1);
        toast.success(`Reservation ${id} payment received — stock reserved and ready for pickup`);
      } else if (action === 'complete') {
        await updateReservation(res.docId, { status: 'Completed' });
        // Consume reserved stock (item purchased/picked up forever)
        await adjustStock(res.productId || res.productName || res.outfit, res.size, 1, true);
        toast.success(`Reservation ${id} completed — stock consumed permanently`);
      } else if (action === 'cancel') {
        await updateReservation(res.docId, { status: 'Cancelled', countdown: false });
        // Only restore stock if it was confirmed/to-pickup/active (stock was deducted)
        if (res.status === 'Confirmed' || res.status === 'Fitting' || res.status === 'To Pickup' || res.status === 'Active') {
          await adjustStock(res.productId || res.productName || res.outfit, res.size, 1);
        }
        toast.error(`Reservation ${id} cancelled`);
      }
      const actionLabels = {
        approve_pay: 'Approved for Payment',
        ready_pickup: 'Confirmed & To Pickup',
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
        date: new Date(newDate), // Fallback for Android which parses 'date'
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

  const handleToggleDeposit = async (res) => {
    try {
      const newDepositValue = !res.deposit;
      await updateReservation(res.docId, { deposit: newDepositValue });
      setViewModal((prev) => prev ? { ...prev, deposit: newDepositValue } : prev);
      await logAction(user, newDepositValue ? 'Marked deposit as paid' : 'Marked deposit as unpaid', {
        reservationId: res.id,
        customer: res.customerName || res.customer,
      });
      toast.success(newDepositValue ? 'Deposit marked as paid' : 'Deposit marked as unpaid');
    } catch (e) {
      toast.error('Failed to update deposit status');
    }
  };

  const handleVerifyPayment = async (res) => {
    try {
      await updateReservation(res.docId, { paymentStatus: 'Paid' });
      setViewModal((prev) => prev ? { ...prev, paymentStatus: 'Paid' } : prev);
      await logAction(user, 'Verified GCash Payment', {
        reservationId: res.id,
        customer: res.customerName || res.customer,
      });
      toast.success('Payment verified successfully');
    } catch (e) {
      toast.error('Failed to verify payment');
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
        date: new Date(newRes.date), // Fallback for Android which parses 'date'
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
          {can(user?.role, 'create_reservation') && (
            <button className="btn-primary flex-center gap-2" onClick={() => setIsModalOpen(true)}>
              <Plus size={18} /> New Reservation
            </button>
          )}
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
              <option value="Pending">Pending / Requests</option>
              <option value="To Pay">To Pay</option>
              <option value="To Pickup">To Pickup (Confirmed)</option>
              <option value="Completed">Completed / Returned</option>
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
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredReservations.map((res) => {
                  const rDate = parseDate(res.reservationDate || res.date);
                  return (
                    <tr key={res.id}>
                      <td className="font-mono text-sm">{res.id}</td>
                      <td className="font-medium">{res.displayName}</td>
                      <td>
                        <div>{res.productName || res.outfit}</div>
                        <div className="text-secondary text-sm">Size: {res.size}</div>
                      </td>
                      <td>
                        <div>{res.displayDate.toLocaleDateString()}</div>
                        <div className="text-secondary text-sm">
                          {res.displayDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        {res.countdown && (res.displayStatus === 'Pending' || res.displayStatus === 'Request Approval') && (
                          <CountdownTimer targetDate={res.reservationDate || res.date} />
                        )}
                      </td>
                      <td>
                        <StatusBadge status={res.displayStatus} />
                        {res.paymentStatus === 'Processing' && res.receiptUrl && (
                          <div className="text-gold text-xs mt-1 font-medium bg-cream p-1 rounded inline-block border" style={{ borderColor: 'var(--border-color)' }}>
                            Receipt Uploaded
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="action-icon view"
                            title="View Details"
                            onClick={() => setViewModal(res)}
                          >
                            <Eye size={16} />
                          </button>
                          {/* Lifecycle actions — full-access roles only; staff view read-only */}
                          {canManage && (
                          <>
                          {res.displayStatus === 'Pending' && (
                            <>
                              <button
                                className="action-icon approve"
                                title="Approve & Request Payment"
                                onClick={() => handleAction(res.id, 'approve_pay')}
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
                          {res.displayStatus === 'To Pay' && (
                            <>
                              <button
                                className="action-icon approve"
                                title="Mark Paid & Ready for Pickup"
                                onClick={() => handleAction(res.id, 'ready_pickup')}
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
                          {res.displayStatus === 'To Pickup' && (
                            <>
                              <button
                                className="action-icon approve"
                                title="Complete / Hand over"
                                onClick={() => handleAction(res.id, 'complete')}
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
                          {(res.displayStatus === 'Pending' || res.displayStatus === 'To Pay' || res.displayStatus === 'To Pickup') && (
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
                          </>
                          )}

                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredReservations.length === 0 && (
                  <tr>
                    <td colSpan="6" className="text-center py-8 text-secondary">
                      No reservations found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {/* Pagination removed for Real-Time stream */}
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
                  const steps = ['Pending', 'To Pay', 'To Pickup', 'Completed'];
                  const statusOrder = { Pending: 0, 'To Pay': 1, 'To Pickup': 2, Completed: 3, Cancelled: -1, Returned: -1 };
                  return steps.map((step, i) => {
                    const current = statusOrder[viewModal.displayStatus] ?? -1;
                    const stepIdx = statusOrder[step];
                    const isCancelled = viewModal.displayStatus === 'Cancelled';
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
              {viewModal.displayStatus === 'Cancelled' && (
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
                <strong>{viewModal.customerName || viewModal.customer || 'Unknown'}</strong>
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
                <StatusBadge status={viewModal.displayStatus || 'Pending'} />
              </div>
              <div className="detail-row">
                <span className="detail-label">Deposit</span>
                <div className="flex-center gap-2">
                  <span className={viewModal.deposit ? 'text-success' : 'text-secondary'}>
                    {viewModal.deposit ? 'Paid ✓' : 'Unpaid ✗'}
                  </span>
                  {viewModal.displayStatus !== 'Completed' && viewModal.displayStatus !== 'Cancelled' && (
                    <button
                      className={viewModal.deposit ? 'btn-outline small' : 'btn-primary small'}
                      style={{ padding: '0.2rem 0.75rem', fontSize: '0.75rem' }}
                      onClick={() => handleToggleDeposit(viewModal)}
                    >
                      {viewModal.deposit ? 'Mark Unpaid' : 'Mark as Paid'}
                    </button>
                  )}
                </div>
              </div>
              <div className="detail-row">
                <span className="detail-label">Payment</span>
                <div>
                  <div className={`font-medium ${viewModal.paymentStatus === 'Processing' ? 'text-gold' : viewModal.paymentStatus === 'Paid' ? 'text-success' : 'text-danger'}`}>
                    {viewModal.paymentStatus || 'Unpaid'}
                  </div>
                  {viewModal.paymentType && (
                    <div className="text-secondary text-sm">{viewModal.paymentType}</div>
                  )}
                </div>
              </div>
              {viewModal.receiptUrl && (
                <div className="detail-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: '8px' }}>
                    <span className="detail-label">Receipt Uploaded</span>
                    {viewModal.paymentStatus === 'Processing' && (
                      <button
                        className="btn-primary small"
                        style={{ padding: '0.2rem 0.75rem', fontSize: '0.75rem' }}
                        onClick={() => handleVerifyPayment(viewModal)}
                      >
                        Verify Payment
                      </button>
                    )}
                  </div>
                  <a href={viewModal.receiptUrl} target="_blank" rel="noopener noreferrer">
                    <img 
                      src={viewModal.receiptUrl} 
                      alt="Receipt" 
                      style={{ height: '150px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }} 
                    />
                  </a>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button
                className="btn-primary flex-center gap-2"
                onClick={() => {
                  const cName = viewModal.customerName || viewModal.customer;
                  const pName = viewModal.productName || viewModal.outfit;
                  const resDate = parseDate(viewModal.reservationDate || viewModal.date);
                  const resId = (viewModal.id || viewModal.docId || '').toUpperCase();
                  const status = viewModal.displayStatus || 'Pending';

                  navigate('/messages', {
                    state: {
                      buyerId: viewModal.customerId || '',
                      buyerName: cName,
                      autoSendReservation: true,
                      reservationContext: {
                        id: resId,
                        productName: pName,
                        size: viewModal.size || 'N/A',
                        date: resDate.toLocaleDateString('en-PH', {
                          weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
                        }),
                        time: resDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        status,
                        deposit: viewModal.deposit ? 'Paid ✓' : 'Unpaid',
                        imageUrl: viewModal.imageUrl || '',
                        customerName: cName,
                      },
                    },
                  });
                  setViewModal(null);
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

    </div>
  );
};

export default Reservations;
