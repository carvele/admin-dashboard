/**
 * accountDeletionService.js
 *
 * Processing side of public.account_deletion_requests. The mobile app files
 * requests (see jezsy-mobile-app/app/profile/account-settings.tsx); this is
 * the staff-facing queue that acts on them.
 *
 * Actual erasure runs server-side in two privileged steps neither of which
 * can happen from this client:
 *  1. public.process_account_deletion(_request_id) -- a SECURITY DEFINER RPC
 *     that scrubs/erases/anonymizes the public schema (blocked if the
 *     customer still has an open reservation or in-flight payment).
 *  2. auth.admin.deleteUser -- revokes the login itself. Requires the
 *     service-role key, so it runs inside the process-account-deletion Edge
 *     Function, never here.
 * This file only ever calls the Edge Function for the mutation; it reads
 * directly from Supabase for the queue list.
 */

import { supabase } from '../lib/supabaseClient';
import { toCamel } from '../lib/supabaseService';

/** Pending requests, joined to the customer's current (pre-scrub) profile. */
export const getPendingDeletionRequests = async () => {
  const { data, error } = await supabase
    .from('account_deletion_requests')
    .select(`
      id,
      user_id,
      reason,
      status,
      created_at,
      profiles!user_id (
        first_name,
        last_name,
        email,
        phone
      )
    `)
    .in('status', ['pending', 'auth_revocation_pending'])
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map((row) => ({
    ...toCamel(row),
    docId: row.id,
    customerName:
      [row.profiles?.first_name, row.profiles?.last_name].filter(Boolean).join(' ') || 'Unknown customer',
    customerEmail: row.profiles?.email ?? null,
    customerPhone: row.profiles?.phone ?? null,
  }));
};

/**
 * Any reservation/payment obligations that would currently block processing.
 * Purely informational (a preview before staff commit) -- the RPC re-checks
 * the same condition itself and is the actual enforcement point, since this
 * can go stale between the preview and the click.
 */
export const getBlockingObligations = async (userId) => {
  const [{ data: reservations, error: resErr }, { data: payments, error: payErr }] = await Promise.all([
    supabase
      .from('reservations')
      .select('id, display_id, status, payment_status, payment_type, rental_price, deposit, balance_settled_at')
      .eq('customer_id', userId)
      .eq('deleted', false),
    supabase
      .from('payments')
      .select('id, status')
      .eq('user_id', userId)
      .in('status', ['awaiting_payment', 'processing']),
  ]);

  if (resErr) throw resErr;
  if (payErr) throw payErr;

  const blockingReservations = (reservations || []).filter((r) => {
    if (r.status?.toLowerCase() === 'cancelled') return false;
    if (r.balance_settled_at) return false;
    const paymentStatus = (r.payment_status || '').toLowerCase();
    const paymentType = (r.payment_type || '').toLowerCase();
    const rentalPrice = Number(r.rental_price || 0);
    const deposit = Number(r.deposit || 0);

    if (paymentStatus !== 'paid') return true;
    if (paymentType === 'deposit' && rentalPrice > deposit) return true;
    return false;
  });

  return {
    reservations: blockingReservations,
    payments: payments || [],
  };
};

const getEnv = (key) => {
  try {
    const meta = new Function('return import.meta')();
    if (meta && meta.env && meta.env[key]) {
      return meta.env[key];
    }
  } catch {
    // fallback for environments without import.meta
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return '';
};

/**
 * Calls the process-account-deletion Edge Function, which runs the DB-side
 * scrub then revokes the login. Returns { blocked: true, ... } if the RPC
 * found an open obligation instead of processing.
 */
export const processAccountDeletion = async (requestId) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Your session has expired. Please log in again.');

  const supabaseUrl = getEnv('VITE_SUPABASE_URL') || 'https://wufcmtndotfvxvvxkamv.supabase.co';
  const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY') || '';

  const res = await fetch(
    `${supabaseUrl}/functions/v1/process-account-deletion`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({ request_id: requestId }),
    },
  );

  const body = await res.json().catch(() => ({}));

  if (!res.ok && res.status !== 207) {
    throw new Error(body?.error || 'Failed to process this deletion request.');
  }

  return body;
};

/**
 * Declines a pending request without erasing anything -- moves it to
 * 'cancelled' via the reject_account_deletion_request RPC. Unlike
 * processAccountDeletion this never needs the service-role Edge Function:
 * it's a plain status write, so it's staff-authenticated and RPC-enforced
 * directly (SECURITY DEFINER, re-checks is_staff_or_admin()).
 */
export const rejectAccountDeletion = async (requestId) => {
  const { error } = await supabase.rpc('reject_account_deletion_request', {
    _request_id: requestId,
  });
  if (error) throw error;
};
