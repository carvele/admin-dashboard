/**
 * Tests for reservationService's RPC call sites -- the functions that talk
 * to trusted server-side SECURITY DEFINER RPCs rather than writing columns
 * directly, and the inventory-adjustment lookup/delta logic in front of
 * adjust_inventory_stock.
 *
 * adjustInventoryForReservation is the one that matters most: it used to be
 * a JS-side read-compute-write (fetch the row, add/subtract in JS, write it
 * back), which lost updates under concurrent calls -- a double-click, two
 * staff acting close together, a realtime refresh racing a manual action.
 * It's now a thin wrapper that resolves which inventory row to touch, then
 * hands the delta to the atomic adjust_inventory_stock RPC to apply
 * server-side. These tests pin that shape: no direct .update()/.upsert() on
 * inventory's numeric columns from this layer, ever.
 */

const mockRpc = jest.fn();
const mockLookup = { product_doc_id: null, sku: null, item: null };

jest.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (...args) => mockRpc(...args),
    from: (table) => ({
      select: () => ({
        eq: (col1, _val1) => ({
          eq: (_col2, _val2) => ({
            maybeSingle: () =>
              Promise.resolve({ data: table === 'inventory' ? mockLookup[col1] : null, error: null }),
          }),
        }),
      }),
      // Any direct write attempt on inventory from this layer is exactly
      // the regression these tests exist to catch -- fail loudly instead
      // of silently succeeding if adjustInventoryForReservation is ever
      // "simplified" back into a read-compute-write.
      update: () => {
        throw new Error('adjustInventoryForReservation must not write inventory columns directly -- use the adjust_inventory_stock RPC');
      },
      upsert: () => {
        throw new Error('adjustInventoryForReservation must not write inventory columns directly -- use the adjust_inventory_stock RPC');
      },
    }),
  },
}));

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
  adjustInventoryForReservation,
  resolveRescheduleRequest,
  updateReservation,
} from './reservationService';

const resetLookups = () => {
  mockLookup.product_doc_id = null;
  mockLookup.sku = null;
  mockLookup.item = null;
};

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

  test('calls the owner-only balance command with the reservation id and method', async () => {
    mockRpc.mockResolvedValue({ data: { settled_amount: 500 }, error: null });
    const result = await settleReservationBalance('res-1', 'cash');
    expect(mockRpc).toHaveBeenCalledWith('record_reservation_balance', {
      _reservation_id: 'res-1',
      _method: 'cash',
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
    expect(mockRpc).toHaveBeenCalledWith('cancel_reservation_as_manager', {
      _reservation_id: 'res-1',
      _expected_status: 'To Pay',
      _reason: 'Cancelled by owner',
    });
  });

  test('reviews a receipt through the payment command', async () => {
    mockRpc.mockResolvedValue({ data: { approved: true }, error: null });
    await reviewReservationReceipt('res-1', true);
    expect(mockRpc).toHaveBeenCalledWith('review_reservation_receipt', {
      _reservation_id: 'res-1',
      _approve: true,
    });
  });

  test('completes handover and balance settlement atomically', async () => {
    mockRpc.mockResolvedValue({ data: { status: 'Completed' }, error: null });
    await completeReservationHandover('res-1');
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

describe('adjustInventoryForReservation', () => {
  afterEach(() => {
    mockRpc.mockReset();
    resetLookups();
  });

  test('resolves the inventory row by product_doc_id first and stops there', async () => {
    mockLookup.product_doc_id = { id: 'inv-1' };
    mockLookup.sku = { id: 'inv-WRONG' };
    mockRpc.mockResolvedValue({ error: null });

    await adjustInventoryForReservation('prod-uuid', 'M', 1, false);

    expect(mockRpc).toHaveBeenCalledWith('adjust_inventory_stock', expect.objectContaining({ p_inventory_id: 'inv-1' }));
  });

  test('falls back to SKU lookup when product_doc_id has no match', async () => {
    mockLookup.product_doc_id = null;
    mockLookup.sku = { id: 'inv-2' };
    mockRpc.mockResolvedValue({ error: null });

    await adjustInventoryForReservation('SKU-123', 'M', 1, false);

    expect(mockRpc).toHaveBeenCalledWith('adjust_inventory_stock', expect.objectContaining({ p_inventory_id: 'inv-2' }));
  });

  test('falls back to item-name lookup when both product_doc_id and SKU miss', async () => {
    mockLookup.product_doc_id = null;
    mockLookup.sku = null;
    mockLookup.item = { id: 'inv-3' };
    mockRpc.mockResolvedValue({ error: null });

    await adjustInventoryForReservation('Silk Dress', 'M', 1, false);

    expect(mockRpc).toHaveBeenCalledWith('adjust_inventory_stock', expect.objectContaining({ p_inventory_id: 'inv-3' }));
  });

  test('returns false and never calls the RPC when no inventory row matches anywhere', async () => {
    const result = await adjustInventoryForReservation('nonexistent', 'M', 1, false);
    expect(result).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test('release (isConsume=false) sends a positive available delta and matching negative reserved delta', async () => {
    mockLookup.product_doc_id = { id: 'inv-1' };
    mockRpc.mockResolvedValue({ error: null });

    await adjustInventoryForReservation('prod-uuid', 'M', 3, false);

    expect(mockRpc).toHaveBeenCalledWith('adjust_inventory_stock', {
      p_inventory_id: 'inv-1',
      p_available_delta: 3,
      p_reserved_delta: -3,
    });
  });

  test('consume (isConsume=true) sends matching negative total and reserved deltas, sign-normalized', async () => {
    mockLookup.product_doc_id = { id: 'inv-1' };
    mockRpc.mockResolvedValue({ error: null });

    // A negative delta passed in should still normalize to a negative total/reserved delta,
    // not double-negate -- Math.abs() in the implementation guards exactly this.
    await adjustInventoryForReservation('prod-uuid', 'M', -2, true);

    expect(mockRpc).toHaveBeenCalledWith('adjust_inventory_stock', {
      p_inventory_id: 'inv-1',
      p_total_delta: -2,
      p_reserved_delta: -2,
    });
  });

  test('returns true when the RPC succeeds', async () => {
    mockLookup.product_doc_id = { id: 'inv-1' };
    mockRpc.mockResolvedValue({ error: null });
    const result = await adjustInventoryForReservation('prod-uuid', 'M', 1, false);
    expect(result).toBe(true);
  });

  test('returns false (not throw) when the RPC errors, since a caller stock-adjustment failure should not abort the surrounding status change', async () => {
    mockLookup.product_doc_id = { id: 'inv-1' };
    mockRpc.mockResolvedValue({ error: new Error('constraint violated') });
    const result = await adjustInventoryForReservation('prod-uuid', 'M', 1, false);
    expect(result).toBe(false);
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
