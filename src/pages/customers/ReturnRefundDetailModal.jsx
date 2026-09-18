import { useState, useEffect } from 'react';
import {
  X,
  CheckCircle,
  Clock,
  Image as ImageIcon,
  ExternalLink,
  DollarSign,
  User,
  Package,
  ShieldAlert,
  HelpCircle,
} from 'lucide-react';
import { reviewReturnRefundRequest, getSignedEvidenceUrl } from '../../services/reservationService';
import { formatCurrency } from '../../utils/helpers';
import { toast } from 'sonner';

const REASON_LABELS = {
  size_fit: 'Size / Fit Issue',
  damaged_defective: 'Damaged or Defective',
  wrong_item: 'Wrong Item Sent',
  not_as_described: 'Not as Described',
  changed_mind: 'Changed Mind',
  other: 'Other',
};

const formatManilaDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleString('en-PH', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch (_e) {
    return dateStr;
  }
};

export default function ReturnRefundDetailModal({
  request,
  isOpen,
  onClose,
  onRefresh,
  onDisburse,
  canDisburse = false,
}) {
  const [evidenceUrl, setEvidenceUrl] = useState(null);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Review action state
  const [actionLoading, setActionLoading] = useState(false);
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const [showApproveBox, setShowApproveBox] = useState(false);
  const [approveNotes, setApproveNotes] = useState('');

  useEffect(() => {
    if (!isOpen || !request) {
      setEvidenceUrl(null);
      setShowRejectBox(false);
      setShowApproveBox(false);
      setRejectNotes('');
      setApproveNotes('');
      return;
    }

    if (request.photoPath) {
      setLoadingEvidence(true);
      getSignedEvidenceUrl(request.photoPath, 900)
        .then((url) => setEvidenceUrl(url))
        .catch((err) => {
          console.error('Failed to load signed evidence URL:', err);
          setEvidenceUrl(null);
        })
        .finally(() => setLoadingEvidence(false));
    } else {
      setEvidenceUrl(null);
    }
  }, [isOpen, request]);

  if (!isOpen || !request) return null;

  const res = request.reservations || {};
  const items = res.reservationItems || res.reservation_items || [];
  const customer = request.customer || {};
  const reviewer = request.reviewer || {};
  const underReviewer = request.underReviewer || request.under_reviewer || {};

  // Payments and refund liability info
  const payments = res.payments || [];
  const paidPayments = payments.filter((p) => p.status === 'paid');
  const totalPaidCentavos = paidPayments.reduce((sum, p) => sum + (p.amountCentavos || p.amount_centavos || 0), 0);
  const totalPaidPesos = totalPaidCentavos / 100;

  const disbursedPayment = payments.find((p) => p.refundDisbursedAt || p.refund_disbursed_at);

  const handleMarkUnderReview = async () => {
    setActionLoading(true);
    try {
      await reviewReturnRefundRequest(request.id, 'under_review');
      toast.success('Request marked as Under Review.');
      if (onRefresh) await onRefresh();
    } catch (err) {
      console.error('Error updating status to under_review:', err);
      toast.error(err.message || 'Failed to update status.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      await reviewReturnRefundRequest(request.id, 'approve', approveNotes.trim() || null);
      toast.success('Return request approved. Reservation moved to Refund Required.');
      setShowApproveBox(false);
      if (onRefresh) await onRefresh();
    } catch (err) {
      console.error('Error approving return request:', err);
      toast.error(err.message || 'Failed to approve request.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectNotes.trim()) {
      toast.error('Rejection reason is required.');
      return;
    }
    setActionLoading(true);
    try {
      await reviewReturnRefundRequest(request.id, 'reject', rejectNotes.trim());
      toast.success('Return request rejected.');
      setShowRejectBox(false);
      if (onRefresh) await onRefresh();
    } catch (err) {
      console.error('Error rejecting return request:', err);
      toast.error(err.message || 'Failed to reject request.');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'submitted':
        return <span className="badge badge-warning flex-center gap-1"><Clock size={12} /> Submitted</span>;
      case 'under_review':
        return <span className="badge badge-info flex-center gap-1"><HelpCircle size={12} /> Under Review</span>;
      case 'approved':
        return <span className="badge badge-purple flex-center gap-1"><CheckCircle size={12} /> Approved — Awaiting Refund</span>;
      case 'rejected':
        return <span className="badge badge-danger flex-center gap-1"><X size={12} /> Rejected</span>;
      case 'refunded':
        return <span className="badge badge-success flex-center gap-1"><DollarSign size={12} /> Refunded</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  };

  return (
    <div
      className="modal-overlay"
      role="button"
      tabIndex={0}
      aria-label="Close dialog"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="return-refund-dialog-title"
        style={{ maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="modal-header d-flex justify-between align-center">
          <div>
            <h3 id="return-refund-dialog-title" style={{ margin: 0, fontSize: '1.25rem' }}>Return / Refund Request</h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Booking {res.displayId || res.display_id || res.id} &bull; Submitted {formatManilaDate(request.submittedAt || request.submitted_at)}
            </p>
          </div>
          <div className="d-flex align-center gap-2">
            {getStatusBadge(request.status)}
            <button className="btn-icon" onClick={onClose} aria-label="Close modal">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Status Alert Banners */}
          {request.status === 'approved' && (
            <div
              style={{
                backgroundColor: 'var(--status-fitting-bg, #f3e8ff)',
                color: 'var(--status-fitting-text, #6b21a8)',
                padding: '0.875rem 1rem',
                borderRadius: '8px',
                border: '1px solid #d8b4fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle size={18} />
                <div>
                  <strong>Approved Return — Refund Liability Active</strong>
                  <div style={{ fontSize: '0.8rem' }}>
                    Payment status is <em>Refund Required</em>. Total refundable: {formatCurrency(totalPaidPesos || res.totalAmount || res.total_amount || 0)}.
                  </div>
                </div>
              </div>
              {canDisburse && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                  onClick={() => {
                    onClose();
                    if (onDisburse) onDisburse(res);
                  }}
                >
                  Disburse Refund
                </button>
              )}
            </div>
          )}

          {request.status === 'rejected' && (
            <div
              style={{
                backgroundColor: 'var(--status-cancelled-bg, #fee2e2)',
                color: 'var(--status-cancelled-text, #991b1b)',
                padding: '0.875rem 1rem',
                borderRadius: '8px',
                border: '1px solid #fca5a5',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '4px' }}>
                <ShieldAlert size={18} />
                <strong>Request Rejected</strong>
              </div>
              <div style={{ fontSize: '0.85rem' }}>
                <strong>Reason / Notes:</strong> {request.resolutionNotes || request.resolution_notes || 'No reason specified'}
              </div>
            </div>
          )}

          {request.status === 'refunded' && (
            <div
              style={{
                backgroundColor: 'var(--status-completed-bg, #dcfce7)',
                color: 'var(--status-completed-text, #166534)',
                padding: '0.875rem 1rem',
                borderRadius: '8px',
                border: '1px solid #86efac',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '4px' }}>
                <DollarSign size={18} />
                <strong>Refund Completed & Disbursed</strong>
              </div>
              <div style={{ fontSize: '0.85rem' }}>
                Disbursed on {formatManilaDate(disbursedPayment?.refundDisbursedAt || disbursedPayment?.refund_disbursed_at || request.updatedAt || request.updated_at)}.
                {disbursedPayment?.refundReferenceNumber && (
                  <span> Ref: <code>{disbursedPayment.refundReferenceNumber}</code> ({disbursedPayment.refundDisbursementMethod || 'N/A'})</span>
                )}
              </div>
            </div>
          )}

          {/* Customer & Reservation Info Card */}
          <div className="card" style={{ padding: '1rem', background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <span className="detail-label"><User size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> Customer</span>
                <p style={{ margin: '4px 0 0', fontWeight: 600 }}>{customer.fullName || customer.full_name || res.customerName || res.customer_name || 'Guest'}</p>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{customer.email || 'No email'}</p>
                {customer.phone && <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{customer.phone}</p>}
              </div>
              <div>
                <span className="detail-label"><Package size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> Reservation</span>
                <p style={{ margin: '4px 0 0', fontWeight: 600 }}>ID: {res.displayId || res.display_id || res.id}</p>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Status: <strong>{res.status}</strong> &bull; Total: <strong>{formatCurrency(res.totalAmount || res.total_amount || 0)}</strong>
                </p>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Settled Paid: <strong>{formatCurrency(totalPaidPesos)}</strong>
                </p>
              </div>
            </div>
          </div>

          {/* Claim Details */}
          <div>
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', fontWeight: 600 }}>Return Claim Details</h4>
            <div style={{ background: 'var(--beige)', padding: '0.875rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <span className="detail-label">Reason Category:</span>{' '}
                <strong style={{ textTransform: 'capitalize' }}>
                  {REASON_LABELS[request.reasonCategory || request.reason_category] || (request.reasonCategory || request.reason_category)}
                </strong>
              </div>
              <div>
                <span className="detail-label">Customer Explanation:</span>
                <p style={{ margin: '4px 0 0', fontSize: '0.875rem', lineHeight: '1.4', whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
                  {request.details || <em>No additional explanation provided.</em>}
                </p>
              </div>
            </div>
          </div>

          {/* Photo Evidence */}
          <div>
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ImageIcon size={16} /> Photo Evidence
            </h4>
            {loadingEvidence ? (
              <div style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading secure evidence photo…</div>
            ) : evidenceUrl ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <button
                  type="button"
                  style={{
                    position: 'relative',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: '1px solid var(--border-color)',
                    width: '140px',
                    height: '140px',
                    backgroundColor: '#000',
                    padding: 0,
                  }}
                  onClick={() => setLightboxOpen(true)}
                  title="Click to zoom evidence photo"
                  aria-label="Zoom evidence photo"
                >
                  <img
                    src={evidenceUrl}
                    alt="Return claim proof"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      bottom: '4px',
                      right: '4px',
                      backgroundColor: 'rgba(0,0,0,0.65)',
                      color: '#fff',
                      fontSize: '0.7rem',
                      padding: '2px 4px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px',
                    }}
                  >
                    <ExternalLink size={10} /> View
                  </span>
                </button>
                <div style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <p style={{ margin: 0 }}>Secure photo attached by customer during return request submission.</p>
                  <p style={{ margin: '4px 0 0' }}>Click thumbnail to preview in full resolution.</p>
                </div>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                No photo evidence uploaded for this request.
              </p>
            )}
          </div>

          {/* Purchased Items List */}
          {items.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', fontWeight: 600 }}>Purchased Order Items ({items.length})</h4>
              <div className="table-container" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                <table className="data-table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Variant</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const prod = item.products || {};
                      return (
                        <tr key={item.id || idx}>
                          <td style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {prod.imageUrl || prod.image_url ? (
                              <img
                                src={prod.imageUrl || prod.image_url}
                                alt={prod.name || 'Product'}
                                style={{ width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover' }}
                              />
                            ) : (
                              <Package size={16} className="text-secondary" />
                            )}
                            <span style={{ fontWeight: 500 }}>{prod.name || 'Custom Item'}</span>
                          </td>
                          <td>
                            {item.size || 'Std'}
                            {item.color ? ` / ${item.color}` : ''}
                          </td>
                          <td>{item.quantity || 1}</td>
                          <td>{formatCurrency(item.unitPrice || item.unit_price || 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Audit Timeline */}
          <div>
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', fontWeight: 600 }}>Lifecycle History</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <div>&bull; <strong>Submitted:</strong> {formatManilaDate(request.submittedAt || request.submitted_at)}</div>
              {(request.underReviewAt || request.under_review_at) && (
                <div>
                  &bull; <strong>Under Review:</strong> {formatManilaDate(request.underReviewAt || request.under_review_at)}
                  {(underReviewer.fullName || underReviewer.full_name) && (
                    <span> by {underReviewer.fullName || underReviewer.full_name}</span>
                  )}
                </div>
              )}
              {(request.reviewedAt || request.reviewed_at) && (
                <div>
                  &bull; <strong>Reviewed:</strong> {formatManilaDate(request.reviewedAt || request.reviewed_at)}
                  {(reviewer.fullName || reviewer.full_name) && (
                    <span> by {reviewer.fullName || reviewer.full_name}</span>
                  )}
                  {request.resolutionNotes && (
                    <span> &mdash; <em>&ldquo;{request.resolutionNotes}&rdquo;</em></span>
                  )}
                </div>
              )}
              {disbursedPayment?.refundDisbursedAt && (
                <div>
                  &bull; <strong>Disbursed:</strong> {formatManilaDate(disbursedPayment.refundDisbursedAt)}
                  {disbursedPayment.refundReferenceNumber && (
                    <span> (Ref: {disbursedPayment.refundReferenceNumber})</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action Decision Boxes */}
          {showApproveBox && (
            <div style={{ background: 'var(--status-fitting-bg, #f5f3ff)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem' }}>
              <h5 style={{ margin: '0 0 0.5rem', color: 'var(--status-fitting-text, #5b21b6)', fontSize: '0.9rem' }}>Confirm Return Approval</h5>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                Approving this return will transition reservation payment status to <strong>Refund Required</strong> and mark paid payments for refund.
              </p>
              <textarea
                className="input-field"
                rows={2}
                placeholder="Optional resolution notes (e.g. Returned to store, tag intact)"
                value={approveNotes}
                onChange={(e) => setApproveNotes(e.target.value)}
                style={{ width: '100%', marginBottom: '0.5rem', fontSize: '0.85rem' }}
                disabled={actionLoading}
              />
              <div className="d-flex justify-end gap-2">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setShowApproveBox(false)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleApprove}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Approving…' : 'Confirm Approval'}
                </button>
              </div>
            </div>
          )}

          {showRejectBox && (
            <div style={{ background: 'var(--status-cancelled-bg, #fef2f2)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem' }}>
              <h5 style={{ margin: '0 0 0.5rem', color: 'var(--status-cancelled-text, #991b1b)', fontSize: '0.9rem' }}>Reject Return Request</h5>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                A rejection reason is <strong>mandatory</strong> and will be saved in the permanent ledger.
              </p>
              <textarea
                className="input-field"
                rows={2}
                placeholder="Explain why this return is rejected (e.g. Item worn/damaged by customer, past return window)"
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                style={{ width: '100%', marginBottom: '0.5rem', fontSize: '0.85rem' }}
                disabled={actionLoading}
              />
              <div className="d-flex justify-end gap-2">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setShowRejectBox(false)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={handleReject}
                  disabled={actionLoading || !rejectNotes.trim()}
                >
                  {actionLoading ? 'Rejecting…' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer d-flex justify-between align-center">
          <div>
            <button type="button" className="btn-outline" onClick={onClose}>
              Close
            </button>
          </div>

          <div className="d-flex gap-2">
            {request.status === 'submitted' && !showApproveBox && !showRejectBox && (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleMarkUnderReview}
                  disabled={actionLoading}
                >
                  Mark Under Review
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => setShowRejectBox(true)}
                  disabled={actionLoading}
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setShowApproveBox(true)}
                  disabled={actionLoading}
                >
                  Approve Return
                </button>
              </>
            )}

            {request.status === 'under_review' && !showApproveBox && !showRejectBox && (
              <>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => setShowRejectBox(true)}
                  disabled={actionLoading}
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setShowApproveBox(true)}
                  disabled={actionLoading}
                >
                  Approve Return
                </button>
              </>
            )}

            {request.status === 'approved' && canDisburse && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  onClose();
                  if (onDisburse) onDisburse(res);
                }}
              >
                Disburse Refund
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Full Size Lightbox for Evidence Photo */}
      {lightboxOpen && evidenceUrl && (
        <div
          className="modal-overlay"
          role="button"
          tabIndex={0}
          aria-label="Close image preview"
          style={{ zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.85)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setLightboxOpen(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
              setLightboxOpen(false);
            }
          }}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '0',
                background: 'transparent',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
              }}
              aria-label="Close image preview"
            >
              <X size={28} />
            </button>
            <img
              src={evidenceUrl}
              alt="Full size evidence preview"
              style={{
                maxWidth: '100%',
                maxHeight: '85vh',
                objectFit: 'contain',
                borderRadius: '8px',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
