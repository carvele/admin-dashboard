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
  updateDocument,
  deleteDocument,
  getPaginatedCollection,
  toCamel,
} from '../lib/supabaseService';

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

const toLocalTimeString = (value, explicitTime) => {
  if (explicitTime) return explicitTime.slice(0, 5);
  if (typeof value === 'string') {
    const match = value.match(/T(\d{2}:\d{2})/);
    if (match) return match[1];
  }
  const d = toDate(value);
  if (!d) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
    // The UUID is internal-only. A missing display ID must remain visibly
    // missing instead of being presented to customers or staff as a reference.
    displayId: c.displayId ?? null,
    // appointmentTime as the extracted "HH:MM" string
    appointmentTime: extractTime(c.appointmentTime),
    // Full appointment instant, for Manila date/time formatting and slot logic.
    appointmentAt: c.appointmentTime ? new Date(c.appointmentTime) : null,
    // date as JS Date object for UI components that call .toDate() style methods
    date: c.date ? new Date(c.date) : null,
    returnDate: c.returnDate ? new Date(c.returnDate) : null,
    confirmedAt: c.confirmedAt ? new Date(c.confirmedAt) : null,
    pickupDeadlineAt: c.pickupDeadlineAt ? new Date(c.pickupDeadlineAt) : null,
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
      if (bTime !== aTime) return bTime - aTime;
      return (b.id || '').localeCompare(a.id || '');
    });
    // Realtime trimming contract: cap board view snapshot at 200
    callback(sorted.slice(0, 200).map(normaliseReservation));
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
    .order('id', { ascending: false })
    .limit(maxResults > 0 ? maxResults : 10000);
  if (error) throw error;
  return (data ?? []).map(normaliseReservation);
};

export const getReservationByPickupToken = async (pickupToken) => {
  const token = String(pickupToken || '').trim();
  if (!token) return null;

  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('pickup_token', token)
    .maybeSingle();
  if (error) throw error;
  return normaliseReservation(data);
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

export const getReservationById = async (reservationId) => {
  if (!reservationId) return null;
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('id', reservationId)
    .maybeSingle();
  if (error) throw error;
  return normaliseReservation(data);
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
  'payment_type',
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
  const dateValue = data.date || data.reservationDate;
  const date = toLocalDateString(dateValue);
  const appointmentTime = toLocalTimeString(dateValue, data.appointmentTime);

  const customerId = data.customerId || data.customer_id;
  const productId = data.productId || data.product_id;
  if (!date || !appointmentTime || !customerId || !productId) {
    throw new Error('Customer, product, date, and appointment time are required.');
  }

  const { data: created, error } = await supabase.rpc('create_reservation_multi', {
    _items: [{
      product_id: productId,
      size: data.size || null,
      color: data.color || null,
      quantity: data.quantity ?? 1,
    }],
    _date: date,
    _appointment_time: appointmentTime,
    _receipt_path: null,
    _payment_option: String(data.paymentType || data.payment_type || '').toLowerCase() === 'full'
      ? 'full'
      : 'deposit',
    _customer_id: customerId,
  });
  if (error) throw error;
  return created?.id;
};

export const updateReservation = async (docId, updates) => {
  const payload = sanitizeReservationPayload(updates);

  if ('status' in payload || 'payment_status' in payload) {
    throw new Error('Lifecycle and payment state must use a reservation command.');
  }

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
 * Goes through the narrow balance command rather than writing the columns
 * directly. The RPC re-checks the caller's role, that the deposit has actually
 * cleared, that a balance exists at all, and that it has not already been
 * recorded -- none of which a bare column update would enforce, and all of
 * which matter because this is the moment money changes hands with no
 * electronic trail behind it.
 */
export const isReservationConcurrencyConflict = (error) => {
  return error?.code === 'PT409';
};

export const normalizeReservationError = (error) => {
  if (isReservationConcurrencyConflict(error)) {
    const normalized = new Error(
      'Reservation changed. The latest information has been loaded.'
    );
    normalized.code = 'PT409';
    normalized.status = 409;
    normalized.isConcurrencyConflict = true;
    normalized.cause = error;
    return normalized;
  }
  return error;
};

export const settleReservationBalance = async (reservationId, method = 'cash') => {
  try {
    await expireReservationPaymentSessions(reservationId);
    const { data, error } = await supabase.rpc('record_reservation_balance', {
      _reservation_id: reservationId,
      _method: method,
    });
    if (error) throw error;
    return data;
  } catch (err) {
    throw normalizeReservationError(err);
  }
};

export const transitionReservationStatus = async (reservationId, expectedStatus, nextStatus) => {
  try {
    const { data, error } = await supabase.rpc('transition_reservation_status', {
      _reservation_id: reservationId,
      _expected_status: expectedStatus,
      _next_status: nextStatus,
    });
    if (error) throw error;
    return data;
  } catch (err) {
    throw normalizeReservationError(err);
  }
};

// The reason is shown to the customer; the server rejects a blank one.
export const cancelReservation = async (reservationId, expectedStatus, reason) => {
  const trimmed = String(reason || '').trim();
  if (!trimmed) throw new Error('Enter the reason shown to the customer.');
  try {
    await expireReservationPaymentSessions(reservationId);
    const { data, error } = await supabase.rpc('cancel_reservation_as_manager', {
      _reservation_id: reservationId,
      _expected_status: expectedStatus,
      _reason: trimmed,
    });
    if (error) throw error;
    return data;
  } catch (err) {
    throw normalizeReservationError(err);
  }
};

/** Server-derived financial outcome shown before a staff cancellation. */
export const previewReservationCancellation = async (reservationId) => {
  const { data, error } = await supabase.rpc('preview_reservation_cancellation', {
    _reservation_id: reservationId,
  });
  if (error) throw error;
  return data;
};

export const reviewReservationReceipt = async (reservationId, approve, reasonCode = null, staffNote = null) => {
  try {
    if (approve) await expireReservationPaymentSessions(reservationId);
    const { data, error } = await supabase.rpc('review_reservation_receipt', {
      _reservation_id: reservationId,
      _approve: approve,
      _reason_code: approve ? null : reasonCode,
      _staff_note: approve ? null : staffNote,
    });
    if (error) throw error;
    return data;
  } catch (err) {
    throw normalizeReservationError(err);
  }
};

export const reviewReservationBalanceReceipt = async (reservationId, approve, reasonCode = null, staffNote = null) => {
  try {
    if (approve) await expireReservationPaymentSessions(reservationId);
    const { data, error } = await supabase.rpc('review_reservation_balance_receipt', {
      _reservation_id: reservationId,
      _approve: approve,
      _reason_code: approve ? null : reasonCode,
      _staff_note: approve ? null : staffNote,
    });
    if (error) throw error;
    return data;
  } catch (err) {
    throw normalizeReservationError(err);
  }
};

/**
 * Cancels a reservation whose receipt is currently under review, for a
 * structured reason (including, but not limited to, suspected fraud). A
 * thin wrapper over cancel_reservation_for_fraud -- it does not accept an
 * arbitrary status/payment_status write; the RPC itself only permits this
 * while payment_status is submitted/processing, and delegates the actual
 * cancellation to the same canonical cancel_reservation_as_manager every
 * other staff cancellation uses, so its financial/inventory guards apply
 * unchanged here too.
 */
export const cancelReservationForFraud = async (reservationId, expectedStatus, reasonCode, staffNote = null) => {
  try {
    const { data, error } = await supabase.rpc('cancel_reservation_for_fraud', {
      _reservation_id: reservationId,
      _expected_status: expectedStatus,
      _reason_code: reasonCode,
      _staff_note: staffNote,
    });
    if (error) throw error;
    return data;
  } catch (err) {
    throw normalizeReservationError(err);
  }
};

/**
 * Staff-only warning surface: does another reservation already carry a
 * verified payment under this same reference number? Never an automatic
 * verdict -- the RPC itself refuses non-admin callers.
 */
export const findDuplicatePaymentReference = async (referenceNumber, excludeReservationId = null) => {
  if (!referenceNumber) return [];
  const { data, error } = await supabase.rpc('find_duplicate_payment_reference', {
    _reference_number: referenceNumber,
    _exclude_reservation_id: excludeReservationId,
  });
  if (error) throw error;
  return data ?? [];
};

/**
 * Payment review history for one reservation, read from the general audit
 * log (public.logs) rather than a dedicated table -- these three actions
 * already write there via review_reservation_receipt / cancel_reservation_*,
 * so this reuses that trail instead of standing up a parallel one.
 */
export const getPaymentReviewHistory = async (reservationId) => {
  const { data, error } = await supabase
    .from('logs')
    .select('*')
    .eq('target_type', 'reservation')
    .eq('target_id', reservationId)
    .in('action', ['Approved reservation receipt', 'Rejected reservation receipt', 'Cancelled reservation'])
    .order('timestamp', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...toCamel(row),
    createdAt: row.timestamp,
  }));
};

export const completeReservationHandover = async (reservationId, method = 'cash') => {
  try {
    await expireReservationPaymentSessions(reservationId);
    const { data, error } = await supabase.rpc('complete_reservation_handover', {
      _reservation_id: reservationId,
      _method: method,
    });
    if (error) throw error;
    return data;
  } catch (err) {
    throw normalizeReservationError(err);
  }
};

const expireReservationPaymentSessions = async (reservationId) => {
  const { error } = await supabase.functions.invoke('payments-expire', {
    body: { reservation_id: reservationId },
  });
  if (error) {
    let message = error.message;
    try {
      if ('context' in error && error.context && typeof error.context.json === 'function') {
        const errorBody = await error.context.json();
        if (errorBody?.error && typeof errorBody.error === 'string') {
          message = errorBody.error;
        }
      }
    } catch {
      // Fall back to original error message
    }
    throw new Error(message || 'Failed to expire active payment sessions.');
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
 * Pending customer change requests (reschedule / ready cancellation), keyed
 * by reservation id. The realtime callback only replaces local state.
 */
export const subscribeToPendingChangeRequests = (callback) => {
  return subscribeToCollection('reservation_change_requests', (rows) => {
    const byReservation = {};
    for (const row of rows) {
      if (row.reservationId) byReservation[row.reservationId] = row;
    }
    callback(byReservation);
  }, { status: 'pending' });
};

/**
 * Answers a customer's reschedule request. Approving re-checks the slot: it
 * was free when requested, but may have been taken since.
 */
export const resolveRescheduleRequest = async (requestId, approve, notes = null) => {
  try {
    const { data, error } = await supabase.rpc('resolve_reschedule_request_v2', {
      _request_id: requestId,
      _approve: approve,
      _resolution_notes: notes,
    });
    if (error) throw error;
    return data;
  } catch (err) {
    throw normalizeReservationError(err);
  }
};

/** Approving applies the existing customer-fault forfeiture policy server-side. */
export const resolveReadyCancellationRequest = async (requestId, approve, notes = null) => {
  try {
    const { data, error } = await supabase.rpc('resolve_ready_cancellation_request', {
      _request_id: requestId,
      _approve: approve,
      _resolution_notes: notes,
    });
    if (error) throw error;
    return data;
  } catch (err) {
    throw normalizeReservationError(err);
  }
};

// Direct staff change of a pre-Ready appointment; the reason reaches the customer.
export const rescheduleReservation = async (
  reservationId,
  expectedStatus,
  newDate,
  newAppointmentTime,
  reason,
) => {
  const trimmed = String(reason || '').trim();
  if (!trimmed) throw new Error('Enter the reason shown to the customer.');
  try {
    const { data, error } = await supabase.rpc('reschedule_reservation_as_manager', {
      _reservation_id:       reservationId,
      _expected_status:      expectedStatus,
      _new_date:             newDate,           // 'YYYY-MM-DD' (Asia/Manila)
      _new_appointment_time: newAppointmentTime, // 'HH:MM:SS' (Asia/Manila)
      _reason:               trimmed,
    });
    if (error) throw error;
    return data;
  } catch (err) {
    throw normalizeReservationError(err);
  }
};

export const getSlotBookedCounts = async (date) => {
  const { data, error } = await supabase.rpc('get_slot_booked_counts', { _date: date });
  if (error) throw error;
  return data ?? [];
};

export const markRefundDisbursed = async (
  reservationId,
  disbursementMethod,
  referenceNumber,
  notes = null,
) => {
  const { data, error } = await supabase.rpc('mark_reservation_refund_disbursed', {
    _reservation_id:      reservationId,
    _disbursement_method: disbursementMethod,
    _reference_number:    referenceNumber,
    _notes:               notes,
  });
  if (error) throw error;
  return data;
};

/**
 * Fetches reservations that have pending refund liability.
 * Supports both Cancelled reservations and Completed reservations with approved return requests.
 * Canonical predicate: payment_status='Refund Required' AND payments.requires_refund=true AND payments.status='paid'.
 * Used as the single source of truth for refund count and exact peso amount.
 */
export const getRefundQueue = async () => {
  const { data, error } = await supabase
    .from('reservations')
    .select(`
      id, display_id, customer_name, payment_status, updated_at,
      payments!inner(id, amount_centavos, requires_refund, refund_required_at,
                     refund_disbursed_at, refund_disbursement_method, refund_reference_number,
                     status)
    `)
    .in('status', ['Cancelled', 'Completed'])
    .eq('payment_status', 'Refund Required')
    .eq('payments.requires_refund', true)
    .eq('payments.status', 'paid')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toCamel);
};

/**
 * Fetches customer return/refund requests with associated reservation, items, payments, and profiles.
 * @param {string|string[]|null} status - Optional status filter ('submitted', 'under_review', 'approved', 'rejected', 'refunded')
 */
export const getReturnRefundRequests = async (status = null) => {
  let query = supabase
    .from('return_refund_requests')
    .select(`
      id,
      reservation_id,
      customer_id,
      reason_category,
      details,
      photo_path,
      status,
      resolution_notes,
      reviewed_by,
      reviewed_at,
      under_review_at,
      under_review_by,
      submitted_at,
      created_at,
      updated_at,
      reservations!inner (
        id,
        display_id,
        status,
        payment_status,
        customer_name,
        created_at,
        reservation_items (
          id,
          quantity,
          unit_price,
          size,
          color,
          products (
            id,
            name,
            image_url
          )
        ),
        payments (
          id,
          amount_centavos,
          status,
          requires_refund,
          refund_disbursed_at,
          refund_disbursement_method,
          refund_reference_number
        )
      ),
      customer:profiles!customer_id (
        id,
        full_name,
        email,
        phone
      ),
      reviewer:profiles!reviewed_by (
        id,
        full_name
      ),
      under_reviewer:profiles!under_review_by (
        id,
        full_name
      )
    `);

  if (status) {
    if (Array.isArray(status)) {
      query = query.in('status', status);
    } else {
      query = query.eq('status', status);
    }
  }

  query = query.order('submitted_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toCamel);
};

/**
 * Reviews a customer return/refund request via RPC.
 * @param {string} requestId - UUID of return_refund_requests row
 * @param {'approve'|'reject'|'under_review'} decision - Review decision
 * @param {string|null} notes - Mandatory for 'reject', optional resolution/context notes
 */
export const reviewReturnRefundRequest = async (requestId, decision, notes = null) => {
  const { data, error } = await supabase.rpc('review_return_refund_request', {
    _request_id: requestId,
    _decision:   decision,
    _notes:      notes,
  });
  if (error) throw error;
  return data;
};

/**
 * Generates a signed read URL for return/refund photo evidence.
 * Evidence is stored in the private 'return-refund-evidence' bucket.
 * @param {string} photoPath - Path within the bucket
 * @param {number} expiresIn - Expiration in seconds (default: 900 / 15 minutes)
 */
export const getSignedEvidenceUrl = async (photoPath, expiresIn = 900) => {
  if (!photoPath) return null;
  const { data, error } = await supabase.storage
    .from('return-refund-evidence')
    .createSignedUrl(photoPath, expiresIn);
  if (error) throw error;
  return data?.signedUrl ?? null;
};

