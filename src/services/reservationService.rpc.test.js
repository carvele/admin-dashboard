/**
 * Tests for reservationService's RPC call sites -- the functions that talk
 * to trusted server-side SECURITY DEFINER RPCs rather than writing columns
 * directly.
 */

const mockRpc = jest.fn();
const mockInvoke = jest.fn().mockResolvedValue({ data: { expired: 0 }, error: null });

jest.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (...args) => mockRpc(...args),
    functions: { invoke: (...args) => mockInvoke(...args) },
  },
}));

afterEach(() => mockInvoke.mockClear());

jest.mock('../lib/supabaseService', () => ({
  subscribeToCollection: jest.fn(),
  addDocument: jest.fn(),
  updateDocument: jest.fn(),
  deleteDocument: jest.fn(),
  getPaginatedCollection: jest.fn(),
  toCamel: (o) => o,
}));

import { updateDocument } from '../lib/supabaseService';
import {
  createReservation,
  settleReservationBalance,
  transitionReservationStatus,
  cancelReservation,
  reviewReservationReceipt,
  completeReservationHandover,
  resolveRescheduleRequest,
  updateReservation,
} from './reservationService';


describe('createReservation', () => {
  afterEach(() => mockRpc.mockReset());

  const reservation = {
    customerId: 'customer-1',
    productId: 'product-1',
    productName: 'Dress',
    size: 'M',
    quantity: 1,
    date: '2026-09-15T10:00:00+08:00',
    status: 'To Pay',
    payment_status: 'Pending',
    payment_due_at: '2026-09-14T10:00:00.000Z',
    rentalPrice: 2000,
    deposit: 1000,
  };

  test('creates the reservation and stock hold through one server transaction', async () => {
    mockRpc.mockResolvedValue({ data: { id: 'reservation-1' }, error: null });

    await expect(createReservation(reservation)).resolves.toBe('reservation-1');

    expect(mockRpc).toHaveBeenCalledWith('create_reservation_multi', {
      _items: [{ product_id: 'product-1', size: 'M', color: null, quantity: 1 }],
      _date: '2026-09-15',
      _appointment_time: '10:00',
      _receipt_path: null,
      _payment_option: 'deposit',
      _customer_id: 'customer-1',
    });
  });

  test('propagates an atomic create failure without client-side compensation', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('Inventory unavailable') });
    await expect(createReservation(reservation)).rejects.toThrow('Inventory unavailable');
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});

describe('settleReservationBalance', () => {
  afterEach(() => mockRpc.mockReset());

  test('calls the balance command with the reservation id and method', async () => {
    mockRpc.mockResolvedValue({ data: { settled_amount: 500 }, error: null });
    const result = await settleReservationBalance('res-1', 'cash');
    expect(mockRpc).toHaveBeenCalledWith('record_reservation_balance', {
      _reservation_id: 'res-1',
      _method: 'cash',
    });
    expect(mockInvoke).toHaveBeenCalledWith('payments-expire', {
      body: { reservation_id: 'res-1' },
    });
    expect(result).toEqual({ settled_amount: 500 });
  });

  test('defaults method to cash when not provided', async () => {
    mockRpc.mockResolvedValue({ data: {}, error: null });
    await settleReservationBalance('res-1');
    expect(mockRpc).toHaveBeenCalledWith('record_reservation_balance', {
      _reservation_id: 'res-1',
      _method: 'cash',
    });
  });

  test('throws when the RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('Balance already settled') });
    await expect(settleReservationBalance('res-1')).rejects.toThrow('Balance already settled');
  });
});

describe('reservation lifecycle commands', () => {
  afterEach(() => mockRpc.mockReset());

  test('passes expected and target state to the transition command', async () => {
    mockRpc.mockResolvedValue({ data: { status: 'Preparing' }, error: null });
    await transitionReservationStatus('res-1', 'To Pay', 'Preparing');
    expect(mockRpc).toHaveBeenCalledWith('transition_reservation_status', {
      _reservation_id: 'res-1',
      _expected_status: 'To Pay',
      _next_status: 'Preparing',
    });
  });

  test('cancels through the guarded command', async () => {
    mockRpc.mockResolvedValue({ data: { status: 'Cancelled' }, error: null });
    await cancelReservation('res-1', 'To Pay');
    expect(mockInvoke).toHaveBeenCalledWith('payments-expire', {
      body: { reservation_id: 'res-1' },
    });
    expect(mockRpc).toHaveBeenCalledWith('cancel_reservation_as_manager', {
      _reservation_id: 'res-1',
      _expected_status: 'To Pay',
      _reason: 'Cancelled by owner',
    });
  });

  test('reviews a receipt through the payment command', async () => {
    mockRpc.mockResolvedValue({ data: { approved: true }, error: null });
    await reviewReservationReceipt('res-1', true);
    expect(mockInvoke).toHaveBeenCalledWith('payments-expire', {
      body: { reservation_id: 'res-1' },
    });
    expect(mockRpc).toHaveBeenCalledWith('review_reservation_receipt', {
      _reservation_id: 'res-1',
      _approve: true,
    });
  });

  test('completes handover through the guarded command', async () => {
    mockRpc.mockResolvedValue({ data: { status: 'Completed' }, error: null });
    await completeReservationHandover('res-1');
    expect(mockInvoke).toHaveBeenCalledWith('payments-expire', {
      body: { reservation_id: 'res-1' },
    });
    expect(mockRpc).toHaveBeenCalledWith('complete_reservation_handover', {
      _reservation_id: 'res-1',
      _method: 'cash',
    });
  });
});

describe('resolveRescheduleRequest', () => {
  afterEach(() => mockRpc.mockReset());

  test('calls the owner-only reschedule command with the reservation id and approve flag', async () => {
    mockRpc.mockResolvedValue({ data: { rescheduled: true }, error: null });
    await resolveRescheduleRequest('res-2', true);
    expect(mockRpc).toHaveBeenCalledWith('resolve_reschedule_as_manager', {
      _reservation_id: 'res-2',
      _approve: true,
    });
  });

  test('throws when the RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('Slot no longer available') });
    await expect(resolveRescheduleRequest('res-2', true)).rejects.toThrow('Slot no longer available');
  });
});


describe('updateReservation (status transitions)', () => {
  afterEach(() => updateDocument.mockReset());

  test.each(['Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled'])(
    'rejects direct lifecycle status=%s writes',
    async (status) => {
      await expect(updateReservation('res-1', { status })).rejects.toThrow(
        'Lifecycle and payment state must use a reservation command.',
      );
      expect(updateDocument).not.toHaveBeenCalled();
    },
  );

  test('rejects direct payment-state writes', async () => {
    await expect(updateReservation('res-1', { paymentStatus: 'Paid' })).rejects.toThrow(
      'Lifecycle and payment state must use a reservation command.',
    );
    expect(updateDocument).not.toHaveBeenCalled();
  });

  test('a reschedule converts date/time without changing lifecycle state', async () => {
    await updateReservation('res-1', { date: '2026-09-01', appointmentTime: '14:00' });
    const [, , payload] = updateDocument.mock.calls[0];
    expect(payload.appointment_time).toBeTruthy();
    expect(payload.appointmentTime).toBeUndefined();
  });
});
