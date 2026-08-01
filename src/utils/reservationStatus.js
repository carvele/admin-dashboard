/**
 * reservationStatus.js
 *
 * Single source of truth for reservation status values.
 *
 * These strings were previously duplicated as inline literals across
 * Dashboard, Analytics, Reservations and Customers — if one page's list drifted
 * from another's, reservations silently vanished from counts and revenue totals
 * with no error. Import from here instead of hardcoding.
 */

// Every status the app writes, in rough lifecycle order.
export const RESERVATION_STATUSES = [
  'Pending',
  'Request Approval',
  'To Pay',
  'Approved',
  'Confirmed',
  'To Pickup',
  'Active',
  'Completed',
  'Cancelled',
];

/** Awaiting staff action — shown as "pending requests". */
export const PENDING_STATUSES = ['Pending', 'Request Approval', 'To Pay'];

/** Terminal, did not happen. Excluded from every count that implies business. */
export const CANCELLED_STATUSES = ['Cancelled'];

/**
 * Statuses that represent committed business — i.e. the reservation was
 * approved and is progressing or finished. Used for lifetime-value revenue.
 * Deliberately excludes the pre-approval states (Pending / Request Approval)
 * and 'To Pay' (approved but money not yet taken), plus Cancelled.
 */
export const REVENUE_STATUSES = [
  'Approved',
  'Confirmed',
  'To Pickup',
  'Active',
  'Completed',
];

export const isCancelled = (status) => CANCELLED_STATUSES.includes(status);
export const isPending = (status) => PENDING_STATUSES.includes(status);

/**
 * Does this reservation count toward a customer's lifetime spend?
 * True when payment was actually taken, or when it reached a committed state.
 */
export const countsAsRevenue = (reservation) => {
  if (!reservation || isCancelled(reservation.status)) return false;
  if (reservation.payment_status === 'Paid' || reservation.paymentStatus === 'Paid') return true;
  return REVENUE_STATUSES.includes(reservation.status);
};
