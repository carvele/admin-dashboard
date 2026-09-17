/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  EyeOff,
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
  Archive,
  Copy,
  Keyboard,
  Camera,
  Scissors,
  Ruler,
  AlertTriangle,
  Save,
} from 'lucide-react';
import StatusBadge from '../../components/ReservationStatusBadge';
import SkeletonTable from '../../components/SkeletonTable';
import ReservationCard from '../../components/reservations/ReservationCard';
import ReservationCalendar from '../../components/reservations/ReservationCalendar';
import PickupQrScanner from '../../components/reservations/PickupQrScanner';
import ConfirmDialog from '../../components/ConfirmDialog';
import PageHeader from '../../components/PageHeader';
import '../../components/reservations/ReservationBoard.css';
import {
  CAN_RESCHEDULE_STATUSES,
  canCancelReservation,
  isAwaitingReceipt,
  primaryActionFor,
} from '../../utils/reservationActions';
import { formatPaymentDeadline, computePaymentDueAt } from '../../utils/reservationDeadline';
import { toDisplayStatus } from '../../utils/reservationStatus';
import { outstandingBalance, balanceDue } from '../../utils/reservationBalance';
import { formatProposedAppointment } from '../../utils/rescheduleRequest';
import { formatCurrency } from '../../utils/helpers';
import {
  subscribeToReservations,
  subscribeToReservationItems,
  updateReservation,
  createReservation,
  repairReservationData,
  settleReservationBalance,
  transitionReservationStatus,
  cancelReservation,
  reviewReservationReceipt,
  reviewReservationBalanceReceipt,
  cancelReservationForFraud,
  findDuplicatePaymentReference,
  getPaymentReviewHistory,
  completeReservationHandover,
  resolveRescheduleRequest,
  getPaymentsForReservation,
  rescheduleReservation,
  markRefundDisbursed,
  getRefundQueue,
  getReturnRefundRequests,
} from '../../services/reservationService';
import ReturnRefundQueue from './ReturnRefundQueue';
import {
  subscribeToCustomers,
} from '../../services/customerService';
import { subscribeToProducts } from '../../services/productService';
import { resolveSignedStorageUrl } from '../../lib/storage';
import { logAction } from '../../services/staffService';
import { can } from '../../utils/permissions';
import { toast } from 'sonner';
import './Reservations.css';


const getInitials = (name) => {
  if (!name) return 'CU';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const formatAppointmentTime = (timeStr, dateObj) => {
  if (timeStr && /^\d{1,2}:\d{2}/.test(timeStr)) {
    const [h, m] = timeStr.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  }
  if (dateObj && typeof dateObj.toLocaleTimeString === 'function') {
    return dateObj.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' });
  }
  return timeStr || '';
};

const formatDateTime = (val) => {
  if (!val) return '';
  const d = parseDate(val);
  if (isNaN(d.getTime())) return '';
  const dateStr = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
  const timeStr = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' });
  return `${dateStr} • ${timeStr}`;
};

// Matches the CHECK constraint on reservations.last_receipt_rejection_reason
// (and cancel_reservation_for_fraud's accepted values) exactly -- keep in sync.
const REASON_CODE_LABELS = {
  unreadable_receipt: 'Unreadable receipt',
  wrong_amount: 'Wrong amount',
  invalid_reference: 'Invalid / missing reference',
  wrong_account: 'Sent to wrong account',
  duplicate_receipt: 'Duplicate / reused receipt',
  suspected_fraud: 'Suspected fraudulent proof',
  other: 'Other',
};

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
    status: 'To Pay',
    label: 'To Pay',
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
    label: 'To Pickup',
    icon: Shirt,
    empty: 'Nothing waiting to be collected.',
  },
];

const Reservations = () => {
  const { user } = useAuth();
  // Staff remain lifecycle-read-only but may record an in-person payment.
  const canManage = can(user?.role, 'assign_reservation');
  const canRecordPayment = can(user?.role, 'record_reservation_payment');
  const navigate = useNavigate();
  const [reservations, setReservations] = useState([]);
  const [itemsByReservation, setItemsByReservation] = useState({});
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  // Canonical refund queue: cancelled reservations with qualifying payment rows.
  // Single source of truth for refundCount and refundLiabilityTotal (exact centavo sum).
  const [refundQueue, setRefundQueue] = useState([]);
  const [refundQueueLoading, setRefundQueueLoading] = useState(true);

  const loadRefundQueue = useCallback(async () => {
    setRefundQueueLoading(true);
    try {
      const rows = await getRefundQueue();
      setRefundQueue(rows);
    } catch (err) {
      console.error('Failed to load refund queue:', err);
    } finally {
      setRefundQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRefundQueue();
  }, [loadRefundQueue]);


  useEffect(() => {
    setLoading(true);

    // Auto-cancellation has been moved to a server-side pg_cron job `expire_all_stale_reservations`

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

      // Realtime trimming contract: cap snapshot at 200
      setReservations(data.slice(0, 200));
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(() => searchParams.get('search') || '');
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('search') || '');

  // debounce(...) only closes over the stable setSearchTerm setter, so an
  // empty dep array is correct; eslint can't statically verify that through
  // the debounce() call wrapper.
   
  const debouncedSearch = useCallback(
    debounce((val) => setSearchTerm(val), 400),
    []
  );

  const handleSearchChange = (e) => {
    setSearchInput(e.target.value);
    debouncedSearch(e.target.value);
  };

  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || 'All');
  const [scopeFilter, setScopeFilter] = useState(() => {
    const paramScope = searchParams.get('scope');
    if (paramScope === 'refunds') return 'refunds';
    if (paramScope === 'archived' || paramScope === 'completed') return 'archived';
    const paramStatus = searchParams.get('status');
    if (paramStatus === 'Cancelled' || paramStatus === 'Completed') return 'archived';
    return 'active';
  });

  const handleScopeChange = (newScope) => {
    setScopeFilter(newScope);
    setPage(0);
    if (newScope === 'refunds') {
      // Refund scope always uses table view; no lifecycle status sub-filter applies.
      setViewMode('table');
      setStatusFilter('All');
    } else if (newScope === 'active' && (statusFilter === 'Completed' || statusFilter === 'Cancelled')) {
      setStatusFilter('All');
    } else if (newScope === 'archived' && (statusFilter === 'To Pay' || statusFilter === 'Preparing' || statusFilter.startsWith('To Pickup'))) {
      setStatusFilter('All');
    }
  };
  // Main Section Tab: 'reservations' | 'return_refunds'
  const [mainTab, setMainTab] = useState(() => searchParams.get('tab') || 'reservations');
  const [pendingReturnCount, setPendingReturnCount] = useState(0);

  const refreshPendingReturnCount = useCallback(async () => {
    try {
      const data = await getReturnRefundRequests(['submitted', 'under_review']);
      setPendingReturnCount(data?.length || 0);
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshPendingReturnCount();
  }, [refreshPendingReturnCount]);

  // Board first: the day-to-day job is working the queue. List view (table) is for
  // scanning history like Cancelled or Completed reservations.
  const [viewMode, setViewMode] = useState(() => {
    const paramView = searchParams.get('view');
    if (paramView) return paramView;
    const paramStatus = searchParams.get('status');
    if (paramStatus === 'Cancelled' || paramStatus === 'Completed') return 'table';
    return 'board';
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rescheduleModal, setRescheduleModal] = useState(null);
  const [viewModal, setViewModal] = useState(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrToken, setQrToken] = useState('');
  const [qrResult, setQrResult] = useState(null);
  const [qrScanMode, setQrScanMode] = useState('camera');
  // List view sort: { key: string, dir: 'asc'|'desc' }
  const [listSort, setListSort] = useState(() => {
    try {
      const saved = localStorage.getItem('admin_res_sort');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return { key: 'date', dir: 'desc' }; // Default to newest first
  });

  useEffect(() => {
    localStorage.setItem('admin_res_sort', JSON.stringify(listSort));
  }, [listSort]);

  const toggleSort = (key) => setListSort(prev => ({
    key,
    dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc',
  }));
  const [receiptModalUrl, setReceiptModalUrl] = useState(null);
  const [confirmDialogState, setConfirmDialogState] = useState(null);
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(() => {
    const p = parseInt(searchParams.get('page') || '1', 10);
    return isNaN(p) || p < 1 ? 0 : p - 1;
  });

  // Keep URL search params in sync with active filters/view/pagination
  useEffect(() => {
    const params = new URLSearchParams();
    if (mainTab && mainTab !== 'reservations') params.set('tab', mainTab);
    if (viewMode && viewMode !== 'board') params.set('view', viewMode);
    if (viewMode === 'table') params.set('scope', scopeFilter);
    if (statusFilter && statusFilter !== 'All') params.set('status', statusFilter);
    if (searchTerm.trim()) params.set('search', searchTerm.trim());
    if (viewMode === 'table' && page > 0) params.set('page', String(page + 1));
    setSearchParams(params, { replace: true });
  }, [mainTab, viewMode, scopeFilter, statusFilter, searchTerm, page, setSearchParams]);

  // Reset page to first whenever search, status filter, scope, or view mode changes
  useEffect(() => {
    setPage(0);
  }, [searchTerm, statusFilter, viewMode, scopeFilter]);

  // Dismiss topmost modal on Escape key (WCAG 2.1.2)
  useEffect(() => {
    const onEsc = (e) => {
      if (e.key !== 'Escape') return;
      if (receiptModalUrl) setReceiptModalUrl(null);
      else if (viewModal) setViewModal(null);
      else if (rescheduleModal) setRescheduleModal(null);
      else if (isModalOpen) setIsModalOpen(false);
      else if (showQRModal) setShowQRModal(false);
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [receiptModalUrl, viewModal, rescheduleModal, isModalOpen, showQRModal]);

  // receipt_url on the row is a bare storage path in a private bucket, not a
  // usable URL -- resolve it to a signed URL whenever the detail modal opens
  // on a reservation that has one.
  const [resolvedReceiptUrl, setResolvedReceiptUrl] = useState(null);
  const [receiptLoadFailed, setReceiptLoadFailed] = useState(false);

  const [resolvedBalanceReceiptUrl, setResolvedBalanceReceiptUrl] = useState(null);
  const [balanceReceiptLoadFailed, setBalanceReceiptLoadFailed] = useState(false);

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

  useEffect(() => {
    setResolvedBalanceReceiptUrl(null);
    setBalanceReceiptLoadFailed(false);
    if (!viewModal?.balanceReceiptUrl) return;
    let cancelled = false;
    resolveSignedStorageUrl('payment_receipts', viewModal.balanceReceiptUrl).then((url) => {
      if (cancelled) return;
      if (url) setResolvedBalanceReceiptUrl(url);
      else setBalanceReceiptLoadFailed(true);
    });
    return () => { cancelled = true; };
  }, [viewModal?.balanceReceiptUrl]);

  // Payment review context: duplicate-reference warning and review history,
  // both fetched whenever the detail modal opens on a reservation that has
  // ever had a manual reference number. Warnings only -- staff decide, this
  // never blocks or auto-rejects anything.
  const [duplicateReferenceMatches, setDuplicateReferenceMatches] = useState([]);
  const [reviewHistory, setReviewHistory] = useState([]);
  // { mode: 'reject' | 'reject_balance' | 'cancel', reservation } | null
  const [reasonModal, setReasonModal] = useState(null);
  const [reasonCode, setReasonCode] = useState('');
  const [reasonNote, setReasonNote] = useState('');
  const [reasonSubmitting, setReasonSubmitting] = useState(false);

  useEffect(() => {
    setDuplicateReferenceMatches([]);
    const refNum = viewModal?.manualReferenceNumber || viewModal?.balanceReferenceNumber;
    if (!refNum) return;
    let cancelled = false;
    findDuplicatePaymentReference(refNum, viewModal.docId)
      .then((matches) => { if (!cancelled) setDuplicateReferenceMatches(matches); })
      .catch(() => {}); // non-admin viewers get a permission error here -- silently show no warning
    return () => { cancelled = true; };
  }, [viewModal?.manualReferenceNumber, viewModal?.balanceReferenceNumber, viewModal?.docId]);

  useEffect(() => {
    setReviewHistory([]);
    if (!viewModal?.docId) return;
    let cancelled = false;
    getPaymentReviewHistory(viewModal.docId)
      .then((rows) => { if (!cancelled) setReviewHistory(rows); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [viewModal?.docId]);

  // PayMongo transaction history for the reservation currently open in the
  // details modal. See getPaymentsForReservation: this table was never read
  // anywhere in the app before, so staff had no way to see the actual
  // transaction (amount charged, provider status, checkout session id)
  // behind a reservation's payment_status.
  const [paymentRecords, setPaymentRecords] = useState([]);
  const [paymentRecordsLoading, setPaymentRecordsLoading] = useState(false);
  const [balanceMethod, setBalanceMethod] = useState('cash');
  const [recordingBalance, setRecordingBalance] = useState(false);
  // Refund disbursement form state (shown in detail modal for Refund Required reservations).
  const [refundDisbursementMethod, setRefundDisbursementMethod] = useState('cash');
  const [refundReferenceNumber, setRefundReferenceNumber] = useState('');
  const [refundNotes, setRefundNotes] = useState('');
  const [submittingRefund, setSubmittingRefund] = useState(false);

  const handleMarkRefundDisbursed = async (res) => {
    if (!refundReferenceNumber.trim()) {
      toast.error('Reference number is required.');
      return;
    }
    setSubmittingRefund(true);
    try {
      await markRefundDisbursed(res.docId, refundDisbursementMethod, refundReferenceNumber.trim(), refundNotes.trim() || null);
      // Optimistic UI update.
      setViewModal((prev) => prev ? { ...prev, paymentStatus: 'Refunded' } : prev);
      toast.success(`Refund disbursement recorded for ${res.id}`);
      // Refetch authoritative sources: payment records + canonical queue.
      if (res.docId) {
        getPaymentsForReservation(res.docId).then(setPaymentRecords).catch(() => {});
      }
      await loadRefundQueue();
      await refreshPendingReturnCount();
      setRefundReferenceNumber('');
      setRefundNotes('');
    } catch (err) {
      console.error('Failed to mark refund disbursed:', err);
      toast.error(err.message || 'Failed to record refund disbursement');
    } finally {
      setSubmittingRefund(false);
    }
  };


  useEffect(() => {
    setBalanceMethod('cash');
  }, [viewModal?.id]);

  useEffect(() => {
    if (!viewModal?.id) return;
    const current = reservations.find((reservation) => reservation.id === viewModal.id);
    if (!current) return;
    // Re-syncing from the raw `reservations` array (not filteredReservations,
    // which also depends on search/statusFilter state this effect has no
    // business reacting to) drops displayStatus -- the same normalization
    // filteredReservations applies has to be redone here, or the lifecycle
    // tracker silently renders with every step unfilled the moment any live
    // update (e.g. recording a payment) refreshes `reservations` while this
    // modal is open.
    setViewModal({ ...current, displayStatus: toDisplayStatus(current.status) });
  }, [reservations, viewModal?.id]);

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
  }, [viewModal?.id, viewModal?.paymentStatus, viewModal?.balanceSettledAt]);



  const [newRes, setNewRes] = useState({
    customer: '',
    customerId: '',
    outfit: '',
    size: 'M',
    date: '',
  });
  const [newDate, setNewDate] = useState('');
  const [expandedRows, setExpandedRows] = useState({});

  const toggleExpandRow = (resId) => {
    setExpandedRows((prev) => ({ ...prev, [resId]: !prev[resId] }));
  };


  // Live KPI counts across all reservations
  const { activeCount, toPayCount, toPickupCount, preparingCount, completedCount, cancelledCount, archivedCount } = useMemo(() => {
    let act = 0, pay = 0, pickup = 0, prep = 0, comp = 0, canc = 0;
    for (const r of reservations) {
      const s = toDisplayStatus(r.status);
      if (s === 'Completed') comp++;
      else if (s === 'Cancelled') canc++;
      else {
        act++;
        if (s === 'To Pay' || s === 'Pending') pay++;
        else if (s === 'To Pickup') pickup++;
        else if (s === 'Preparing') prep++;
      }
    }
    return {
      activeCount: act,
      toPayCount: pay,
      toPickupCount: pickup,
      preparingCount: prep,
      completedCount: comp,
      cancelledCount: canc,
      archivedCount: comp + canc,
    };
  }, [reservations]);

  // Exact refund count and liability from canonical payment-ledger predicate.
  const { refundCount, refundLiabilityTotal } = useMemo(() => {
    const count = refundQueue.length;
    const totalCentavos = refundQueue.reduce((total, reservation) =>
      total + (reservation.payments ?? []).reduce(
        (sum, payment) => sum + (payment.amountCentavos ?? 0),
        0,
      ),
    0);
    return { refundCount: count, refundLiabilityTotal: totalCentavos / 100 };
  }, [refundQueue]);

  const filteredReservations = reservations.map(r => {
    // Normalize status to Sentence Case, mapping legacy states to new ones for display.
    // A null status shouldn't happen for a live row (every writer sets one),
    // but the column is nullable -- fall back to To Pay rather than Pending,
    // which retired along with 'Request Approval' (neither has a live writer).
    const displayStatus = toDisplayStatus(r.status);

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
    else if (statusFilter.startsWith('To Pickup')) matchesStatus = r.displayStatus === 'To Pickup';
    else if (statusFilter.startsWith('Completed')) matchesStatus = r.displayStatus === 'Completed';
    else matchesStatus = r.displayStatus === statusFilter;

    // Scope filter: in table view, separate Active Queue, Refunds, and Archive.
    let matchesScope = true;
    if (viewMode === 'table') {
      if (scopeFilter === 'refunds') {
        // Refund scope: Cancelled reservations with pending refund liability.
        matchesScope =
          r.displayStatus === 'Cancelled' &&
          (r.paymentStatus || '').toLowerCase() === 'refund required';
      } else {
        const isArchived = r.displayStatus === 'Completed' || r.displayStatus === 'Cancelled';
        matchesScope = scopeFilter === 'archived' ? isArchived : !isArchived;
      }
    }

    return matchesSearch && matchesStatus && matchesScope;
  });

  const sortedReservations = [...filteredReservations].sort((a, b) => {
    let va, vb;
    if (listSort.key === 'customer') { va = a.displayName; vb = b.displayName; }
    else if (listSort.key === 'balance') { va = outstandingBalance(a) || 0; vb = outstandingBalance(b) || 0; }
    else { va = a.displayDate?.getTime?.() || 0; vb = b.displayDate?.getTime?.() || 0; }
    if (va < vb) return listSort.dir === 'asc' ? -1 : 1;
    if (va > vb) return listSort.dir === 'asc' ? 1 : -1;
    return 0;
  });
  const totalPages = Math.max(1, Math.ceil(sortedReservations.length / PAGE_SIZE));
  const pagedReservations = sortedReservations.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // --- LIFECYCLE ACTIONS ---
  // Lifecycle: To Pay → Preparing → To Pickup → Completed | Cancelled.
  // Legacy Pending rows can still be activated from the list view.
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
    } catch (e) {
      toast.error(e?.message || 'Could not answer that request.');
    }
  };

  // The mobile app's pickup pass QR encodes `jezsy-pickup:<pickup_token>`.
  // Manual entry accepts either the bare token or the customer-visible
  // display ID, since staff may not have the QR in front of them.
  const lookupByPickupCode = (rawInput) => {
    const value = rawInput.trim();
    const token = value.toLowerCase().startsWith('jezsy-pickup:')
      ? value.slice('jezsy-pickup:'.length)
      : value;
    const found = filteredReservations.find(
      (r) =>
        (r.pickupToken && r.pickupToken === token) ||
        (r.displayId && r.displayId.toUpperCase() === value.toUpperCase()),
    );
    setQrResult(found ? { found: true, res: found } : { found: false });
  };

  const handleQrDecode = (decoded) => {
    setQrToken(decoded);
    lookupByPickupCode(decoded);
  };

  const handleAction = async (id, action) => {
    const res = reservations.find((r) => r.id === id);
    if (!res) return;

    try {
      if (action === 'start_preparing') {
        if (String(res.paymentStatus || '').toLowerCase() !== 'paid') {
          throw new Error('Payment must be confirmed before preparation starts.');
        }
        await transitionReservationStatus(res.docId, res.status, 'Preparing');
        toast.success(`Reservation ${id} payment received — preparing item`);
      } else if (action === 'ready_pickup') {
        await transitionReservationStatus(res.docId, res.status, 'Ready');
        toast.success(`Reservation ${id} marked ready for pickup`);
      } else if (action === 'complete') {
        const outstanding = outstandingBalance(res);
        if (outstanding > 0) {
          throw new Error(`Record the ${formatCurrency(outstanding)} balance and its payment method in Details before handover.`);
        }

        await completeReservationHandover(res.docId);
        toast.success(`Reservation ${id} completed — stock consumed permanently`);
        return;
      } else if (action === 'cancel') {
        if (!canCancelReservation(res)) {
          throw new Error('Resolve or refund the payment before cancelling this reservation.');
        }
        await cancelReservation(res.docId, res.status);
        toast.error(`Reservation ${id} cancelled`);
      }
    } catch (err) {
      console.error('Reservation action failed:', err);
      toast.error(err.message || 'Failed to update reservation');
    }
  };

  const handleReschedule = async (e) => {
    e.preventDefault();
    if (!newDate) {
      toast.error('Select a new date');
      return;
    }

    // Extract HH:MM from the time input (falls back to midnight if absent).
    const newTime = rescheduleModal.newTime || '10:00';
    const appointmentTimePadded = newTime.length === 5 ? `${newTime}:00` : newTime;

    try {
      // Server owns: capacity advisory lock, slot validation, deadline recompute.
      await rescheduleReservation(
        rescheduleModal.docId,
        rescheduleModal.status,
        newDate,
        appointmentTimePadded,
        null,
      );
      toast.success(`Reservation ${rescheduleModal.id} rescheduled`);
      setRescheduleModal(null);
      setNewDate('');
    } catch (err) {
      console.error('Failed to reschedule:', err);
      toast.error(err.message || 'Failed to reschedule');
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

  const handleVerifyPayment = async (res) => {
    try {
      await reviewReservationReceipt(res.docId, true);
      setViewModal((prev) => prev ? { ...prev, status: 'Preparing', paymentStatus: 'Paid' } : prev);
      toast.success('Payment verified — preparing item');
    } catch (err) { console.error('Failed to verify payment:', err); toast.error(err.message || 'Failed to verify payment'); }
  };

  // A receipt only leaves 'Submitted' when an owner has looked at it. Rejecting
  // returns it to unpaid rather than cancelling outright, so a customer who
  // sent the wrong image can try again inside whatever time is left -- an
  // unreadable screenshot is not the same as refusing to pay. Requires a
  // reason code server-side now, so this opens the shared reason modal
  // rather than firing immediately.
  const handleRejectReceipt = (res) => {
    setReasonCode('');
    setReasonNote('');
    setReasonModal({ mode: 'reject', reservation: res });
  };

  const handleVerifyBalancePayment = async (res) => {
    try {
      await reviewReservationBalanceReceipt(res.docId, true);
      setViewModal((prev) => prev ? {
        ...prev,
        balancePaymentStatus: 'paid',
        balanceReceiptUrl: null,
      } : prev);
      if (res.docId) {
        getPaymentsForReservation(res.docId).then(setPaymentRecords).catch(() => {});
      }
      toast.success('Balance payment verified');
    } catch (err) {
      console.error('Failed to verify balance payment:', err);
      toast.error(err.message || 'Failed to verify balance payment');
    }
  };

  const handleRejectBalanceReceipt = (res) => {
    setReasonCode('');
    setReasonNote('');
    setReasonModal({ mode: 'reject_balance', reservation: res });
  };

  // Distinct from Reject: this ends the reservation entirely (releasing the
  // inventory hold) rather than giving the customer another attempt. Only
  // reachable while a receipt is under review -- cancel_reservation_for_fraud
  // itself refuses to run once payment is verified or the reservation is
  // otherwise resolved, and it always delegates to the same
  // cancel_reservation_as_manager every other staff cancellation uses.
  const handleCancelForFraud = (res) => {
    setReasonCode('');
    setReasonNote('');
    setReasonModal({ mode: 'cancel', reservation: res });
  };

  const handleSubmitReasonModal = async (e) => {
    e.preventDefault();
    if (!reasonModal || !reasonCode) return;
    setReasonSubmitting(true);
    const { mode, reservation } = reasonModal;
    try {
      if (mode === 'reject') {
        await reviewReservationReceipt(reservation.docId, false, reasonCode, reasonNote || null);
        setViewModal((prev) => (prev ? { ...prev, paymentStatus: 'Pending', receiptUrl: null } : prev));
        toast.error('Receipt rejected — the customer can upload another');
      } else if (mode === 'reject_balance') {
        await reviewReservationBalanceReceipt(reservation.docId, false, reasonCode, reasonNote || null);
        setViewModal((prev) => (prev ? {
          ...prev,
          balancePaymentStatus: 'rejected',
          balanceReceiptUrl: null,
          balancePaymentIssue: reasonCode === 'unreadable_receipt' ? 'image_unclear' :
                               reasonCode === 'wrong_amount' ? 'amount_mismatch' :
                               reasonCode === 'invalid_reference' ? 'reference_unverified' : 'verification_failed',
        } : prev));
        toast.error('Balance receipt rejected — customer can upload another');
      } else {
        await cancelReservationForFraud(reservation.docId, reservation.status, reasonCode, reasonNote || null);
        setViewModal((prev) => (prev ? { ...prev, status: 'Cancelled' } : prev));
        toast.error('Reservation cancelled');
      }
      setReasonModal(null);
    } catch (err) {
      console.error(`Failed to ${mode} reservation:`, err);
      toast.error(err.message || `Failed to ${mode.startsWith('reject') ? 'reject the receipt' : 'cancel the reservation'}`);
    } finally {
      setReasonSubmitting(false);
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
          status: 'To Pay',
          assigned_staff_id: '',
          countdown: true,
          size: newRes.size,
          // deposit is the numeric amount owed (50%, matching the standard
          // convention elsewhere in this codebase), not a paid/unpaid flag.
          deposit: Math.round((matchedProduct?.price || 0) * 0.5 * 100) / 100,
          payment_status: 'Pending',
          payment_type: 'Deposit',
          payment_due_at: computePaymentDueAt(newRes.date),
          rentalPrice: matchedProduct?.price || 0,
        });
        await logAction(user, 'Created new reservation', { customer: newRes.customer, customerId });
        setIsModalOpen(false);
        toast.success('Reservation created and stock held for payment');
        setNewRes({ customer: '', customerId: '', outfit: '', size: 'M', date: '' });
      } catch (err) { console.error('Failed to create reservation:', err); toast.error(err.message || 'Failed to create reservation'); }
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
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Reservations' }]}
        title="Reservation Management"
        subtitle="Manage customer holds, payments, and pickup"
        category="OPERATIONS"
        actions={
          <div className="header-actions flex-center gap-2">
            {mainTab === 'reservations' && (
              <div className="view-toggle">
                <button
                  type="button"
                  className={`toggle-btn ${viewMode === 'board' ? 'active' : ''}`}
                  onClick={() => setViewMode('board')}
                  aria-pressed={viewMode === 'board'}
                >
                  Board
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                  onClick={() => setViewMode('table')}
                  aria-pressed={viewMode === 'table'}
                >
                  List View
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}
                  onClick={() => setViewMode('calendar')}
                  aria-pressed={viewMode === 'calendar'}
                >
                  Calendar
                </button>
              </div>
            )}
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

      {/* Primary Section Tabs: Reservations vs Return/Refund Requests */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
        <button
          type="button"
          className={`toggle-btn ${mainTab === 'reservations' ? 'active' : ''}`}
          onClick={() => setMainTab('reservations')}
          style={{ padding: '0.5rem 1.25rem', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Package size={16} /> Reservations
        </button>
        <button
          type="button"
          className={`toggle-btn ${mainTab === 'return_refunds' ? 'active' : ''}`}
          onClick={() => {
            setMainTab('return_refunds');
            refreshPendingReturnCount();
          }}
          style={{ padding: '0.5rem 1.25rem', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <AlertTriangle size={16} /> Return / Refund Requests
          {pendingReturnCount > 0 && (
            <span className="badge badge-warning" style={{ marginLeft: '4px', fontSize: '0.75rem' }}>
              {pendingReturnCount}
            </span>
          )}
        </button>
      </div>

      {mainTab === 'return_refunds' ? (
        <ReturnRefundQueue
          onDisburseReservation={(res) => {
            const target = reservations.find(r => r.id === res.id || r.docId === res.id) || {
              ...res,
              docId: res.id,
              paymentStatus: 'Refund Required',
            };
            setViewModal(target);
          }}
        />
      ) : (
        <>
          {/* Metric KPI Summary Cards for List View */}
      {viewMode === 'table' && (
        scopeFilter === 'active' ? (
          <div className="res-summary-grid">
            <div
              className={`card res-stat-card ${statusFilter === 'All' ? 'active-stat' : ''}`}
              onClick={() => setStatusFilter('All')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setStatusFilter('All');
                }
              }}
              role="button"
              tabIndex={0}
              title="Show all active reservations"
            >
              <div className="icon-bg-soft blue">
                <Clock size={24} />
              </div>
              <div className="res-stat-content">
                <p className="stat-label">Active Queue</p>
                <h3>{activeCount}</h3>
                <span className="stat-sub">Currently open reservations</span>
              </div>
            </div>
            <div
              className={`card res-stat-card ${statusFilter === 'To Pay' ? 'active-stat' : ''}`}
              onClick={() => setStatusFilter('To Pay')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setStatusFilter('To Pay');
                }
              }}
              role="button"
              tabIndex={0}
              title="Filter to reservations awaiting payment"
            >
              <div className="icon-bg-soft orange">
                <DollarSign size={24} />
              </div>
              <div className="res-stat-content">
                <p className="stat-label">To Pay</p>
                <h3>{toPayCount}</h3>
                <span className="stat-sub">Awaiting payment</span>
              </div>
            </div>
            <div
              className={`card res-stat-card ${statusFilter === 'Preparing' ? 'active-stat' : ''}`}
              onClick={() => setStatusFilter('Preparing')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setStatusFilter('Preparing');
                }
              }}
              role="button"
              tabIndex={0}
              title="Filter to reservations being prepared"
            >
              <div className="icon-bg-soft purple">
                <Package size={24} />
              </div>
              <div className="res-stat-content">
                <p className="stat-label">Preparing</p>
                <h3>{preparingCount}</h3>
                <span className="stat-sub">Being prepared</span>
              </div>
            </div>
            <div
              className={`card res-stat-card ${statusFilter === 'To Pickup' ? 'active-stat' : ''}`}
              onClick={() => setStatusFilter('To Pickup')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setStatusFilter('To Pickup');
                }
              }}
              role="button"
              tabIndex={0}
              title="Filter to reservations ready for pickup"
            >
              <div className="icon-bg-soft green">
                <PackageCheck size={24} />
              </div>
              <div className="res-stat-content">
                <p className="stat-label">To Pickup</p>
                <h3>{toPickupCount}</h3>
                <span className="stat-sub">Ready for pickup</span>
              </div>
            </div>
            {/* Refunds Required — danger card; exact amount from payment ledger */}
            <div
              className="card res-stat-card danger-stat"
              onClick={() => handleScopeChange('refunds')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleScopeChange('refunds');
                }
              }}
              role="button"
              tabIndex={0}
              title="View reservations with pending refund liability"
              aria-label={`Refunds Required: ${refundCount} reservations, ${formatCurrency(refundLiabilityTotal)} pending`}
            >
              <div className="icon-bg-soft red">
                <AlertTriangle size={24} />
              </div>
              <div className="res-stat-content">
                <p className="stat-label">Refunds Required</p>
                <h3>{refundQueueLoading ? '—' : refundCount}</h3>
                <span className="stat-sub">
                  {refundQueueLoading ? 'Loading…' : `${formatCurrency(refundLiabilityTotal)} pending`}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="res-summary-grid archive-grid">
            <div
              className={`card res-stat-card ${statusFilter === 'All' ? 'active-stat' : ''}`}
              onClick={() => setStatusFilter('All')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setStatusFilter('All');
                }
              }}
              role="button"
              tabIndex={0}
              title="Show all historical reservations"
            >
              <div className="icon-bg-soft purple">
                <Archive size={24} />
              </div>
              <div className="res-stat-content">
                <p className="stat-label">Archived</p>
                <h3>{archivedCount}</h3>
                <span className="stat-sub">Historical reservations</span>
              </div>
            </div>
            <div
              className={`card res-stat-card ${statusFilter === 'Completed' ? 'active-stat' : ''}`}
              onClick={() => setStatusFilter('Completed')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setStatusFilter('Completed');
                }
              }}
              role="button"
              tabIndex={0}
              title="Filter to completed reservations"
            >
              <div className="icon-bg-soft green">
                <CheckCircle size={24} />
              </div>
              <div className="res-stat-content">
                <p className="stat-label">Completed</p>
                <h3>{completedCount}</h3>
                <span className="stat-sub">Successfully completed</span>
              </div>
            </div>
            <div
              className={`card res-stat-card ${statusFilter === 'Cancelled' ? 'active-stat' : ''}`}
              onClick={() => setStatusFilter('Cancelled')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setStatusFilter('Cancelled');
                }
              }}
              role="button"
              tabIndex={0}
              title="Filter to cancelled reservations"
            >
              <div className="icon-bg-soft red">
                <XCircle size={24} />
              </div>
              <div className="res-stat-content">
                <p className="stat-label">Cancelled</p>
                <h3>{cancelledCount}</h3>
                <span className="stat-sub">Cancelled reservations</span>
              </div>
            </div>
          </div>
        )
      )}

      <div className="card">
        {/* Scope Bar: Active Queue | Refunds Required | Archive */}
        {viewMode === 'table' && (
          <div className="res-scope-bar">
            <div className="res-scope-tabs" role="tablist" aria-label="Reservation Scope">
              <button
                type="button"
                role="tab"
                aria-selected={scopeFilter === 'active'}
                className={`res-scope-tab ${scopeFilter === 'active' ? 'active' : ''}`}
                onClick={() => handleScopeChange('active')}
              >
                <span>Active Queue</span>
                <span className="res-scope-count">{activeCount}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={scopeFilter === 'refunds'}
                className={`res-scope-tab ${scopeFilter === 'refunds' ? 'active danger' : ''}`}
                onClick={() => handleScopeChange('refunds')}
                aria-label={`Refunds Required: ${refundCount} reservations`}
              >
                <span>Refunds Required</span>
                <span className={`res-scope-count ${refundCount > 0 ? 'danger' : ''}`}>
                  {refundQueueLoading ? '…' : refundCount}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={scopeFilter === 'archived'}
                className={`res-scope-tab ${scopeFilter === 'archived' ? 'active' : ''}`}
                onClick={() => handleScopeChange('archived')}
              >
                <span>Archive</span>
                <span className="res-scope-count">{archivedCount}</span>
              </button>
            </div>
          </div>
        )}

        <div className="card-toolbar">
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input
              id="reservations-search-input"
              name="reservationsSearch"
              type="text"
              placeholder={scopeFilter === 'archived' ? "Search archived by ID or customer name..." : "Search active reservations by ID or customer name..."}
              aria-label="Search by reservation ID or customer name"
              autoComplete="off"
              value={searchInput}
              onChange={handleSearchChange}
              className="input-field pl-10"
            />
          </div>
          <div className="flex-center gap-2">
            <select autoComplete="off" id="field_015bxhd" name="field_015bxhd"
              className="input-field"
              style={{ width: 'auto', minWidth: 160 }}
              value={statusFilter}
              onChange={(e) => {
                const val = e.target.value;
                setStatusFilter(val);
                if ((val === 'Cancelled' || val === 'Completed') && viewMode === 'board') {
                  setViewMode('table');
                  setScopeFilter('archived');
                }
              }}
              aria-label="Filter by reservation status"
            >
              {scopeFilter === 'active' ? (
                <>
                  <option value="All">All Active Statuses</option>
                  <option value="To Pay">To Pay</option>
                  <option value="Preparing">Preparing</option>
                  <option value="To Pickup">To Pickup</option>
                </>
              ) : (
                <>
                  <option value="All">All Archived</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </>
              )}
            </select>
          </div>
        </div>

        {viewMode === 'board' && (statusFilter === 'Cancelled' || statusFilter === 'Completed') && (
          <div className="alert-banner info-banner flex-between p-3 mb-4 rounded-lg" style={{ background: 'var(--bg-light)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', margin: '16px' }}>
            <div className="flex-center gap-2">
              <Clock size={16} />
              <span><strong>{statusFilter}</strong> reservations are historical records. View them in <strong>List View</strong>.</span>
            </div>
            <button className="btn-sm btn-primary" onClick={() => setViewMode('table')}>
              Switch to List View
            </button>
          </div>
        )}

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
          <div className="table-container table-sticky-container">
            <table className="table res-list-table">
              <thead className="table-sticky-header">
                <tr>
                  <th scope="col">ID</th>
                  <th
                    scope="col"
                    aria-sort={listSort.key === 'customer' ? (listSort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button className="sort-header-btn" onClick={() => toggleSort('customer')}>
                      Customer <ArrowUpDown size={13} aria-hidden="true" />
                    </button>
                  </th>
                  <th scope="col">Item</th>
                  <th
                    scope="col"
                    aria-sort={listSort.key === 'date' ? (listSort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button className="sort-header-btn" onClick={() => toggleSort('date')} title="Sort by pickup date">
                      Pickup Schedule <ArrowUpDown size={13} aria-hidden="true" />
                    </button>
                  </th>
                  <th scope="col">Status</th>
                  <th
                    scope="col"
                    aria-sort={listSort.key === 'balance' ? (listSort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button className="sort-header-btn" onClick={() => toggleSort('balance')}>
                      Balance <ArrowUpDown size={13} aria-hidden="true" />
                    </button>
                  </th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedReservations.map((res) => {
                  const balance = outstandingBalance(res);
                  const primaryAction = primaryActionFor(res);
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
                    <tr key={res.id} className={`res-row ${(res.displayStatus === 'Completed' || res.displayStatus === 'Cancelled') ? 'archived-row' : ''}`}>
                      <td className="font-mono text-sm" style={{ whiteSpace: 'nowrap' }}>
                        <div className="flex items-center gap-1">
                          {hasMultipleLines && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpandRow(res.id);
                              }}
                              className="p-0.5 hover:bg-gray-100 rounded text-gray-500"
                              title={isExpanded ? "Collapse items" : "Expand items"}
                              aria-expanded={isExpanded}
                              aria-label={isExpanded ? "Collapse item list" : `Expand ${res.lines.length} items`}
                            >
                              {isExpanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                            </button>
                          )}
                          <div className="res-id-wrap">
                            <span className="res-id-mono" title={res.id}>{formattedId}</span>
                            <button
                              type="button"
                              className="res-id-copy"
                              title="Copy reservation ID"
                              aria-label="Copy reservation ID"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (navigator?.clipboard) {
                                  navigator.clipboard.writeText(res.id);
                                  toast.success('Reservation ID copied');
                                }
                              }}
                            >
                              <Copy size={11} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="res-customer-cell">
                          <div className="res-cust-avatar" aria-hidden="true">
                            {getInitials(res.displayName)}
                          </div>
                          <div className="res-cust-meta">
                            <div className="res-cust-name">{res.displayName}</div>
                            <div className="res-cust-role">Customer</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="res-item-cell">
                          {imageUrl && (
                            <img src={imageUrl} alt="" className="res-thumb" />
                          )}
                          <div className="res-item-info">
                            {(hasMultipleLines && !isExpanded ? res.lines.slice(0, 1) : res.lines).map((line, index) => (
                              <div key={line.id ?? `${line.productId}-${index}`} className={index > 0 ? 'text-sm text-secondary pt-1 border-t border-dashed mt-1' : ''}>
                                <div className="res-item-name">{line.productName || res.productName || res.outfit}</div>
                                <div className="res-item-sub">
                                  {line.size && <span className="size-pill">Size {line.size}</span>}
                                  <span className="qty-pill">Qty {line.quantity ?? 1}</span>
                                </div>
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
                        <div className="res-schedule-cell">
                          <div className="res-schedule-primary">
                            <Calendar size={13} className="res-schedule-icon" aria-hidden="true" />
                            <span className="res-schedule-date">
                              {res.displayDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })}
                            </span>
                            <span className="res-schedule-time">
                              • {formatAppointmentTime(res.appointmentTime, res.displayDate)}
                            </span>
                          </div>
                          {res.displayStatus === 'Completed' && (res.completedAt || res.balanceSettledAt || res.updatedAt || res.updated_at) && (
                            <div className="res-schedule-completed" title="Actual completion / pickup handover timestamp">
                              <CheckCircle size={11} aria-hidden="true" />
                              <span>
                                Finished: {formatDateTime(res.completedAt || res.balanceSettledAt || res.updatedAt || res.updated_at)}
                              </span>
                            </div>
                          )}
                          {res.displayStatus === 'Cancelled' && (res.cancelledAt || res.updatedAt || res.updated_at) && (
                            <div className="res-schedule-cancelled" title="Cancellation timestamp">
                              <XCircle size={11} aria-hidden="true" />
                              <span>
                                Cancelled: {formatDateTime(res.cancelledAt || res.updatedAt || res.updated_at)}
                              </span>
                            </div>
                          )}
                          {(res.createdAt || res.created_at) && (
                            <div className="res-schedule-booked">
                              <span>Booked: {parseDate(res.createdAt || res.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })}</span>
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
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                          <StatusBadge status={res.displayStatus} />
                          {String(res.paymentStatus || '').toLowerCase() === 'refund required' && (() => {
                            const qItem = refundQueue.find((q) => q.id === res.id || q.docId === res.docId);
                            const totalRefund = qItem
                              ? (qItem.payments ?? []).reduce((sum, p) => sum + (p.amountCentavos ?? 0), 0) / 100
                              : 0;
                            return (
                              <span
                                className="receipt-badge"
                                style={{
                                  background: 'rgba(239, 68, 68, 0.15)',
                                  color: '#ef4444',
                                  borderColor: 'rgba(239, 68, 68, 0.4)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  fontWeight: 700,
                                }}
                              >
                                ⚠️ Refund Required{totalRefund > 0 ? ` — ${formatCurrency(totalRefund)}` : ''}
                              </span>
                            );
                          })()}
                          {isAwaitingReceipt(res) && (
                            <span className="receipt-badge">📎 Receipt uploaded</span>
                          )}
                          {res.balancePaymentStatus === 'submitted' && (
                            <span className="receipt-badge" style={{ background: 'rgba(212, 175, 55, 0.15)', color: '#b8860b' }}>
                              📎 Balance receipt
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {balance > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span className="balance-due-pill">
                              <DollarSign size={11} /> {formatCurrency(balance)} due
                            </span>
                            {res.balancePaymentStatus === 'submitted' && (
                              <span className="text-[11px] font-semibold text-gold">Proof under review</span>
                            )}
                          </div>
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
                          <button
                            className="res-action-btn view"
                            title="View Details"
                            aria-label={`View details for reservation ${res.displayId || res.id}`}
                            onClick={() => setViewModal(res)}
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            className="res-action-btn msg"
                            title="Message"
                            aria-label={`Message customer for reservation ${res.displayId || res.id}`}
                            onClick={() => handleMessageBuyer(res)}
                          >
                            <MessageSquare size={14} />
                          </button>
                          {canManage && primaryAction && (
                            <button
                              className={`res-action-primary ${isAwaitingReceipt(res) ? 'verify' : 'approve'}`}
                              aria-label={`${isAwaitingReceipt(res) ? 'Verify Receipt' : primaryAction.action === 'complete' ? 'Complete Pickup' : primaryAction.label} for reservation ${res.displayId || res.id}`}
                              // Same fix as the board card: this used to fire
                              // a payment mutation immediately, relabeled
                              // "Verify Receipt" -- staff could mark it verified
                              // without ever opening the receipt image. Opens
                              // the detail modal instead, where the receipt
                              // renders next to its own Verify Payment button.
                              onClick={() => (primaryAction.action === 'review_receipt' ? setViewModal(res) : handleAction(res.id, primaryAction.action))}
                            >
                              {isAwaitingReceipt(res) ? <><ReceiptText size={13} /> Verify Receipt</> : primaryAction.action === 'complete' ? <><PackageCheck size={13} /> Complete Pickup</> : <><CheckCircle size={13} /> {primaryAction.label}</>}
                            </button>
                          )}
                          {canManage && CAN_RESCHEDULE_STATUSES.has(res.displayStatus) && (
                            <button
                              className="res-action-btn reschedule"
                              title="Reschedule"
                              aria-label={`Reschedule reservation ${res.displayId || res.id}`}
                              onClick={() => { setRescheduleModal(res); setNewDate(res.date); }}
                            >
                              <Calendar size={14} />
                            </button>
                          )}
                          {canManage && CAN_RESCHEDULE_STATUSES.has(res.displayStatus) && canCancelReservation(res) && (
                            <button
                              className="res-action-btn reject"
                              title="Cancel"
                              aria-label={`Cancel reservation ${res.displayId || res.id}`}
                              onClick={() => handleAction(res.id, 'cancel')}
                            >
                              <XCircle size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {pagedReservations.length === 0 && (
                  <tr>
                    <td colSpan="7" className="text-center py-10 text-secondary">
                      <div className="res-empty-state">
                        <div className="res-empty-icon">
                          {scopeFilter === 'archived' ? <Archive size={28} /> : <Clock size={28} />}
                        </div>
                        <h4>
                          {searchTerm || statusFilter !== 'All'
                            ? (scopeFilter === 'archived' ? 'No archived reservations found' : 'No active reservations found')
                            : (scopeFilter === 'archived' ? 'Archive is clear' : 'All caught up')}
                        </h4>
                        <p className="text-secondary text-sm">
                          {searchTerm || statusFilter !== 'All'
                            ? 'Try clearing your search query or status filter to view other records.'
                            : (scopeFilter === 'archived'
                                ? 'Completed and cancelled reservations will appear here.'
                                : 'There are no active reservations waiting for payment, preparation, or pickup.')}
                        </p>
                        {(searchTerm || statusFilter !== 'All') && (
                          <button
                            type="button"
                            className="btn-outline btn-sm mt-3"
                            onClick={() => {
                              setSearchInput('');
                              setSearchTerm('');
                              setStatusFilter('All');
                            }}
                          >
                            Clear Filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="res-pagination" role="navigation" aria-label="Reservation table pagination">
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="Go to previous page"
                >
                  &larr; Previous
                </button>
                <span className="res-pagination-info text-sm text-secondary">
                  Page {page + 1} of {totalPages} ({sortedReservations.length} reservation{sortedReservations.length === 1 ? '' : 's'})
                </span>
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Go to next page"
                >
                  Next &rarr;
                </button>
              </div>
            )}
          </div>
        ) : (
          <ReservationCalendar
            reservations={filteredReservations}
            onView={(res) => setViewModal(res)}
            onMessage={handleMessageBuyer}
          />
        )}
      </div>
        </>
      )}

      {/* ===== QR / TOKEN VERIFICATION MODAL ===== */}
      {showQRModal && (
        <div
          className="modal-overlay"
          role="button"
          tabIndex={0}
          aria-label="Close dialog"
          onClick={(e) => { if (e.target === e.currentTarget) setShowQRModal(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setShowQRModal(false);
            }
          }}
        >
          <div
            className="modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qr-dialog-title"
            style={{ maxWidth: 420 }}
          >
            <div className="modal-header">
              <h2 id="qr-dialog-title"><QrCode size={20} style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'middle' }} />Verify Pickup</h2>
              <button className="close-btn" onClick={() => setShowQRModal(false)} aria-label="Close dialog">&times;</button>
            </div>
            <div className="modal-body">
              <div className="qr-mode-toggle" role="tablist" aria-label="Pickup verification method">
                <button
                  type="button"
                  role="tab"
                  aria-selected={qrScanMode === 'camera'}
                  className={qrScanMode === 'camera' ? 'btn-primary' : 'btn-outline'}
                  onClick={() => { setQrScanMode('camera'); setQrResult(null); }}
                >
                  <Camera size={14} /> Scan with camera
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={qrScanMode === 'manual'}
                  className={qrScanMode === 'manual' ? 'btn-primary' : 'btn-outline'}
                  onClick={() => { setQrScanMode('manual'); setQrResult(null); }}
                >
                  <Keyboard size={14} /> Enter manually
                </button>
              </div>

              {qrScanMode === 'camera' ? (
                <>
                  <p className="text-secondary text-sm mb-3">Point the camera at the QR code shown on the customer&apos;s pickup pass.</p>
                  <PickupQrScanner onDecode={handleQrDecode} />
                </>
              ) : (
                <>
                  <p className="text-secondary text-sm mb-3">Enter the customer&apos;s pickup token or reservation ID (displayed in their app) to verify and complete handover.</p>
                  <div className="form-group">
                    <label className="label" htmlFor="qr-token">Pickup Token / Reservation ID</label>
                    <input autoComplete="off"
                      id="qr-token"
                      type="text"
                      className="input-field font-mono"
                      placeholder="e.g. RES-1A09B570B26-586"
                      value={qrToken}
                      onChange={(e) => { setQrToken(e.target.value); setQrResult(null); }}
                      // eslint-disable-next-line jsx-a11y/no-autofocus -- primary input of a just-opened modal
                      autoFocus
                    />
                  </div>
                </>
              )}
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
                {qrScanMode === 'manual' && (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => lookupByPickupCode(qrToken)}
                  >
                    Look Up
                  </button>
                )}
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
          aria-label="Close dialog"
          onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsModalOpen(false);
            }
          }}
        >
          <div
            className="modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-res-dialog-title"
          >
            <div className="modal-header">
              <h2 id="create-res-dialog-title">Create New Reservation</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)} aria-label="Close dialog">
                &times;
              </button>
            </div>
            <form className="modal-body" onSubmit={handleCreateReservation}>
              <div className="form-group">
                <label className="label" htmlFor="reservation-customer">Customer</label>
                <input autoComplete="off"
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
                  <select autoComplete="off"
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
                  <select autoComplete="off"
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
                <input autoComplete="off"
                  id="reservation-date"
                  type="datetime-local"
                  className="input-field"
                  min={new Date().toISOString().slice(0, 16)}
                  value={newRes.date}
                  onChange={(e) => setNewRes({ ...newRes, date: e.target.value })}
                  required
                />
                <span className="form-hint">Store hours: 9:00 AM – 5:00 PM, Mon – Sat</span>
              </div>
              <span className="form-hint">
                Creating the reservation holds stock immediately. Payment must still be confirmed through PayMongo or receipt review.
              </span>
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
          aria-label="Close dialog"
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="reschedule-dialog-title"
            style={{ maxWidth: 500 }}
          >
            <div className="modal-header">
              <h2 id="reschedule-dialog-title">Reschedule {rescheduleModal.id}</h2>
              <button className="close-btn" onClick={() => setRescheduleModal(null)} aria-label="Close dialog">
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
                <input autoComplete="off"
                  id="reschedule-date"
                  type="datetime-local"
                  className="input-field"
                  min={new Date().toISOString().slice(0, 16)}
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  required
                />
                <span className="form-hint">Store hours: 9:00 AM – 5:00 PM, Mon – Sat</span>
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
          aria-label="Close dialog"
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="view-res-dialog-title"
            style={{ maxWidth: 640 }}
          >
            <div className="modal-header">
              <h2 id="view-res-dialog-title">Reservation Details</h2>
              <button className="close-btn" onClick={() => setViewModal(null)} aria-label="Close dialog">
                &times;
              </button>
            </div>
            <div className="modal-body">
              {/* Lifecycle Progress Indicator */}
              <nav aria-label="Reservation progress">
                <ol className="lifecycle-progress">
                  {(() => {
                    const steps = ['To Pay', 'Preparing', 'To Pickup', 'Completed'];
                    const statusOrder = { 'To Pay': 0, Preparing: 1, 'To Pickup': 2, Completed: 3, Cancelled: -1, Returned: -1 };
                    return steps.map((step, i) => {
                      const current = statusOrder[viewModal.displayStatus] ?? -1;
                      const stepIdx = statusOrder[step];
                      const isCancelled = viewModal.displayStatus === 'Cancelled';
                      const isActive = !isCancelled && stepIdx <= current;
                      const isCurrent = !isCancelled && stepIdx === current;
                      return (
                        <li
                          key={step}
                          className={`lifecycle-step ${isActive ? 'active' : ''} ${isCancelled ? 'cancelled' : ''}`}
                          aria-current={isCurrent ? 'step' : undefined}
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
                        </li>
                      );
                    });
                  })()}
                </ol>
              </nav>
              {viewModal.displayStatus === 'Cancelled' && (
                <div
                  style={{
                    textAlign: 'center',
                    color: 'var(--stock-low)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    marginBottom: '12px',
                    padding: '8px 12px',
                    background: 'rgba(239, 68, 68, 0.08)',
                    borderRadius: '6px',
                  }}
                >
                  <div>This reservation was cancelled</div>
                  {(viewModal.cancellationReason || viewModal.cancellation_reason) && (
                    <div style={{ fontSize: '0.8rem', fontWeight: 400, marginTop: '4px', opacity: 0.9, color: 'var(--text-secondary)' }}>
                      Reason: {viewModal.cancellationReason || viewModal.cancellation_reason}
                    </div>
                  )}
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
              {viewModal.displayStatus === 'Completed' && (viewModal.completedAt || viewModal.balanceSettledAt || viewModal.updatedAt || viewModal.updated_at) && (
                <div className="detail-row">
                  <span className="detail-label">Actual Finished At</span>
                  <strong className="text-success">
                    {parseDate(viewModal.completedAt || viewModal.balanceSettledAt || viewModal.updatedAt || viewModal.updated_at).toLocaleString('en-PH', {
                      weekday: 'short',
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
              {viewModal.displayStatus === 'Cancelled' && (viewModal.cancelledAt || viewModal.updatedAt || viewModal.updated_at) && (
                <div className="detail-row">
                  <span className="detail-label">Cancelled At</span>
                  <strong className="text-danger">
                    {parseDate(viewModal.cancelledAt || viewModal.updatedAt || viewModal.updated_at).toLocaleString('en-PH', {
                      weekday: 'short',
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
              {/* Prominent Payment Status & Controls Card */}
              <div className="payment-action-card">
                <div className="payment-card-header">
                  <div>
                    <div className="payment-card-title">Payment Controls</div>
                    <div className="payment-meta-row">
                      <span className={`payment-status-pill ${
                        (viewModal.paymentStatus || '').toLowerCase() === 'paid' ? 'paid'
                        : ['submitted', 'processing'].includes((viewModal.paymentStatus || '').toLowerCase()) ? 'submitted'
                        : (viewModal.paymentStatus || '').toLowerCase() === 'refunded' ? 'paid'
                        : 'unpaid'
                      }`}>
                        {(viewModal.paymentStatus || '').toLowerCase() === 'paid'
                          ? (outstandingBalance(viewModal) > 0 ? 'Reservation payment paid ✓' : 'Paid in full ✓')
                         : (viewModal.paymentStatus || '').toLowerCase() === 'refund required' ? 'Refund required ⚠️'
                         : (viewModal.paymentStatus || '').toLowerCase() === 'refunded' ? 'Refunded ✓'
                         : ['submitted', 'processing'].includes((viewModal.paymentStatus || '').toLowerCase()) ? 'Receipt Submitted ⌛'
                         : 'Unpaid ✗'}
                      </span>
                      {/* Cleaned up payment meta */}
                      {(viewModal.paymentStatus || '').toLowerCase() === 'paid' ? (
                        outstandingBalance(viewModal) > 0 ? (
                          <span className="text-secondary text-sm font-medium">
                            Deposit paid · Balance due at pickup: <strong>{formatCurrency(outstandingBalance(viewModal))}</strong>
                          </span>
                        ) : (
                          <span className="text-secondary text-sm font-medium">
                            {viewModal.paymentType ? `Payment type: ${viewModal.paymentType}` : 'Paid in full'}
                          </span>
                        )
                      ) : (viewModal.paymentStatus || '').toLowerCase() === 'refunded' ? (
                        <span className="text-secondary text-sm font-medium text-emerald-600 font-semibold">
                          Refund disbursed ✓
                        </span>
                      ) : (viewModal.paymentStatus || '').toLowerCase() === 'refund required' ? (
                        <span className="text-secondary text-sm font-medium text-red-500 font-semibold">
                          Cancellation liability pending disbursement
                        </span>
                      ) : (
                        <span className="text-secondary text-sm font-medium">
                          Amount Due: ₱{Number(viewModal.deposit || viewModal.rentalPrice || 0).toFixed(2)} {viewModal.paymentType ? `(${viewModal.paymentType})` : ''}
                        </span>
                      )}
                      {viewModal.paymentMethod && (
                        <span className="text-secondary text-sm"> · Method: <strong>{viewModal.paymentMethod}</strong></span>
                      )}
                      {viewModal.providerRef && (
                        <span className="text-secondary text-sm"> · Ref: <code className="text-xs">{viewModal.providerRef}</code></span>
                      )}
                    </div>
                    <div className="text-xs text-secondary mt-1">
                      <strong>Payment controls:</strong> PayMongo confirms electronic payments. Owners verify submitted transfer receipts. Once paid, start preparing the item, then mark it ready for pickup.
                    </div>
                  </div>
                </div>

                {outstandingBalance(viewModal) > 0 && (
                  <div className="payment-card-body">
                    <div className="balance-info-row">
                      <div>
                        <span className="text-sm text-secondary">Balance Owed at Pickup: </span>
                        <strong className="text-gold">{formatCurrency(outstandingBalance(viewModal))}</strong>
                      </div>
                      {canRecordPayment && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <select
                            id="balance-payment-method"
                            value={balanceMethod}
                            onChange={(event) => setBalanceMethod(event.target.value)}
                            disabled={recordingBalance}
                            aria-label="Balance payment method"
                          >
                            <option value="cash">Cash</option>
                            <option value="transfer">Transfer</option>
                            <option value="card">Card</option>
                            <option value="other">Other</option>
                          </select>
                          <button
                            className="btn-collect-balance"
                            disabled={recordingBalance}
                            onClick={async () => {
                              const amount = outstandingBalance(viewModal);
                              setRecordingBalance(true);
                              try {
                                const result = await settleReservationBalance(viewModal.id, balanceMethod);
                                setViewModal(prev => prev ? {
                                  ...prev,
                                  paymentStatus: 'Paid',
                                  balanceSettledAt: result?.settled_at || new Date().toISOString(),
                                  balanceSettledMethod: balanceMethod,
                                } : prev);
                                const rows = await getPaymentsForReservation(viewModal.id);
                                setPaymentRecords(rows);
                                toast.success(`Recorded collection of ${formatCurrency(amount)}`);
                              } catch (e) {
                                toast.error(e?.message || 'Failed to record balance collection');
                              } finally {
                                setRecordingBalance(false);
                              }
                            }}
                          >
                            {recordingBalance ? 'Recording…' : 'Record Collection'}
                          </button>
                        </div>
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

              {/* Operational Refund Action Panel (R-02 / Stage 3) */}
              {(viewModal.paymentStatus || '').toLowerCase() === 'refund required' && (() => {
                const qItem = refundQueue.find((q) => q.id === viewModal.id || q.docId === viewModal.docId);
                const refundablePayments = (paymentRecords.length > 0 ? paymentRecords : (qItem?.payments ?? []))
                  .filter((p) => p.requiresRefund || p.requires_refund);
                const totalRefundPesos = refundablePayments.reduce((sum, p) => {
                  const centavos = p.amountCentavos ?? p.amount_centavos ?? (p.amount ? p.amount * 100 : 0);
                  return sum + centavos;
                }, 0) / 100 || (qItem?.payments ?? []).reduce((sum, p) => sum + (p.amountCentavos ?? 0), 0) / 100;
                const isAdminOrOwner = ['admin', 'owner'].includes(String(user?.role || '').toLowerCase());

                return (
                  <div
                    className="card"
                    style={{
                      marginTop: '1rem',
                      padding: '1rem',
                      borderRadius: '8px',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      background: 'rgba(239, 68, 68, 0.04)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <AlertTriangle size={20} color="#ef4444" />
                      <h4 style={{ margin: 0, color: '#ef4444', fontWeight: 700, fontSize: '0.95rem' }}>
                        Refund Disbursement Required
                      </h4>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 0.75rem 0' }}>
                      This reservation was cancelled, but a payment of{' '}
                      <strong style={{ color: '#ef4444' }}>
                        {formatCurrency(totalRefundPesos || viewModal.rentalPrice || 0)}
                      </strong>{' '}
                      was collected and requires refund settlement to the customer.
                    </p>

                    {isAdminOrOwner ? (
                      <div
                        style={{
                          background: 'var(--card-bg, #fff)',
                          padding: '0.75rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color, #e5e7eb)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.75rem',
                        }}
                      >
                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                          Record Refund Disbursement (Admin/Owner)
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 140px' }}>
                            <label
                              htmlFor="refund-disbursement-method"
                              style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}
                            >
                              Disbursement Method
                            </label>
                            <select
                              id="refund-disbursement-method"
                              value={refundDisbursementMethod}
                              onChange={(e) => setRefundDisbursementMethod(e.target.value)}
                              disabled={submittingRefund}
                              className="input-field"
                              style={{ width: '100%' }}
                            >
                              <option value="cash">Cash in Person</option>
                              <option value="gcash">GCash Transfer</option>
                              <option value="bank_transfer">Bank Transfer</option>
                              <option value="paymongo">PayMongo Manual</option>
                              <option value="other">Other</option>
                            </select>
                          </div>
                          <div style={{ flex: '2 1 180px' }}>
                            <label
                              htmlFor="refund-reference-number"
                              style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}
                            >
                              Reference Number / Tx ID *
                            </label>
                            <input
                              id="refund-reference-number"
                              type="text"
                              value={refundReferenceNumber}
                              onChange={(e) => setRefundReferenceNumber(e.target.value)}
                              placeholder="e.g. GCash Ref / Receipt #"
                              disabled={submittingRefund}
                              className="input-field"
                              style={{ width: '100%' }}
                            />
                          </div>
                        </div>
                        <div>
                          <label
                            htmlFor="refund-settlement-notes"
                            style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}
                          >
                            Settlement Notes (Optional)
                          </label>
                          <input
                            id="refund-settlement-notes"
                            type="text"
                            value={refundNotes}
                            onChange={(e) => setRefundNotes(e.target.value)}
                            placeholder="Reason or notes regarding settlement"
                            disabled={submittingRefund}
                            className="input-field"
                            style={{ width: '100%' }}
                          />
                        </div>
                        <button
                          type="button"
                          className="btn-danger"
                          disabled={submittingRefund || !refundReferenceNumber.trim()}
                          onClick={() => handleMarkRefundDisbursed(viewModal)}
                          style={{
                            alignSelf: 'flex-start',
                            padding: '0.5rem 1rem',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            borderRadius: '6px',
                            cursor: submittingRefund || !refundReferenceNumber.trim() ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {submittingRefund ? 'Recording Disbursement…' : `Mark Refund Disbursed (${formatCurrency(totalRefundPesos || 0)})`}
                        </button>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        Only an Administrator or Owner can disburse and record refunds.
                      </div>
                    )}
                  </div>
                );
              })()}
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
                          {p.purpose && (
                            <div className="text-secondary text-xs">
                              {p.purpose.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                            </div>
                          )}
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
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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
                          Reject & Retry
                        </button>
                        <button
                          className="btn-outline small"
                          style={{ padding: '0.2rem 0.75rem', fontSize: '0.75rem', color: 'var(--color-danger, #c0392b)', borderColor: 'var(--color-danger, #c0392b)' }}
                          onClick={() => handleCancelForFraud(viewModal)}
                        >
                          Cancel Reservation
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Structured submission context -- staff should not have to
                      judge a bare image with no numbers to check it against. */}
                  {(viewModal.manualAmountClaimed != null || viewModal.manualPaymentMethod || viewModal.manualReferenceNumber) && (
                    <div className="restock-item-info" style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', marginBottom: '10px', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="text-secondary">Expected amount</span>
                        <strong>{formatCurrency(viewModal.deposit || 0)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="text-secondary">Claimed amount</span>
                        <strong style={
                          viewModal.manualAmountClaimed != null && Number(viewModal.manualAmountClaimed) !== Number(viewModal.deposit || 0)
                            ? { color: 'var(--color-danger, #c0392b)' }
                            : undefined
                        }>
                          {viewModal.manualAmountClaimed != null ? formatCurrency(viewModal.manualAmountClaimed) : '—'}
                          {viewModal.manualAmountClaimed != null && Number(viewModal.manualAmountClaimed) !== Number(viewModal.deposit || 0) && ' ⚠ mismatch'}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="text-secondary">Method</span>
                        <span>{viewModal.manualPaymentMethod === 'gcash' ? 'GCash' : viewModal.manualPaymentMethod === 'bank_transfer' ? 'Bank Transfer' : '—'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="text-secondary">Reference</span>
                        <span style={{ userSelect: 'text' }}>{viewModal.manualReferenceNumber || '—'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="text-secondary">Attempt</span>
                        <span>{viewModal.manualReceiptAttemptCount || 1}</span>
                      </div>
                      {viewModal.lastReceiptRejectionReason && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span className="text-secondary">Last rejection</span>
                          <span>{REASON_CODE_LABELS[viewModal.lastReceiptRejectionReason] || viewModal.lastReceiptRejectionReason}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {duplicateReferenceMatches.length > 0 && (
                    <div
                      className="text-sm"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        marginBottom: '10px',
                        background: 'rgba(192, 57, 43, 0.1)',
                        color: 'var(--color-danger, #c0392b)',
                      }}
                    >
                      ⚠ Reference already used on a verified payment
                      {duplicateReferenceMatches.map((m) => (
                        <div key={m.reservation_id}>
                          {m.display_id || m.reservation_id.slice(0, 8)}
                          {m.customer_name ? ` — ${m.customer_name}` : ''}
                        </div>
                      ))}
                      This is a warning, not a verdict -- reference formats can be reused innocently.
                    </div>
                  )}

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
                        style={{ height: '150px', objectFit: 'contain', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
                      />
                    </button>
                  ) : (
                    <div className="text-secondary text-sm">Loading receipt…</div>
                  )}
                </div>
              )}

              {viewModal.balanceReceiptUrl && (
                <div className="detail-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: '8px' }}>
                    <span className="detail-label">Remaining Balance Receipt</span>
                    {viewModal.balancePaymentStatus === 'submitted' && (
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          className="btn-primary small"
                          style={{ padding: '0.2rem 0.75rem', fontSize: '0.75rem' }}
                          onClick={() => handleVerifyBalancePayment(viewModal)}
                        >
                          Verify Balance Payment
                        </button>
                        <button
                          className="btn-outline small"
                          style={{ padding: '0.2rem 0.75rem', fontSize: '0.75rem' }}
                          onClick={() => handleRejectBalanceReceipt(viewModal)}
                        >
                          Reject &amp; Retry
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Structured balance submission context */}
                  {(viewModal.balanceAmountClaimed != null || viewModal.balancePaymentMethod || viewModal.balanceReferenceNumber) && (
                    <div className="restock-item-info" style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', marginBottom: '10px', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="text-secondary">Expected balance</span>
                        <strong>{formatCurrency(outstandingBalance(viewModal) || balanceDue(viewModal) || 0)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="text-secondary">Claimed amount</span>
                        <strong style={
                          viewModal.balanceAmountClaimed != null && Number(viewModal.balanceAmountClaimed) !== Number(outstandingBalance(viewModal) || balanceDue(viewModal) || 0)
                            ? { color: 'var(--color-danger, #c0392b)' }
                            : undefined
                        }>
                          {viewModal.balanceAmountClaimed != null ? formatCurrency(viewModal.balanceAmountClaimed) : '—'}
                          {viewModal.balanceAmountClaimed != null && Number(viewModal.balanceAmountClaimed) !== Number(outstandingBalance(viewModal) || balanceDue(viewModal) || 0) && ' ⚠ mismatch'}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="text-secondary">Method</span>
                        <span>{viewModal.balancePaymentMethod === 'gcash' ? 'GCash' : viewModal.balancePaymentMethod === 'bank_transfer' ? 'Bank Transfer' : viewModal.balancePaymentMethod || '—'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="text-secondary">Reference</span>
                        <span style={{ userSelect: 'text' }}>{viewModal.balanceReferenceNumber || '—'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="text-secondary">Attempt</span>
                        <span>{viewModal.balanceReceiptAttemptCount || 1}</span>
                      </div>
                      {viewModal.balancePaymentIssue && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span className="text-secondary">Current issue</span>
                          <span style={{ color: 'var(--color-danger, #c0392b)' }}>{viewModal.balancePaymentIssue.replace(/_/g, ' ')}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {balanceReceiptLoadFailed ? (
                    <div className="text-danger text-sm">
                      Could not load this receipt. It may have been removed, or you may not have permission to view it.
                    </div>
                  ) : resolvedBalanceReceiptUrl ? (
                    <button
                      type="button"
                      className="receipt-thumb-btn"
                      onClick={() => setReceiptModalUrl(resolvedBalanceReceiptUrl)}
                      style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}
                      aria-label="View full-size balance receipt"
                    >
                      <img
                        src={resolvedBalanceReceiptUrl}
                        alt="Remaining Balance Receipt"
                        style={{ height: '150px', objectFit: 'contain', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
                      />
                    </button>
                  ) : (
                    <div className="text-secondary text-sm">Loading receipt…</div>
                  )}
                </div>
              )}

              {reviewHistory.length > 0 && (
                <div className="detail-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span className="detail-label" style={{ marginBottom: '6px' }}>Payment Review History</span>
                  {reviewHistory.map((entry) => (
                    <div key={entry.id} className="text-sm" style={{ width: '100%', marginBottom: '6px' }}>
                      <div className="text-secondary text-xs">
                        {parseDate(entry.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })}
                      </div>
                      <div>
                        {entry.action} — {entry.userName}
                        {entry.details?.reasonCode && ` (${REASON_CODE_LABELS[entry.details.reasonCode] || entry.details.reasonCode})`}
                      </div>
                      {entry.details?.staffNote && (
                        <div className="text-secondary" style={{ fontStyle: 'italic' }}>&quot;{entry.details.staffNote}&quot;</div>
                      )}
                    </div>
                  ))}
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
          aria-label="Close dialog"
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="receipt-dialog-title"
            style={{ maxWidth: '90vw', maxHeight: '90vh', width: 'auto', padding: '1rem' }}
          >
            <div className="modal-header">
              <h3 id="receipt-dialog-title">Payment Receipt</h3>
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

      {reasonModal && (
        <div
          className="modal-overlay"
          role="button"
          tabIndex={0}
          aria-label="Close dialog"
          onClick={(e) => { if (e.target === e.currentTarget && !reasonSubmitting) setReasonModal(null); }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !reasonSubmitting) { e.preventDefault(); setReasonModal(null); }
          }}
        >
          <div className="modal-content" role="dialog" aria-labelledby="reason-modal-title" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3 id="reason-modal-title">
                {reasonModal.mode === 'reject' || reasonModal.mode === 'reject_balance' ? 'Reject & Retry' : 'Cancel Reservation'}
              </h3>
              <button className="btn-icon" onClick={() => !reasonSubmitting && setReasonModal(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form className="modal-body" onSubmit={handleSubmitReasonModal}>
              <p className="text-secondary text-sm" style={{ marginTop: '-0.5rem', marginBottom: '0.75rem' }}>
                {reasonModal.mode === 'reject_balance'
                  ? 'The customer keeps their reservation and can upload a corrected balance receipt.'
                  : reasonModal.mode === 'reject'
                  ? 'The customer keeps their reservation and can upload a corrected receipt within the retry window.'
                  : 'This ends the reservation and releases the held item. Use this for a fabricated or reused receipt, or when the customer should not get another attempt.'}
              </p>
              <label htmlFor="reason-code-select" className="text-sm" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
                Reason *
              </label>
              <select
                id="reason-code-select"
                className="form-input"
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
                required
                style={{ width: '100%', marginBottom: '0.75rem' }}
              >
                <option value="" disabled>Select a reason…</option>
                {Object.entries(REASON_CODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <label htmlFor="reason-staff-note" className="text-sm" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
                Staff note (optional)
              </label>
              <textarea
                id="reason-staff-note"
                className="form-input"
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                rows={3}
                style={{ width: '100%', resize: 'vertical' }}
                placeholder="Any extra context for the record"
              />
              <div className="modal-footer" style={{ justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="btn-outline" onClick={() => setReasonModal(null)} disabled={reasonSubmitting}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={reasonModal.mode === 'cancel' ? { background: 'var(--color-danger, #c0392b)', borderColor: 'var(--color-danger, #c0392b)' } : undefined}
                  disabled={!reasonCode || reasonSubmitting}
                >
                  {reasonSubmitting ? 'Working…' : reasonModal.mode === 'reject' || reasonModal.mode === 'reject_balance' ? 'Reject & Retry' : 'Cancel Reservation'}
                </button>
              </div>
            </form>
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
