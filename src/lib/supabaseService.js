/**
 * supabaseService.js
 * Generic CRUD helpers for Supabase, mirroring the API surface of firebase/firestore.js.
 * All higher-level service files should import from here, NOT from supabaseClient.js directly.
 *
 * Naming-convention bridge:
 *  - Supabase rows are snake_case; the UI expects camelCase.
 *  - toCamel() / toSnake() convert object keys at the boundary.
 */

import { supabase } from './supabaseClient';

// ── Key-name conversion helpers ─────────────────────────────

/** Convert a snake_case string to camelCase */
const snakeToCamel = (str) =>
  str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

/** Convert a camelCase string to snake_case */
const camelToSnake = (str) =>
  str.replace(/([A-Z])/g, '_$1').toLowerCase();

/** Recursively convert all object keys from snake_case → camelCase */
export const toCamel = (obj) => {
  if (Array.isArray(obj)) return obj.map(toCamel);
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [snakeToCamel(k), toCamel(v)])
    );
  }
  return obj;
};

/** Recursively convert all object keys from camelCase → snake_case */
export const toSnake = (obj) => {
  if (Array.isArray(obj)) return obj.map(toSnake);
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [camelToSnake(k), toSnake(v)])
    );
  }
  return obj;
};

/**
 * Normalise a raw Supabase row into the shape the UI expects:
 *  - id:    uuid (the database PK)
 *  - docId: same value — keeps compatibility with legacy Firestore code
 *  - all other keys converted camelCase
 */
export const normaliseRow = (row) => {
  if (!row) return null;
  const camel = toCamel(row);
  return { ...camel, docId: camel.id };
};

// ── Generic error handler ───────────────────────────────────

const handleError = (error, context) => {
  console.error(`[Supabase] ${context}:`, error?.message ?? error);
  throw error;
};

// ── Generic CRUD helpers ────────────────────────────────────

/**
 * Fetch all rows from a table (soft-delete filtered by default).
 * @param {string} table
 * @param {boolean} includeDeleted
 * @param {number} maxResults - 0 = unlimited
 */
export const getCollection = async (table, includeDeleted = false, maxResults = 0) => {
  let q = supabase.from(table).select('*');
  if (!includeDeleted) {
    // Only filter deleted if the table actually has a deleted column
    const DELETED_TABLES = [
      'products', 'profiles', 'inventory',
      'wardrobe_items', 'saved_outfits',
    ];
    if (DELETED_TABLES.includes(table)) {
      q = q.eq('deleted', false);
    }
  }
  if (maxResults > 0) q = q.limit(maxResults);

  const { data, error } = await q;
  if (error) handleError(error, `getCollection(${table})`);
  return (data ?? []).map(normaliseRow);
};

/**
 * Fetch a single row by its PK (`id` column).
 */
export const getDocument = async (table, id) => {
  const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
  if (error) handleError(error, `getDocument(${table}, ${id})`);
  return data ? normaliseRow(data) : null;
};

/**
 * Insert a new row. Timestamps are handled by Postgres defaults.
 * @returns {string} uuid of the created row
 */
export const addDocument = async (table, data) => {
  const payload = toSnake({
    ...data,
    deleted: data.deleted ?? false,
  });
  // Remove auto-managed columns
  delete payload.id;
  delete payload.created_at;
  delete payload.updated_at;

  const { data: row, error } = await supabase.from(table).insert(payload).select('id').single();
  if (error) handleError(error, `addDocument(${table})`);
  return row.id;
};

/**
 * Update an existing row by its PK.
 */
export const updateDocument = async (table, id, updates) => {
  const payload = toSnake({
    ...updates,
    updated_at: new Date().toISOString(),
  });
  delete payload.id;

  const { error } = await supabase.from(table).update(payload).eq('id', id);
  if (error) handleError(error, `updateDocument(${table}, ${id})`);
};

/**
 * Upsert a row identified by a custom primary key value.
 * Useful for `devices` (PK = fingerprint text) or settings (PK = key text).
 * @param {string} table
 * @param {Object} data  - must include the PK column
 * @param {string} onConflict - column name of the conflict target (default: 'id')
 */
export const upsertDocument = async (table, data, onConflict = 'id') => {
  const payload = toSnake(data);
  const { error } = await supabase.from(table).upsert(payload, { onConflict });
  if (error) handleError(error, `upsertDocument(${table})`);
};

/**
 * Hard delete a row by its PK.
 */
export const deleteDocument = async (table, id) => {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) handleError(error, `deleteDocument(${table}, ${id})`);
};

/**
 * Soft delete a row — sets deleted = true.
 * For 'products', also cascades to all linked inventory rows.
 */
export const softDeleteDocument = async (table, id) => {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from(table)
    .update({ deleted: true, deleted_at: now, updated_at: now })
    .eq('id', id);
  if (error) handleError(error, `softDeleteDocument(${table}, ${id})`);

  if (table === 'products') {
    const { error: invErr } = await supabase
      .from('inventory')
      .update({ deleted: true, deleted_at: now, updated_at: now })
      .eq('product_doc_id', id);
    if (invErr) console.warn('[Supabase] Inventory cascade soft-delete failed:', invErr.message);
  }
};

/**
 * Paginated query.
 * @returns {{ data: Object[], hasMore: boolean, nextPage: number }}
 */
export const getPaginatedCollection = async (
  table,
  pageSize,
  page = 0,
  filters = {},
  includeDeleted = false,
) => {
  let q = supabase.from(table).select('*', { count: 'exact' });

  if (!includeDeleted) {
    const DELETED_TABLES = ['products', 'profiles', 'inventory', 'wardrobe_items', 'saved_outfits'];
    if (DELETED_TABLES.includes(table)) q = q.eq('deleted', false);
  }

  // Apply filters: { column: value } or { column: ['in', [v1, v2]] }
  for (const [col, val] of Object.entries(filters)) {
    if (Array.isArray(val) && val[0] === 'in') {
      q = q.in(col, val[1]);
    } else {
      q = q.eq(col, val);
    }
  }

  const from = page * pageSize;
  const to = from + pageSize - 1;
  q = q.range(from, to);

  const { data, count, error } = await q;
  if (error) handleError(error, `getPaginatedCollection(${table})`);

  return {
    data: (data ?? []).map(normaliseRow),
    hasMore: (from + (data?.length ?? 0)) < (count ?? 0),
    nextPage: page + 1,
  };
};

// ── Audit log helper ────────────────────────────────────────

/**
 * Append an immutable audit entry to public.logs.
 * Maps to the logs schema: user_id, user_name, action, target_type, target_id, details
 */
export const logAction = async (user, action, targetInfo = {}) => {
  try {
    const { targetType, targetId, ...rest } = targetInfo;
    const { error } = await supabase.from('logs').insert({
      user_id: user?.uid ?? null,
      user_name: user?.name ?? user?.email ?? 'System',
      action,
      target_type: targetType ?? null,
      target_id: targetId ? String(targetId) : null,
      details: rest,
    });
    if (error) console.error('[Supabase] logAction failed:', error.message);
  } catch (err) {
    console.error('[Supabase] logAction threw:', err);
  }
};

// ── Real-time subscription helpers ─────────────────────────

/**
 * Subscribe to all changes on a table.
 * Returns an unsubscribe function.
 *
 * Note: Supabase Realtime sends individual change events; we re-fetch the
 * full collection on every change so the UI always sees a consistent list
 * (same behaviour as Firestore's onSnapshot).
 *
 * @param {string} table
 * @param {Function} callback  - called with Array<normalised rows>
 * @param {Object}  [filters]  - optional eq filters applied to the initial fetch
 * @param {boolean} [includeDeleted]
 * @returns {Function} unsubscribe
 */
export const subscribeToCollection = (table, callback, filters = {}, includeDeleted = false) => {
  // Initial load
  const doFetch = async () => {
    let q = supabase.from(table).select('*');
    if (!includeDeleted) {
      const DELETED_TABLES = ['products', 'profiles', 'inventory', 'wardrobe_items', 'saved_outfits'];
      if (DELETED_TABLES.includes(table)) q = q.eq('deleted', false);
    }
    for (const [col, val] of Object.entries(filters)) {
      q = q.eq(col, val);
    }
    const { data, error } = await q;
    if (error) {
      console.error(`[Supabase] subscribeToCollection fetch error (${table}):`, error.message);
      callback([]);
      return;
    }
    callback((data ?? []).map(normaliseRow));
  };

  doFetch();

  // Real-time channel
  const channel = supabase
    .channel(`public:${table}:${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
      doFetch();
    })
    .subscribe();

  // Return unsubscribe
  return () => {
    supabase.removeChannel(channel);
  };
};

/**
 * Subscribe to a SINGLE row by its PK.
 * Used for device status polling.
 * @param {string} table
 * @param {string} pkColumn - name of the PK column
 * @param {*} pkValue
 * @param {Function} callback  - called with the normalised row or null
 * @returns {Function} unsubscribe
 */
export const subscribeToDocument = (table, pkColumn, pkValue, callback) => {
  const doFetch = async () => {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(pkColumn, pkValue)
      .maybeSingle();
    if (error) {
      console.error(`[Supabase] subscribeToDocument fetch error (${table}):`, error.message);
      callback(null);
      return;
    }
    callback(data ? toCamel(data) : null);
  };

  doFetch();

  const channel = supabase
    .channel(`public:${table}:${pkColumn}:${pkValue}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table,
      filter: `${pkColumn}=eq.${pkValue}`,
    }, () => {
      doFetch();
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

// Re-export the raw client for edge-case direct usage
export { supabase };
