import { supabase } from '../lib/supabaseClient';
import { errorReporting } from './observability';

/**
 * Derives the canonical Month-to-Date (MTD) half-open date range from a Manila business date (YYYY-MM-DD).
 * For '2026-09-15', returns:
 * {
 *   startDateStr: '2026-09-01',
 *   endDateStr: '2026-09-15',
 *   timezone: 'Asia/Manila'
 * }
 */
export const deriveMtdDateRange = (businessDateStr, timezone = 'Asia/Manila') => {
  if (!businessDateStr) {
    throw new Error('businessDateStr is required');
  }
  const [year, month] = businessDateStr.split('-');
  const startDateStr = `${year}-${month}-01`;
  return {
    startDateStr,
    endDateStr: businessDateStr,
    timezone,
  };
};

/**
 * Operations Domain: Fetches deduplicated action queues, pending refund liability,
 * and today's schedule in Asia/Manila.
 */
export const getDashboardOperations = async (todayDate, timezone = 'Asia/Manila') => {
  const params = {};
  if (todayDate) params.p_today_date = todayDate;
  if (timezone) params.p_timezone = timezone;

  const { data, error } = await supabase.rpc('get_dashboard_operations', params);
  if (error) {
    errorReporting.capture(error, { domain: 'dashboard', operation: 'getDashboardOperations', params });
    throw error;
  }
  return data;
};

/**
 * Inventory Domain: Fetches the top urgent inventory alerts (out of stock and critical low stock),
 * evaluated authoritatively on the server via canonical available <= low_stock_threshold().
 */
export const getTopInventoryAlerts = async (limit = 5) => {
  const { data, error } = await supabase.rpc('get_top_inventory_alerts', { p_limit: limit });
  if (error) {
    errorReporting.capture(error, { domain: 'dashboard', operation: 'getTopInventoryAlerts', limit });
    throw error;
  }
  return data || [];
};

/**
 * Customer Pulse: Fetches the newest registered customer profiles, sorted by created_at DESC.
 * Transition-aware for Unified Identity (matches role = customer or role IS NULL until account_kind is live).
 */
export const getRecentSignups = async (limit = 5) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, first_name, last_name, email, created_at, role')
    .or('role.eq.customer,role.is.null')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    errorReporting.capture(error, { domain: 'dashboard', operation: 'getRecentSignups', limit });
    throw error;
  }
  return data || [];
};

/**
 * Activity Domain: Fetches safe operational events from public.logs, strictly excluding
 * privileged IAM, MFA, auth, and device admin entries.
 */
export const getRecentDashboardActivity = async (limit = 8) => {
  const { data, error } = await supabase.rpc('get_recent_dashboard_activity', { p_limit: limit });
  if (error) {
    errorReporting.capture(error, { domain: 'dashboard', operation: 'getRecentDashboardActivity', limit });
    throw error;
  }
  return data || [];
};
