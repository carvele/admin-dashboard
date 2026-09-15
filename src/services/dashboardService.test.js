import {
  deriveMtdDateRange,
  getDashboardOperations,
  getTopInventoryAlerts,
  getRecentSignups,
  getRecentDashboardActivity,
} from './dashboardService';
import { supabase } from '../lib/supabaseClient';
import { errorReporting } from './observability';

jest.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

jest.mock('./observability', () => ({
  errorReporting: {
    capture: jest.fn(),
  },
}));

describe('dashboardService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('deriveMtdDateRange', () => {
    it('correctly derives month-to-date interval from a business date', () => {
      const result = deriveMtdDateRange('2026-09-15');
      expect(result).toEqual({
        startDateStr: '2026-09-01',
        endDateStr: '2026-09-15',
        timezone: 'Asia/Manila',
      });
    });

    it('handles first day of the month', () => {
      const result = deriveMtdDateRange('2026-10-01');
      expect(result).toEqual({
        startDateStr: '2026-10-01',
        endDateStr: '2026-10-01',
        timezone: 'Asia/Manila',
      });
    });

    it('throws when businessDateStr is missing', () => {
      expect(() => deriveMtdDateRange(null)).toThrow('businessDateStr is required');
    });
  });

  describe('getDashboardOperations', () => {
    it('calls get_dashboard_operations RPC with default timezone', async () => {
      const mockData = { business_date: '2026-09-15', action_queues: { unique_action_count: 3 } };
      supabase.rpc.mockResolvedValueOnce({ data: mockData, error: null });

      const res = await getDashboardOperations('2026-09-15');
      expect(supabase.rpc).toHaveBeenCalledWith('get_dashboard_operations', {
        p_today_date: '2026-09-15',
        p_timezone: 'Asia/Manila',
      });
      expect(res).toEqual(mockData);
    });

    it('captures error and rethrows on failure', async () => {
      const mockErr = new Error('RPC failure');
      supabase.rpc.mockResolvedValueOnce({ data: null, error: mockErr });

      await expect(getDashboardOperations('2026-09-15')).rejects.toThrow('RPC failure');
      expect(errorReporting.capture).toHaveBeenCalledWith(
        mockErr,
        expect.objectContaining({ domain: 'dashboard', operation: 'getDashboardOperations' })
      );
    });
  });

  describe('getTopInventoryAlerts', () => {
    it('calls get_top_inventory_alerts RPC with limit', async () => {
      const mockAlerts = [{ sku: 'JZ-001', available: 0 }];
      supabase.rpc.mockResolvedValueOnce({ data: mockAlerts, error: null });

      const res = await getTopInventoryAlerts(5);
      expect(supabase.rpc).toHaveBeenCalledWith('get_top_inventory_alerts', { p_limit: 5 });
      expect(res).toEqual(mockAlerts);
    });

    it('captures error and rethrows on failure', async () => {
      const mockErr = new Error('Inventory RPC failure');
      supabase.rpc.mockResolvedValueOnce({ data: null, error: mockErr });

      await expect(getTopInventoryAlerts(5)).rejects.toThrow('Inventory RPC failure');
      expect(errorReporting.capture).toHaveBeenCalledWith(
        mockErr,
        expect.objectContaining({ domain: 'dashboard', operation: 'getTopInventoryAlerts' })
      );
    });
  });

  describe('getRecentSignups', () => {
    it('queries profiles ordered by created_at DESC with limit', async () => {
      const mockProfiles = [{ id: 'p1', full_name: 'Customer One' }];
      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValueOnce({ data: mockProfiles, error: null }),
      };
      supabase.from.mockReturnValueOnce(queryBuilder);

      const res = await getRecentSignups(5);
      expect(supabase.from).toHaveBeenCalledWith('profiles');
      expect(queryBuilder.select).toHaveBeenCalledWith('id, full_name, first_name, last_name, email, created_at, role');
      expect(queryBuilder.or).toHaveBeenCalledWith('role.eq.customer,role.is.null');
      expect(queryBuilder.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(queryBuilder.limit).toHaveBeenCalledWith(5);
      expect(res).toEqual(mockProfiles);
    });

    it('captures error and rethrows on failure', async () => {
      const mockErr = new Error('Profiles query failed');
      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValueOnce({ data: null, error: mockErr }),
      };
      supabase.from.mockReturnValueOnce(queryBuilder);

      await expect(getRecentSignups(5)).rejects.toThrow('Profiles query failed');
      expect(errorReporting.capture).toHaveBeenCalledWith(
        mockErr,
        expect.objectContaining({ domain: 'dashboard', operation: 'getRecentSignups' })
      );
    });
  });

  describe('getRecentDashboardActivity', () => {
    it('calls get_recent_dashboard_activity RPC with limit', async () => {
      const mockLogs = [{ id: 'log-1', action: 'Updated product details' }];
      supabase.rpc.mockResolvedValueOnce({ data: mockLogs, error: null });

      const res = await getRecentDashboardActivity(8);
      expect(supabase.rpc).toHaveBeenCalledWith('get_recent_dashboard_activity', { p_limit: 8 });
      expect(res).toEqual(mockLogs);
    });

    it('captures error and rethrows on failure', async () => {
      const mockErr = new Error('Logs RPC failure');
      supabase.rpc.mockResolvedValueOnce({ data: null, error: mockErr });

      await expect(getRecentDashboardActivity(8)).rejects.toThrow('Logs RPC failure');
      expect(errorReporting.capture).toHaveBeenCalledWith(
        mockErr,
        expect.objectContaining({ domain: 'dashboard', operation: 'getRecentDashboardActivity' })
      );
    });
  });
});
