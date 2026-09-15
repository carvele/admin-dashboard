const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
    rpc: (...args) => mockRpc(...args),
  },
}));

import {
  dateToServerParams,
  getAnalyticsOverview,
  getReservationAnalytics,
  getCashflowAnalytics,
  getInventoryHealthAnalytics,
  getProductPerformanceAnalytics,
  getCustomerCohortAnalytics,
  getReservationsRange,
  getArSessionsRange,
  getFeedbackRange,
} from './analyticsService';

describe('analyticsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('dateToServerParams', () => {
    test('correctly converts inclusive date range to half-open exclusive end parameters', () => {
      const params = dateToServerParams('2026-09-01', '2026-09-15');
      expect(params).toEqual({
        p_start_date: '2026-09-01',
        p_end_date_exclusive: '2026-09-16',
        p_timezone: 'Asia/Manila',
      });
    });

    test('handles month boundaries correctly (e.g. Sep 30 -> Oct 01)', () => {
      const params = dateToServerParams('2026-09-01', '2026-09-30');
      expect(params).toEqual({
        p_start_date: '2026-09-01',
        p_end_date_exclusive: '2026-10-01',
        p_timezone: 'Asia/Manila',
      });
    });

    test('throws if missing startDateStr or endDateStr', () => {
      expect(() => dateToServerParams(null, '2026-09-15')).toThrow('startDateStr and endDateStr are required');
      expect(() => dateToServerParams('2026-09-01', '')).toThrow('startDateStr and endDateStr are required');
    });
  });

  describe('canonical RPC wrappers', () => {
    test('getAnalyticsOverview calls supabase.rpc with correct params', async () => {
      const mockData = { gross_cash_collected: { current: 23675, previous: 3020 } };
      mockRpc.mockResolvedValueOnce({ data: mockData, error: null });

      const res = await getAnalyticsOverview('2026-09-01', '2026-09-15');
      expect(mockRpc).toHaveBeenCalledWith('get_analytics_overview', {
        p_start_date: '2026-09-01',
        p_end_date_exclusive: '2026-09-16',
        p_timezone: 'Asia/Manila',
      });
      expect(res).toEqual(mockData);
    });

    test('getAnalyticsOverview throws when RPC returns error', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: new Error('RPC error') });
      await expect(getAnalyticsOverview('2026-09-01', '2026-09-15')).rejects.toThrow('RPC error');
    });

    test('getReservationAnalytics calls supabase.rpc with correct params', async () => {
      const mockData = { status_breakdown: [], daily_trends: [] };
      mockRpc.mockResolvedValueOnce({ data: mockData, error: null });

      const res = await getReservationAnalytics('2026-09-01', '2026-09-15');
      expect(mockRpc).toHaveBeenCalledWith('get_reservation_analytics', {
        p_start_date: '2026-09-01',
        p_end_date_exclusive: '2026-09-16',
        p_timezone: 'Asia/Manila',
      });
      expect(res).toEqual(mockData);
    });

    test('getCashflowAnalytics calls supabase.rpc with correct params', async () => {
      const mockData = { gross_cash_collected: 23675, method_breakdown: [], purpose_breakdown: [] };
      mockRpc.mockResolvedValueOnce({ data: mockData, error: null });

      const res = await getCashflowAnalytics('2026-09-01', '2026-09-15');
      expect(mockRpc).toHaveBeenCalledWith('get_cashflow_analytics', {
        p_start_date: '2026-09-01',
        p_end_date_exclusive: '2026-09-16',
        p_timezone: 'Asia/Manila',
      });
      expect(res).toEqual(mockData);
    });

    test('getInventoryHealthAnalytics calls supabase.rpc without date params', async () => {
      const mockData = { available_units: 876, in_stock_variants: 122 };
      mockRpc.mockResolvedValueOnce({ data: mockData, error: null });

      const res = await getInventoryHealthAnalytics();
      expect(mockRpc).toHaveBeenCalledWith('get_inventory_health_analytics');
      expect(res).toEqual(mockData);
    });

    test('getProductPerformanceAnalytics calls supabase.rpc with correct params', async () => {
      const mockData = { top_performing_items: [], most_wishlisted_items: [], category_distribution: [] };
      mockRpc.mockResolvedValueOnce({ data: mockData, error: null });

      const res = await getProductPerformanceAnalytics('2026-09-01', '2026-09-15');
      expect(mockRpc).toHaveBeenCalledWith('get_product_performance_analytics', {
        p_start_date: '2026-09-01',
        p_end_date_exclusive: '2026-09-16',
        p_timezone: 'Asia/Manila',
      });
      expect(res).toEqual(mockData);
    });

    test('getCustomerCohortAnalytics calls supabase.rpc with correct params', async () => {
      const mockData = { new_registered_users: 17, unique_customers_served: 7, returning_customers: 2 };
      mockRpc.mockResolvedValueOnce({ data: mockData, error: null });

      const res = await getCustomerCohortAnalytics('2026-09-01', '2026-09-15');
      expect(mockRpc).toHaveBeenCalledWith('get_customer_cohort_analytics', {
        p_start_date: '2026-09-01',
        p_end_date_exclusive: '2026-09-16',
        p_timezone: 'Asia/Manila',
      });
      expect(res).toEqual(mockData);
    });
  });

  const setupRangeQuery = (data, error = null) => {
    const limitFn = jest.fn().mockResolvedValue({ data, error });
    const lteFn = jest.fn().mockReturnValue({ limit: limitFn });
    const gteFn = jest.fn().mockReturnValue({ lte: lteFn });
    const selectFn = jest.fn().mockReturnValue({ gte: gteFn });

    mockFrom.mockReturnValue({
      select: selectFn,
    });

    return { selectFn, gteFn, lteFn, limitFn };
  };

  describe('getReservationsRange (legacy)', () => {
    test('fetches reservations bounded by created_at range', async () => {
      const mockReservations = [
        { id: 'res-1', created_at: '2026-09-01T00:00:00Z', total_amount: 1500 },
      ];
      const { selectFn, gteFn, lteFn } = setupRangeQuery(mockReservations);

      const startDate = '2026-09-01T00:00:00.000Z';
      const endDate = '2026-09-10T23:59:59.999Z';

      const result = await getReservationsRange(startDate, endDate);

      expect(mockFrom).toHaveBeenCalledWith('reservations');
      expect(selectFn).toHaveBeenCalledWith('*');
      expect(gteFn).toHaveBeenCalledWith('created_at', startDate);
      expect(lteFn).toHaveBeenCalledWith('created_at', endDate);
      expect(result).toEqual(mockReservations);
    });

    test('throws on error', async () => {
      setupRangeQuery(null, new Error('Reservations query failed'));

      await expect(
        getReservationsRange('2026-09-01', '2026-09-10')
      ).rejects.toThrow('Reservations query failed');
    });
  });

  describe('getArSessionsRange (legacy)', () => {
    test('fetches ar_sessions bounded by created_at range', async () => {
      const mockSessions = [
        { id: 'ar-1', created_at: '2026-09-02T10:00:00Z', duration: 120 },
      ];
      const { selectFn, gteFn, lteFn } = setupRangeQuery(mockSessions);

      const startDate = '2026-09-01T00:00:00.000Z';
      const endDate = '2026-09-10T23:59:59.999Z';

      const result = await getArSessionsRange(startDate, endDate);

      expect(mockFrom).toHaveBeenCalledWith('ar_sessions');
      expect(selectFn).toHaveBeenCalledWith('*');
      expect(gteFn).toHaveBeenCalledWith('created_at', startDate);
      expect(lteFn).toHaveBeenCalledWith('created_at', endDate);
      expect(result).toEqual(mockSessions);
    });

    test('throws on error', async () => {
      setupRangeQuery(null, new Error('AR query failed'));

      await expect(
        getArSessionsRange('2026-09-01', '2026-09-10')
      ).rejects.toThrow('AR query failed');
    });
  });

  describe('getFeedbackRange (legacy)', () => {
    test('fetches feedback bounded by created_at range', async () => {
      const mockFeedback = [
        { id: 'fb-1', created_at: '2026-09-03T12:00:00Z', rating: 5 },
      ];
      const { selectFn, gteFn, lteFn } = setupRangeQuery(mockFeedback);

      const startDate = '2026-09-01T00:00:00.000Z';
      const endDate = '2026-09-10T23:59:59.999Z';

      const result = await getFeedbackRange(startDate, endDate);

      expect(mockFrom).toHaveBeenCalledWith('feedback');
      expect(selectFn).toHaveBeenCalledWith('*');
      expect(gteFn).toHaveBeenCalledWith('created_at', startDate);
      expect(lteFn).toHaveBeenCalledWith('created_at', endDate);
      expect(result).toEqual(mockFeedback);
    });

    test('throws on error', async () => {
      setupRangeQuery(null, new Error('Feedback query failed'));

      await expect(
        getFeedbackRange('2026-09-01', '2026-09-10')
      ).rejects.toThrow('Feedback query failed');
    });
  });
});

