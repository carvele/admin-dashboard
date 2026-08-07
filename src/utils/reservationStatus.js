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
 * Statuses where the sale has actually been earned.
 *
 * Revenue is recognised when the performance obligation is satisfied -- when
 * control of the item passes to the customer -- which for reserve-and-collect
 * is the handover, not the deposit. A deposit is a liability until then, not
 * income. That is the IFRS 15 / ASC 606 position and the ordinary retail one.
 *
 * Only 'Completed' qualifies, which conveniently makes cash and accrual agree:
 * by the time staff hand the item over the balance has been collected in
 * person, so the full price is both earned and received. Nothing here depends
 * on recording that collection separately.
 */
export const EARNED_STATUSES = ['Completed'];

/**
 * Approved and progressing, but not yet earned. This is pipeline, not revenue.
 * Kept separate so a future "committed business" figure has somewhere honest to
 * come from rather than being folded back into lifetime spend.
 */
export const COMMITTED_STATUSES = [
  'Approved',
  'Confirmed',
  'To Pickup',
  'Fitting',
  'Active',
];

/**
 * Statuses that hold physical stock.
 *
 * This existed as two disagreeing definitions: recalculateAllInventoryStock
 * counted Pending as holding stock, while adjustStockForReservation only ever
 * moved stock at 'To Pickup'. Running the sync and running the lifecycle
 * therefore produced different numbers for the same reality, which is how a
 * unit ended up reserved against a reservation that had already been cancelled.
 *
 * Stock is held from approval onward: once staff accept a request the item is
 * promised to that customer, so it must stop being sellable even though payment
 * has not landed yet. Pending is deliberately excluded -- an unvetted request
 * must never be able to lock stock, or a burst of requests would empty the
 * shelf without a single approval.
 *
 * 'To Pay' is the display label for stored 'Confirmed', but older rows may
 * carry it literally; 'Fitting' and 'Active' are legacy mid-flow states. All
 * are included so historical rows reconcile correctly.
 */
export const STOCK_HOLDING_STATUSES = [
  'Approved',
  'Confirmed',
  'To Pay',
  'To Pickup',
  'Fitting',
  'Active',
];

/** Does this status currently hold a unit out of sellable stock? */
export const holdsStock = (status) => STOCK_HOLDING_STATUSES.includes(status);

export const isCancelled = (status) => CANCELLED_STATUSES.includes(status);
export const isPending = (status) => PENDING_STATUSES.includes(status);

const normalise = (status) =>
  String(status ?? '')
    .trim()
    .toLowerCase();

/**
 * Does this reservation count toward a customer's lifetime spend?
 *
 * Only once it has been handed over. This used to return true the moment
 * payment_status was 'Paid', which the payment webhook sets as soon as the 50%
 * *deposit* clears -- so a customer who had paid 945 of 1890 had the full 1890
 * added to their lifetime spend, and the >50,000 "high value" flag on the
 * Customers page was reachable on money that had neither been earned nor
 * received.
 *
 * Approved-and-progressing reservations are pipeline, not spend. They are in
 * COMMITTED_STATUSES if a separate figure is ever wanted for them.
 */
export const countsAsRevenue = (reservation) => {
  if (!reservation) return false;
  return EARNED_STATUSES.some((s) => normalise(s) === normalise(reservation.status));
};

/** Approved and in progress, but not yet earned. */
export const isCommitted = (reservation) => {
  if (!reservation) return false;
  return COMMITTED_STATUSES.some((s) => normalise(s) === normalise(reservation.status));
};
