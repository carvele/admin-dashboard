import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import debounce from 'lodash.debounce';
import { useAuth } from '../../context/AuthContext';
import {
  Calendar,
  Search,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Shirt,
  Package,
  MessageSquare,
  X,
  QrCode,
  DollarSign,
  ArrowUpDown,
  ReceiptText,
  PackageCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import StatusBadge from '../../components/ReservationStatusBadge';
import SkeletonTable from '../../components/SkeletonTable';
import ReservationCard from '../../components/reservations/ReservationCard';
import ReservationCalendar from '../../components/reservations/ReservationCalendar';
import ConfirmDialog from '../../components/ConfirmDialog';
import PageHeader from '../../components/PageHeader';
import '../../components/reservations/ReservationBoard.css';
import { PRIMARY_ACTION, CAN_RESCHEDULE_STATUSES, isAwaitingReceipt } from '../../utils/reservationActions';
import { formatPaymentDeadline, computePaymentDueAt } from '../../utils/reservationDeadline';
import { holdsStock } from '../../utils/reservationStatus';
import { outstandingBalance } from '../../utils/reservationBalance';
import { formatProposedAppointment } from '../../utils/rescheduleRequest';
import { formatCurrency } from '../../utils/helpers';
import {
  subscribeToReservations,
  subscribeToReservationItems,
  adjustInventoryForReservation,
  updateReservation,
  createReservation,
  repairReservationData,
  settleReservationBalance,
  resolveRescheduleRequest,
  getPaymentsForReservation,
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
    status: 'Preparing',
    label: 'Preparing',
    icon: Package,
    empty: 'Nothing being prepared right now.',
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
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    setLoading(true);
    // Real-time Reservations Listener
    const unsubR = subscribeToReservations((data) => {
      // Auto-healing for broken data (Names or Product Names)
      data.forEach(res => {
        const cName = res.customerName || res.customer || '';
        const pName = res.productName || res.outfit || '';
        const isId = (str) => /^[a-zA-Z0-9-]{15,40}$/.test(str);
        
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

  // debounce(...) only closes over the stable setSearchTerm setter, so an
  // empty dep array is correct; eslint can't statically verify that through
  // the debounce() call wrapper.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrToken, setQrToken] = useState('');
  const [qrResult, setQrResult] = useState(null);
  // List view sort: { key: string, dir: 'asc'|'desc' }
  const [listSort, setListSort] = useState({ key: 'date', dir: 'asc' });
  const toggleSort = (key) => setListSort(prev => ({
    key,
    dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc',
  }));
  const [receiptModalUrl, setReceiptModalUrl] = useState(null);
  const [confirmDialogState, setConfirmDialogState] = useState(null);
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

  // PayMongo transaction history for the reservation currently open in the
  // details modal. See getPaymentsForReservation: this table was never read
  // anywhere in the app before, so staff had no way to see the actual
  // transaction (amount charged, provider status, checkout session id)
  // behind a reservation's payment_status.
  const [paymentRecords, setPaymentRecords] = useState([]);
  const [paymentRecordsLoading, setPaymentRecordsLoading] = useState(false);

  useEffect(() => {
    setPaymentRecords([]);
    if (!viewModal?.id) return;
    let cancelled = false;
    setPaymentRecordsLoading(true);
    getPaymentsForReservation(viewModal.id)
      .then((rows) => { if (!cancelled) setPaymentRecords(rows); })
      .catch(() => { if (!cancelled) setPaymentRecords([]) })
      .finally(() => { if (!cancelled) setPaymentRecordsLoading(false); });
    return () => { cancelled = true; };
  }, [viewModal?.id]);

  const [newRes, setNewRes] = useState({
    customer: '',
    customerId: '',
    outfit: '',
    size: 'M',
    date: '',
    deposit: false,
  });
  const [newDate, setNewDate] = useState('');
  const [expandedRows, setExpandedRows] = useState({});

  const toggleExpandRow = (resId) => {
    setExpandedRows((prev) => ({ ...prev, [resId]: !prev[resId] }));
  };

  const filteredReservations = reservations.map(r => {
    // Normalize status to Sentence Case, mapping legacy states to new ones for display if desired
    let displayStatus = r.status ? r.status.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ') : 'Pending';
    if (displayStatus === 'Request Approval') displayStatus = 'Pending';
    if (displayStatus === 'Confirmed') displayStatus = 'To Pay';
    if (displayStatus === 'Fitting') displayStatus = 'To Pickup';
    if (displayStatus === 'Ready') displayStatus = 'To Pickup';
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
    return adjustInventoryForReservation(outfit, size, delta, isConsume);
  };

  // A reservation can hold several products, so stock has to move for every
  // line. Adjusting only the reservation's own product columns would leave
  // every item after the first uncounted -- reserved stock silently wrong.
  // Quantity is honoured too: 2 of something moves 2.
  // Returns false if any line failed, so callers can warn staff instead of
  // claiming a stock move that didn't actually happen.
  const adjustStockForReservation = async (res, deltaPerUnit, isConsume = false) => {
    const lines = itemsByReservation[res.id]?.length
      ? itemsByReservation[res.id]
      : [{
          productId: res.productId,
          productName: res.productName || res.outfit,
          size: res.size,
          quantity: res.quantity ?? 1,
        }];

    let allOk = true;
    for (const line of lines) {
      const qty = Math.max(1, line.quantity ?? 1);
      const ok = await adjustStock(
        line.productId || line.productName,
        line.size,
        deltaPerUnit * qty,
        isConsume,
      );
      if (!ok) allOk = false;
    }
    return allOk;
  };

  // --- LIFECYCLE ACTIONS ---
  // Lifecycle: Pending → To Pay → Preparing → To Pickup → Completed | Cancelled
  // Also backwards compatible with Confirmed, Fitting and Active
  // Answering a customer's request to move their appointment. Approving
  // re-checks the slot inside the RPC: it was free when they asked, but the
  // request may have sat in the queue while another reservation took it, so a
  // clash surfaces here rather than as a double-booked morning.
  const handleResolveReschedule = async (id, approve) => {
    const res = filteredReservations.find((r) => r.id === id);
    if (!res) return;
    try {
      await resolveRescheduleRequest(id, approve);
      toast.success(
        approve
          ? `Moved ${res.displayId || id} to ${formatProposedAppointment(res)}`
          : `Declined the new time for ${res.displayId || id}`,
      );
      await logAction(user, `${approve ? 'Approved' : 'Declined'} reschedule request`, {
        reservationId: id,
      });
    } catch (e) {
      toast.error(e?.message || 'Could not answer that request.');
    }
  };

  const handleAction = async (id, action) => {
    const res = reservations.find((r) => r.id === id);
    if (!res) return;

    try {
      if (action === 'approve_pay') {
        await updateReservation(res.docId, {
          status: 'To Pay',
          confirmed_by_id: user?.uid || user?.id || null,
          confirmed_by_name: user?.name || user?.email || 'Staff',
          confirmed_at: new Date().toISOString()
        });
        // Stock is committed at approval, not at pickup: once staff accept, the
        // item is promised to this customer and must stop being sellable even
        // though payment has not landed. Deducting only at ready_pickup meant
        // two customers could both be approved for the same last unit.
        const stockOk = await adjustStockForReservation(res, -1);
        toast.success(`Reservation ${id} approved for payment — stock held`);
        if (!stockOk) toast.error(`Stock adjustment for ${id} may have failed — check inventory`);
      } else if (action === 'mark_paid') {
        await updateReservation(res.docId, {
          status: 'Preparing',
          payment_status: 'Paid',
          assigned_staff_id: user?.uid || '',
          countdown: false,
        });
        // No stock movement here: approval already held it, and both statuses
        // are in STOCK_HOLDING_STATUSES.
        toast.success(`Reservation ${id} payment received — preparing item`);
      } else if (action === 'ready_pickup') {
        // Payment already landed at mark_paid; this just signals the item is
        // pulled and physically ready at the counter.
        await updateReservation(res.docId, { status: 'Ready' });
        toast.success(`Reservation ${id} marked ready for pickup`);
      } else if (action === 'complete') {
        // Handing over is the moment the rest of the money is taken, in cash,
        // with no electronic trail. Completing without recording it was how a
        // forgotten balance disappeared silently.
        const outstanding = outstandingBalance(res);
        const executeComplete = async () => {
          try {
            if (outstanding > 0) {
              // Recorded before the status moves: if this throws, the reservation
              // stays in To Pickup rather than completing with the money unlogged.
              await settleReservationBalance(res.id);
            }

            await updateReservation(res.docId, { status: 'Completed' });
            // Consume reserved stock (item purchased/picked up forever)
            const stockOk = await adjustStockForReservation(res, 1, true);
            toast.success(
              outstanding > 0
                ? `Reservation ${id} completed — ${formatCurrency(outstanding)} balance recorded`
                : `Reservation ${id} completed — stock consumed permanently`,
            );
            if (!stockOk) toast.error(`Stock consumption for ${id} may have failed — check inventory`);
            await logAction(user, 'Completed reservation', { reservationId: id });
          } catch {
            toast.error('Failed to update reservation');
          }
        };

        if (outstanding > 0) {
          setConfirmDialogState({
            title: 'Confirm Balance Collection',
            message: `${formatCurrency(outstanding)} is still owed on ${id}.\n\nConfirm you have collected it before handing the item over. This is recorded against your account.`,
            confirmText: 'Confirm & Complete',
            cancelText: 'Cancel',
            isDestructive: false,
            onConfirm: executeComplete,
          });
          return;
        }

        await executeComplete();
        return;
      } else if (action === 'cancel') {
        await updateReservation(res.docId, { status: 'Cancelled', countdown: false });
        // Restore exactly when the previous status was holding stock. Using the
        // shared predicate rather than a hand-listed set is the point: the old
        // inline list included statuses that had never deducted, so cancelling
        // handed back units that were never taken.
        let stockOk = true;
        if (holdsStock(res.status)) {
          stockOk = await adjustStockForReservation(res, 1);
        }
        toast.error(`Reservation ${id} cancelled`);
        if (!stockOk) toast.error(`Stock restore for ${id} may have failed — check inventory`);
      }
      const actionLabels = {
        approve_pay: 'Approved for Payment',
        mark_paid: 'Payment Received & Preparing',
        ready_pickup: 'Marked Ready for Pickup',
        complete: 'Completed',
        cancel: 'Cancelled',
      };
      await logAction(user, `${actionLabels[action]} reservation`, { reservationId: id });
    } catch {
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

    const executeReschedule = async () => {
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
      } catch {
        toast.error('Failed to reschedule');
      }
    };

    if (conflict) {
      setConfirmDialogState({
        title: 'Reservation Conflict Warning',
        message: 'This outfit/size is already reserved within 2 hours of the new time. Proceed anyway?',
        confirmText: 'Reschedule Anyway',
        cancelText: 'Cancel',
        isDestructive: false,
        onConfirm: executeReschedule,
      });
      return;
    }

    await executeReschedule();
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
          deposit: outstandingBalance(res)
            ? `Deposit paid, ${formatCurrency(outstandingBalance(res))} due on collection`
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
    } catch {
      toast.error('Failed to update payment status');
    }
  };

  const handleVerifyPayment = async (res) => {
    try {
      // Matches the mark_paid lifecycle action (handleAction) exactly --
      // this only ever set paymentStatus, so a reservation verified from
      // here stayed stuck on "To Pay" forever even though payment_status
      // said Paid, instead of moving to Preparing like every other path
      // that marks a reservation paid.
      await updateReservation(res.docId, {
        status: 'Preparing',
        paymentStatus: 'Paid',
        assignedStaffId: user?.uid || '',
        countdown: false,
      });
      setViewModal((prev) => prev ? { ...prev, status: 'Preparing', paymentStatus: 'Paid' } : prev);
      await logAction(user, 'Verified GCash Payment', {
        reservationId: res.id,
        customer: res.customerName || res.customer,
      });
      toast.success('Payment verified — preparing item');
    } catch {
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

    const executeCreate = async () => {
      // Find the customer_id FK from the selected customer name
      const matchedCustomer = customers.find(
        (c) => (c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim()) === newRes.customer,
      );
      const customerId = matchedCustomer?.docId || matchedCustomer?.id || '';

      // Find productId and imageUrl if possible
      const matchedProduct = products.find((p) => p.name === newRes.outfit);
      try {
        await createReservation({
          customerName: newRes.customer,
          customerId: customerId, // FK to users collection (matches Android field name)
          productName: newRes.outfit,
          productId: matchedProduct?.id || '',
          imageUrl: matchedProduct?.images?.[0] || '',
          reservationDate: new Date(newRes.date),
          date: new Date(newRes.date), // Fallback for Android which parses 'date'
          status: 'Pending',
          assigned_staff_id: '', // Will be set on Confirm
          countdown: true,
          size: newRes.size,
          // deposit is the numeric amount owed (50%, matching the standard
          // convention elsewhere in this codebase), not a paid/unpaid flag --
          // that belongs on payment_status, which the checkbox actually means.
          deposit: Math.round((matchedProduct?.price || 0) * 0.5 * 100) / 100,
          payment_status: newRes.deposit ? 'Paid' : 'Pending',
          rentalPrice: matchedProduct?.price || 0,
        });
        await logAction(user, 'Created new reservation', { customer: newRes.customer, customerId });
        setIsModalOpen(false);
        toast.success('Reservation created successfully');
        setNewRes({ customer: '', customerId: '', outfit: '', size: 'M', date: '', deposit: false });
      } catch {
        toast.error('Failed to create reservation');
      }
    };

    if (conflict) {
      setConfirmDialogState({
        title: 'Reservation Conflict Warning',
        message: 'Warning: This outfit/size is already reserved within 2 hours of this time. Proceed anyway?',
        confirmText: 'Create Anyway',
        cancelText: 'Cancel',
        isDestructive: false,
        onConfirm: executeCreate,
      });
      return;
    }

    await executeCreate();
  };

  return (
    <div className="page-container">
      <PageHeader
        title="Reservation Management"
        subtitle="Manage customer bookings and outfit try-ons"
        category="OPERATIONS"
        actions={
          <div className="header-actions flex-center gap-2">
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
            {canManage && (
              <button
                className="btn-outline flex-center gap-2"
                onClick={() => { setShowQRModal(true); setQrToken(''); setQrResult(null); }}
                title="Verify pickup token or scan QR"
              >
                <QrCode size={16} /> Verify Pickup
              </button>
            )}
            {can(user?.role, 'create_reservation') && (
              <button className="btn-primary flex-center gap-2" onClick={() => setIsModalOpen(true)}>
                <Plus size={18} /> New Reservation
              </button>
            )}
          </div>
        }
      />

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
              <option value="Preparing">Preparing</option>
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
                        onResolveReschedule={handleResolveReschedule}
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
            <table className="table res-list-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>
                    <button className="sort-header-btn" onClick={() => toggleSort('customer')}>
                      Customer <ArrowUpDown size={13} />
                    </button>
                  </th>
                  <th>Item</th>
                  <th>
                    <button className="sort-header-btn" onClick={() => toggleSort('date')}>
                      Date &amp; Time <ArrowUpDown size={13} />
                    </button>
                  </th>
                  <th>Status</th>
                  <th>
                    <button className="sort-header-btn" onClick={() => toggleSort('balance')}>
                      Balance <ArrowUpDown size={13} />
                    </button>
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...filteredReservations]
                  .sort((a, b) => {
                    let va, vb;
                    if (listSort.key === 'customer') { va = a.displayName; vb = b.displayName; }
                    else if (listSort.key === 'balance') { va = outstandingBalance(a) || 0; vb = outstandingBalance(b) || 0; }
                    else { va = a.displayDate?.getTime?.() || 0; vb = b.displayDate?.getTime?.() || 0; }
                    if (va < vb) return listSort.dir === 'asc' ? -1 : 1;
                    if (va > vb) return listSort.dir === 'asc' ? 1 : -1;
                    return 0;
                  })
                  .map((res) => {
                    const balance = outstandingBalance(res);
                    const primaryAction = PRIMARY_ACTION[res.displayStatus];
                    const deadline = res.displayStatus === 'To Pay' ? formatPaymentDeadline(res.paymentDueAt) : null;
                    const firstLine = res.lines[0];
                    const imageUrl = res.imageUrl || firstLine?.imageUrl;
                    const isExpanded = !!expandedRows[res.id];
                    const hasMultipleLines = res.lines.length > 1;
                    const resYear = res.createdAt ? new Date(res.createdAt).getFullYear() : new Date().getFullYear();
                    // res.displayId is already the real display_id column
                    // (RES-...), populated by reservationService's
                    // normaliseReservation and used correctly elsewhere in
                    // this file (see the reschedule toast messages above).
                    // This row alone ignored it and fabricated a fake
                    // ORD-<year>-<uuid prefix> id from the raw primary key,
                    // which showed a different identifier for the same
                    // reservation than the card view and the details modal.
                    const formattedId = res.displayId
                      || (res.id?.startsWith('ORD-') || res.id?.startsWith('RES-')
                        ? res.id
                        : `ORD-${resYear}-${String(res.id || '').slice(0, 5).toUpperCase().padStart(5, '0')}`);

                    return (
                      <tr key={res.id}>
                        <td className="font-mono text-sm" style={{ whiteSpace: 'nowrap' }}>
                          <div className="flex items-center gap-1">
                            {hasMultipleLines && (
                              <button
                                type="button"
                                onClick={() => toggleExpandRow(res.id)}
                                className="p-0.5 hover:bg-gray-100 rounded text-gray-500"
                                title={isExpanded ? "Collapse items" : "Expand items"}
                              >
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                            )}
                            <span>{formattedId}</span>
                          </div>
                        </td>
                        <td>
                          <div className="res-customer-cell">
                            <div className="res-cust-name">{res.displayName}</div>
                          </div>
                        </td>
                        <td>
                          <div className="res-item-cell">
                            {imageUrl && (
                              <img src={imageUrl} alt="" className="res-thumb" />
                            )}
                            <div className="res-item-info">
                              {(hasMultipleLines && !isExpanded ? res.lines.slice(0, 1) : res.lines).map((line, index) => (
                                <div key={line.id ?? `${line.productId}-${index}`} className={index > 0 ? 'text-sm text-secondary pt-1 border-t border-dashed mt-1' : 'font-medium'}>
                                  {line.productName || res.productName || res.outfit}
                                  {line.size && <span className="size-pill ml-1">{line.size}</span>}
                                  {(line.quantity ?? 1) > 1 && <span className="text-secondary text-sm"> ×{line.quantity}</span>}
                                </div>
                              ))}
                              {hasMultipleLines && !isExpanded && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpandRow(res.id)}
                                  className="text-[11px] text-primary font-bold hover:underline mt-1 block"
                                >
                                  +{res.lines.length - 1} more item{res.lines.length - 1 > 1 ? 's' : ''} (click to expand)
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div className="font-medium">
                            {res.displayDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })}
                          </div>
                          <div className="text-secondary text-sm">
                            {res.appointmentTime || res.displayDate.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })}
                          </div>
                          {(res.createdAt || res.created_at) && (
                            <div className="text-[11px] text-secondary mt-1">
                              Booked: {parseDate(res.createdAt || res.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })} {parseDate(res.createdAt || res.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })}
                            </div>
                          )}
                          {res.countdown && (res.displayStatus === 'Pending') && (
                            <CountdownTimer targetDate={res.reservationDate || res.date} />
                          )}
                          {deadline && (
                            <div className={`text-xs mt-1 font-medium ${deadline.urgent ? 'text-danger' : 'text-gold'}`}>
                              {deadline.label}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                            <StatusBadge status={res.displayStatus} />
                            {isAwaitingReceipt(res) && (
                              <span className="receipt-badge">📎 Receipt uploaded</span>
                            )}
                          </div>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {balance > 0 ? (
                            <span className="balance-due-pill">
                              <DollarSign size={11} /> {formatCurrency(balance)} due
                            </span>
                          ) : res.paymentStatus === 'Paid' ? (
                            <span className="balance-paid-pill">✓ Paid</span>
                          ) : (
                            <span className="text-secondary text-sm">—</span>
                          )}
                          {res.rentalPrice > 0 && (
                            <div className="text-xs text-secondary mt-1">{formatCurrency(res.rentalPrice)} total</div>
                          )}
                        </td>
                        <td>
                          <div className="res-list-actions">
                            <button className="res-action-btn view" title="View Details" onClick={() => setViewModal(res)}>
                              <Eye size={14} />
                            </button>
                            <button className="res-action-btn msg" title="Message" onClick={() => handleMessageBuyer(res)}>
                              <MessageSquare size={14} />
                            </button>
                            {canManage && primaryAction && (
                              <button
                                className={`res-action-primary ${isAwaitingReceipt(res) ? 'verify' : 'approve'}`}
                                // Same fix as the board card: this used to fire
                                // mark_paid immediately, relabeled "Verify
                                // Receipt" -- staff could mark payment verified
                                // without ever opening the receipt image. Opens
                                // the detail modal instead, where the receipt
                                // renders next to its own Verify Payment button.
                                onClick={() => (isAwaitingReceipt(res) ? setViewModal(res) : handleAction(res.id, primaryAction.action))}
                              >
                                {isAwaitingReceipt(res) ? <><ReceiptText size={13} /> Verify Receipt</> : primaryAction.action === 'complete' ? <><PackageCheck size={13} /> Complete Pickup</> : <><CheckCircle size={13} /> {primaryAction.label}</>}
                              </button>
                            )}
                            {canManage && CAN_RESCHEDULE_STATUSES.has(res.displayStatus) && (
                              <button className="res-action-btn reschedule" title="Reschedule" onClick={() => { setRescheduleModal(res); setNewDate(res.date); }}>
                                <Calendar size={14} />
                              </button>
                            )}
                            {canManage && CAN_RESCHEDULE_STATUSES.has(res.displayStatus) && (
                              <button className="res-action-btn reject" title="Cancel" onClick={() => handleAction(res.id, 'cancel')}>
                                <XCircle size={14} />
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
          </div>
        ) : (
          <ReservationCalendar
            reservations={filteredReservations}
            onView={(res) => setViewModal(res)}
            onMessage={handleMessageBuyer}
          />
        )}
      </div>

      {/* ===== QR / TOKEN VERIFICATION MODAL ===== */}
      {showQRModal && (
        <div
          className="modal-overlay"
          role="button"
          tabIndex={0}
          onClick={(e) => { if (e.target === e.currentTarget) setShowQRModal(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setShowQRModal(false);
            }
          }}
        >
          <div className="modal-content" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2><QrCode size={20} style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'middle' }} />Verify Pickup</h2>
              <button className="close-btn" onClick={() => setShowQRModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p className="text-secondary text-sm mb-3">Enter the customer&apos;s pickup token (displayed in their app) to verify and complete handover.</p>
              <div className="form-group">
                <label className="label" htmlFor="qr-token">Pickup Token / Reservation ID</label>
                <input
                  id="qr-token"
                  type="text"
                  className="input-field font-mono"
                  placeholder="e.g. ORD-2026-00042"
                  value={qrToken}
                  onChange={(e) => { setQrToken(e.target.value.toUpperCase()); setQrResult(null); }}
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- primary input of a just-opened modal
                  autoFocus
                />
              </div>
              {qrResult && (
                <div className={`qr-result ${qrResult.found ? 'qr-result-found' : 'qr-result-notfound'}`}>
                  {qrResult.found ? (
                    <>
                      <div className="qr-result-name">✓ {qrResult.res.displayName}</div>
                      <div className="qr-result-item">{qrResult.res.lines?.[0]?.productName || qrResult.res.productName || qrResult.res.outfit}</div>
                      <div className="qr-result-date">{qrResult.res.displayDate?.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                      <div className="qr-result-status">{qrResult.res.displayStatus}</div>
                    </>
                  ) : (
                    <div>⚠ No reservation found for token <strong>{qrToken}</strong></div>
                  )}
                </div>
              )}
              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setShowQRModal(false)}>Cancel</button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    const found = filteredReservations.find(r => r.id?.toUpperCase() === qrToken.trim().toUpperCase());
                    if (found) {
                      setQrResult({ found: true, res: found });
                    } else {
                      setQrResult({ found: false });
                    }
                  }}
                >
                  Look Up
                </button>
                {qrResult?.found && qrResult.res.displayStatus === 'To Pickup' && (
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ background: 'var(--status-completed-text)' }}
                    onClick={async () => {
                      await handleAction(qrResult.res.id, 'complete');
                      setShowQRModal(false);
                    }}
                  >
                    <PackageCheck size={15} /> Complete Pickup
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== NEW RESERVATION MODAL ===== */}
      {isModalOpen && (
        <div
          className="modal-overlay"
          role="button"
          tabIndex={0}
          onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsModalOpen(false);
            }
          }}
        >
          <div className="modal-content">
            <div className="modal-header">
              <h2>Create New Reservation</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>
                &times;
              </button>
            </div>
            <form className="modal-body" onSubmit={handleCreateReservation}>
              <div className="form-group">
                <label className="label" htmlFor="reservation-customer">Customer</label>
                <input
                  id="reservation-customer"
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
                  <label className="label" htmlFor="reservation-outfit">Selected Outfit</label>
                  <select
                    id="reservation-outfit"
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
                  <label className="label" htmlFor="reservation-size">Size</label>
                  <select
                    id="reservation-size"
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
                <label className="label" htmlFor="reservation-date">Reservation Date & Time</label>
                <input
                  id="reservation-date"
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
        <div
          className="modal-overlay"
          role="button"
          tabIndex={0}
          onClick={(e) => { if (e.target === e.currentTarget) setRescheduleModal(null); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setRescheduleModal(null);
            }
          }}
        >
          <div
            className="modal-content"
            style={{ maxWidth: 500 }}
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
                <label className="label" htmlFor="reschedule-date">New Date & Time</label>
                <input
                  id="reschedule-date"
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
        <div
          className="modal-overlay"
          role="button"
          tabIndex={0}
          onClick={(e) => { if (e.target === e.currentTarget) setViewModal(null); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setViewModal(null);
            }
          }}
        >
          <div
            className="modal-content"
            style={{ maxWidth: 640 }}
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
                  const steps = ['Pending', 'To Pay', 'Preparing', 'To Pickup', 'Completed'];
                  const statusOrder = { Pending: 0, 'To Pay': 1, Preparing: 2, 'To Pickup': 3, Completed: 4, Cancelled: -1, Returned: -1 };
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
              {(viewModal.createdAt || viewModal.created_at) && (
                <div className="detail-row">
                  <span className="detail-label">Created At</span>
                  <strong>
                    {parseDate(viewModal.createdAt || viewModal.created_at).toLocaleString('en-PH', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Asia/Manila',
                    })}
                  </strong>
                </div>
              )}
              <div className="detail-row">
                <span className="detail-label">Pickup Date & Time</span>
                <strong>
                  {parseDate(viewModal.reservationDate || viewModal.date).toLocaleDateString('en-PH', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    timeZone: 'Asia/Manila',
                  })}{' '}
                  at{' '}
                  {viewModal.appointmentTime || parseDate(viewModal.reservationDate || viewModal.date).toLocaleTimeString('en-PH', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Manila',
                  })}
                </strong>
              </div>
              <div className="detail-row">
                <span className="detail-label">Status</span>
                <StatusBadge status={viewModal.displayStatus || 'Pending'} />
              </div>
              {/* Prominent Payment Status & Controls Card */}
              <div className="payment-action-card">
                <div className="payment-card-header">
                  <div>
                    <div className="payment-card-title">Payment Controls</div>
                    <div className="payment-meta-row">
                      <span className={`payment-status-pill ${
                        (viewModal.paymentStatus || '').toLowerCase() === 'paid' ? 'paid'
                        : ['submitted', 'processing'].includes((viewModal.paymentStatus || '').toLowerCase()) ? 'submitted'
                        : 'unpaid'
                      }`}>
                        {(viewModal.paymentStatus || '').toLowerCase() === 'paid' ? 'Paid ✓'
                         : ['submitted', 'processing'].includes((viewModal.paymentStatus || '').toLowerCase()) ? 'Receipt Submitted ⌛'
                         : 'Unpaid ✗'}
                      </span>
                      <span className="text-secondary text-sm font-medium">
                        Deposit Due: ₱{Number(viewModal.deposit || 0).toFixed(2)}
                      </span>
                      {viewModal.paymentType && (
                        <span className="text-secondary text-sm">({viewModal.paymentType})</span>
                      )}
                      {viewModal.paymentMethod && (
                        <span className="text-secondary text-sm"> · Method: <strong>{viewModal.paymentMethod}</strong></span>
                      )}
                      {viewModal.providerRef && (
                        <span className="text-secondary text-sm"> · Ref: <code className="text-xs">{viewModal.providerRef}</code></span>
                      )}
                    </div>
                    <div className="text-xs text-secondary mt-1">
                      💡 <strong>Note on Payment Actions:</strong> &ldquo;Mark Paid&rdquo; (on the main table) moves reservation lifecycle from <em>To Pay → Preparing</em>; &ldquo;Mark Ready&rdquo; then moves it to <em>To Pickup</em> once the item is pulled. &ldquo;Toggle Payment Record&rdquo; (below) updates financial payment status without changing lifecycle stage.
                    </div>
                  </div>
                  <div className="payment-action-buttons">
                    <button
                      className={`btn-pay-toggle ${(viewModal.paymentStatus || '').toLowerCase() === 'paid' ? 'is-paid' : 'is-unpaid'}`}
                      onClick={() => handleTogglePaid(viewModal)}
                      title="Toggle financial payment status"
                    >
                      {(viewModal.paymentStatus || '').toLowerCase() === 'paid' ? '✓ Mark as Unpaid' : '💳 Toggle Paid Status'}
                    </button>
                  </div>
                </div>

                {outstandingBalance(viewModal) > 0 && (
                  <div className="payment-card-body">
                    <div className="balance-info-row">
                      <div>
                        <span className="text-sm text-secondary">Balance Owed at Pickup: </span>
                        <strong className="text-gold">{formatCurrency(outstandingBalance(viewModal))}</strong>
                      </div>
                      {canManage && (
                        <button
                          className="btn-collect-balance"
                          onClick={async () => {
                            try {
                              await settleReservationBalance(viewModal.id);
                              setViewModal(prev => prev ? { ...prev, paymentStatus: 'Paid' } : prev);
                              toast.success(`Recorded collection of ${formatCurrency(outstandingBalance(viewModal))}`);
                            } catch (e) {
                              toast.error(e?.message || 'Failed to record balance collection');
                            }
                          }}
                        >
                          Record Collection
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {(() => {
                  const deadline = viewModal.displayStatus === 'To Pay' ? formatPaymentDeadline(viewModal.paymentDueAt) : null;
                  if (!deadline) return null;
                  return (
                    <div className={`payment-deadline-banner ${deadline.urgent ? 'urgent' : ''}`}>
                      ⏰ Payment Deadline: {deadline.label}
                    </div>
                  );
                })()}
              </div>
              {/* Actual PayMongo transaction records for this reservation --
                  distinct from the payment_status pill above, which only
                  reflects the current aggregate state. A reservation can have
                  more than one row if an earlier checkout session was
                  abandoned before a later one succeeded. */}
              {paymentRecordsLoading ? (
                <div className="detail-row">
                  <span className="detail-label">Payment Transactions</span>
                  <span className="text-secondary text-sm">Loading…</span>
                </div>
              ) : paymentRecords.length > 0 && (
                <div className="detail-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span className="detail-label" style={{ marginBottom: '8px' }}>
                    Payment Transactions ({paymentRecords.length})
                  </span>
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {paymentRecords.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          width: '100%',
                          fontSize: '13px',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          background: 'var(--beige)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <div>
                          <strong>{formatCurrency((p.amountCentavos || 0) / 100)}</strong>
                          <span className="text-secondary"> · {p.provider}{p.method ? ` (${p.method})` : ''}</span>
                          {p.providerRef && (
                            <div className="text-secondary text-xs">
                              <code>{p.providerRef}</code>
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span className={`payment-status-pill ${p.status === 'paid' ? 'paid' : ['awaiting_payment', 'processing'].includes(p.status) ? 'submitted' : 'unpaid'}`}>
                            {p.status}
                          </span>
                          <div className="text-secondary text-xs" style={{ marginTop: '2px' }}>
                            {parseDate(p.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
        <div
          className="modal-overlay"
          role="button"
          tabIndex={0}
          onClick={(e) => { if (e.target === e.currentTarget) setReceiptModalUrl(null); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setReceiptModalUrl(null);
            }
          }}
        >
          <div
            className="modal-content"
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

      <ConfirmDialog
        isOpen={!!confirmDialogState}
        title={confirmDialogState?.title || 'Confirm Action'}
        message={confirmDialogState?.message || ''}
        confirmText={confirmDialogState?.confirmText || 'Confirm'}
        cancelText={confirmDialogState?.cancelText || 'Cancel'}
        isDestructive={confirmDialogState?.isDestructive ?? false}
        onConfirm={async () => {
          const action = confirmDialogState?.onConfirm;
          setConfirmDialogState(null);
          if (action) await action();
        }}
        onCancel={() => setConfirmDialogState(null)}
      />
    </div>
  );
};

export default Reservations;
