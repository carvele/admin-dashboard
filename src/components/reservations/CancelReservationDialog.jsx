/**
 * Staff cancellation with a mandatory customer-facing reason. The financial
 * outcome comes from preview_reservation_cancellation, never client math.
 */
import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { previewReservationCancellation } from '../../services/reservationService';
import { formatCurrency } from '../../utils/helpers';

const REASON_MAX = 500;

const OUTCOME_COPY = {
  no_payment: 'No payment recorded — nothing to refund.',
  refund_required: 'Paid amounts become a refund obligation (Refund Required).',
  refund_already_required: 'A refund is already required and stays open.',
  already_refunded: 'Payment was already refunded.',
  payment_in_progress: 'A payment is in progress — cancellation will be blocked until it finishes or expires.',
};

const CancelReservationDialog = ({ res, isOpen, submitting, onClose, onSubmit }) => {
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  useEffect(() => {
    if (!isOpen || !res?.docId) return undefined;
    let active = true;
    previewReservationCancellation(res.docId)
      .then((data) => { if (active) setPreview(data); })
      .catch((err) => { if (active) setPreviewError(err?.message || 'Could not load the financial outcome.'); });
    return () => { active = false; };
  }, [isOpen, res?.docId]);

  const trimmed = reason.trim();
  const canSubmit = Boolean(trimmed && !submitting && preview?.outcome !== 'payment_in_progress');
  const firstLine = res?.lines?.[0];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      dismissable={!submitting}
      stacked
      title="Cancel reservation?"
      maxWidth={520}
      footer={(
        <>
          <button type="button" className="btn-outline" onClick={onClose} disabled={submitting}>Keep reservation</button>
          <button
            type="submit"
            form="cancel-reservation-form"
            className="btn-primary"
            style={{ background: 'var(--color-danger, #c0392b)', borderColor: 'var(--color-danger, #c0392b)' }}
            disabled={!canSubmit}
          >
            {submitting ? 'Cancelling…' : 'Cancel reservation'}
          </button>
        </>
      )}
    >
      <form
        id="cancel-reservation-form"
        onSubmit={(e) => { e.preventDefault(); if (canSubmit) onSubmit(trimmed); }}
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
      >
        <dl className="res-dialog-summary">
          <div><dt>Customer</dt><dd>{res?.displayName || res?.customerName || 'Customer'}</dd></div>
          <div><dt>Item</dt><dd>{firstLine?.productName || res?.productName || '—'}{res?.lines?.length > 1 ? ` +${res.lines.length - 1} more` : ''}</dd></div>
          <div><dt>Current status</dt><dd>{res?.displayStatus || res?.status}</dd></div>
          <div><dt>Payment state</dt><dd>{res?.paymentStatus || '—'}</dd></div>
        </dl>

        <div className="form-group">
          <label className="label" htmlFor="cancel-reason">Reason shown to customer *</label>
          <textarea
            id="cancel-reason"
            className="input-field"
            rows={3}
            maxLength={REASON_MAX}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. The item was damaged and cannot be released."
            required
            style={{ resize: 'vertical' }}
          />
          <span className="form-hint">{reason.length}/{REASON_MAX} · Sent to the customer and shown on their reservation.</span>
        </div>

        <div className="res-dialog-note" role="status">
          <strong>Financial result</strong>
          <span>
            {previewError
              ? previewError
              : !preview
                ? 'Checking payments…'
                : `${OUTCOME_COPY[preview.outcome] || preview.outcome}${preview.paid_centavos > 0 ? ` Paid so far: ${formatCurrency(preview.paid_centavos / 100)}.` : ''}`}
          </span>
        </div>
      </form>
    </Modal>
  );
};

export default CancelReservationDialog;
