/**
 * src/components/reservations/ReservationCard.jsx
 * One reservation on the board.
 *
 * Shows every line, not just the reservation's own product columns -- those
 * only ever describe the first item, so a multi-item reservation used to
 * read as if it held a single piece.
 */

import React from 'react';
import { Eye, Calendar, XCircle } from 'lucide-react';
import { formatPaymentDeadline } from '../../utils/reservationDeadline';
import { PRIMARY_ACTION, isAwaitingReceipt } from '../../utils/reservationActions';

const initialsOf = (name) =>
  (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

const ReservationCard = ({ res, canManage, onView, onAction, onReschedule }) => {
  const primary = PRIMARY_ACTION[res.displayStatus];
  const deadline = formatPaymentDeadline(res.paymentDueAt);
  const lines = res.lines || [];
  const awaitingReceipt = isAwaitingReceipt(res);

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
          {res.displayDate?.toLocaleDateString?.([], { month: 'short', day: 'numeric' })}
          {', '}
          {res.displayDate?.toLocaleTimeString?.([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span className="res-card-total">
          {res.paymentStatus === 'Paid' ? 'Paid' : awaitingReceipt ? 'Receipt to check' : ''}
        </span>
      </div>

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
