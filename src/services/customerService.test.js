/**
 * Tests for the derived customer engagement stats.
 *
 * These figures used to be read straight off the `profiles` row, where the
 * columns don't exist — so every customer showed 0. These tests pin the real
 * aggregation so that regression can't return silently.
 */

// Mock the Supabase client before importing the service under test.
const mockReservations = { data: [], error: null };
const mockWardrobe = { data: [], error: null };

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
  },
}));

// supabaseService pulls in other browser-ish deps; stub what the service imports.
jest.mock('../lib/supabaseService', () => ({
  getCollection: jest.fn(),
  getDocument: jest.fn(),
  addDocument: jest.fn(),
  updateDocument: jest.fn(),
  softDeleteDocument: jest.fn(),
  subscribeToCollection: jest.fn(),
  getPaginatedCollection: jest.fn(),
  normaliseRow: jest.fn(),
  toCamel: (o) => o,
}));

const { getCustomerStatsBatch } = require('./customerService');

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
      // handed over → earned
      { customer_id: CUST, status: 'Completed', rental_price: 1000, size: 'M', created_at: daysAgo(5) },
      // approved and progressing, but the customer does not have the item yet
      { customer_id: CUST, status: 'Active', rental_price: 500, size: 'M', created_at: daysAgo(10) },
      // cancelled → never
      { customer_id: CUST, status: 'Cancelled', rental_price: 9999, size: 'L', created_at: daysAgo(3) },
      // pre-approval → a reservation, but nothing earned
      { customer_id: CUST, status: 'Pending', rental_price: 700, size: 'S', created_at: daysAgo(2) },
    ]);

    const stats = await getCustomerStatsBatch([CUST]);

    expect(stats[CUST].reservationCount).toBe(4);
    expect(stats[CUST].completedCount).toBe(1);
    expect(stats[CUST].totalSpent).toBe(1000);
  });

  // This is the defect the change exists to fix. The payment webhook sets
  // payment_status to 'Paid' the moment the 50% deposit clears, so the old rule
  // credited the customer with the full price of an item they had not received
  // and had only half paid for.
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
    // At handover the balance has been collected in person, so cash and
    // accrual agree on the full price.
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
      // recency 40 + frequency min(40,40) + wardrobe min(20,20)
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
      expect(stale).toBe(10); // recency 0 + one reservation
    });
  });
});
