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
import { countsAsRevenue } from '../utils/reservationStatus';
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

// ── Engagement stats (derived — no such columns exist on profiles) ──
// The Customers page used to render `engagementScore`, `totalSpent`,
// `wardrobeItems`, `reservations` and `preferredSizes` straight off the profile
// row. None of those columns exist, so every customer displayed 0 / "None yet".
// These are computed here from the real `reservations` + `wardrobe_items` data.

/**
 * How the 0–100 engagement score is built. Kept explicit (and surfaced in the
 * UI) so it reads as a defined metric rather than a magic number.
 *   Recency   (max 40) — activity in the last 30 days scores full, decaying to
 *                        0 once the last activity is 180+ days old.
 *   Frequency (max 40) — 10 points per reservation.
 *   Wardrobe  (max 20) — 4 points per saved wardrobe item.
 */
export const ENGAGEMENT_FORMULA =
  'Recency (40) + Reservations (10 each, max 40) + Saved items (4 each, max 20)';

const scoreEngagement = ({ reservationCount, wardrobeCount, lastActivity }) => {
  let recency = 0;
  if (lastActivity) {
    const days = (Date.now() - new Date(lastActivity).getTime()) / 86_400_000;
    if (days <= 30) recency = 40;
    else if (days >= 180) recency = 0;
    else recency = Math.round(40 * (1 - (days - 30) / 150));
  }
  const frequency = Math.min(reservationCount * 10, 40);
  const wardrobe = Math.min(wardrobeCount * 4, 20);
  return Math.max(0, Math.min(100, recency + frequency + wardrobe));
};

/**
 * Compute engagement stats for many customers at once.
 * Two queries total regardless of how many customers are passed, so paging the
 * customer list doesn't fan out into an N+1.
 *
 * @param {string[]} customerIds
 * @returns {Promise<Record<string, object>>} keyed by customer id
 */
export const getCustomerStatsBatch = async (customerIds) => {
  const ids = (customerIds ?? []).filter(Boolean);
  if (ids.length === 0) return {};

  const [resResult, wardrobeResult] = await Promise.all([
    supabase
      .from('reservations')
      .select('customer_id, status, payment_status, rental_price, size, created_at')
      .in('customer_id', ids)
      .eq('deleted', false),
    supabase
      .from('wardrobe_items')
      .select('user_id')
      .in('user_id', ids)
      .eq('deleted', false),
  ]);

  if (resResult.error) throw resResult.error;
  if (wardrobeResult.error) throw wardrobeResult.error;

  const wardrobeCounts = {};
  for (const row of wardrobeResult.data ?? []) {
    wardrobeCounts[row.user_id] = (wardrobeCounts[row.user_id] ?? 0) + 1;
  }

  const byCustomer = {};
  for (const id of ids) {
    byCustomer[id] = {
      reservationCount: 0,
      completedCount: 0,
      totalSpent: 0,
      sizeTally: {},
      lastActivity: null,
    };
  }

  for (const r of resResult.data ?? []) {
    const bucket = byCustomer[r.customer_id];
    if (!bucket) continue;

    bucket.reservationCount += 1;
    if (r.status === 'Completed') bucket.completedCount += 1;
    if (countsAsRevenue(r)) bucket.totalSpent += Number(r.rental_price) || 0;
    if (r.size) bucket.sizeTally[r.size] = (bucket.sizeTally[r.size] ?? 0) + 1;
    if (r.created_at && (!bucket.lastActivity || r.created_at > bucket.lastActivity)) {
      bucket.lastActivity = r.created_at;
    }
  }

  const stats = {};
  for (const id of ids) {
    const b = byCustomer[id];
    const wardrobeCount = wardrobeCounts[id] ?? 0;
    stats[id] = {
      reservationCount: b.reservationCount,
      completedCount: b.completedCount,
      totalSpent: b.totalSpent,
      wardrobeCount,
      lastActivity: b.lastActivity,
      // Most-booked sizes first, top 3.
      preferredSizes: Object.entries(b.sizeTally)
        .sort((a, z) => z[1] - a[1])
        .slice(0, 3)
        .map(([size]) => size),
      engagementScore: scoreEngagement({
        reservationCount: b.reservationCount,
        wardrobeCount,
        lastActivity: b.lastActivity,
      }),
    };
  }
  return stats;
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
