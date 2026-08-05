/**
 * reservationService.js  (Supabase)
 * Replaces the Firebase-based reservationService.
 *
 * Key mapping:
 *  Firestore `docId`          → Supabase `id` (uuid)
 *  Firestore `productId`      → `product_id` (uuid FK to products)
 *  Firestore `customerId`     → `customer_id` (uuid FK to profiles)
 *  Firestore `appointmentTime` (string "HH:MM") is combined with `date` into
 *    `appointment_time` (timestamptz) on write, and unpacked on read.
 */

import { supabase } from '../lib/supabaseClient';
import {
  getCollection,
  subscribeToCollection,
  addDocument,
  updateDocument,
  deleteDocument,
  getPaginatedCollection,
  normaliseRow,
  toCamel,
} from '../lib/supabaseService';

// ── Helpers ─────────────────────────────────────────────────

/**
 * Combine a date string or epoch and a time string ("HH:MM") into a timestamptz.
 * Returns null if inputs are invalid.
 */
const buildTimestamp = (date, timeStr) => {
  if (!date) return null;
  const d = date instanceof Date ? date : (typeof date === 'number' ? new Date(date) : new Date(date));
  if (isNaN(d.getTime())) return null;

  const datePart = d.toISOString().split('T')[0]; // "YYYY-MM-DD"

  if (!timeStr || typeof timeStr !== 'string') return d.toISOString();
  return `${datePart}T${timeStr.padStart(5, '0')}:00+08:00`;
};

/**
 * Extract the "HH:MM" time string from a timestamptz column value.
 */
const extractTime = (isoStr) => {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
};

/**
 * Convert a raw Supabase reservation row into the shape the UI expects.
 * Outputs camelCase fields plus the legacy helpers (docId, id for display_id).
 */
const normaliseReservation = (row) => {
  if (!row) return null;
  const c = toCamel(row);
  return {
    ...c,
    docId: c.id,
    // Legacy field: UI sometimes uses 'id' as the display reservation number
    displayId: c.displayId ?? c.id,
    // appointmentTime as the extracted "HH:MM" string
    appointmentTime: extractTime(c.appointmentTime),
    // date as JS Date object for UI components that call .toDate() style methods
    date: c.date ? new Date(c.date) : null,
    returnDate: c.returnDate ? new Date(c.returnDate) : null,
  };
};

// ── Subscriptions ────────────────────────────────────────────

export const subscribeToReservations = (callback) => {
  return subscribeToCollection('reservations', (rows) => {
    // subscribeToCollection issues no ORDER BY, so Postgres returns rows in
    // whatever order it likes (typically insertion order) -- newest was
    // landing at the bottom of the list instead of the top.
    const sorted = [...rows].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
    callback(sorted.map(normaliseReservation));
  }, {}, true /* includeDeleted so cancelled/history are accessible */);
};

// ── One-time fetches ─────────────────────────────────────────

export const getReservations = async (maxResults = 0) => {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(maxResults > 0 ? maxResults : 10000);
  if (error) throw error;
  return (data ?? []).map(normaliseReservation);
};

export const getPaginatedReservations = async (pageSize, page = 0, filters = {}) => {
  const result = await getPaginatedCollection('reservations', pageSize, page, filters, true);
  return { ...result, data: result.data.map(normaliseReservation) };
};

export const getReservationsByProduct = async (productId, productName) => {
  const results = new Map();

  // 1. By product_id (UUID FK)
  if (productId) {
    const { data: byId } = await supabase
      .from('reservations')
      .select('*')
      .eq('product_id', productId);
    (byId ?? []).forEach((row) => results.set(row.id, row));
  }

  // 2. By product_name (legacy text match)
  if (productName) {
    const { data: byName } = await supabase
      .from('reservations')
      .select('*')
      .eq('product_name', productName);
    (byName ?? []).forEach((row) => results.set(row.id, row));
  }

  return Array.from(results.values())
    .map(normaliseReservation)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

// ── Writes ────────────────────────────────────────────────────

export const createReservation = async (data) => {
  // Combine date + appointmentTime string → appointment_time timestamptz
  const appointmentTs = buildTimestamp(data.date, data.appointmentTime);
  const returnTs = data.returnDate
    ? (data.returnDate instanceof Date ? data.returnDate.toISOString() : new Date(data.returnDate).toISOString())
    : null;
  const dateTs = data.date
    ? (data.date instanceof Date ? data.date.toISOString() : new Date(data.date).toISOString())
    : null;

  const { appointmentTime, ...rest } = data;
  return addDocument('reservations', {
    ...rest,
    date: dateTs,
    return_date: returnTs,
    appointment_time: appointmentTs,
    deleted: false,
  });
};

export const updateReservation = (docId, updates) => {
  // If updating date/appointmentTime, rebuild the combined timestamp
  if (updates.date || updates.appointmentTime) {
    const date = updates.date ?? undefined;
    const time = updates.appointmentTime ?? undefined;
    if (date || time) {
      updates = {
        ...updates,
        appointment_time: buildTimestamp(date, time),
      };
    }
    delete updates.appointmentTime; // remove camelCase before sending to Supabase
  }
  return updateDocument('reservations', docId, updates);
};

export const deleteReservation = (docId) => {
  return deleteDocument('reservations', docId);
};

// ── Inventory adjustment ─────────────────────────────────────

/**
 * Adjust inventory available/reserved counts when a reservation status changes.
 * `delta` = positive when releasing (e.g. cancelled), negative when consuming.
 * `isConsume` = true permanently reduces total stock (for sales).
 */
export const adjustInventoryForReservation = async (productIdOrName, size, delta, isConsume = false) => {
  try {
    let invRow = null;

    // 1. Try by product_doc_id (uuid)
    const { data: byId } = await supabase
      .from('inventory')
      .select('id, total, reserved, available')
      .eq('product_doc_id', productIdOrName)
      .eq('size', size)
      .maybeSingle();
    invRow = byId;

    // 2. Try by SKU
    if (!invRow) {
      const { data: bySku } = await supabase
        .from('inventory')
        .select('id, total, reserved, available')
        .eq('sku', productIdOrName)
        .eq('size', size)
        .maybeSingle();
      invRow = bySku;
    }

    // 3. Try by item name
    if (!invRow) {
      const { data: byName } = await supabase
        .from('inventory')
        .select('id, total, reserved, available')
        .eq('item', productIdOrName)
        .eq('size', size)
        .maybeSingle();
      invRow = byName;
    }

    if (!invRow) {
      console.warn(`[Inventory] No matching item found for ${productIdOrName} (${size})`);
      return;
    }

    const updates = {};
    if (isConsume) {
      const amount = Math.abs(delta);
      updates.total = Math.max(0, (invRow.total || 0) - amount);
      updates.reserved = Math.max(0, (invRow.reserved || 0) - amount);
    } else {
      updates.available = Math.max(0, (invRow.available || 0) + delta);
      updates.reserved = Math.max(0, (invRow.reserved || 0) - delta);
    }
    updates.updated_at = new Date().toISOString();

    const { error } = await supabase.from('inventory').update(updates).eq('id', invRow.id);
    if (error) console.warn('[Inventory] Adjust failed:', error.message);
    else console.log(`[Inventory] Adjusted stock for ${productIdOrName} (${size}): delta=${delta}`);
  } catch (err) {
    console.warn('Stock adjustment failed:', err);
  }
};

/**
 * Repairs stale customer/product name fields on a reservation row.
 * Safe to call speculatively — only writes when data actually differs.
 */
export const repairReservationData = async (reservation) => {
  const currentCustomerName = reservation.customerName || reservation.customer || '';
  const customerId = reservation.customerId || '';
  const currentProductName = reservation.productName || reservation.outfit || '';
  const productId = reservation.productId || '';

  const isLikelyId = (str) => /^[a-zA-Z0-9-]{15,40}$/.test(str);

  const updates = {};

  // 1. Repair customer name
  if (customerId && (!currentCustomerName || isLikelyId(currentCustomerName))) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('id', customerId)
      .maybeSingle();
    if (profile) {
      const realName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email || 'User';
      if (realName && realName !== currentCustomerName) updates.customerName = realName;
    }
  }

  // 2. Repair product name
  if (productId && (!currentProductName || isLikelyId(currentProductName))) {
    const { data: product } = await supabase
      .from('products')
      .select('name, images')
      .eq('id', productId)
      .maybeSingle();
    if (product) {
      if (product.name && product.name !== currentProductName) updates.productName = product.name;
      if (!reservation.imageUrl && product.images?.[0]) updates.imageUrl = product.images[0];
    }
  }

  if (Object.keys(updates).length > 0) {
    await updateReservation(reservation.docId, updates);
    console.log(`[Healer] Repaired reservation ${reservation.displayId ?? reservation.docId}`);
    return true;
  }
  return false;
};
