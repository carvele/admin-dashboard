import { supabase } from '../lib/supabaseClient';
import { errorReporting } from './observability';

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
