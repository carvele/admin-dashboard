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
});
