/**
 * src/components/ReservationStatusBadge.jsx
 * Reservation status badge — separate from inventory/StatusBadge.jsx, which
 * is keyed on the stock-tier vocabulary (No Stock/Critical/Low/Healthy) and
 * fell back to '?' for every reservation status, since none of them match.
 *
 * Reuses StatusBadge.css's class-name convention (status-{slug}) so the
 * existing color rules for pending/completed/cancelled/etc still apply.
 */

import React from 'react';
import './StatusBadge.css';

/**
 * @param {string} status - One of the displayStatus strings Reservations.jsx
 *   produces: Pending, To Pay, Preparing, To Pickup, Completed, Cancelled.
 */
const getReservationStatusIcon = (status) => {
  switch (status) {
    case 'Pending':
      return '⏳';
    case 'To Pay':
      return '💳';
    case 'Preparing':
      return '🧵';
    case 'To Pickup':
      return '📦';
    case 'Completed':
      return '✓';
    case 'Cancelled':
      return '✕';
    default:
      return '•';
  }
};

const ReservationStatusBadge = ({ status, showLabel = true }) => {
  if (!status) return null;

  const icon = getReservationStatusIcon(status);
  const ariaLabel = `Status: ${status}`;

  return (
    <span
      className={`status-badge status-${status.toLowerCase().replace(/\s+/g, '-')}`}
      role="status"
      aria-label={ariaLabel}
    >
      <span className="status-icon" aria-hidden="true">
        {icon}
      </span>
      {showLabel && (
        <span className="status-label">{status}</span>
      )}
    </span>
  );
};

export default ReservationStatusBadge;
