import { presentationStatus, rescheduleModalTitle } from './reservationStatus';

describe('presentationStatus (RES-002)', () => {
  test('a refunded reservation presents as Refunded regardless of operational status', () => {
    expect(presentationStatus({ displayStatus: 'Completed', paymentStatus: 'Refunded' })).toBe('Refunded');
    expect(presentationStatus({ displayStatus: 'Cancelled', paymentStatus: 'Refunded' })).toBe('Refunded');
  });

  test('handles the raw snake_case payment_status field too', () => {
    expect(presentationStatus({ displayStatus: 'Completed', payment_status: 'Refunded' })).toBe('Refunded');
  });

  test('a pending refund keeps the operational status -- the extra warning chip carries that state', () => {
    expect(presentationStatus({ displayStatus: 'Completed', paymentStatus: 'Refund Required' })).toBe('Completed');
  });

  test('falls through to the operational status otherwise', () => {
    expect(presentationStatus({ displayStatus: 'To Pickup', paymentStatus: 'Paid' })).toBe('To Pickup');
  });

  test('null reservation is undefined, not a throw', () => {
    expect(presentationStatus(null)).toBeUndefined();
  });
});

describe('rescheduleModalTitle (RES-001)', () => {
  test('customer name and display id together', () => {
    expect(rescheduleModalTitle({ customerName: 'Carl Vener Wee', displayId: 'RES-12345', id: 'a1b2c3d4-full-uuid' }))
      .toBe('Reschedule Carl Vener Wee (RES-12345)');
  });

  test('never falls back to the full UUID when a display id is missing', () => {
    const title = rescheduleModalTitle({ customerName: 'Carl Vener Wee', id: 'a1b2c3d4-e5f6-7890-full-uuid' });
    expect(title).toBe('Reschedule Carl Vener Wee (a1b2c3d4)');
    expect(title).not.toContain('a1b2c3d4-e5f6-7890-full-uuid');
  });

  test('no display id and no name derives a short id from the raw id', () => {
    expect(rescheduleModalTitle({ id: 'a1b2c3d4-e5f6-7890-full-uuid' })).toBe('Reschedule a1b2c3d4');
  });

  test('nothing to work with falls back to the neutral label', () => {
    expect(rescheduleModalTitle({})).toBe('Reschedule Reservation');
    expect(rescheduleModalTitle(null)).toBe('Reschedule Reservation');
  });

  test('accepts the snake_case customer/display_id fields too', () => {
    expect(rescheduleModalTitle({ customer: 'Jane Doe', display_id: 'RES-99' })).toBe('Reschedule Jane Doe (RES-99)');
  });
});
