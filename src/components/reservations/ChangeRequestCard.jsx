/**
 * A pending customer change request, shown prominently in reservation
 * details. Approve/Decline are the only way to answer it; handover and direct
 * reschedule stay blocked server-side until it is resolved.
 */
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatManilaSlot } from '../../utils/rescheduleRequest';

const ChangeRequestCard = ({ request, currentAppointment, canManage, busy, onResolve }) => {
  const [note, setNote] = useState('');
  if (!request) return null;
  const isReschedule = request.requestType === 'reschedule';
  const isExtension = request.requestType === 'extension';

  const resolve = (approve) => onResolve(request, approve, note.trim() || null);

  return (
    <section className="res-change-request" aria-labelledby="change-request-heading">
      <p className="res-change-request-eyebrow">Customer request</p>
      <h3 id="change-request-heading" className="res-change-request-title">
        <AlertTriangle size={16} aria-hidden="true" />
        {isReschedule
          ? 'Reschedule requested'
          : isExtension
            ? 'Pickup extension requested'
            : 'Cancellation requested'}
      </h3>

      <dl className="res-dialog-summary">
        {isReschedule && (
          <>
            <div><dt>Current appointment</dt><dd>{formatManilaSlot(currentAppointment) || '—'}</dd></div>
            <div><dt>Requested appointment</dt><dd>{formatManilaSlot(request.requestedFor)}</dd></div>
          </>
        )}
        {isExtension && (
          <div>
            <dt>Requested extension</dt>
            <dd>Extend pickup window by 1 day</dd>
          </div>
        )}
        <div><dt>Reason</dt><dd className="res-change-request-reason">&ldquo;{request.reason}&rdquo;</dd></div>
        <div><dt>Requested</dt><dd>{formatManilaSlot(request.createdAt)}</dd></div>
        {!isReschedule && !isExtension && (
          <div>
            <dt>Financial policy</dt>
            <dd>Paid amounts will be forfeited if this cancellation is approved.</dd>
          </div>
        )}
      </dl>

      {canManage && (
        <>
          <label className="label" htmlFor="change-request-note">Note to customer (optional)</label>
          <textarea
            id="change-request-note"
            className="input-field"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
            style={{ resize: 'vertical' }}
          />
          <div className="res-change-request-actions">
            <button type="button" className="res-btn-outline" disabled={busy} onClick={() => resolve(false)}>
              Decline
            </button>
            <button
              type="button"
              className={isReschedule || isExtension ? 'res-btn-primary' : 'res-btn-danger-outline'}
              disabled={busy}
              onClick={() => resolve(true)}
            >
              {busy ? 'Working…' : isReschedule ? 'Approve' : isExtension ? 'Approve extension' : 'Approve cancellation'}
            </button>
          </div>
        </>
      )}
    </section>
  );
};

export default ChangeRequestCard;
