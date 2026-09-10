import {
  RESERVATION_STATUSES,
  PENDING_STATUSES,
  CANCELLED_STATUSES,
} from '../utils/reservationStatus';
import { balanceDue, isDepositReservation } from '../utils/reservationBalance';
import { formatPaymentDeadline } from '../utils/reservationDeadline';

describe('Reservation Service & Status Logic', () => {
  test('includes all expected statuses in lifecycle order', () => {
    // 'Pending' and 'Request Approval' are retired -- neither had a live
    // writer in either app (see jezsy-mobile-app 20260911110000).
    expect(RESERVATION_STATUSES).not.toContain('Pending');
    expect(RESERVATION_STATUSES).not.toContain('Request Approval');
    expect(RESERVATION_STATUSES).toContain('Confirmed');
    expect(RESERVATION_STATUSES).toContain('Preparing');
    expect(RESERVATION_STATUSES).toContain('To Pickup');
    expect(RESERVATION_STATUSES).toContain('Completed');
    expect(RESERVATION_STATUSES).toContain('Cancelled');
  });

  test('groups pending statuses correctly', () => {
    expect(PENDING_STATUSES).toContain('To Pay');
    expect(PENDING_STATUSES).not.toContain('Pending');
  });

  test('groups cancelled statuses correctly', () => {
    expect(CANCELLED_STATUSES).toContain('Cancelled');
  });

  test('calculates remaining balance correctly', () => {
    const reservation = {
      paymentType: 'Deposit',
      paymentStatus: 'Paid',
      rentalPrice: 2000,
      deposit: 500,
    };
    expect(isDepositReservation(reservation)).toBe(true);
    expect(balanceDue(reservation)).toBe(1500);
  });

  test('formats payment deadline status correctly', () => {
    const pastDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const result = formatPaymentDeadline(pastDate);
    expect(result?.label).toBe('Overdue');
    expect(result?.urgent).toBe(true);
  });
});
