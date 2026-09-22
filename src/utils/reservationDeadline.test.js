import {
  formatPaymentDeadline,
  computePaymentDueAt,
  getActivePaymentDeadline,
} from './reservationDeadline';

describe('reservationDeadline utilities', () => {
  describe('computePaymentDueAt', () => {
    test('returns null for invalid appointment dates', () => {
      expect(computePaymentDueAt('invalid-date')).toBeNull();
    });

    test('computes appointment - 1h capped at now + 24h', () => {
      const futureAppt = new Date(Date.now() + 5 * 60 * 60 * 1000); // 5h ahead
      const dueIso = computePaymentDueAt(futureAppt);
      expect(dueIso).not.toBeNull();
      const dueTime = new Date(dueIso).getTime();
      // Should be roughly 4h ahead (5h - 1h)
      expect(Math.abs(dueTime - (futureAppt.getTime() - 60 * 60 * 1000))).toBeLessThan(1000);
    });
  });

  describe('formatPaymentDeadline', () => {
    test('returns null for null or missing dueAt', () => {
      expect(formatPaymentDeadline(null)).toBeNull();
      expect(formatPaymentDeadline(undefined)).toBeNull();
      expect(formatPaymentDeadline('not-a-date')).toBeNull();
    });

    test('returns Overdue for past dates', () => {
      const past = new Date(Date.now() - 10000).toISOString();
      expect(formatPaymentDeadline(past)).toEqual({ label: 'Overdue', urgent: true });
    });

    test('returns minutes left when under an hour', () => {
      const soon = new Date(Date.now() + 25 * 60 * 1000).toISOString();
      const res = formatPaymentDeadline(soon);
      expect(res?.urgent).toBe(true);
      expect(res?.label).toMatch(/^\d+m left$/);
    });

    test('returns hours left when over an hour', () => {
      const later = new Date(Date.now() + 2.5 * 60 * 60 * 1000).toISOString();
      const res = formatPaymentDeadline(later);
      expect(res?.urgent).toBe(false);
      expect(res?.label).toBe('3h left');
    });
  });

  describe('getActivePaymentDeadline', () => {
    const twoHoursFuture = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const pastDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    test('returns null when reservation is null or undefined', () => {
      expect(getActivePaymentDeadline(null)).toBeNull();
      expect(getActivePaymentDeadline(undefined)).toBeNull();
    });

    test('returns active deadline for unpaid reservation in To Pay', () => {
      const res = {
        displayStatus: 'To Pay',
        paymentStatus: 'Pending',
        paymentDueAt: twoHoursFuture,
      };
      const result = getActivePaymentDeadline(res);
      expect(result).not.toBeNull();
      expect(result?.label).toBe('2h left');
    });

    test('returns null when reservation is paid (suppresses contradictory deadline)', () => {
      const res = {
        displayStatus: 'To Pay',
        paymentStatus: 'Paid',
        paymentDueAt: twoHoursFuture,
      };
      expect(getActivePaymentDeadline(res)).toBeNull();

      // Lowercase variant
      expect(getActivePaymentDeadline({ ...res, paymentStatus: 'paid' })).toBeNull();
    });

    test('returns null when reservation has payment submitted awaiting review', () => {
      const res = {
        displayStatus: 'To Pay',
        paymentStatus: 'Submitted',
        paymentDueAt: twoHoursFuture,
      };
      expect(getActivePaymentDeadline(res)).toBeNull();
    });

    test('returns null when payment is processing', () => {
      const res = {
        displayStatus: 'To Pay',
        paymentStatus: 'Processing',
        paymentDueAt: twoHoursFuture,
      };
      expect(getActivePaymentDeadline(res)).toBeNull();
    });

    test('returns null when reservation is cancelled', () => {
      expect(
        getActivePaymentDeadline({
          displayStatus: 'Cancelled',
          paymentStatus: 'Pending',
          paymentDueAt: pastDate,
        }),
      ).toBeNull();

      expect(
        getActivePaymentDeadline({
          status: 'Cancelled',
          displayStatus: 'To Pay',
          paymentStatus: 'Pending',
          paymentDueAt: pastDate,
        }),
      ).toBeNull();

      expect(
        getActivePaymentDeadline({
          displayStatus: 'To Pay',
          paymentStatus: 'Cancelled',
          paymentDueAt: pastDate,
        }),
      ).toBeNull();
    });

    test('returns null when reservation is refunded or refund required', () => {
      expect(
        getActivePaymentDeadline({
          displayStatus: 'To Pay',
          paymentStatus: 'Refunded',
          paymentDueAt: twoHoursFuture,
        }),
      ).toBeNull();

      expect(
        getActivePaymentDeadline({
          displayStatus: 'To Pay',
          paymentStatus: 'Refund Required',
          paymentDueAt: twoHoursFuture,
        }),
      ).toBeNull();
    });

    test('returns null when reservation is beyond To Pay stage', () => {
      expect(
        getActivePaymentDeadline({
          displayStatus: 'Preparing',
          paymentStatus: 'Pending',
          paymentDueAt: twoHoursFuture,
        }),
      ).toBeNull();

      expect(
        getActivePaymentDeadline({
          displayStatus: 'To Pickup',
          paymentStatus: 'Pending',
          paymentDueAt: twoHoursFuture,
        }),
      ).toBeNull();

      expect(
        getActivePaymentDeadline({
          displayStatus: 'Completed',
          paymentStatus: 'Pending',
          paymentDueAt: twoHoursFuture,
        }),
      ).toBeNull();
    });

    test('handles snake_case payment_due_at and payment_status fallbacks', () => {
      const res = {
        displayStatus: 'To Pay',
        payment_status: 'pending',
        payment_due_at: twoHoursFuture,
      };
      const result = getActivePaymentDeadline(res);
      expect(result).not.toBeNull();
      expect(result?.label).toBe('2h left');
    });

    test('returns null when payment due date is missing', () => {
      expect(
        getActivePaymentDeadline({
          displayStatus: 'To Pay',
          paymentStatus: 'Pending',
        }),
      ).toBeNull();
    });
  });
});
