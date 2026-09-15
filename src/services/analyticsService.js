import { supabase } from '../lib/supabaseClient';
import { errorReporting } from './observability';

/**
 * Formats inclusive UI dates (YYYY-MM-DD) into canonical half-open RPC parameters.
 * When an admin selects Sep 1 to Sep 15, start is 2026-09-01 and exclusive end is 2026-09-16.
 */
export const dateToServerParams = (startDateStr, endDateStr, timezone = 'Asia/Manila') => {
  if (!startDateStr || !endDateStr) {
    throw new Error('startDateStr and endDateStr are required');
  }

  // Parse YYYY-MM-DD components directly to avoid timezone shift during Date parsing
  const [eYear, eMonth, eDay] = endDateStr.split('-').map(Number);
  // Add 1 calendar day to compute exclusive upper bound
  const nextDay = new Date(Date.UTC(eYear, eMonth - 1, eDay + 1));
  const nextDayYyyy = nextDay.getUTCFullYear();
  const nextDayMm = String(nextDay.getUTCMonth() + 1).padStart(2, '0');
  const nextDayDd = String(nextDay.getUTCDate()).padStart(2, '0');
  const endDateExclusiveStr = `${nextDayYyyy}-${nextDayMm}-${nextDayDd}`;

  return {
    p_start_date: startDateStr,
    p_end_date_exclusive: endDateExclusiveStr,
    p_timezone: timezone,
  };
};

export const getAnalyticsOverview = async (startDateStr, endDateStr, timezone = 'Asia/Manila') => {
  const params = dateToServerParams(startDateStr, endDateStr, timezone);
  const { data, error } = await supabase.rpc('get_analytics_overview', { ...params });
  if (error) {
    errorReporting.capture(error, { domain: 'analytics', operation: 'getAnalyticsOverview', params });
    throw error;
  }
  return data;
};

export const getReservationAnalytics = async (startDateStr, endDateStr, timezone = 'Asia/Manila') => {
  const params = dateToServerParams(startDateStr, endDateStr, timezone);
  const { data, error } = await supabase.rpc('get_reservation_analytics', { ...params });
  if (error) {
    errorReporting.capture(error, { domain: 'analytics', operation: 'getReservationAnalytics', params });
    throw error;
  }
  return data;
};

export const getCashflowAnalytics = async (startDateStr, endDateStr, timezone = 'Asia/Manila') => {
  const params = dateToServerParams(startDateStr, endDateStr, timezone);
  const { data, error } = await supabase.rpc('get_cashflow_analytics', { ...params });
  if (error) {
    errorReporting.capture(error, { domain: 'analytics', operation: 'getCashflowAnalytics', params });
    throw error;
  }
  return data;
};

export const getInventoryHealthAnalytics = async () => {
  const { data, error } = await supabase.rpc('get_inventory_health_analytics');
  if (error) {
    errorReporting.capture(error, { domain: 'analytics', operation: 'getInventoryHealthAnalytics' });
    throw error;
  }
  return data;
};

export const getProductPerformanceAnalytics = async (startDateStr, endDateStr, timezone = 'Asia/Manila') => {
  const params = dateToServerParams(startDateStr, endDateStr, timezone);
  const { data, error } = await supabase.rpc('get_product_performance_analytics', { ...params });
  if (error) {
    errorReporting.capture(error, { domain: 'analytics', operation: 'getProductPerformanceAnalytics', params });
    throw error;
  }
  return data;
};

export const getCustomerCohortAnalytics = async (startDateStr, endDateStr, timezone = 'Asia/Manila') => {
  const params = dateToServerParams(startDateStr, endDateStr, timezone);
  const { data, error } = await supabase.rpc('get_customer_cohort_analytics', { ...params });
  if (error) {
    errorReporting.capture(error, { domain: 'analytics', operation: 'getCustomerCohortAnalytics', params });
    throw error;
  }
  return data;
};

// Backwards compatibility wrappers if needed during migration transition
export const getReservationsRange = async (startDate, endDate) => {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .limit(10000);
  if (error) {
    errorReporting.capture(error, { domain: 'analytics', operation: 'getReservationsRange' });
    throw error;
  }
  return data || [];
};

export const getArSessionsRange = async (startDate, endDate) => {
  const { data, error } = await supabase
    .from('ar_sessions')
    .select('*')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .limit(10000);
  if (error) {
    errorReporting.capture(error, { domain: 'analytics', operation: 'getArSessionsRange' });
    throw error;
  }
  return data || [];
};

export const getFeedbackRange = async (startDate, endDate) => {
  const { data, error } = await supabase
    .from('feedback')
    .select('*')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .limit(10000);
  if (error) {
    errorReporting.capture(error, { domain: 'analytics', operation: 'getFeedbackRange' });
    throw error;
  }
  return data || [];
};

