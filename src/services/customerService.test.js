/**
 * Tests for customerService.js:
 * 1. Customer engagement stats (getCustomerStatsBatch)
 * 2. B2A-4 Customer Commands (updateCustomerDetails, setCustomerBlockState, setCustomerArchiveState)
 */

const mockReservations = { data: [], error: null };
const mockWardrobe = { data: [], error: null };
const mockRpc = jest.fn();
const mockUpdateDocument = jest.fn();

jest.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (table) => ({
      select: () => ({
        in: () => ({
          eq: () =>
            Promise.resolve(table === 'reservations' ? mockReservations : mockWardrobe),
        }),
      }),
    }),
    rpc: (...args) => mockRpc(...args),
  },
}));

jest.mock('../lib/supabaseService', () => ({
  getCollection: jest.fn(),
  getDocument: jest.fn(),
  addDocument: jest.fn(),
  updateDocument: (...args) => mockUpdateDocument(...args),
  softDeleteDocument: jest.fn(),
  subscribeToCollection: jest.fn(),
  getPaginatedCollection: jest.fn(),
  normaliseRow: jest.fn(),
  toCamel: (o) => o,
}));

import {
  getCustomerStatsBatch,
  updateCustomerDetails,
  setCustomerBlockState,
  setCustomerArchiveState,
} from './customerService';

const CUST = 'cust-1';
const OTHER = 'cust-2';
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

const setData = (reservations, wardrobe = []) => {
  mockReservations.data = reservations;
  mockWardrobe.data = wardrobe;
};

describe('getCustomerStatsBatch', () => {
  afterEach(() => setData([], []));

  test('returns empty object for no ids (and makes no query)', async () => {
    await expect(getCustomerStatsBatch([])).resolves.toEqual({});
    await expect(getCustomerStatsBatch(null)).resolves.toEqual({});
  });

  test('sums only reservations that have actually been handed over', async () => {
    setData([
      { customer_id: CUST, status: 'Completed', rental_price: 1000, size: 'M', created_at: daysAgo(5) },
      { customer_id: CUST, status: 'Active', rental_price: 500, size: 'M', created_at: daysAgo(10) },
      { customer_id: CUST, status: 'Cancelled', rental_price: 9999, size: 'L', created_at: daysAgo(3) },
      { customer_id: CUST, status: 'Pending', rental_price: 700, size: 'S', created_at: daysAgo(2) },
    ]);

    const stats = await getCustomerStatsBatch([CUST]);

    expect(stats[CUST].reservationCount).toBe(4);
    expect(stats[CUST].completedCount).toBe(1);
    expect(stats[CUST].totalSpent).toBe(1000);
  });

  test('a cleared deposit is not revenue until the item is handed over', async () => {
    setData([
      {
        customer_id: CUST,
        status: 'To Pay',
        payment_status: 'Paid',
        payment_type: 'Deposit',
        rental_price: 1890,
        deposit: 945,
        created_at: daysAgo(1),
      },
    ]);
    const stats = await getCustomerStatsBatch([CUST]);
    expect(stats[CUST].totalSpent).toBe(0);
  });

  test('the same reservation counts in full once it is completed', async () => {
    setData([
      {
        customer_id: CUST,
        status: 'Completed',
        payment_status: 'Paid',
        payment_type: 'Deposit',
        rental_price: 1890,
        deposit: 945,
        created_at: daysAgo(1),
      },
    ]);
    const stats = await getCustomerStatsBatch([CUST]);
    expect(stats[CUST].totalSpent).toBe(1890);
  });

  test('does not leak one customer\'s reservations into another', async () => {
    setData([
      { customer_id: CUST, status: 'Completed', rental_price: 100, created_at: daysAgo(1) },
      { customer_id: OTHER, status: 'Completed', rental_price: 900, created_at: daysAgo(1) },
    ]);
    const stats = await getCustomerStatsBatch([CUST, OTHER]);
    expect(stats[CUST].totalSpent).toBe(100);
    expect(stats[OTHER].totalSpent).toBe(900);
  });

  test('preferred sizes are ranked by frequency, top 3', async () => {
    setData([
      { customer_id: CUST, status: 'Completed', size: 'M', created_at: daysAgo(1) },
      { customer_id: CUST, status: 'Completed', size: 'M', created_at: daysAgo(2) },
      { customer_id: CUST, status: 'Completed', size: 'L', created_at: daysAgo(3) },
      { customer_id: CUST, status: 'Completed', size: 'S', created_at: daysAgo(4) },
      { customer_id: CUST, status: 'Completed', size: 'XL', created_at: daysAgo(5) },
    ]);
    const stats = await getCustomerStatsBatch([CUST]);
    expect(stats[CUST].preferredSizes[0]).toBe('M');
    expect(stats[CUST].preferredSizes).toHaveLength(3);
  });

  test('counts wardrobe items per user', async () => {
    setData(
      [],
      [{ user_id: CUST }, { user_id: CUST }, { user_id: OTHER }],
    );
    const stats = await getCustomerStatsBatch([CUST, OTHER]);
    expect(stats[CUST].wardrobeCount).toBe(2);
    expect(stats[OTHER].wardrobeCount).toBe(1);
  });

  test('lastActivity is the most recent reservation', async () => {
    setData([
      { customer_id: CUST, status: 'Completed', created_at: daysAgo(40) },
      { customer_id: CUST, status: 'Completed', created_at: daysAgo(2) },
    ]);
    const stats = await getCustomerStatsBatch([CUST]);
    const ageDays = (Date.now() - new Date(stats[CUST].lastActivity).getTime()) / 86_400_000;
    expect(Math.round(ageDays)).toBe(2);
  });

  describe('engagement score', () => {
    test('a customer with no activity scores 0', async () => {
      setData([]);
      const stats = await getCustomerStatsBatch([CUST]);
      expect(stats[CUST].engagementScore).toBe(0);
      expect(stats[CUST].totalSpent).toBe(0);
    });

    test('recent + frequent + wardrobe activity approaches 100', async () => {
      setData(
        Array.from({ length: 4 }, () => ({
          customer_id: CUST, status: 'Completed', rental_price: 100, created_at: daysAgo(1),
        })),
        Array.from({ length: 5 }, () => ({ user_id: CUST })),
      );
      const stats = await getCustomerStatsBatch([CUST]);
      expect(stats[CUST].engagementScore).toBe(100);
    });

    test('score is capped at 100 no matter how much activity', async () => {
      setData(
        Array.from({ length: 50 }, () => ({
          customer_id: CUST, status: 'Completed', rental_price: 10, created_at: daysAgo(1),
        })),
        Array.from({ length: 50 }, () => ({ user_id: CUST })),
      );
      const stats = await getCustomerStatsBatch([CUST]);
      expect(stats[CUST].engagementScore).toBe(100);
    });

    test('stale activity scores lower than recent activity', async () => {
      setData([{ customer_id: CUST, status: 'Completed', created_at: daysAgo(200) }]);
      const stale = (await getCustomerStatsBatch([CUST]))[CUST].engagementScore;

      setData([{ customer_id: CUST, status: 'Completed', created_at: daysAgo(1) }]);
      const fresh = (await getCustomerStatsBatch([CUST]))[CUST].engagementScore;

      expect(stale).toBeLessThan(fresh);
      expect(stale).toBe(10);
    });
  });
});

describe('customerService B2A-4 commands', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateDocument.mockResolvedValue({ success: true });
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });
  });

  describe('updateCustomerDetails', () => {
    test('sends only sanitized personal fields and excludes privileged/moderation keys', async () => {
      await updateCustomerDetails('cust-123', {
        firstName: 'Maria',
        lastName: 'Santos',
        phone: '+639123456789',
        isBlocked: true,
        deleted: true,
        role: 'admin',
        email: 'attacker@evil.com',
      });

      expect(mockUpdateDocument).toHaveBeenCalledTimes(1);
      const [table, docId, payload] = mockUpdateDocument.mock.calls[0];
      expect(table).toBe('profiles');
      expect(docId).toBe('cust-123');

      expect(payload.firstName).toBe('Maria');
      expect(payload.lastName).toBe('Santos');
      expect(payload.phone).toBe('+639123456789');

      expect(payload.isBlocked).toBeUndefined();
      expect(payload.deleted).toBeUndefined();
      expect(payload.role).toBeUndefined();
      expect(payload.email).toBeUndefined();
    });

    test('trims names properly', async () => {
      await updateCustomerDetails('cust-123', {
        firstName: '  Juan  ',
        lastName: '  Dela Cruz  ',
      });

      const [, , payload] = mockUpdateDocument.mock.calls[0];
      expect(payload.firstName).toBe('Juan');
      expect(payload.lastName).toBe('Dela Cruz');
    });
  });

  describe('setCustomerBlockState', () => {
    test('calls set_customer_block_state RPC with correct arguments', async () => {
      const result = await setCustomerBlockState('cust-456', true, 'Payment delinquency');

      expect(mockRpc).toHaveBeenCalledWith('set_customer_block_state', {
        target_customer_id: 'cust-456',
        new_is_blocked: true,
        change_reason: 'Payment delinquency',
      });
      expect(result).toEqual({ success: true });
    });

    test('propagates error when RPC fails', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: new Error('Unauthorized: Only active administrators on approved devices can modify customer block status.'),
      });

      await expect(
        setCustomerBlockState('cust-456', false, 'Unblocking customer')
      ).rejects.toThrow('Unauthorized');
    });
  });

  describe('setCustomerArchiveState', () => {
    test('calls set_customer_archive_state RPC with correct arguments', async () => {
      const result = await setCustomerArchiveState('cust-789', true, 'Requested by customer');

      expect(mockRpc).toHaveBeenCalledWith('set_customer_archive_state', {
        target_customer_id: 'cust-789',
        new_deleted: true,
        change_reason: 'Requested by customer',
      });
      expect(result).toEqual({ success: true });
    });

    test('propagates error when archive RPC fails', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: new Error('Cannot modify block state of an archived customer'),
      });

      await expect(
        setCustomerArchiveState('cust-789', false, 'Restoring customer')
      ).rejects.toThrow('Cannot modify block state');
    });
  });
});
