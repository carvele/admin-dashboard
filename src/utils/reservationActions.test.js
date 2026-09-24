import {
  canCancelReservation,
  isAwaitingReceipt,
  primaryActionFor,
} from './reservationActions';

describe('primaryActionFor', () => {
  it('does not let staff fabricate an unpaid payment', () => {
    expect(primaryActionFor({ displayStatus: 'To Pay', paymentStatus: 'Pending' })).toBeNull();
  });

  it('starts preparation only after payment is confirmed', () => {
    expect(primaryActionFor({ displayStatus: 'To Pay', paymentStatus: 'Paid' })).toEqual({
      action: 'start_preparing',
      label: 'Start preparing',
    });
  });

  it('routes submitted receipts to review', () => {
    const reservation = { displayStatus: 'To Pay', paymentStatus: 'Submitted' };
    expect(isAwaitingReceipt(reservation)).toBe(true);
    expect(primaryActionFor(reservation)?.action).toBe('review_receipt');
  });

  it('routes blocking change requests and pending extensions to review_request', () => {
    expect(primaryActionFor({ displayStatus: 'To Pickup', pendingRequest: { requestType: 'cancel_ready' } })).toEqual({
      action: 'review_request',
      label: 'Review request',
    });
    expect(primaryActionFor({ displayStatus: 'To Pickup', extensionStatus: 'pending' })).toEqual({
      action: 'review_request',
      label: 'Review request',
    });
    expect(primaryActionFor({ displayStatus: 'Preparing', pendingRequest: { requestType: 'reschedule' } })).toEqual({
      action: 'review_request',
      label: 'Review request',
    });
  });
});

describe('canCancelReservation', () => {
  it.each(['Paid', 'Submitted', 'Processing', 'Refund Required'])(
    'blocks ordinary cancellation for %s',
    (paymentStatus) => {
      expect(canCancelReservation({ paymentStatus })).toBe(false);
    },
  );

  it('allows an unpaid reservation to be cancelled', () => {
    expect(canCancelReservation({ paymentStatus: 'Pending' })).toBe(true);
  });

  it('safely handles null/undefined arguments across all helpers', () => {
    expect(isAwaitingReceipt(null)).toBe(false);
    expect(isAwaitingReceipt(undefined)).toBe(false);
    expect(primaryActionFor(null)).toBeNull();
    expect(primaryActionFor(undefined)).toBeNull();
    expect(canCancelReservation(null)).toBe(false);
    expect(canCancelReservation(undefined)).toBe(false);
  });
});
