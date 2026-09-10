const mockFrom = jest.fn();

jest.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
  },
}));

import {
  getReservationsRange,
  getArSessionsRange,
  getFeedbackRange,
} from './analyticsService';

describe('analyticsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  describe('getReservationsRange', () => {
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

  describe('getArSessionsRange', () => {
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

  describe('getFeedbackRange', () => {
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
