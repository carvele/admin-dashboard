/**
 * src/components/reservations/ReservationCard.jsx
 * One reservation on the board.
 *
 * Shows every line, not just the reservation's own product columns -- those
 * only ever describe the first item, so a multi-item reservation used to
 * read as if it held a single piece.
 */

import { Eye, Calendar, XCircle, MessageSquare } from 'lucide-react';
import { getActivePaymentDeadline } from '../../utils/reservationDeadline';
import {
  canCancelReservation,
  canRescheduleReservation,
  hasBlockingChangeRequest,
  isAwaitingReceipt,
  primaryActionFor,
} from '../../utils/reservationActions';
import { outstandingBalance } from '../../utils/reservationBalance';
import { formatProposedAppointment, hasPendingReadyCancellation } from '../../utils/rescheduleRequest';
import { formatCurrency, formatTimeLabel } from '../../utils/helpers';

const initialsOf = (name) =>
  (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

const ReservationCard = ({ res, canManage, busy = false, onView, onAction, onReschedule, onMessage }) => {
  const primary = primaryActionFor(res);
  const isCancelled =
    String(res.status || '').toLowerCase() === 'cancelled' ||
    String(res.displayStatus || '').toLowerCase() === 'cancelled' ||
    String(res.paymentStatus || '').toLowerCase() === 'cancelled';
  // payment_due_at is never cleared once paid -- it's the original deposit
  // deadline, not a pickup timer, so it has nothing meaningful to say once
  // payment is settled or cancelled (and would eventually read "Overdue" on a paid/cancelled item).
  const deadline = getActivePaymentDeadline(res);
  const lines = res.lines || [];
  const awaitingReceipt = isAwaitingReceipt(res);
  const balance = outstandingBalance(res);
  const pendingReschedule = formatProposedAppointment(res);
  const blockingRequest = hasBlockingChangeRequest(res);

  return (
    <article className={`res-card${deadline?.urgent ? ' res-card-urgent' : ''}`}>
      <header className="res-card-head">
        <div className="res-card-who">
          <span className="res-card-avatar" aria-hidden="true">{initialsOf(res.displayName)}</span>
          <div>
            <p className="res-card-name">{res.displayName}</p>
            <p className="res-card-id">{res.displayId ? `Booking ${res.displayId}` : 'Booking reference pending'}</p>
          </div>
        </div>
        {deadline ? (
          <span className={`res-chip ${deadline.urgent ? 'res-chip-danger' : 'res-chip-warning'}`}>
            {deadline.label}
          </span>
        ) : lines.length > 1 ? (
          <span className="res-chip res-chip-accent">{lines.length} items</span>
        ) : null}
      </header>

      <ul className="res-card-lines">
        {lines.map((line, index) => (
          <li key={line.id ?? `${line.productId}-${index}`}>
            <span className="res-card-line-name">
              {line.productName || 'Unnamed item'}
              {line.size ? `, ${line.size}` : ''}
            </span>
            <span className="res-card-line-qty">x{line.quantity ?? 1}</span>
          </li>
        ))}
      </ul>

      <div className="res-card-meta">
        <span>
          {res.pickupDeadlineAt ? (
            <>Collect by {res.pickupDeadlineAt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })} • {res.pickupDeadlineAt.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })}</>
          ) : (res.displayDate && (res.appointmentTime || res.date)) ? (
            <>
              {res.displayDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })}
              {', '}
              {res.appointmentTime
                ? formatTimeLabel(res.appointmentTime)
                : res.displayDate.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })}
            </>
          ) : (
            <>Pickup in 3 open days once Ready</>
          )}
        </span>
        {/* "Paid" alone was a half-truth on a deposit reservation: the webhook
            marks it paid once the 50% clears, so this read Paid while the rest
            was still owed at the counter. */}
        <span className={`res-card-total${balance > 0 ? ' res-card-balance' : ''}`}>
          {balance > 0
            ? (res.balancePaymentStatus === 'submitted' ? 'Balance proof to check' : `${formatCurrency(balance)} to collect`)
            // Refund state takes precedence over the operational status --
            // a reservation stays 'Completed' after a return per the
            // canonical lifecycle, but that must never read as a plain
            // successful sale once the money has moved.
            : res.paymentStatus === 'Refunded'
              ? 'Refunded'
              : res.paymentStatus === 'Refund Required'
                ? 'Refund Required'
                : res.paymentStatus === 'Paid'
                  ? 'Paid in full'
                  : isCancelled
                    ? 'Cancelled'
                    : awaitingReceipt
                      ? 'Receipt to check'
                      : ''}
        </span>
      </div>

      {res.confirmedByName && (
        <div className="res-card-staff-attribution" style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: 'var(--spacing-xs)' }}>
          Accepted by <strong>{res.confirmedByName}</strong>
          {res.confirmedAt && ` on ${new Date(res.confirmedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })}`}
        </div>
      )}

      {/* A pending request sits above the actions, not in the meta row: it is
          work waiting on a decision, and the live booking above it still
          stands until someone answers. */}
      {blockingRequest && (
        <div className="res-card-reschedule">
          <p className="res-card-reschedule-text">
            {hasPendingReadyCancellation(res)
              ? <>Customer asked to <strong>cancel</strong> this order</>
              : <>Wants to move to <strong>{pendingReschedule}</strong></>}
          </p>
          {canManage && (
            <div className="res-card-reschedule-actions">
              <button className="btn-primary res-card-reschedule-btn" onClick={onView}>
                Review request
              </button>
            </div>
          )}
        </div>
      )}

      <footer className="res-card-actions">
        {canManage && primary && (
          <button
            className="btn-primary res-card-primary"
            disabled={busy}
            // A submitted-receipt reservation used to mutate payment the
            // instant this button was clicked,
            // just relabeled "Verify receipt" -- so staff could mark a
            // payment verified without the receipt image ever having been
            // opened. Now opens the detail modal instead, where the receipt
            // renders next to its own dedicated Verify Payment button.
            onClick={() => (primary.action === 'review_receipt' || res.balancePaymentStatus === 'submitted' || blockingRequest ? onView() : onAction(res.id, primary.action))}
          >
            {awaitingReceipt ? 'Verify receipt' : res.balancePaymentStatus === 'submitted' ? 'Verify balance proof' : primary.label}
          </button>
        )}
        <button className="btn-outline res-card-icon" onClick={onView} aria-label="View details" title="View details">
          <Eye size={15} />
        </button>
        <button className="btn-outline res-card-icon" onClick={onMessage} aria-label="Message buyer" title="Message buyer">
          <MessageSquare size={15} />
        </button>
        {canManage && (
          <>
            {canRescheduleReservation(res) && (
              <button className="btn-outline res-card-icon" onClick={onReschedule} disabled={busy} aria-label="Reschedule" title="Reschedule">
                <Calendar size={15} />
              </button>
            )}
            {canCancelReservation(res) && (
              <button
                className="btn-outline res-card-icon"
                onClick={() => onAction(res.id, 'cancel')}
                aria-label="Cancel reservation"
                title="Cancel reservation"
              >
                <XCircle size={15} />
              </button>
            )}
          </>
        )}
      </footer>
    </article>
  );
};

export default ReservationCard;
