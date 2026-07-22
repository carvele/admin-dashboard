/**
 * customerService.js  (Supabase)
 * Replaces the Firebase-based customerService.
 *
 * Key mapping:
 *  Firestore `users` collection → Supabase `public.profiles` (role = 'customer')
 *  Firestore `conversations`    → Supabase `public.conversations`
 *  Firestore `messages`         → Supabase `public.messages`
 */

import { supabase } from '../lib/supabaseClient';
import {
  getCollection,
  getDocument,
  addDocument,
  updateDocument,
  softDeleteDocument,
  subscribeToCollection,
  getPaginatedCollection,
  normaliseRow,
  toCamel,
} from '../lib/supabaseService';

// ── Customers (profiles with role = 'customer') ─────────────

/** Subscribe to all customer profiles in real-time. */
export const subscribeToCustomers = (callback) => {
  return subscribeToCollection('profiles', (rows) => {
    callback(rows.filter((r) => r.role === 'customer'));
  });
};

/** Fetch all customer profiles (one-time). */
export const getCustomers = async (maxResults = 0) => {
  let q = supabase
    .from('profiles')
    .select('*')
    .eq('role', 'customer')
    .eq('deleted', false);
  if (maxResults > 0) q = q.limit(maxResults);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...toCamel(r), docId: r.id }));
};

export const getCustomerById = async (id) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? { ...toCamel(data), docId: data.id } : null;
};

export const getPaginatedCustomers = async (pageSize, page = 0, filters = {}, includeDeleted = false) => {
  let q = supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .eq('role', 'customer');

  if (!includeDeleted) q = q.eq('deleted', false);

  for (const [col, val] of Object.entries(filters)) {
    q = q.eq(col, val);
  }

  const from = page * pageSize;
  q = q.range(from, from + pageSize - 1);

  const { data, count, error } = await q;
  if (error) throw error;
  return {
    data: (data ?? []).map((r) => ({ ...toCamel(r), docId: r.id })),
    hasMore: (from + (data?.length ?? 0)) < (count ?? 0),
    nextPage: page + 1,
  };
};

export const createCustomer = (customerData) => {
  return addDocument('profiles', { ...customerData, role: 'customer' });
};

export const updateCustomer = (docId, updates) => {
  return updateDocument('profiles', docId, updates);
};

/** Soft-delete a customer profile. */
export const deleteCustomer = (docId) => {
  return softDeleteDocument('profiles', docId);
};

// ── Measurements (public.user_measurements — one row per user) ─
// NOTE: body metrics live in the dedicated `user_measurements` table, NOT on
// `profiles`. The jsonb `measurements` column uses the same canonical keys the
// mobile app reads/writes (bust, waist, hips, inseam, shoulderWidth, armLength,
// torsoLength, legLength). height/weight are top-level numeric columns.

/** Fetch the single measurements row for a customer (or null). */
export const getCustomerMeasurements = async (userId) => {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('user_measurements')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
};

/**
 * Upsert a customer's measurements. `measurements` is merged onto whatever the
 * caller passes — callers should spread the existing jsonb first so keys the
 * admin form doesn't surface (e.g. confidence data) are preserved.
 * Writes raw column names directly (NO camel→snake conversion) so the jsonb
 * inner keys keep their camelCase form the mobile app expects.
 */
export const saveCustomerMeasurements = async (userId, { height, weight, measurements }) => {
  const payload = {
    user_id: userId,
    height: height ?? null,
    weight: weight ?? null,
    measurements: measurements ?? {},
    measurement_source: 'admin_manual',
  };
  const { error } = await supabase
    .from('user_measurements')
    .upsert(payload, { onConflict: 'user_id' });
  if (error) throw error;
};

// ── Reservations (re-exported from reservationService) ───────

export const subscribeToReservations = (callback) => {
  return subscribeToCollection('reservations', callback, {}, true);
};

export const getReservations = async () => {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...toCamel(r), docId: r.id }));
};

export const createReservation = (data) => addDocument('reservations', data);
export const updateReservation = (docId, updates) => updateDocument('reservations', docId, updates);
export const deleteReservation = (docId) => softDeleteDocument('reservations', docId);

// ── Wardrobe (placeholder — feature reads from wardrobe_items) ──

export const getCustomerWardrobe = async (customerId) => {
  if (!customerId) return [];
  const { data, error } = await supabase
    .from('wardrobe_items')
    .select('*')
    .eq('user_id', customerId)
    .eq('deleted', false);
  if (error) return [];
  return (data ?? []).map((r) => ({ ...toCamel(r), docId: r.id }));
};

// ── Notifications / Messaging ─────────────────────────────────

/**
 * Find or create a conversation for the given customerId, then append a staff message.
 * Maps to conversations (customer_id, last_message) + messages (conversation_id, sender_id, text).
 */
export const sendNotification = async (customerId, customerName, messageText, staffUser = null) => {
  const now = new Date().toISOString();

  // 1. Find existing conversation
  const { data: existing, error: convFetchErr } = await supabase
    .from('conversations')
    .select('id')
    .eq('customer_id', customerId)
    .maybeSingle();
  if (convFetchErr) throw convFetchErr;

  let conversationId;

  if (!existing) {
    // Create new conversation
    const { data: newConv, error: convInsertErr } = await supabase
      .from('conversations')
      .insert({
        customer_id: customerId,
        last_message: messageText,
        last_message_time: now,
        unread_count: 1,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single();
    if (convInsertErr) throw convInsertErr;
    conversationId = newConv.id;
  } else {
    conversationId = existing.id;
    await supabase.from('conversations').update({
      last_message: messageText,
      last_message_time: now,
      unread_count: supabase.rpc ? undefined : 0, // increment handled server-side ideally
      updated_at: now,
    }).eq('id', conversationId);
  }

  // 2. Insert message
  const { data: msg, error: msgErr } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: staffUser?.uid ?? null,
      sender_name: staffUser?.name ?? 'Staff',
      text: messageText,
      created_at: now,
    })
    .select('id')
    .single();
  if (msgErr) throw msgErr;

  return msg.id;
};
