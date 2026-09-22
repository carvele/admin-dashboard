/**
 * src/components/reservations/ReservationDetailModal.jsx
 *
 * Dedicated Staff Order Details Workspace Modal.
 * Replaces the sparse view modal with a complete 2-column operational workspace:
 * - Line Items Table (with order snapshot precedence)
 * - Customer Details & Direct In-App Actions
 * - Financial Ledger (Order Total, Deposit, Amount Paid, Balance Due, Method, Deadlines)
 * - Receipt Verification & Fraud / Reject controls
 * - Pickup Appointment & Location Context
 * - Evidence-Backed Order Timeline (real persisted events only)
 * - State-Aware Sticky Action Footer
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Calendar,
  Clock,
  MapPin,
  User,
  Mail,
  Phone,
  ExternalLink,
  MessageSquare,
  CheckCircle,
  AlertTriangle,
  Shirt,
  DollarSign,
  Package,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import StatusBadge from '../ReservationStatusBadge';
import { formatCurrency, formatTimeLabel } from '../../utils/helpers';
import { outstandingBalance } from '../../utils/reservationBalance';
import { formatPaymentDeadline } from '../../utils/reservationDeadline';
import { toDisplayStatus } from '../../utils/reservationStatus';
import { formatProposedAppointment } from '../../utils/rescheduleRequest';
import {
  canCancelReservation,
  isAwaitingReceipt,
  CAN_RESCHEDULE_STATUSES,
} from '../../utils/reservationActions';
import {
  getPaymentsForReservation,
  findDuplicatePaymentReference,
  settleReservationBalance,
} from '../../services/reservationService';
import { getLogsForTarget } from '../../lib/supabaseService';
import { fetchSettings } from '../../services/settingsService';
import { resolveSignedStorageUrl } from '../../lib/storage';
import { toast } from 'sonner';
import './ReservationDetailModal.css';

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
  if (d instanceof Date) return d;
  if (d.toDate) return d.toDate();
  if (d.seconds) return new Date(d.seconds * 1000);
  return new Date(d);
};

const formatManilaDateTime = (dateVal) => {
  if (!dateVal) return '';
  const d = parseDate(dateVal);
  if (isNaN(d.getTime())) return '';
  const dateStr = d.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  });
  const timeStr = d.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila',
  });
  return `${dateStr} · ${timeStr}`;
};

const initialsOf = (name) =>
  (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

const ReservationDetailModal = ({
  isOpen,
  res,
  user,
  canManage,
  canRecordPayment,
  customers = [],
  products = [],
  refundQueue: _refundQueue = [],
  onClose,
  onMessage,
  onReschedule,
  onResolveReschedule,
  onAction,
  onVerifyPayment,
  onRejectReceipt,
  onCancelForFraud,
  onVerifyBalancePayment,
  onRejectBalanceReceipt,
  onSettleBalance,
  onMarkRefundDisbursed,
  onViewCustomer,
}) => {
  // ── Asynchronous State with Request-Safe Tracking ─────────────
  const [paymentRecords, setPaymentRecords] = useState([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState(null);

  const [auditLogs, setAuditLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState(null);

  const [storeInfo, setStoreInfo] = useState(null);

  const [resolvedReceiptUrl, setResolvedReceiptUrl] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptLoadFailed, setReceiptLoadFailed] = useState(false);

  const [resolvedBalanceReceiptUrl, setResolvedBalanceReceiptUrl] = useState(null);
  const [balanceReceiptLoading, setBalanceReceiptLoading] = useState(false);
  const [balanceReceiptLoadFailed, setBalanceReceiptLoadFailed] = useState(false);

  const [duplicateMatches, setDuplicateMatches] = useState([]);

  // Local balance collection state
  const [balanceMethod, setBalanceMethod] = useState('cash');
  const [recordingBalance, setRecordingBalance] = useState(false);

  // Local refund disbursement state
  const [refundMethod, setRefundMethod] = useState('cash');
  const [refundReference, setRefundReference] = useState('');
  const [refundNotes, setRefundNotes] = useState('');
  const [submittingRefund, setSubmittingRefund] = useState(false);

  // Receipt full-screen preview state
  const [zoomedReceiptUrl, setZoomedReceiptUrl] = useState(null);

  // ── Fetch Store Settings (Dynamic Location) ───────────────────
  useEffect(() => {
    let active = true;
    fetchSettings()
      .then((rows) => {
        if (!active) return;
        const map = Object.fromEntries((rows || []).map((r) => [r.key, r.value]));
        setStoreInfo(map.storeInfo || null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // ── Load Payments with Abort Safety ───────────────────────────
  const loadPayments = useCallback(() => {
    if (!res?.id) return () => {};
    let active = true;
    setPaymentLoading(true);
    setPaymentError(null);

    getPaymentsForReservation(res.id)
      .then((rows) => {
        if (!active) return;
        setPaymentRecords(rows || []);
      })
      .catch((err) => {
        if (!active) return;
        console.error('Failed to load payment records:', err);
        setPaymentError('Could not load payment records.');
      })
      .finally(() => {
        if (active) setPaymentLoading(false);
      });

    return () => {
      active = false;
    };
  }, [res?.id]);

  useEffect(() => {
    const cancel = loadPayments();
    return cancel;
  }, [loadPayments]);

  // ── Load Audit Logs with Abort Safety ─────────────────────────
  const loadLogs = useCallback(() => {
    const targetId = res?.docId || res?.id;
    if (!targetId) return () => {};
    let active = true;
    setLogsLoading(true);
    setLogsError(null);

    getLogsForTarget('reservation', targetId, 40)
      .then((rows) => {
        if (!active) return;
        setAuditLogs(rows || []);
      })
      .catch((err) => {
        if (!active) return;
        console.error('Failed to load audit logs:', err);
        setLogsError('Failed to load activity logs.');
      })
      .finally(() => {
        if (active) setLogsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [res?.docId, res?.id]);

  useEffect(() => {
    const cancel = loadLogs();
    return cancel;
  }, [loadLogs]);

  // ── Resolve Receipt URLs ──────────────────────────────────────
  useEffect(() => {
    setResolvedReceiptUrl(null);
    setReceiptLoadFailed(false);
    if (!res?.receiptUrl) return;

    let active = true;
    setReceiptLoading(true);
    resolveSignedStorageUrl('payment_receipts', res.receiptUrl)
      .then((url) => {
        if (!active) return;
        if (url) setResolvedReceiptUrl(url);
        else setReceiptLoadFailed(true);
      })
      .catch(() => {
        if (active) setReceiptLoadFailed(true);
      })
      .finally(() => {
        if (active) setReceiptLoading(false);
      });

    return () => {
      active = false;
    };
  }, [res?.receiptUrl]);

  useEffect(() => {
    setResolvedBalanceReceiptUrl(null);
    setBalanceReceiptLoadFailed(false);
    if (!res?.balanceReceiptUrl) return;

    let active = true;
    setBalanceReceiptLoading(true);
    resolveSignedStorageUrl('payment_receipts', res.balanceReceiptUrl)
      .then((url) => {
        if (!active) return;
        if (url) setResolvedBalanceReceiptUrl(url);
        else setBalanceReceiptLoadFailed(true);
      })
      .catch(() => {
        if (active) setBalanceReceiptLoadFailed(true);
      })
      .finally(() => {
        if (active) setBalanceReceiptLoading(false);
      });

    return () => {
      active = false;
    };
  }, [res?.balanceReceiptUrl]);

  // ── Duplicate Payment Reference Check ─────────────────────────
  useEffect(() => {
    setDuplicateMatches([]);
    const refNum = res?.manualReferenceNumber || res?.balanceReferenceNumber;
    if (!refNum) return;

    let active = true;
    findDuplicatePaymentReference(refNum, res?.docId || res?.id)
      .then((matches) => {
        if (active) setDuplicateMatches(matches || []);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [res?.manualReferenceNumber, res?.balanceReferenceNumber, res?.docId, res?.id]);

  // ── Normalized Customer Profile Lookup ────────────────────────
  const customerProfile = useMemo(() => {
    if (!res?.customerId && !res?.customer_id) return null;
    const cid = res.customerId || res.customer_id;
    return customers.find((c) => (c.docId || c.id) === cid) || null;
  }, [customers, res?.customerId, res?.customer_id]);

  // ── Canonical Operational & Financial States ──────────────────
  const opStatus = useMemo(() => {
    if (!res) return 'Pending';
    return res.displayStatus || toDisplayStatus(res.status) || 'Pending';
  }, [res]);

  const isCancelled = useMemo(() => {
    if (!res) return false;
    return (
      String(res.status || '').toLowerCase() === 'cancelled' ||
      String(res.displayStatus || '').toLowerCase() === 'cancelled' ||
      String(res.paymentStatus || '').toLowerCase() === 'cancelled'
    );
  }, [res]);

  const financialState = useMemo(() => {
    if (!res) return { key: 'unpaid', label: 'Unpaid' };
    const rawPayment = String(res.paymentStatus || '').toLowerCase();
    if (rawPayment === 'refund required') return { key: 'refund-required', label: 'Refund Required' };
    if (rawPayment === 'refunded') return { key: 'refunded', label: 'Refunded' };
    if (isAwaitingReceipt(res)) return { key: 'submitted', label: 'Receipt to Verify' };
    if (rawPayment === 'paid') {
      return outstandingBalance(res) > 0
        ? { key: 'deposit-paid', label: 'Deposit Paid' }
        : { key: 'paid', label: 'Paid in Full' };
    }
    if (isCancelled) return { key: 'cancelled', label: 'Cancelled' };
    return { key: 'unpaid', label: 'Unpaid' };
  }, [res, isCancelled]);

  // ── Canonical Financial Calculations ──────────────────────────
  const orderTotal = useMemo(() => {
    if (!res) return 0;
    if (res.rentalPrice != null) return Number(res.rentalPrice);
    if (res.lines?.length) {
      return res.lines.reduce((sum, l) => sum + (Number(l.unitPrice ?? l.unit_price ?? 0) * (l.quantity ?? 1)), 0);
    }
    return 0;
  }, [res]);

  const requiredDeposit = useMemo(() => {
    if (!res) return 0;
    if (res.deposit != null) return Number(res.deposit);
    return orderTotal > 0 ? orderTotal * 0.5 : 0;
  }, [res, orderTotal]);

  const currentBalance = useMemo(() => {
    if (!res) return 0;
    if (isCancelled && financialState.key !== 'refund-required') return 0;
    if (financialState.key === 'refunded') return 0;
    return outstandingBalance(res);
  }, [res, isCancelled, financialState.key]);

  const totalPaid = useMemo(() => {
    if (!res) return 0;
    // Verified payment rows take precedence if present
    const paidSum = paymentRecords
      .filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + ((p.amountCentavos ?? 0) / 100), 0);
    if (paidSum > 0) return paidSum;

    if (res.paymentStatus === 'Paid') {
      return orderTotal - currentBalance;
    }
    return 0;
  }, [res, paymentRecords, orderTotal, currentBalance]);

  // ── Line Items Snapshot Precedence ────────────────────────────
  const lineItems = useMemo(() => {
    if (!res) return [];
    const rawLines = res.lines?.length
      ? res.lines
      : [{
          id: res.id,
          productId: res.productId || res.product_id,
          productName: res.productName || res.outfit,
          size: res.size,
          color: res.color,
          quantity: res.quantity ?? 1,
          unitPrice: res.rentalPrice,
          imageUrl: res.imageUrl || res.image_url,
        }];

    return rawLines.map((line) => {
      const pId = line.productId || line.product_id;
      const fallbackProduct = products.find((p) => (p.docId || p.id) === pId);

      // Snapshot fields strictly take precedence over current catalog mutations
      const name = line.productName || line.product_name || fallbackProduct?.name || 'Unnamed item';
      const size = line.size || fallbackProduct?.sizes?.[0] || '—';
      const color = line.color || fallbackProduct?.color || '—';
      const quantity = Number(line.quantity ?? 1);
      const unitPrice = line.unitPrice != null
        ? Number(line.unitPrice)
        : (line.unit_price != null ? Number(line.unit_price) : Number(fallbackProduct?.price ?? 0));
      const lineTotal = unitPrice * quantity;
      const imageUrl = line.imageUrl || line.image_url || fallbackProduct?.images?.[0] || fallbackProduct?.imageUrl || null;
      const sku = fallbackProduct?.styleCode || fallbackProduct?.style_code || fallbackProduct?.sku || (line.inventoryId ? line.inventoryId.slice(0, 8) : null);

      return {
        id: line.id ?? `${pId}-${name}`,
        name,
        size,
        color,
        quantity,
        unitPrice,
        lineTotal,
        imageUrl,
        sku,
      };
    });
  }, [res, products]);

  // ── Synthesized Evidence-Backed Timeline ──────────────────────
  const timelineEvents = useMemo(() => {
    const events = [];

    // 1. Order created
    if (res?.createdAt || res?.created_at) {
      events.push({
        id: 'evt-created',
        time: parseDate(res.createdAt || res.created_at),
        label: 'Order placed by customer',
        actor: res.customerName || res.customer || 'Customer',
        detail: res.displayId ? `Booking reference ${res.displayId}` : null,
      });
    }

    // 2. Payments from verified payment records
    paymentRecords.forEach((p) => {
      if (p.status === 'paid') {
        events.push({
          id: `evt-payment-${p.id}`,
          time: parseDate(p.createdAt),
          label: `Payment verified (${formatCurrency((p.amountCentavos ?? 0) / 100)})`,
          actor: p.provider ? (p.provider === 'paymongo' ? 'PayMongo Gateway' : p.provider) : 'Payment Gateway',
          detail: p.providerRef ? `Ref: ${p.providerRef}` : (p.referenceNumber ? `Ref: ${p.referenceNumber}` : null),
        });
      } else if (p.status === 'awaiting_payment' || p.status === 'processing') {
        events.push({
          id: `evt-payment-attempt-${p.id}`,
          time: parseDate(p.createdAt),
          label: `Checkout session initiated (${formatCurrency((p.amountCentavos ?? 0) / 100)})`,
          actor: 'Customer',
          detail: p.method ? `Method: ${p.method}` : null,
        });
      }
    });

    // 3. Accepted & moved to Preparing
    if (res?.confirmedAt) {
      events.push({
        id: 'evt-confirmed',
        time: parseDate(res.confirmedAt),
        label: 'Order accepted — moved to Preparing',
        actor: res.confirmedByName || 'Staff',
      });
    }

    // 4. Marked ready for pickup
    if (res?.pickupReadyAt || res?.pickup_ready_at) {
      events.push({
        id: 'evt-ready',
        time: parseDate(res.pickupReadyAt || res.pickup_ready_at),
        label: 'Marked Ready for Pickup',
        actor: 'Staff',
      });
    }

    // 5. Reschedule requested
    if (res?.rescheduleRequestedAt || res?.reschedule_requested_at) {
      events.push({
        id: 'evt-reschedule-req',
        time: parseDate(res.rescheduleRequestedAt || res.reschedule_requested_at),
        label: `Customer requested reschedule to ${res.rescheduleRequestedDate || res.reschedule_requested_date || ''} ${res.rescheduleRequestedAtTime || res.reschedule_requested_at_time || ''}`,
        actor: res.customerName || 'Customer',
      });
    }

    // 6. In-person balance collected
    if (res?.balanceSettledAt || res?.balance_settled_at) {
      events.push({
        id: 'evt-balance-settled',
        time: parseDate(res.balanceSettledAt || res.balance_settled_at),
        label: `Balance collected (${formatCurrency(res.balanceAmountClaimed || currentBalance || 0)})`,
        actor: res.balanceSettledByName || res.balance_settled_by_name || 'Staff',
        detail: `Method: ${res.balanceSettledMethod || res.balance_settled_method || 'cash'}`,
      });
    }

    // 7. Audit log actions
    auditLogs.forEach((log) => {
      events.push({
        id: `evt-log-${log.id}`,
        time: parseDate(log.timestamp || log.createdAt),
        label: log.action || 'Logged action',
        actor: log.userName || log.user_name || 'Staff',
        detail: log.details?.reasonCode
          ? `Reason: ${REASON_CODE_LABELS[log.details.reasonCode] || log.details.reasonCode}`
          : (log.details?.staffNote ? `Note: "${log.details.staffNote}"` : null),
      });
    });

    // 8. Order completed
    if (res?.completedAt || res?.completed_at) {
      events.push({
        id: 'evt-completed',
        time: parseDate(res.completedAt || res.completed_at),
        label: 'Order completed & handed over to customer',
        actor: 'Staff',
      });
    }

    // 9. Order cancelled
    if (res?.cancelledAt || res?.cancelled_at) {
      events.push({
        id: 'evt-cancelled',
        time: parseDate(res.cancelledAt || res.cancelled_at),
        label: `Order cancelled${res.cancellationReason || res.cancellation_reason ? `: ${res.cancellationReason || res.cancellation_reason}` : ''}`,
        actor: 'Staff / System',
      });
    }

    // Sort ascending by time (earliest to latest)
    return events
      .filter((e) => e.time && !isNaN(e.time.getTime()))
      .sort((a, b) => a.time.getTime() - b.time.getTime());
  }, [res, paymentRecords, auditLogs, currentBalance]);

  // ── In-Person Balance Collection Handler ───────────────────────
  const handleCollectBalance = async () => {
    if (!currentBalance || currentBalance <= 0) return;
    setRecordingBalance(true);
    try {
      if (onSettleBalance) {
        await onSettleBalance(res.id, balanceMethod);
      } else {
        await settleReservationBalance(res.id, balanceMethod);
      }
      toast.success(`Recorded collection of ${formatCurrency(currentBalance)}`);
      loadPayments();
      loadLogs();
    } catch (err) {
      console.error('Failed to record balance collection:', err);
      toast.error(err?.message || 'Failed to record balance payment');
    } finally {
      setRecordingBalance(false);
    }
  };

  // ── Refund Disbursement Handler ───────────────────────────────
  const handleDisburseRefund = async () => {
    if (!refundReference.trim()) {
      toast.error('Reference / Transaction ID is required.');
      return;
    }
    setSubmittingRefund(true);
    try {
      if (onMarkRefundDisbursed) {
        await onMarkRefundDisbursed(
          res,
          refundMethod,
          refundReference.trim(),
          refundNotes.trim() || null
        );
      }
      setRefundReference('');
      setRefundNotes('');
      loadPayments();
      loadLogs();
    } catch (err) {
      console.error('Failed to record refund disbursement:', err);
      toast.error(err?.message || 'Failed to record refund disbursement');
    } finally {
      setSubmittingRefund(false);
    }
  };

  if (!isOpen || !res) return null;

  const pendingReschedule = formatProposedAppointment(res);
  const deadlineInfo = opStatus === 'To Pay' && !isCancelled
    ? formatPaymentDeadline(res.paymentDueAt)
    : null;

  const isAdminOrOwner = ['admin', 'owner'].includes(String(user?.role || '').toLowerCase());

  return (
    <div
      className="res-detail-modal-overlay"
      role="button"
      tabIndex={0}
      aria-label="Close dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className="res-detail-modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-details-title"
      >
        {/* ── 1. STICKY HEADER ────────────────────────────────────── */}
        <header className="res-detail-header">
          <div className="res-detail-header-left">
            <div className="res-detail-header-title-row">
              <h2 id="order-details-title" className="res-detail-order-id">
                Order {res.displayId || 'Pending'}
              </h2>
              <div className="res-detail-badges">
                <StatusBadge status={opStatus} />
                <span className={`res-financial-badge ${financialState.key}`}>
                  {financialState.label}
                </span>
              </div>
            </div>
            <div className="res-detail-header-sub">
              <span>Customer: <strong>{res.displayName || res.customerName || 'Unknown'}</strong></span>
              <span>•</span>
              <span>Created: <strong>{formatManilaDateTime(res.createdAt || res.created_at)}</strong></span>
              {(res.date || res.reservationDate) && (
                <>
                  <span>•</span>
                  <span>Pickup: <strong>{formatManilaDateTime(res.date || res.reservationDate)}</strong></span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            className="res-detail-close-btn"
            onClick={onClose}
            aria-label="Close workspace"
          >
            <X size={20} />
          </button>
        </header>

        {/* ── COMPACT SECONDARY STEPPER CUE ───────────────────────── */}
        {!isCancelled && financialState.key !== 'refund-required' && financialState.key !== 'refunded' && (
          <nav className="res-compact-stepper" aria-label="Operational progress">
            {['To Pay', 'Preparing', 'To Pickup', 'Completed'].map((step, idx) => {
              const statusOrder = { 'To Pay': 0, Preparing: 1, 'To Pickup': 2, Completed: 3 };
              const currentIdx = statusOrder[opStatus] ?? -1;
              const isDone = currentIdx > idx;
              const isCur = currentIdx === idx;
              return (
                <React.Fragment key={step}>
                  <div className={`res-stepper-item ${isDone ? 'completed' : isCur ? 'current' : ''}`}>
                    <div className="res-stepper-dot">
                      {isDone ? '✓' : idx + 1}
                    </div>
                    <span>{step}</span>
                  </div>
                  {idx < 3 && (
                    <div className={`res-stepper-line ${isDone ? 'filled' : ''}`} />
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        )}

        {/* ── 2. SCROLLABLE WORKSPACE BODY ───────────────────────── */}
        <div className="res-detail-body">
          {/* Cancellation Banner */}
          {isCancelled && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.85rem 1rem',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#b91c1c',
                fontSize: '0.88rem',
              }}
            >
              <AlertCircle size={20} color="#dc2626" />
              <div>
                <strong>This reservation was cancelled.</strong>
                {(res.cancellationReason || res.cancellation_reason) && (
                  <span style={{ marginLeft: '0.4rem', color: 'var(--text-secondary, #6b7280)' }}>
                    Reason: {res.cancellationReason || res.cancellation_reason}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* TWO-COLUMN OPERATIONAL GRID */}
          <div className="res-detail-grid">
            {/* ── LEFT COLUMN: ITEMS & CUSTOMER ─────────────────── */}
            <div className="res-detail-col">
              {/* Section 1: Line Items Table */}
              <section className="res-card-section" aria-labelledby="items-heading">
                <h3 id="items-heading" className="res-section-title">
                  <Shirt size={16} /> Items Ordered ({lineItems.length})
                </h3>

                <div className="res-line-items-list">
                  {lineItems.map((item) => (
                    <div key={item.id} className="res-line-item-row">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="res-line-item-thumb"
                          loading="lazy"
                        />
                      ) : (
                        <div className="res-line-item-thumb" aria-hidden="true">
                          <Shirt size={22} />
                        </div>
                      )}

                      <div className="res-line-item-info">
                        <div className="res-line-item-name" title={item.name}>
                          {item.name}
                        </div>
                        <div className="res-line-item-meta">
                          {item.size && item.size !== '—' && (
                            <span className="res-variant-pill">Size: {item.size}</span>
                          )}
                          {item.color && item.color !== '—' && (
                            <span className="res-variant-pill">Color: {item.color}</span>
                          )}
                          {item.sku && (
                            <span className="text-secondary text-xs">SKU: {item.sku}</span>
                          )}
                          <span className="font-medium">Qty: {item.quantity}</span>
                        </div>
                      </div>

                      <div className="res-line-item-pricing">
                        <div className="res-line-item-total">
                          {formatCurrency(item.lineTotal)}
                        </div>
                        {item.quantity > 1 && (
                          <div className="res-line-item-unit">
                            {formatCurrency(item.unitPrice)} each
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="res-items-summary-bar">
                  <span>Total Items: {lineItems.reduce((sum, i) => sum + i.quantity, 0)}</span>
                  <span>
                    Gross Value: <strong>{formatCurrency(orderTotal)}</strong>
                  </span>
                </div>
              </section>

              {/* Section 2: Customer Section */}
              <section className="res-card-section" aria-labelledby="customer-heading">
                <h3 id="customer-heading" className="res-section-title">
                  <User size={16} /> Customer Information
                </h3>

                <div className="res-customer-info-box">
                  <div className="res-customer-avatar" aria-hidden="true">
                    {initialsOf(customerProfile?.fullName || res.customerName || res.displayName)}
                  </div>
                  <div className="res-customer-details">
                    <div className="res-customer-name">
                      {customerProfile?.fullName || res.customerName || res.displayName || 'Unknown Customer'}
                    </div>

                    <div className="res-customer-contact-line">
                      <Mail size={14} />
                      <span>{customerProfile?.email || 'No email on file'}</span>
                    </div>

                    <div className="res-customer-contact-line">
                      <Phone size={14} />
                      <span>{customerProfile?.phone || 'No phone on file'}</span>
                    </div>

                    <div className="res-customer-actions-row">
                      {(res.customerId || res.customer_id) && onViewCustomer && (
                        <button
                          type="button"
                          className="res-btn-subtle"
                          onClick={() => onViewCustomer(res.customerId || res.customer_id)}
                          title="View customer profile"
                        >
                          <ExternalLink size={14} /> View Customer Profile
                        </button>
                      )}
                      <button
                        type="button"
                        className="res-btn-subtle"
                        onClick={() => onMessage(res)}
                        title="Send message to customer"
                      >
                        <MessageSquare size={14} /> Message Customer
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* ── RIGHT COLUMN: FINANCES, RECEIPT & PICKUP ─────── */}
            <div className="res-detail-col">
              {/* Section 3: Payment Breakdown */}
              <section className="res-card-section" aria-labelledby="payment-heading">
                <h3 id="payment-heading" className="res-section-title">
                  <DollarSign size={16} /> Payment &amp; Financial Summary
                  {paymentLoading && <span className="text-secondary text-xs" style={{ fontWeight: 'normal', marginLeft: '0.4rem' }}>(updating…)</span>}
                  {paymentError && <span className="text-danger text-xs" style={{ fontWeight: 'normal', marginLeft: '0.4rem' }}>({paymentError})</span>}
                </h3>

                <div className="res-financial-ledger">
                  <div className="res-ledger-row">
                    <span>Order Total</span>
                    <strong>{formatCurrency(orderTotal)}</strong>
                  </div>

                  <div className="res-ledger-row">
                    <span>Required Deposit</span>
                    <span>{formatCurrency(requiredDeposit)}</span>
                  </div>

                  <div className="res-ledger-row">
                    <span>Total Paid</span>
                    <strong style={{ color: totalPaid > 0 ? '#059669' : undefined }}>
                      {formatCurrency(totalPaid)}
                    </strong>
                  </div>

                  <div className="res-ledger-row balance-due">
                    <span>Balance Due at Pickup</span>
                    <strong className="res-balance-highlight">
                      {formatCurrency(currentBalance)}
                    </strong>
                  </div>

                  <div className="res-ledger-meta">
                    <div className="res-ledger-meta-item">
                      <span>Payment Method</span>
                      <strong className="font-mono">
                        {res.paymentMethod || res.balanceSettledMethod || res.manualPaymentMethod || '—'}
                      </strong>
                    </div>

                    {deadlineInfo && (
                      <div className="res-ledger-meta-item" style={{ color: deadlineInfo.urgent ? '#dc2626' : '#d97706' }}>
                        <span>Deposit Deadline</span>
                        <strong>{deadlineInfo.label}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* In-Person Balance Collection Control */}
                {currentBalance > 0 && canRecordPayment && (
                  <div
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      background: 'rgba(217, 119, 6, 0.08)',
                      border: '1px solid rgba(217, 119, 6, 0.25)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#92400e' }}>
                      Record Pickup Balance Collection ({formatCurrency(currentBalance)})
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <select
                        value={balanceMethod}
                        onChange={(e) => setBalanceMethod(e.target.value)}
                        disabled={recordingBalance}
                        style={{
                          flex: 1,
                          padding: '0.4rem 0.6rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color, #d1d5db)',
                          fontSize: '0.85rem',
                        }}
                        aria-label="Balance payment method"
                      >
                        <option value="cash">Cash</option>
                        <option value="transfer">Bank Transfer / GCash</option>
                        <option value="card">Card / Terminal</option>
                        <option value="other">Other</option>
                      </select>
                      <button
                        type="button"
                        className="res-btn-primary"
                        style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}
                        disabled={recordingBalance}
                        onClick={handleCollectBalance}
                      >
                        {recordingBalance ? 'Recording…' : 'Record Collection'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Operational Refund Disbursement Panel */}
                {financialState.key === 'refund-required' && (
                  <div
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.85rem',
                      borderRadius: '8px',
                      background: 'rgba(220, 38, 38, 0.06)',
                      border: '1px solid rgba(220, 38, 38, 0.3)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.65rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#b91c1c' }}>
                      <AlertTriangle size={18} />
                      <strong style={{ fontSize: '0.88rem' }}>Refund Disbursement Required</strong>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary, #4b5563)' }}>
                      This reservation has a verified payment requiring refund settlement to the customer.
                    </p>

                    {isAdminOrOwner ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <select
                            value={refundMethod}
                            onChange={(e) => setRefundMethod(e.target.value)}
                            disabled={submittingRefund}
                            style={{ flex: 1, padding: '0.35rem', fontSize: '0.8rem', borderRadius: '6px' }}
                          >
                            <option value="cash">Cash in Person</option>
                            <option value="gcash">GCash Transfer</option>
                            <option value="bank_transfer">Bank Transfer</option>
                            <option value="paymongo">PayMongo Manual</option>
                            <option value="other">Other</option>
                          </select>
                          <input
                            type="text"
                            placeholder="Reference / Tx ID *"
                            value={refundReference}
                            onChange={(e) => setRefundReference(e.target.value)}
                            disabled={submittingRefund}
                            style={{ flex: 2, padding: '0.35rem', fontSize: '0.8rem', borderRadius: '6px' }}
                          />
                        </div>
                        <input
                          type="text"
                          placeholder="Settlement notes (optional)"
                          value={refundNotes}
                          onChange={(e) => setRefundNotes(e.target.value)}
                          disabled={submittingRefund}
                          style={{ padding: '0.35rem', fontSize: '0.8rem', borderRadius: '6px' }}
                        />
                        <button
                          type="button"
                          className="res-btn-primary"
                          style={{ background: '#dc2626', alignSelf: 'flex-start', fontSize: '0.82rem' }}
                          disabled={submittingRefund || !refundReference.trim()}
                          onClick={handleDisburseRefund}
                        >
                          {submittingRefund ? 'Recording…' : 'Mark Refund Disbursed'}
                        </button>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.78rem', fontStyle: 'italic', color: 'var(--text-secondary, #6b7280)' }}>
                        Only an Administrator or Owner can disburse and record refunds.
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Section 4: Receipt Review Context (Conditional) */}
              {(res.receiptUrl || res.balanceReceiptUrl) && (
                <section className="res-card-section" aria-labelledby="receipt-heading">
                  <h3 id="receipt-heading" className="res-section-title">
                    <CheckCircle size={16} /> Submitted Payment Proof
                  </h3>

                  <div className="res-receipt-review-box">
                    <div className="res-receipt-meta-grid">
                      <div>
                        <span className="res-receipt-meta-label">Expected Amount:</span>
                        <div><strong>{formatCurrency(requiredDeposit)}</strong></div>
                      </div>
                      <div>
                        <span className="res-receipt-meta-label">Claimed Amount:</span>
                        <div style={{ color: res.manualAmountClaimed != null && Number(res.manualAmountClaimed) !== Number(requiredDeposit) ? '#dc2626' : undefined }}>
                          <strong>{res.manualAmountClaimed != null ? formatCurrency(res.manualAmountClaimed) : '—'}</strong>
                          {res.manualAmountClaimed != null && Number(res.manualAmountClaimed) !== Number(requiredDeposit) && ' ⚠ mismatch'}
                        </div>
                      </div>
                      <div>
                        <span className="res-receipt-meta-label">Method:</span>
                        <div>{res.manualPaymentMethod === 'gcash' ? 'GCash' : res.manualPaymentMethod === 'bank_transfer' ? 'Bank Transfer' : res.manualPaymentMethod || '—'}</div>
                      </div>
                      <div>
                        <span className="res-receipt-meta-label">Reference #:</span>
                        <div className="font-mono">{res.manualReferenceNumber || '—'}</div>
                      </div>
                    </div>

                    {duplicateMatches.length > 0 && (
                      <div
                        style={{
                          padding: '0.5rem 0.75rem',
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: '6px',
                          color: '#dc2626',
                          fontSize: '0.78rem',
                        }}
                      >
                        ⚠ Reference already used on a verified payment ({duplicateMatches.length} match)
                      </div>
                    )}

                    {receiptLoading ? (
                      <div className="text-secondary text-sm">Loading receipt image…</div>
                    ) : receiptLoadFailed ? (
                      <div className="text-danger text-sm">Could not load receipt image.</div>
                    ) : resolvedReceiptUrl ? (
                      <button
                        type="button"
                        className="res-receipt-thumb-wrap"
                        onClick={() => setZoomedReceiptUrl(resolvedReceiptUrl)}
                        aria-label="View full size deposit receipt"
                        title="Click to view full receipt"
                      >
                        <img
                          src={resolvedReceiptUrl}
                          alt="Payment Receipt"
                          className="res-receipt-thumb-img"
                        />
                      </button>
                    ) : null}

                    {/* Receipt Review Action Buttons */}
                    {isAwaitingReceipt(res) && canManage && (
                      <div className="res-receipt-actions">
                        <button
                          type="button"
                          className="res-btn-primary"
                          style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                          onClick={() => onVerifyPayment(res)}
                        >
                          Verify Payment
                        </button>
                        <button
                          type="button"
                          className="res-btn-outline"
                          style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                          onClick={() => onRejectReceipt(res)}
                        >
                          Reject &amp; Retry
                        </button>
                        <button
                          type="button"
                          className="res-btn-danger-outline"
                          style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                          onClick={() => onCancelForFraud(res)}
                        >
                          Cancel for Fraud
                        </button>
                      </div>
                    )}

                    {/* Balance Collection Receipt Preview & Review */}
                    {res.balanceReceiptUrl && (
                      <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--border-color, #e5e7eb)' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary, #4b5563)' }}>
                          Balance Collection Receipt
                        </div>
                        {balanceReceiptLoading ? (
                          <div className="text-secondary text-sm">Loading balance receipt…</div>
                        ) : balanceReceiptLoadFailed ? (
                          <div className="text-danger text-sm">Could not load balance receipt image.</div>
                        ) : resolvedBalanceReceiptUrl ? (
                          <button
                            type="button"
                            className="res-receipt-thumb-wrap"
                            onClick={() => setZoomedReceiptUrl(resolvedBalanceReceiptUrl)}
                            aria-label="View full size balance receipt"
                            title="Click to view full balance receipt"
                          >
                            <img
                              src={resolvedBalanceReceiptUrl}
                              alt="Balance Payment Receipt"
                              className="res-receipt-thumb-img"
                            />
                          </button>
                        ) : null}

                        {!res.balanceSettledAt && canManage && (
                          <div className="res-receipt-actions" style={{ marginTop: '0.4rem' }}>
                            {onVerifyBalancePayment && (
                              <button
                                type="button"
                                className="res-btn-primary"
                                style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                                onClick={() => onVerifyBalancePayment(res)}
                              >
                                Verify Balance Payment
                              </button>
                            )}
                            {onRejectBalanceReceipt && (
                              <button
                                type="button"
                                className="res-btn-outline"
                                style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                                onClick={() => onRejectBalanceReceipt(res)}
                              >
                                Reject Balance Receipt
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Section 5: Pickup Appointment & Location */}
              <section className="res-card-section" aria-labelledby="pickup-heading">
                <h3 id="pickup-heading" className="res-section-title">
                  <MapPin size={16} /> Pickup &amp; Appointment
                </h3>

                <div className="res-pickup-details-list">
                  <div className="res-pickup-detail-row">
                    <Calendar size={18} className="res-pickup-icon" />
                    <div>
                      <div><strong>Scheduled Date &amp; Time</strong></div>
                      <div className="text-secondary">
                        {(res.date || res.reservationDate)
                          ? `${parseDate(res.date || res.reservationDate).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })} at ${res.appointmentTime ? formatTimeLabel(res.appointmentTime) : parseDate(res.date || res.reservationDate).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })}`
                          : 'No appointment date set'}
                      </div>
                    </div>
                  </div>

                  <div className="res-pickup-detail-row">
                    <MapPin size={18} className="res-pickup-icon" />
                    <div>
                      <div><strong>{storeInfo?.storeName || 'Boutique Store'}</strong></div>
                      <div className="text-secondary" style={{ fontSize: '0.82rem' }}>
                        {storeInfo?.address || 'In-store boutique pickup'}
                      </div>
                    </div>
                  </div>

                  <div className="res-pickup-detail-row">
                    <Clock size={18} className="res-pickup-icon" />
                    <div>
                      <div><strong>Collection Window</strong></div>
                      <div className="text-secondary" style={{ fontSize: '0.82rem' }}>
                        {res.pickupDeadlineAt
                          ? `Deadline: ${formatManilaDateTime(res.pickupDeadlineAt)}`
                          : 'Collect within 3 open days once marked Ready'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Customer Reschedule Request Alert */}
                {pendingReschedule && (
                  <div className="res-reschedule-alert">
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#92400e' }}>
                      Customer requested to move appointment to:
                    </div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                      {pendingReschedule}
                    </div>
                    {canManage && onResolveReschedule && (
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <button
                          type="button"
                          className="res-btn-primary"
                          style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}
                          onClick={() => onResolveReschedule(res.id, true)}
                        >
                          Approve Move
                        </button>
                        <button
                          type="button"
                          className="res-btn-outline"
                          style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}
                          onClick={() => onResolveReschedule(res.id, false)}
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>

          {/* ── 3. FULL-WIDTH SECTION: EVIDENCE-BACKED AUDIT TIMELINE ── */}
          <section className="res-card-section" aria-labelledby="timeline-heading">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 id="timeline-heading" className="res-section-title">
                <Clock size={16} /> Order Timeline &amp; Activity Log ({timelineEvents.length})
              </h3>
              <button
                type="button"
                className="res-btn-subtle"
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                onClick={() => {
                  loadPayments();
                  loadLogs();
                }}
                title="Refresh timeline events"
              >
                <RefreshCw size={12} className={logsLoading ? 'loading-spin' : ''} /> Refresh
              </button>
            </div>

            {logsLoading && timelineEvents.length === 0 ? (
              <div className="text-secondary text-sm" style={{ padding: '1rem 0' }}>
                Loading activity history…
              </div>
            ) : logsError && timelineEvents.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem',
                  background: 'rgba(239, 68, 68, 0.06)',
                  color: '#dc2626',
                  fontSize: '0.82rem',
                  borderRadius: '6px',
                }}
              >
                <AlertTriangle size={16} />
                <span>{logsError}</span>
                <button
                  type="button"
                  className="res-btn-subtle"
                  style={{ marginLeft: 'auto', fontSize: '0.75rem' }}
                  onClick={loadLogs}
                >
                  Retry
                </button>
              </div>
            ) : timelineEvents.length === 0 ? (
              <div className="text-secondary text-sm" style={{ padding: '0.5rem 0' }}>
                No recorded history milestones yet.
              </div>
            ) : (
              <div className="res-timeline-container">
                {timelineEvents.map((evt) => (
                  <div key={evt.id} className="res-timeline-event">
                    <div className="res-timeline-node" aria-hidden="true" />
                    <div className="res-timeline-event-header">
                      <span className="res-timeline-event-time">
                        {formatManilaDateTime(evt.time)}
                      </span>
                      <span className="res-timeline-event-label">{evt.label}</span>
                      {evt.actor && (
                        <span className="res-timeline-event-actor">{evt.actor}</span>
                      )}
                    </div>
                    {evt.detail && (
                      <div className="res-timeline-event-detail">
                        {evt.detail}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── 4. STICKY ACTION FOOTER (Context-Sensitive) ─────────── */}
        <footer className="res-detail-footer">
          <div className="res-detail-footer-left">
            <button
              type="button"
              className="res-btn-outline"
              onClick={() => onMessage(res)}
            >
              <MessageSquare size={16} /> Message Customer
            </button>
          </div>

          <div className="res-detail-footer-right">
            {/* Primary Workflow Buttons */}
            {canManage && opStatus === 'To Pay' && res.paymentStatus === 'Paid' && (
              <button
                type="button"
                className="res-btn-primary"
                onClick={() => onAction(res.id, 'start_preparing')}
              >
                <Package size={16} /> Start Preparing
              </button>
            )}

            {canManage && opStatus === 'Preparing' && (
              <button
                type="button"
                className="res-btn-primary"
                onClick={() => onAction(res.id, 'ready_pickup')}
              >
                <CheckCircle size={16} /> Mark Ready for Pickup
              </button>
            )}

            {canManage && opStatus === 'To Pickup' && (
              <button
                type="button"
                className="res-btn-primary"
                disabled={currentBalance > 0}
                onClick={() => onAction(res.id, 'complete')}
                title={currentBalance > 0 ? 'Collect outstanding balance before handover' : 'Complete order handover'}
              >
                <CheckCircle size={16} /> Complete Handover
              </button>
            )}

            {/* Reschedule appointment button */}
            {canManage && CAN_RESCHEDULE_STATUSES.has(opStatus) && onReschedule && (
              <button
                type="button"
                className="res-btn-outline"
                onClick={() => onReschedule(res)}
              >
                <Calendar size={16} /> Reschedule
              </button>
            )}

            {/* Cancel order button */}
            {canManage && canCancelReservation(res) && (
              <button
                type="button"
                className="res-btn-danger-outline"
                onClick={() => onAction(res.id, 'cancel')}
              >
                <X size={16} /> Cancel Order
              </button>
            )}

            <button
              type="button"
              className="res-btn-outline"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </footer>
      </div>

      {/* Full-Screen Receipt Lightbox */}
      {zoomedReceiptUrl && (
        <div
          className="res-detail-modal-overlay"
          style={{ zIndex: 2100 }}
          role="dialog"
          aria-modal="true"
          aria-label="Enlarged receipt preview"
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              background: '#000000',
              padding: '1rem',
              borderRadius: '8px',
            }}
          >
            <button
              type="button"
              className="res-detail-close-btn"
              style={{ position: 'absolute', top: 12, right: 12, color: '#ffffff', background: 'rgba(0,0,0,0.5)' }}
              onClick={() => setZoomedReceiptUrl(null)}
              aria-label="Close zoom preview"
            >
              <X size={20} />
            </button>
            <img
              src={zoomedReceiptUrl}
              alt="Payment Receipt (Enlarged)"
              style={{ maxWidth: '85vw', maxHeight: '80vh', objectFit: 'contain' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ReservationDetailModal;
