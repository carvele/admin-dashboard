/**
 * Shared between the board (ReservationCard) and the List view table, so the
 * two views can't drift into showing different actions for the same status
 * -- which is exactly what happened before this file existed: the table
 * kept its own hand-written per-status button blocks after the board
 * introduced a single primary action per column.
 */

// One primary action per column: the common move is a single click, and
// everything rarer (cancel, reschedule) is secondary.
export const isAwaitingReceipt = (res) =>
  Boolean(
    res &&
    res.displayStatus === 'To Pay' &&
    ['submitted', 'processing'].includes(String(res.paymentStatus || '').toLowerCase()),
  );

export const primaryActionFor = (res) => {
  if (!res) return null;
  if (res.displayStatus === 'To Pay') {
    if (isAwaitingReceipt(res)) return { action: 'review_receipt', label: 'Verify receipt' };
    if (String(res.paymentStatus || '').toLowerCase() === 'paid') {
      return { action: 'start_preparing', label: 'Start preparing' };
    }
    return null;
  }
  if (res.displayStatus === 'Preparing') return { action: 'ready_pickup', label: 'Mark ready' };
  if (res.displayStatus === 'To Pickup') return { action: 'complete', label: 'Hand over' };
  return null;
};

// Pre-Ready only: once Ready, pickup extension is the one date-change workflow.
export const CAN_RESCHEDULE_STATUSES = new Set(['To Pay', 'Preparing']);

/** A pending customer reschedule/cancellation must be answered first. */
export const hasBlockingChangeRequest = (res) => Boolean(res?.pendingRequest);

/** Only legacy reservations with a real appointment can be moved. */
export const canRescheduleReservation = (res) =>
  Boolean(
    res &&
    CAN_RESCHEDULE_STATUSES.has(res.displayStatus) &&
    res.appointmentTime &&
    (res.date || res.reservationDate) &&
    !hasBlockingChangeRequest(res),
  );

export const canCancelReservation = (res) =>
  Boolean(
    res &&
    !['paid', 'submitted', 'processing', 'refund required'].includes(
      String(res.paymentStatus || '').toLowerCase(),
    ),
  );
