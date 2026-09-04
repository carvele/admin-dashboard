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
  subscribeToCollection,
  addDocument,
  updateDocument,
  deleteDocument,
  getPaginatedCollection,
  toCamel,
} from '../lib/supabaseService';

import { recalculateAllInventoryStock } from './productService';

// ── Helpers ─────────────────────────────────────────────────

/**
 * Combine a date string or epoch and a time string ("HH:MM") into a timestamptz.
 * Returns null if inputs are invalid.
 */
const toDate = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : (typeof value === 'number' ? new Date(value) : new Date(value));
  return isNaN(d.getTime()) ? null : d;
};

/**
 * "YYYY-MM-DD" in the local calendar. toISOString() would convert to UTC first,
 * which for Manila (UTC+8) rolls any time before 08:00 back to the previous
 * day -- so a 07:00 booking on the 6th was stored as the 5th.
 */
const toLocalDateString = (date) => {
  const d = toDate(date);
  if (!d) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const buildTimestamp = (date, timeStr) => {
  const d = toDate(date);
  if (!d) return null;

  const datePart = toLocalDateString(d);

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
    // Locale is not timezone: without an explicit timeZone this rendered in
    // the staff machine's zone, so any laptop not set to Manila showed every
    // appointment at the wrong hour. Matches the zone the RPC writes with.
    return d.toLocaleTimeString('en-PH', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Manila',
    });
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
    confirmedAt: c.confirmedAt ? new Date(c.confirmedAt) : null,
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

// A reservation can hold several products; the lines live in
// reservation_items. The reservation row's own product columns only ever
// describe the first line, so anything showing what was actually reserved
// has to read these.
export const subscribeToReservationItems = (callback) => {
  return subscribeToCollection('reservation_items', (rows) => {
    const byReservation = {};
    for (const row of rows) {
      const key = row.reservationId;
      if (!key) continue;
      (byReservation[key] ||= []).push(row);
    }
    callback(byReservation);
  });
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

  // 3. By line item. The reservation's own product columns describe only the
  // first line, so a product reserved as any later line is invisible to the
  // two lookups above.
  if (productId) {
    const { data: lines } = await supabase
      .from('reservation_items')
      .select('reservation_id')
      .eq('product_id', productId);

    const missingIds = (lines ?? [])
      .map((line) => line.reservation_id)
      .filter((rid) => rid && !results.has(rid));

    if (missingIds.length > 0) {
      const { data: byLine } = await supabase
        .from('reservations')
        .select('*')
        .in('id', Array.from(new Set(missingIds)));
      (byLine ?? []).forEach((row) => results.set(row.id, row));
    }
  }

  return Array.from(results.values())
    .map(normaliseReservation)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

/**
 * PayMongo transaction history for a reservation.
 *
 * The `payments` table -- provider, provider_ref (PayMongo checkout session
 * id), amount, status, method -- was never read anywhere in this app: staff
 * only ever saw the reservation's own payment_status ("Paid"/"Pending"),
 * which the webhook sets once the deposit clears. There was no way to see
 * *which* PayMongo transaction that corresponded to, whether an earlier
 * attempt failed first, or the amount actually charged. RLS already permits
 * staff to read this table ("Staff read all payments"); this was purely a
 * missing UI.
 *
 * Newest first: a reservation can have more than one row here if an earlier
 * checkout session was abandoned or failed before a later one succeeded
 * (payments-create reuses an open session rather than stacking them, but a
 * failed/expired one still leaves its own row behind).
 */
export const getPaymentsForReservation = async (reservationId) => {
  if (!reservationId) return [];
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('reservation_id', reservationId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return toCamel(data ?? []);
};

// ── Writes ────────────────────────────────────────────────────

const ALLOWED_RESERVATION_FIELDS = new Set([
  'id',
  'display_id',
  'customer_id',
  'customer_name',
  'product_id',
  'product_name',
  'image_url',
  'date',
  'return_date',
  'appointment_time',
  'status',
  'size',
  'color',
  'deposit',
  'rental_price',
  'receipt_url',
  'countdown',
  'assigned_staff_id',
  'payment_status',
  'payment_due_at',
  'confirmed_by_id',
  'confirmed_by_name',
  'confirmed_at',
  'deleted',
  'created_at',
  'updated_at',
  'reschedule_requested_at',
]);

const sanitizeReservationPayload = (obj) => {
  const clean = {};
  const fieldMap = {
    customerId: 'customer_id',
    customerName: 'customer_name',
    productId: 'product_id',
    productName: 'product_name',
    imageUrl: 'image_url',
    rentalPrice: 'rental_price',
    receiptUrl: 'receipt_url',
    paymentStatus: 'payment_status',
  };

  for (const [key, val] of Object.entries(obj)) {
    const mappedKey = fieldMap[key] || key;
    if (ALLOWED_RESERVATION_FIELDS.has(mappedKey)) {
      clean[mappedKey] = val;
    }
  }
  return clean;
};

export const createReservation = async (data) => {
  const appointmentTs = buildTimestamp(data.date || data.reservationDate, data.appointmentTime);
  const returnTs = toLocalDateString(data.returnDate);
  const dateTs = toLocalDateString(data.date || data.reservationDate);

  const payload = sanitizeReservationPayload({
    ...data,
    date: dateTs,
    return_date: returnTs,
    appointment_time: appointmentTs,
    deleted: false,
  });

  const reservationId = await addDocument('reservations', payload);

  if (reservationId) {
    // Write the corresponding line item so triggers can see what was actually
    // reserved. Fallbacks to the reservation's own columns for missing data.
    await addDocument('reservation_items', {
      reservation_id: reservationId,
      product_id: payload.product_id,
      product_name: payload.product_name,
      image_url: payload.image_url,
      size: payload.size,
      color: payload.color,
      quantity: data.quantity ?? 1,
      unit_price: payload.rental_price,
    });
  }

  return reservationId;
};

export const updateReservation = async (docId, updates) => {
  const payload = sanitizeReservationPayload(updates);

  if (updates.appointmentTime && (updates.date || updates.reservationDate)) {
    payload.appointment_time = buildTimestamp(
      updates.date || updates.reservationDate,
      updates.appointmentTime,
    );
  }
  if (updates.date || updates.reservationDate) {
    payload.date = toLocalDateString(updates.date || updates.reservationDate);
  }
  if (updates.returnDate) {
    payload.return_date = toLocalDateString(updates.returnDate);
  }

  return updateDocument('reservations', docId, payload);
};

export const deleteReservation = async (docId) => {
  return deleteDocument('reservations', docId);
};

/**
 * Records that the outstanding balance was collected in person.
 *
 * Goes through settle_reservation_balance rather than writing the columns
 * directly. The RPC re-checks the caller's role, that the deposit has actually
 * cleared, that a balance exists at all, and that it has not already been
 * recorded -- none of which a bare column update would enforce, and all of
 * which matter because this is the moment money changes hands with no
 * electronic trail behind it.
 */
export const settleReservationBalance = async (reservationId, method = 'cash') => {
  const { data, error } = await supabase.rpc('settle_reservation_balance', {
    _reservation_id: reservationId,
    _method: method,
  });
  if (error) throw error;
  return data;
};

// ── Inventory adjustment ─────────────────────────────────────

/**
 * Adjusts inventory stock for a reservation item.
 *
 * @param {string} productIdOrName - UUID, SKU, or item name
 * @param {string} size - size label (e.g. 'M')
 * @param {number} delta - positive = return to available, negative = take hold
 * @param {boolean} isConsume - true on completed pickup (decrements total + reserved)
 * @param {string} [color=''] - optional colorway (e.g. 'Royal Blue')
 */
export const adjustInventoryForReservation = async (productIdOrName, size, delta, isConsume = false, color = '') => {
  try {
    let invRow = null;

    // 1. Try by product_doc_id (uuid)
    if (color) {
      const { data } = await supabase
        .from('inventory')
        .select('id')
        .eq('product_doc_id', productIdOrName)
        .eq('size', size)
        .eq('color', color)
        .maybeSingle();
      invRow = data;
    }
    if (!invRow) {
      const { data: byId } = await supabase
        .from('inventory')
        .select('id')
        .eq('product_doc_id', productIdOrName)
        .eq('size', size)
        .maybeSingle();
      invRow = byId;
    }

    // 2. Try by SKU
    if (!invRow) {
      if (color) {
        const { data } = await supabase
          .from('inventory')
          .select('id')
          .eq('sku', productIdOrName)
          .eq('size', size)
          .eq('color', color)
          .maybeSingle();
        invRow = data;
      }
      if (!invRow) {
        const { data: bySku } = await supabase
          .from('inventory')
          .select('id')
          .eq('sku', productIdOrName)
          .eq('size', size)
          .maybeSingle();
        invRow = bySku;
      }
    }

    // 3. Try by item name
    if (!invRow) {
      if (color) {
        const { data } = await supabase
          .from('inventory')
          .select('id')
          .eq('item', productIdOrName)
          .eq('size', size)
          .eq('color', color)
          .maybeSingle();
        invRow = data;
      }
      if (!invRow) {
        const { data: byName } = await supabase
          .from('inventory')
          .select('id')
          .eq('item', productIdOrName)
          .eq('size', size)
          .maybeSingle();
        invRow = byName;
      }
    }

    if (!invRow) {
      console.warn(`[Inventory] No matching item found for ${productIdOrName} (${size}${color ? `, ${color}` : ''})`);
      return false;
    }

    // Deltas applied atomically server-side (adjust_inventory_stock)
    const params = isConsume
      ? { p_total_delta: -Math.abs(delta), p_reserved_delta: -Math.abs(delta) }
      : { p_available_delta: delta, p_reserved_delta: -delta };

    const { error } = await supabase.rpc('adjust_inventory_stock', {
      p_inventory_id: invRow.id,
      ...params,
    });
    if (error) {
      console.warn('[Inventory] Adjust failed:', error.message);
      return false;
    }
    console.log(`[Inventory] Adjusted stock for ${productIdOrName} (${size}${color ? `, ${color}` : ''}): delta=${delta}`);
    return true;
  } catch (err) {
    console.warn('Stock adjustment failed:', err);
    return false;
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

/**
 * Answers a customer's reschedule request.
 *
 * Approving re-checks the slot before moving the booking: the time was free
 * when it was asked for, but the request may have sat in the queue while
 * another reservation took it.
 */
export const resolveRescheduleRequest = async (reservationId, approve) => {
  const { data, error } = await supabase.rpc('resolve_reschedule', {
    _reservation_id: reservationId,
    _approve: approve,
  });
  if (error) throw error;
  return data;
};

/**
 * Scans active reservations in 'Pending', 'Request Approval', 'To Pay', 'Confirmed'
 * and automatically cancels any whose appointment date/time or payment deadline has passed.
 * Releases reserved inventory stock for any cancelled reservation that held stock.
 */
export const autoCancelExpiredReservations = async () => {
  try {
    const now = new Date();
    // 5-minute buffer so an appointment at 10:30 isn't cancelled at 10:30:01
    const bufferMs = 5 * 60 * 1000;

    const { data: rows, error } = await supabase
      .from('reservations')
      .select('*')
      .in('status', ['Pending', 'Request Approval', 'To Pay', 'Confirmed'])
      .eq('deleted', false);

    if (error || !rows || rows.length === 0) return [];

    const toCancel = [];

    for (const r of rows) {
      let isExpired = false;
      let reason = '';

      // Determine appointment timestamp
      let apptTime = null;
      if (r.appointment_time) {
        const d = new Date(r.appointment_time);
        if (!isNaN(d.getTime())) apptTime = d;
      }
      if (!apptTime && r.date) {
        const dateStr = typeof r.date === 'string' ? r.date : (r.date instanceof Date ? r.date.toISOString() : '');
        if (dateStr) {
          const timeStr = typeof r.appointment_time === 'string' ? r.appointment_time : '23:59';
          const combinedStr = `${dateStr.slice(0, 10)}T${timeStr.length === 5 ? timeStr : '23:59'}:00+08:00`;
          const d = new Date(combinedStr);
          if (!isNaN(d.getTime())) apptTime = d;
        }
      }

      // 1. Pending Review (Pending / Request Approval)
      if (r.status === 'Pending' || r.status === 'Request Approval') {
        if (apptTime && apptTime.getTime() + bufferMs < now.getTime()) {
          isExpired = true;
          reason = 'Auto-cancelled: Appointment window passed without review';
        }
      }

      // 2. Awaiting Payment (To Pay / Confirmed)
      if (r.status === 'To Pay' || r.status === 'Confirmed') {
        const paymentDue = r.payment_due_at ? new Date(r.payment_due_at) : null;
        if (paymentDue && !isNaN(paymentDue.getTime()) && paymentDue.getTime() + bufferMs < now.getTime()) {
          isExpired = true;
          reason = 'Auto-cancelled: Payment deadline passed';
        } else if (apptTime && apptTime.getTime() + bufferMs < now.getTime()) {
          isExpired = true;
          reason = 'Auto-cancelled: Appointment time passed without payment';
        }
      }

      if (isExpired) {
        toCancel.push({ row: r, reason });
      }
    }

    if (toCancel.length === 0) return [];

    console.log(`[AutoCancel] Found ${toCancel.length} expired reservations to cancel.`);

    const cancelledIds = [];
    for (const { row: r, reason } of toCancel) {
      // DB triggers will automatically handle releasing stock when status updates to 'Cancelled'.

      const nowIso = new Date().toISOString();
      const { error: updateErr } = await supabase
        .from('reservations')
        .update({
          status: 'Cancelled',
          cancellation_reason: reason,
          updated_at: nowIso,
        })
        .eq('id', r.id);

      if (!updateErr) {
        cancelledIds.push(r.id);
      }
    }

    if (cancelledIds.length > 0) {
      await recalculateAllInventoryStock();
    }

    return cancelledIds;
  } catch (err) {
    console.warn('[AutoCancel] Sweep failed:', err?.message ?? err);
    return [];
  }
};
