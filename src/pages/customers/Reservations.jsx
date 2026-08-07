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
  X,
} from 'lucide-react';
import StatusBadge from '../../components/ReservationStatusBadge';
import SkeletonTable from '../../components/SkeletonTable';
import ReservationCard from '../../components/reservations/ReservationCard';
import ReservationCalendar from '../../components/reservations/ReservationCalendar';
import '../../components/reservations/ReservationBoard.css';
import { PRIMARY_ACTION, CAN_RESCHEDULE_STATUSES, isAwaitingReceipt } from '../../utils/reservationActions';
import { formatPaymentDeadline, computePaymentDueAt } from '../../utils/reservationDeadline';
import { holdsStock } from '../../utils/reservationStatus';
import { balanceDue } from '../../utils/reservationBalance';
import { formatCurrency } from '../../utils/helpers';
import {
  subscribeToReservations,
  subscribeToReservationItems,
  adjustInventoryForReservation,
  updateReservation,
  createReservation,
  repairReservationData,
} from '../../services/reservationService';
import { subscribeToCustomers } from '../../services/customerService';
import { subscribeToProducts } from '../../services/productService';
import { resolveSignedStorageUrl } from '../../lib/storage';
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

// The three columns are the work queue. Completed and Cancelled are history,
// not work, so they stay in List view rather than adding dead columns staff
// scroll past all day.
const BOARD_COLUMNS = [
  {
    status: 'Pending',
    label: 'Pending review',
    icon: Clock,
    empty: 'Nothing waiting on a decision.',
  },
  {
    status: 'To Pay',
    label: 'Awaiting payment',
    icon: CheckCircle,
    empty: 'No one owes anything right now.',
  },
  {
    status: 'To Pickup',
    label: 'Ready for pickup',
    icon: Shirt,
    empty: 'Nothing waiting to be collected.',
  },
];

const Reservations = () => {
  const { user } = useAuth();
  // Staff monitor reservations read-only; only full-access roles act on them.
  const canManage = can(user?.role, 'assign_reservation');
  const navigate = useNavigate();
  const [reservations, setReservations] = useState([]);
  const [itemsByReservation, setItemsByReservation] = useState({});
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

    const unsubI = subscribeToReservationItems(setItemsByReservation);

    const unsubC = subscribeToCustomers((data) => {
      setCustomers(data.filter((u) => !u.role || u.role === 'customer'));
    });

    const unsubP = subscribeToProducts((data) => {
      setProducts(data);
    });

    return () => {
      unsubR();
      unsubI();
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
  // Board first: the day-to-day job is working the queue, and a flat table
  // gave no sense of what needs doing next. List view is still there for
  // scanning history.
  const [viewMode, setViewMode] = useState('board');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rescheduleModal, setRescheduleModal] = useState(null);
  const [viewModal, setViewModal] = useState(null);
  const [receiptModalUrl, setReceiptModalUrl] = useState(null);
  // receipt_url on the row is a bare storage path in a private bucket, not a
  // usable URL -- resolve it to a signed URL whenever the detail modal opens
  // on a reservation that has one.
  const [resolvedReceiptUrl, setResolvedReceiptUrl] = useState(null);
  const [receiptLoadFailed, setReceiptLoadFailed] = useState(false);

  useEffect(() => {
    setResolvedReceiptUrl(null);
    setReceiptLoadFailed(false);
    if (!viewModal?.receiptUrl) return;
    let cancelled = false;
    resolveSignedStorageUrl('payment_receipts', viewModal.receiptUrl).then((url) => {
      if (cancelled) return;
      if (url) setResolvedReceiptUrl(url);
      else setReceiptLoadFailed(true);
    });
    return () => { cancelled = true; };
  }, [viewModal?.receiptUrl]);

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

    // Falls back to the reservation's own product columns when the lines
    // have not arrived (or an older row predates them), so a card always
    // shows what was reserved rather than nothing.
    const lines = itemsByReservation[r.id]?.length
      ? itemsByReservation[r.id]
      : [{
          id: r.id,
          productId: r.productId,
          productName: r.productName || r.outfit,
          size: r.size,
          color: r.color,
          quantity: r.quantity ?? 1,
        }];

    return {
      ...r,
      lines,
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

  // A reservation can hold several products, so stock has to move for every
  // line. Adjusting only the reservation's own product columns would leave
  // every item after the first uncounted -- reserved stock silently wrong.
  // Quantity is honoured too: 2 of something moves 2.
  const adjustStockForReservation = async (res, deltaPerUnit, isConsume = false) => {
    const lines = itemsByReservation[res.id]?.length
      ? itemsByReservation[res.id]
      : [{
          productId: res.productId,
          productName: res.productName || res.outfit,
          size: res.size,
          quantity: res.quantity ?? 1,
        }];

    for (const line of lines) {
      const qty = Math.max(1, line.quantity ?? 1);
      await adjustStock(
        line.productId || line.productName,
        line.size,
        deltaPerUnit * qty,
        isConsume,
      );
    }
  };

  // --- LIFECYCLE ACTIONS ---
  // Lifecycle: Pending → To Pay → To Pickup → Active → Completed | Cancelled
  // Also backwards compatible with Confirmed and Fitting
  const handleAction = async (id, action) => {
    const res = reservations.find((r) => r.id === id);
    if (!res) return;

    try {
      if (action === 'approve_pay') {
        // 'Confirmed' is the stored value; the display mapping above turns it
        // back into "To Pay" for staff. Writing the label instead meant the DB
        // never saw an accepted reservation: no payment deadline was stamped,
        // the customer was never told to pay, the app showed no Pay button,
        // and the unpaid sweep never picked it up.
        await updateReservation(res.docId, { status: 'Confirmed' });
        // Stock is committed at approval, not at pickup: once staff accept, the
        // item is promised to this customer and must stop being sellable even
        // though payment has not landed. Deducting only at ready_pickup meant
        // two customers could both be approved for the same last unit.
        await adjustStockForReservation(res, -1);
        toast.success(`Reservation ${id} approved for payment — stock held`);
      } else if (action === 'ready_pickup') {
        await updateReservation(res.docId, {
          status: 'To Pickup',
          staff: user?.name || 'Staff',
          assigned_staff_id: user?.uid || '',
          countdown: false,
        });
        // No stock movement here: approval already held it, and both statuses
        // are in STOCK_HOLDING_STATUSES.
        toast.success(`Reservation ${id} payment received — ready for pickup`);
      } else if (action === 'complete') {
        await updateReservation(res.docId, { status: 'Completed' });
        // Consume reserved stock (item purchased/picked up forever)
        await adjustStockForReservation(res, 1, true);
        toast.success(`Reservation ${id} completed — stock consumed permanently`);
      } else if (action === 'cancel') {
        await updateReservation(res.docId, { status: 'Cancelled', countdown: false });
        // Restore exactly when the previous status was holding stock. Using the
        // shared predicate rather than a hand-listed set is the point: the old
        // inline list included statuses that had never deducted, so cancelling
        // handed back units that were never taken.
        if (holdsStock(res.status)) {
          await adjustStockForReservation(res, 1);
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
      // Moving the appointment invalidates the old payment window: the trigger
      // only stamps on entry to an awaiting-payment status and COALESCEs, so
      // without this the deadline can outlast the new appointment, or have
      // already expired for one moved further out.
      const stillAwaitingPayment =
        rescheduleModal.displayStatus === 'To Pay' &&
        !['paid', 'submitted'].includes(String(rescheduleModal.paymentStatus || '').toLowerCase());

      await updateReservation(rescheduleModal.docId, {
        reservationDate: new Date(newDate),
        date: new Date(newDate), // Fallback for Android which parses 'date'
        countdown: true,
        ...(stillAwaitingPayment ? { payment_due_at: computePaymentDueAt(newDate) } : {}),
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

  // Shared by the modal footer, the board card, and the table row -- used to
  // live only in the modal's onClick, which meant messaging a customer about
  // a reservation required opening the full detail modal first every time.
  const handleMessageBuyer = (res) => {
    const cName = res.customerName || res.customer;
    const pName = res.productName || res.outfit;
    const resDate = parseDate(res.reservationDate || res.date);
    const resId = (res.id || res.docId || '').toUpperCase();
    const status = res.displayStatus || 'Pending';

    navigate('/messages', {
      state: {
        buyerId: res.customerId || '',
        buyerName: cName,
        autoSendReservation: true,
        reservationContext: {
          id: resId,
          productName: pName,
          size: res.size || 'N/A',
          date: resDate.toLocaleDateString('en-PH', {
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
          }),
          time: resDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          status,
          // The amount is not a flag, so a message to the customer must not
          // claim they have paid merely because a balance exists. Nor may it say
          // "Paid" outright on a deposit reservation -- the webhook marks that
          // paid once the 50% clears, and this text goes to the customer.
          deposit: balanceDue(res)
            ? `Deposit paid, ${formatCurrency(balanceDue(res))} due on collection`
            : res.paymentStatus === 'Paid'
              ? 'Paid in full ✓'
              : 'Unpaid',
          imageUrl: res.imageUrl || '',
          customerName: cName,
        },
      },
    });
    setViewModal(null);
  };

  // Was handleToggleDeposit, which wrote a boolean into `deposit` -- a numeric
  // column holding the amount owed. Postgres rejects that outright, so the
  // control silently did nothing; had it succeeded it would have destroyed the
  // figure the customer is being charged. Paid/unpaid belongs to payment_status.
  const handleTogglePaid = async (res) => {
    const nextPaid = res.paymentStatus !== 'Paid';
    try {
      await updateReservation(res.docId, { paymentStatus: nextPaid ? 'Paid' : 'Pending' });
      setViewModal((prev) => prev ? { ...prev, paymentStatus: nextPaid ? 'Paid' : 'Pending' } : prev);
      await logAction(user, nextPaid ? 'Marked payment as received' : 'Marked payment as unpaid', {
        reservationId: res.id,
        customer: res.customerName || res.customer,
      });
      toast.success(nextPaid ? 'Payment marked as received' : 'Payment marked as unpaid');
    } catch (e) {
      toast.error('Failed to update payment status');
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

  // A receipt only leaves 'Submitted' when a person has looked at it. Rejecting
  // returns it to unpaid rather than cancelling outright, so a customer who
  // sent the wrong image can try again inside whatever time is left -- an
  // unreadable screenshot is not the same as refusing to pay.
  const handleRejectReceipt = async (res) => {
    try {
      await updateReservation(res.docId, { paymentStatus: 'Pending', receiptUrl: null });
      setViewModal((prev) => prev ? { ...prev, paymentStatus: 'Pending', receiptUrl: null } : prev);
      await logAction(user, 'Rejected payment receipt', {
        reservationId: res.id,
        customer: res.customerName || res.customer,
      });
      toast.error('Receipt rejected — the customer can upload another');
    } catch {
      toast.error('Failed to reject the receipt');
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
              className={`toggle-btn ${viewMode === 'board' ? 'active' : ''}`}
              onClick={() => setViewMode('board')}
            >
              Board
            </button>
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
        ) : viewMode === 'board' ? (
          <div className="res-board">
            {BOARD_COLUMNS.map((column) => {
              const cards = filteredReservations.filter(
                (r) => r.displayStatus === column.status,
              );
              return (
                <section key={column.status} className="res-board-col">
                  <h2 className="res-board-col-head">
                    <column.icon size={16} aria-hidden="true" />
                    {column.label}
                    <span className="res-board-count">{cards.length}</span>
                  </h2>

                  {cards.length === 0 ? (
                    <p className="res-board-empty">{column.empty}</p>
                  ) : (
                    cards.map((res) => (
                      <ReservationCard
                        key={res.id}
                        res={res}
                        canManage={canManage}
                        onView={() => setViewModal(res)}
                        onAction={handleAction}
                        onReschedule={() => {
                          setRescheduleModal(res);
                          setNewDate(res.date);
                        }}
                        onMessage={() => handleMessageBuyer(res)}
                      />
                    ))
                  )}
                </section>
              );
            })}
          </div>
        ) : viewMode === 'table' ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Customer</th>
                  <th>Items</th>
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
                        {res.lines.map((line, index) => (
                          <div key={line.id ?? `${line.productId}-${index}`} className={index > 0 ? 'text-sm mt-1' : ''}>
                            {line.productName || res.productName || res.outfit}
                            {line.size ? ` (${line.size})` : ''}
                            {(line.quantity ?? 1) > 1 ? ` x${line.quantity}` : ''}
                          </div>
                        ))}
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
                        {isAwaitingReceipt(res) && (
                          <div className="text-gold text-xs mt-1 font-medium bg-cream p-1 rounded inline-block border" style={{ borderColor: 'var(--border-color)' }}>
                            Receipt Uploaded
                          </div>
                        )}
                        {(() => {
                          const deadline = res.displayStatus === 'To Pay' ? formatPaymentDeadline(res.paymentDueAt) : null;
                          if (!deadline) return null;
                          return (
                            <div className={`text-xs mt-1 font-medium ${deadline.urgent ? 'text-danger' : 'text-gold'}`}>
                              {deadline.label} to pay
                            </div>
                          );
                        })()}
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
                          <button
                            className="action-icon"
                            title="Message Buyer"
                            onClick={() => handleMessageBuyer(res)}
                          >
                            <MessageSquare size={16} />
                          </button>
                          {/* Lifecycle actions — full-access roles only; staff view read-only.
                              Same PRIMARY_ACTION map as the board, so the two views never
                              show a different action for the same status again. */}
                          {canManage && (
                            <>
                              {PRIMARY_ACTION[res.displayStatus] && (
                                <button
                                  className="action-icon approve"
                                  title={isAwaitingReceipt(res) ? 'Verify Receipt' : PRIMARY_ACTION[res.displayStatus].label}
                                  onClick={() => handleAction(res.id, PRIMARY_ACTION[res.displayStatus].action)}
                                >
                                  <CheckCircle size={16} />
                                </button>
                              )}
                              {CAN_RESCHEDULE_STATUSES.has(res.displayStatus) && (
                                <>
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
                                  <button
                                    className="action-icon reject"
                                    title="Cancel"
                                    onClick={() => handleAction(res.id, 'cancel')}
                                  >
                                    <XCircle size={16} />
                                  </button>
                                </>
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
          <ReservationCalendar
            reservations={filteredReservations}
            onView={(res) => setViewModal(res)}
            onMessage={handleMessageBuyer}
          />
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
              <div className="detail-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <span className="detail-label" style={{ marginBottom: '6px' }}>
                  {(viewModal.lines?.length ?? 1) > 1 ? `Items (${viewModal.lines.length})` : 'Item'}
                </span>
                <ul className="res-card-lines" style={{ width: '100%' }}>
                  {(viewModal.lines?.length ? viewModal.lines : [{
                    id: viewModal.id,
                    productName: viewModal.productName || viewModal.outfit,
                    size: viewModal.size,
                    quantity: viewModal.quantity ?? 1,
                  }]).map((line, index) => (
                    <li key={line.id ?? `${line.productId}-${index}`}>
                      <span className="res-card-line-name">
                        {line.productName || 'Unnamed item'}
                        {line.size ? `, ${line.size}` : ''}
                      </span>
                      <span className="res-card-line-qty">x{line.quantity ?? 1}</span>
                    </li>
                  ))}
                </ul>
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
                <span className="detail-label">Amount Due</span>
                <div className="flex-center gap-2">
                  {/* deposit is the amount owed, not a paid flag. Reading it as
                      a boolean made every reservation with a non-zero balance
                      show "Paid", which is the opposite of the truth. Whether
                      money arrived is payment_status. */}
                  <span className="text-secondary">
                    ₱{Number(viewModal.deposit || 0).toFixed(2)}
                  </span>
                  <span className={viewModal.paymentStatus === 'Paid' ? 'text-success' : 'text-secondary'}>
                    {viewModal.paymentStatus === 'Paid' ? 'Paid ✓' : 'Unpaid ✗'}
                  </span>
                  {viewModal.displayStatus !== 'Completed' && viewModal.displayStatus !== 'Cancelled' && (
                    <button
                      className={viewModal.paymentStatus === 'Paid' ? 'btn-outline small' : 'btn-primary small'}
                      style={{ padding: '0.2rem 0.75rem', fontSize: '0.75rem' }}
                      onClick={() => handleTogglePaid(viewModal)}
                    >
                      {viewModal.paymentStatus === 'Paid' ? 'Mark Unpaid' : 'Mark as Paid'}
                    </button>
                  )}
                </div>
              </div>
              {balanceDue(viewModal) > 0 && (
                <div className="detail-row">
                  <span className="detail-label">Balance on collection</span>
                  <span className="font-medium text-gold">
                    {formatCurrency(balanceDue(viewModal))} to collect in person
                  </span>
                </div>
              )}
              <div className="detail-row">
                <span className="detail-label">Payment</span>
                <div>
                  <div className={`font-medium ${
                    viewModal.paymentStatus === 'Paid' ? 'text-success'
                    // Submitted/Processing both mean "receipt sent, awaiting staff
                    // review" -- neither is a flat "nothing has happened" unpaid
                    // state, so both get the same in-review color rather than
                    // Submitted falling through to the same red as truly unpaid.
                    : (viewModal.paymentStatus === 'Submitted' || viewModal.paymentStatus === 'Processing') ? 'text-gold'
                    : 'text-danger'
                  }`}>
                    {viewModal.paymentStatus || 'Unpaid'}
                  </div>
                  {(() => {
                    const deadline = viewModal.displayStatus === 'To Pay' ? formatPaymentDeadline(viewModal.paymentDueAt) : null;
                    if (!deadline) return null;
                    return (
                      <div className={`text-sm font-medium ${deadline.urgent ? 'text-danger' : 'text-gold'}`}>
                        {deadline.label} to pay
                      </div>
                    );
                  })()}
                  {viewModal.paymentType && (
                    <div className="text-secondary text-sm">{viewModal.paymentType}</div>
                  )}
                </div>
              </div>
              {viewModal.receiptUrl && (
                <div className="detail-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: '8px' }}>
                    <span className="detail-label">Receipt Uploaded</span>
                    {/* 'Submitted' is what the app writes when a customer sends
                        a transfer receipt. This was gated on 'Processing',
                        which nothing ever sets, so the button never appeared
                        and no receipt could be actioned at all. */}
                    {(viewModal.paymentStatus === 'Submitted' ||
                      viewModal.paymentStatus === 'Processing') && (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          className="btn-primary small"
                          style={{ padding: '0.2rem 0.75rem', fontSize: '0.75rem' }}
                          onClick={() => handleVerifyPayment(viewModal)}
                        >
                          Verify Payment
                        </button>
                        <button
                          className="btn-outline small"
                          style={{ padding: '0.2rem 0.75rem', fontSize: '0.75rem' }}
                          onClick={() => handleRejectReceipt(viewModal)}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                  {receiptLoadFailed ? (
                    <div className="text-danger text-sm">
                      Could not load this receipt. It may have been removed, or you may not have permission to view it.
                    </div>
                  ) : resolvedReceiptUrl ? (
                    <button
                      type="button"
                      className="receipt-thumb-btn"
                      onClick={() => setReceiptModalUrl(resolvedReceiptUrl)}
                      style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}
                      aria-label="View full-size receipt"
                    >
                      <img
                        src={resolvedReceiptUrl}
                        alt="Receipt"
                        style={{ height: '150px', objectFit: 'contain', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface, #f4f4f4)' }}
                      />
                    </button>
                  ) : (
                    <div className="text-secondary text-sm">Loading receipt…</div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button
                className="btn-primary flex-center gap-2"
                onClick={() => handleMessageBuyer(viewModal)}
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

      {receiptModalUrl && (
        <div className="modal-overlay" onClick={() => setReceiptModalUrl(null)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '90vh', width: 'auto', padding: '1rem' }}
          >
            <div className="modal-header">
              <h3>Payment Receipt</h3>
              <button className="btn-icon" onClick={() => setReceiptModalUrl(null)} aria-label="Close receipt">
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', maxHeight: '75vh', overflow: 'auto' }}>
              <img
                src={receiptModalUrl}
                alt="Payment receipt, full size"
                style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: '8px' }}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Reservations;
