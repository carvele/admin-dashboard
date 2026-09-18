import { countsAsRevenue } from './reservationStatus';

describe('countsAsRevenue', () => {
  test('Completed / completed casing parity', () => {
    expect(countsAsRevenue({ status: 'Completed' })).toBe(true);
    expect(countsAsRevenue({ status: 'completed' })).toBe(true);
  });

  test('Completed + Paid counts as revenue', () => {
    expect(countsAsRevenue({ status: 'Completed', paymentStatus: 'Paid' })).toBe(true);
  });

  test('Completed + Refund Required does not count as revenue', () => {
    expect(countsAsRevenue({ status: 'Completed', paymentStatus: 'Refund Required' })).toBe(false);
  });

  test('Completed + Refunded does not count as revenue', () => {
    expect(countsAsRevenue({ status: 'Completed', paymentStatus: 'Refunded' })).toBe(false);
  });

  test('Cancelled does not count as revenue', () => {
    expect(countsAsRevenue({ status: 'Cancelled' })).toBe(false);
  });

  test('handles the raw snake_case payment_status field too', () => {
    expect(countsAsRevenue({ status: 'Completed', payment_status: 'Refunded' })).toBe(false);
  });

  test('non-Completed operational status never counts, regardless of payment', () => {
    expect(countsAsRevenue({ status: 'To Pickup', paymentStatus: 'Paid' })).toBe(false);
  });

  test('null/undefined reservation is falsy, not a throw', () => {
    expect(countsAsRevenue(null)).toBe(false);
    expect(countsAsRevenue(undefined)).toBe(false);
  });
});
