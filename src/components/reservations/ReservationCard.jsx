/**
 * src/components/reservations/ReservationCard.jsx
 * One reservation on the board.
 *
 * Shows every line, not just the reservation's own product columns -- those
 * only ever describe the first item, so a multi-item reservation used to
 * read as if it held a single piece.
 */

import React from 'react';
import { Eye, Calendar, XCircle, MessageSquare } from 'lucide-react';
import { formatPaymentDeadline } from '../../utils/reservationDeadline';
import { PRIMARY_ACTION, isAwaitingReceipt } from '../../utils/reservationActions';
import { outstandingBalance } from '../../utils/reservationBalance';
import { formatProposedAppointment } from '../../utils/rescheduleRequest';
import { formatCurrency, formatTimeLabel } from '../../utils/helpers';

const initialsOf = (name) =>
  (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

const ReservationCard = ({ res, canManage, onView, onAction, onReschedule, onMessage, onResolveReschedule }) => {
  const primary = PRIMARY_ACTION[res.displayStatus];
  const deadline = formatPaymentDeadline(res.paymentDueAt);
  const lines = res.lines || [];
  const awaitingReceipt = isAwaitingReceipt(res);
  const balance = outstandingBalance(res);
  const pendingReschedule = formatProposedAppointment(res);

  return (
    <article className={`res-card${deadline?.urgent ? ' res-card-urgent' : ''}`}>
      <header className="res-card-head">
        <div className="res-card-who">
          <span className="res-card-avatar" aria-hidden="true">{initialsOf(res.displayName)}</span>
          <div>
            <p className="res-card-name">{res.displayName}</p>
            <p className="res-card-id">{res.displayId || res.id}</p>
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
          {res.displayDate?.toLocaleDateString?.('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })}
          {', '}
          {/* res.appointmentTime (the real scheduled time, already resolved to
              Asia/Manila) over reformatting displayDate: displayDate comes
              from the midnight-anchored `date` column, so a time derived from
              it is midnight reinterpreted in the browser's local timezone,
              not the actual appointment -- this showed 08:00 AM for a 1:00 PM
              booking on a Manila-zoned machine. */}
          {res.appointmentTime
            ? formatTimeLabel(res.appointmentTime)
            : res.displayDate?.toLocaleTimeString?.('en-PH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })}
        </span>
        {/* "Paid" alone was a half-truth on a deposit reservation: the webhook
            marks it paid once the 50% clears, so this read Paid while the rest
            was still owed at the counter. */}
        <span className={`res-card-total${balance > 0 ? ' res-card-balance' : ''}`}>
          {balance > 0
            ? `${formatCurrency(balance)} to collect`
            : res.paymentStatus === 'Paid'
              ? 'Paid in full'
              : awaitingReceipt
                ? 'Receipt to check'
                : ''}
        </span>
      </div>

      {res.confirmedByName && (
        <div className="res-card-staff-attribution" style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
          Accepted by <strong>{res.confirmedByName}</strong>
          {res.confirmedAt && ` on ${new Date(res.confirmedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })}`}
        </div>
      )}

      {/* A pending request sits above the actions, not in the meta row: it is
          work waiting on a decision, and the live booking above it still
          stands until someone answers. */}
      {pendingReschedule && (
        <div className="res-card-reschedule">
          <p className="res-card-reschedule-text">
            Wants to move to <strong>{pendingReschedule}</strong>
          </p>
          {canManage && (
            <div className="res-card-reschedule-actions">
              <button
                className="btn-primary res-card-reschedule-btn"
                onClick={() => onResolveReschedule(res.id, true)}
              >
                Approve
              </button>
              <button
                className="btn-outline res-card-reschedule-btn"
                onClick={() => onResolveReschedule(res.id, false)}
              >
                Decline
              </button>
            </div>
          )}
        </div>
      )}

      <footer className="res-card-actions">
        {canManage && primary && (
          <button
            className="btn-primary res-card-primary"
            onClick={() => onAction(res.id, primary.action)}
          >
            {awaitingReceipt ? 'Verify receipt' : primary.label}
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
            <button className="btn-outline res-card-icon" onClick={onReschedule} aria-label="Reschedule" title="Reschedule">
              <Calendar size={15} />
            </button>
            <button
              className="btn-outline res-card-icon"
              onClick={() => onAction(res.id, 'cancel')}
              aria-label="Cancel reservation"
              title="Cancel reservation"
            >
              <XCircle size={15} />
            </button>
          </>
        )}
      </footer>
    </article>
  );
};

export default ReservationCard;
