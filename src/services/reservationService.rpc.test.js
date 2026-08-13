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
        eq: (col1, val1) => ({
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
  settleReservationBalance,
  adjustInventoryForReservation,
  resolveRescheduleRequest,
  updateReservation,
} from './reservationService';

const resetLookups = () => {
  mockLookup.product_doc_id = null;
  mockLookup.sku = null;
  mockLookup.item = null;
};

describe('settleReservationBalance', () => {
  afterEach(() => mockRpc.mockReset());

  test('calls settle_reservation_balance with the reservation id and method', async () => {
    mockRpc.mockResolvedValue({ data: { settled_amount: 500 }, error: null });
    const result = await settleReservationBalance('res-1', 'cash');
    expect(mockRpc).toHaveBeenCalledWith('settle_reservation_balance', {
      _reservation_id: 'res-1',
      _method: 'cash',
    });
    expect(result).toEqual({ settled_amount: 500 });
  });

  test('defaults method to cash when not provided', async () => {
    mockRpc.mockResolvedValue({ data: {}, error: null });
    await settleReservationBalance('res-1');
    expect(mockRpc).toHaveBeenCalledWith('settle_reservation_balance', {
      _reservation_id: 'res-1',
      _method: 'cash',
    });
  });

  test('throws when the RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('Balance already settled') });
    await expect(settleReservationBalance('res-1')).rejects.toThrow('Balance already settled');
  });
});

describe('resolveRescheduleRequest', () => {
  afterEach(() => mockRpc.mockReset());

  test('calls resolve_reschedule with the reservation id and approve flag', async () => {
    mockRpc.mockResolvedValue({ data: { rescheduled: true }, error: null });
    await resolveRescheduleRequest('res-2', true);
    expect(mockRpc).toHaveBeenCalledWith('resolve_reschedule', {
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

  // Reservations.jsx drives every board/list status transition through this
  // one function -- there is no per-status RPC, the DB enforces validity via
  // a CHECK constraint (reservations_status_check) instead. These tests pin
  // that a plain status change reaches updateDocument with exactly {status},
  // not silently dragging along stale/unrelated fields.
  test.each([
    ['Confirmed'],
    ['Preparing'],
    ['Ready'],
    ['Completed'],
    ['Cancelled'],
  ])('passes status=%s straight through to updateDocument', async (status) => {
    await updateReservation('res-1', { status });
    expect(updateDocument).toHaveBeenCalledWith('reservations', 'res-1', { status });
  });

  test('cancelling also clears the countdown flag when provided', async () => {
    await updateReservation('res-1', { status: 'Cancelled', countdown: false });
    expect(updateDocument).toHaveBeenCalledWith('reservations', 'res-1', { status: 'Cancelled', countdown: false });
  });

  test('strips fields not on the allowlist rather than passing them through silently', async () => {
    await updateReservation('res-1', { status: 'Confirmed', notAReservationColumn: 'sneaky' });
    expect(updateDocument).toHaveBeenCalledWith('reservations', 'res-1', { status: 'Confirmed' });
  });

  test('a combined reschedule + status change converts date/time into appointment_time', async () => {
    await updateReservation('res-1', { status: 'Confirmed', date: '2026-09-01', appointmentTime: '14:00' });
    const [, , payload] = updateDocument.mock.calls[0];
    expect(payload.status).toBe('Confirmed');
    expect(payload.appointment_time).toBeTruthy();
    expect(payload.appointmentTime).toBeUndefined();
  });
});
