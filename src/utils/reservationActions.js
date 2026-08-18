/**
 * Shared between the board (ReservationCard) and the List view table, so the
 * two views can't drift into showing different actions for the same status
 * -- which is exactly what happened before this file existed: the table
 * kept its own hand-written per-status button blocks after the board
 * introduced a single primary action per column.
 */

// One primary action per column: the common move is a single click, and
// everything rarer (cancel, reschedule) is secondary.
export const PRIMARY_ACTION = {
  Pending: { action: 'approve_pay', label: 'Approve' },
  'To Pay': { action: 'mark_paid', label: 'Mark paid' },
  Preparing: { action: 'ready_pickup', label: 'Mark ready' },
  'To Pickup': { action: 'complete', label: 'Hand over' },
};

export const CAN_RESCHEDULE_STATUSES = new Set(['Pending', 'To Pay', 'Preparing', 'To Pickup']);

export const isAwaitingReceipt = (res) =>
  res.displayStatus === 'To Pay' &&
  (res.paymentStatus === 'Submitted' || res.paymentStatus === 'Processing');
