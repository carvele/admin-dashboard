/**
 * Tests for reservationService's RPC call sites -- the functions that talk
 * to trusted server-side SECURITY DEFINER RPCs rather than writing columns
 * directly.
 */

const mockRpc = jest.fn();
const mockInvoke = jest.fn().mockResolvedValue({ data: { expired: 0 }, error: null });
const mockFrom = jest.fn();
const mockCreateSignedUrl = jest.fn();
const mockStorageFrom = jest.fn(() => ({
  createSignedUrl: mockCreateSignedUrl,
}));

jest.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (...args) => mockRpc(...args),
    functions: { invoke: (...args) => mockInvoke(...args) },
    from: (...args) => mockFrom(...args),
    storage: {
      from: (...args) => mockStorageFrom(...args),
    },
  },
}));

afterEach(() => {
  mockInvoke.mockClear();
  mockFrom.mockReset();
  mockCreateSignedUrl.mockReset();
  mockStorageFrom.mockClear();
});

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
  cancelReservationForFraud,
  findDuplicatePaymentReference,
  completeReservationHandover,
  resolveRescheduleRequest,
  updateReservation,
  getPaymentReviewHistory,
  rescheduleReservation,
  markRefundDisbursed,
  getRefundQueue,
  getReturnRefundRequests,
  reviewReturnRefundRequest,
  getSignedEvidenceUrl,
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

  test('unwraps error message from edge function if payments-expire fails', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: async () => ({ error: 'Payment has already been completed by customer.' }),
        },
      },
    });

    await expect(settleReservationBalance('res-1')).rejects.toThrow(
      'Payment has already been completed by customer.',
    );
    expect(mockRpc).not.toHaveBeenCalled();
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
      _reason_code: null,
      _staff_note: null,
    });
  });

  test('rejecting a receipt sends the reason code and staff note', async () => {
    mockRpc.mockResolvedValue({ data: { approved: false }, error: null });
    await reviewReservationReceipt('res-1', false, 'wrong_amount', 'Sent less than the deposit');
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith('review_reservation_receipt', {
      _reservation_id: 'res-1',
      _approve: false,
      _reason_code: 'wrong_amount',
      _staff_note: 'Sent less than the deposit',
    });
  });

  test('cancels for suspected fraud through the fraud-cancel command', async () => {
    mockRpc.mockResolvedValue({ data: { status: 'Cancelled' }, error: null });
    await cancelReservationForFraud('res-1', 'Confirmed', 'duplicate_receipt', 'Same reference used on R-1198');
    expect(mockRpc).toHaveBeenCalledWith('cancel_reservation_for_fraud', {
      _reservation_id: 'res-1',
      _expected_status: 'Confirmed',
      _reason_code: 'duplicate_receipt',
      _staff_note: 'Same reference used on R-1198',
    });
  });

  test('looks up a duplicate payment reference', async () => {
    mockRpc.mockResolvedValue({ data: [{ reservation_id: 'res-2', display_id: 'R-1198' }], error: null });
    const matches = await findDuplicatePaymentReference('REF123', 'res-1');
    expect(mockRpc).toHaveBeenCalledWith('find_duplicate_payment_reference', {
      _reference_number: 'REF123',
      _exclude_reservation_id: 'res-1',
    });
    expect(matches).toEqual([{ reservation_id: 'res-2', display_id: 'R-1198' }]);
  });

  test('skips the duplicate-reference lookup entirely with no reference number', async () => {
    const matches = await findDuplicatePaymentReference(null);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(matches).toEqual([]);
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

describe('getPaymentReviewHistory', () => {
  test('queries logs ordered by timestamp and maps createdAt', async () => {
    const mockChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'log-1',
            action: 'Approved reservation receipt',
            timestamp: '2026-09-14T01:00:00.000Z',
          },
        ],
        error: null,
      }),
    };
    mockFrom.mockReturnValue(mockChain);

    const history = await getPaymentReviewHistory('res-1');

    expect(mockFrom).toHaveBeenCalledWith('logs');
    expect(mockChain.select).toHaveBeenCalledWith('*');
    expect(mockChain.eq).toHaveBeenCalledWith('target_type', 'reservation');
    expect(mockChain.eq).toHaveBeenCalledWith('target_id', 'res-1');
    expect(mockChain.in).toHaveBeenCalledWith('action', [
      'Approved reservation receipt',
      'Rejected reservation receipt',
      'Cancelled reservation',
    ]);
    expect(mockChain.order).toHaveBeenCalledWith('timestamp', { ascending: true });
    expect(history).toEqual([
      {
        id: 'log-1',
        action: 'Approved reservation receipt',
        timestamp: '2026-09-14T01:00:00.000Z',
        createdAt: '2026-09-14T01:00:00.000Z',
      },
    ]);
  });
});

describe('rescheduleReservation', () => {
  afterEach(() => mockRpc.mockReset());

  it('invokes reschedule_reservation_as_manager with canonical params', async () => {
    mockRpc.mockResolvedValue({
      data: { reservation_id: 'res-1', date: '2026-09-20', appointment_time: '14:00:00' },
      error: null,
    });

    const result = await rescheduleReservation('res-1', 'To Pay', '2026-09-20', '14:00:00', 'Customer requested');

    expect(mockRpc).toHaveBeenCalledWith('reschedule_reservation_as_manager', {
      _reservation_id: 'res-1',
      _expected_status: 'To Pay',
      _new_date: '2026-09-20',
      _new_appointment_time: '14:00:00',
      _reason: 'Customer requested',
    });
    expect(result).toEqual({ reservation_id: 'res-1', date: '2026-09-20', appointment_time: '14:00:00' });
  });

  it('throws error when RPC returns an error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: new Error('Selected slot is full'),
    });

    await expect(rescheduleReservation('res-1', 'To Pay', '2026-09-20', '14:00:00')).rejects.toThrow(
      'Selected slot is full',
    );
  });
});

describe('markRefundDisbursed', () => {
  afterEach(() => mockRpc.mockReset());

  it('invokes mark_reservation_refund_disbursed with canonical params', async () => {
    mockRpc.mockResolvedValue({
      data: { reservation_id: 'res-1', status: 'refunded', total_refunded_centavos: 318000 },
      error: null,
    });

    const result = await markRefundDisbursed('res-1', 'gcash', 'GCASH-12345', 'Refund sent via app');

    expect(mockRpc).toHaveBeenCalledWith('mark_reservation_refund_disbursed', {
      _reservation_id: 'res-1',
      _disbursement_method: 'gcash',
      _reference_number: 'GCASH-12345',
      _notes: 'Refund sent via app',
    });
    expect(result).toEqual({ reservation_id: 'res-1', status: 'refunded', total_refunded_centavos: 318000 });
  });

  it('throws error when RPC returns an error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: new Error('Refund disbursement requires admin or owner authorization.'),
    });

    await expect(markRefundDisbursed('res-1', 'cash', 'REF-1')).rejects.toThrow(
      'Refund disbursement requires admin or owner authorization.',
    );
  });
});

describe('getRefundQueue', () => {
  it('queries reservations with status in Cancelled/Completed, payment_status Refund Required, and inner payments requires_refund true', async () => {
    const mockOrder = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'res-1',
          display_id: 'RES-001',
          payment_status: 'Refund Required',
          payments: [
            { id: 'pay-1', amount_centavos: 279000, requires_refund: true, status: 'paid' },
          ],
        },
      ],
      error: null,
    });
    const mockEqStatusPaid = jest.fn().mockReturnValue({ order: mockOrder });
    const mockEqRefund = jest.fn().mockReturnValue({ eq: mockEqStatusPaid });
    const mockEqPaymentStatus = jest.fn().mockReturnValue({ eq: mockEqRefund });
    const mockInStatus = jest.fn().mockReturnValue({ eq: mockEqPaymentStatus });
    const mockSelect = jest.fn().mockReturnValue({ in: mockInStatus });

    mockFrom.mockReturnValue({ select: mockSelect });

    const result = await getRefundQueue();

    expect(mockFrom).toHaveBeenCalledWith('reservations');
    expect(mockInStatus).toHaveBeenCalledWith('status', ['Cancelled', 'Completed']);
    expect(mockEqPaymentStatus).toHaveBeenCalledWith('payment_status', 'Refund Required');
    expect(mockEqRefund).toHaveBeenCalledWith('payments.requires_refund', true);
    expect(mockEqStatusPaid).toHaveBeenCalledWith('payments.status', 'paid');
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('res-1');
  });
});

describe('reviewReturnRefundRequest', () => {
  afterEach(() => mockRpc.mockReset());

  it('invokes review_return_refund_request with canonical approve params', async () => {
    mockRpc.mockResolvedValue({
      data: { success: true, request_id: 'req-1', previous_status: 'submitted', new_status: 'approved' },
      error: null,
    });

    const result = await reviewReturnRefundRequest('req-1', 'approve', 'Approved by manager');

    expect(mockRpc).toHaveBeenCalledWith('review_return_refund_request', {
      _request_id: 'req-1',
      _decision:   'approve',
      _notes:      'Approved by manager',
    });
    expect(result).toEqual({ success: true, request_id: 'req-1', previous_status: 'submitted', new_status: 'approved' });
  });

  it('invokes review_return_refund_request with canonical reject params', async () => {
    mockRpc.mockResolvedValue({
      data: { success: true, request_id: 'req-1', previous_status: 'under_review', new_status: 'rejected' },
      error: null,
    });

    const result = await reviewReturnRefundRequest('req-1', 'reject', 'Item damaged by customer');

    expect(mockRpc).toHaveBeenCalledWith('review_return_refund_request', {
      _request_id: 'req-1',
      _decision:   'reject',
      _notes:      'Item damaged by customer',
    });
    expect(result.new_status).toBe('rejected');
  });

  it('invokes review_return_refund_request with under_review decision', async () => {
    mockRpc.mockResolvedValue({
      data: { success: true, request_id: 'req-1', previous_status: 'submitted', new_status: 'under_review' },
      error: null,
    });

    const result = await reviewReturnRefundRequest('req-1', 'under_review');

    expect(mockRpc).toHaveBeenCalledWith('review_return_refund_request', {
      _request_id: 'req-1',
      _decision:   'under_review',
      _notes:      null,
    });
    expect(result.new_status).toBe('under_review');
  });

  it('throws error when RPC returns an error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: new Error('A rejection reason is required.'),
    });

    await expect(reviewReturnRefundRequest('req-1', 'reject', '')).rejects.toThrow(
      'A rejection reason is required.',
    );
  });
});

describe('getSignedEvidenceUrl', () => {
  it('returns null when photoPath is empty or null', async () => {
    const result = await getSignedEvidenceUrl(null);
    expect(result).toBeNull();
  });

  it('invokes createSignedUrl on return-refund-evidence bucket', async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://supabase.co/storage/v1/object/sign/return-refund-evidence/cust1/proof.jpg?token=xyz' },
      error: null,
    });

    const result = await getSignedEvidenceUrl('cust1/proof.jpg', 900);

    expect(mockStorageFrom).toHaveBeenCalledWith('return-refund-evidence');
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('cust1/proof.jpg', 900);
    expect(result).toContain('https://supabase.co/storage/v1/object/sign/return-refund-evidence/cust1/proof.jpg');
  });

  it('throws error when createSignedUrl fails', async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: null,
      error: new Error('Object not found in storage bucket'),
    });

    await expect(getSignedEvidenceUrl('cust1/missing.jpg')).rejects.toThrow(
      'Object not found in storage bucket',
    );
  });
});

describe('getReturnRefundRequests', () => {
  it('fetches return refund requests with status filter and joins', async () => {
    const mockOrder = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'req-1',
          reservation_id: 'res-1',
          customer_id: 'cust-1',
          reason_category: 'damaged',
          details: 'Torn seam',
          photo_path: 'cust-1/photo.jpg',
          status: 'submitted',
        },
      ],
      error: null,
    });
    const mockEqStatus = jest.fn().mockReturnValue({ order: mockOrder });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEqStatus });

    mockFrom.mockReturnValue({ select: mockSelect });

    const result = await getReturnRefundRequests('submitted');

    expect(mockFrom).toHaveBeenCalledWith('return_refund_requests');
    expect(mockEqStatus).toHaveBeenCalledWith('status', 'submitted');
    expect(mockOrder).toHaveBeenCalledWith('submitted_at', { ascending: false });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('req-1');
  });

  it('fetches return refund requests with array status filter', async () => {
    const mockOrder = jest.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const mockInStatus = jest.fn().mockReturnValue({ order: mockOrder });
    const mockSelect = jest.fn().mockReturnValue({ in: mockInStatus });

    mockFrom.mockReturnValue({ select: mockSelect });

    await getReturnRefundRequests(['submitted', 'under_review']);

    expect(mockFrom).toHaveBeenCalledWith('return_refund_requests');
    expect(mockInStatus).toHaveBeenCalledWith('status', ['submitted', 'under_review']);
    expect(mockOrder).toHaveBeenCalledWith('submitted_at', { ascending: false });
  });

  it('fetches all return refund requests when status is null', async () => {
    const mockOrder = jest.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const mockSelect = jest.fn().mockReturnValue({ order: mockOrder });

    mockFrom.mockReturnValue({ select: mockSelect });

    await getReturnRefundRequests();

    expect(mockFrom).toHaveBeenCalledWith('return_refund_requests');
    expect(mockOrder).toHaveBeenCalledWith('submitted_at', { ascending: false });
  });
});



