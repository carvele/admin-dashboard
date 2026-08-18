/**
 * src/services/variantService.js
 *
 * Variant-aware access to the `inventory` table.
 *
 * The `inventory` table is the canonical stock model. Historically it held one
 * row per (product, size); the variants migration adds `color` and `pattern`
 * so a row is one per (product, size, colour, pattern) — the standard retail
 * SKU matrix, where selling "Red / M" decrements only the Red-M bin.
 *
 * Compatibility contract:
 *  - READS are safe before the migration lands: rows without colour/pattern
 *    normalise to empty strings, which is also the legitimate "does not vary
 *    along this dimension" state.
 *  - WRITES that set colour/pattern require the migration. Callers should
 *    check `variantColumnsAvailable()` before offering variant creation.
 *  - Stock adjustments go through adjustInventoryStockDelta (an atomic
 *    server-side RPC keyed on the inventory row id). Never read-modify-write
 *    stock from the client — that race was already fixed once.
 *
 * @see docs/PROPOSED_MIGRATION_inventory_variants.sql
 */

import { supabase } from '../lib/supabaseClient';
import { toCamel } from '../lib/supabaseService';
import { adjustInventoryStockDelta, syncProductStock } from './productService';

// ── Normalisation ────────────────────────────────────────────────────────────

/**
 * Coerce a raw inventory row into a variant shape with guaranteed fields.
 * Pre-migration rows have no colour/pattern; they become ''.
 */
export const normaliseVariant = (row) => {
  const v = toCamel(row) || {};
  return {
    ...v,
    docId: row?.id ?? v.id,
    size: v.size ?? '',
    color: v.color ?? '',
    pattern: v.pattern ?? '',
    variantSku: v.variantSku ?? null,
    total: Number(v.total ?? 0),
    reserved: Number(v.reserved ?? 0),
    available: Number(v.available ?? 0),
  };
};

/** Stable key identifying a variant within a product. */
export const variantKey = ({ size = '', color = '', pattern = '' } = {}) =>
  `${size}|||${color}|||${pattern}`;

/**
 * Human label for a variant, skipping dimensions the product doesn't use.
 * e.g. `M / Red / Solid`, or just `M` when colour and pattern are empty.
 */
export const variantLabel = ({ size = '', color = '', pattern = '' } = {}) => {
  const parts = [size, color, pattern].map((p) => String(p).trim()).filter(Boolean);
  return parts.length ? parts.join(' / ') : 'Default';
};

/**
 * Build a readable variant SKU: `GOWN01-RED-SOLID-M`.
 * Returns null when there's no base SKU to extend.
 */
export const buildVariantSku = (baseSku, { size = '', color = '', pattern = '' } = {}) => {
  const base = String(baseSku ?? '').trim();
  if (!base) return null;
  const clean = (s) => String(s ?? '').replace(/[^A-Za-z0-9]+/g, '').toUpperCase();
  return [base.toUpperCase(), clean(color), clean(pattern), clean(size)]
    .filter(Boolean)
    .join('-');
};

// ── Capability probe ─────────────────────────────────────────────────────────

let _variantColumnsAvailable = null;

/**
 * Whether the variants migration has been applied.
 *
 * Probes once and caches. Used to gate variant *creation* UI so staff are
 * never shown a control that will fail server-side. Read paths don't need it.
 */
export const variantColumnsAvailable = async () => {
  if (_variantColumnsAvailable !== null) return _variantColumnsAvailable;
  const { error } = await supabase.from('inventory').select('color, pattern').limit(1);
  // PostgREST reports an unknown column as 42703 (undefined_column).
  _variantColumnsAvailable = !error;
  if (error) {
    console.info('[variants] colour/pattern columns not present yet — variant creation disabled.');
  }
  return _variantColumnsAvailable;
};

/** Test seam — resets the cached probe. */
export const __resetVariantProbe = () => {
  _variantColumnsAvailable = null;
};

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * All live variants for one product, ordered for matrix display.
 * @returns {Promise<Array>} normalised variant rows
 */
export const getProductVariants = async (productDocId) => {
  if (!productDocId) return [];
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .eq('product_doc_id', productDocId)
    .eq('deleted', false);
  if (error) throw error;
  return (data ?? [])
    .map(normaliseVariant)
    .sort((a, b) =>
      a.size.localeCompare(b.size) ||
      a.color.localeCompare(b.color) ||
      a.pattern.localeCompare(b.pattern));
};

/**
 * Distinct option values actually stocked for a product — the axes of its
 * variant matrix.
 */
export const getVariantAxes = (variants = []) => {
  const uniq = (key) => [...new Set(variants.map((v) => v[key]).filter(Boolean))].sort();
  return {
    sizes: uniq('size'),
    colors: uniq('color'),
    patterns: uniq('pattern'),
  };
};

// ── Matrix construction ──────────────────────────────────────────────────────

/**
 * Build the full cross product of the selected options, marking which
 * combinations already exist.
 *
 * Deliberately does NOT create anything: 5 sizes x 8 colours x 4 patterns is
 * 160 combinations and no boutique stocks them all. The caller presents this
 * for explicit selection.
 *
 * @returns {Array<{size, color, pattern, key, label, exists, variant}>}
 */
export const buildVariantMatrix = ({ sizes = [], colors = [], patterns = [] }, existing = []) => {
  const byKey = new Map(existing.map((v) => [variantKey(v), v]));

  // An empty axis still yields one pass with '' so a product can vary along
  // fewer than three dimensions.
  const axis = (arr) => (arr.length ? arr : ['']);

  const out = [];
  for (const size of axis(sizes)) {
    for (const color of axis(colors)) {
      for (const pattern of axis(patterns)) {
        const combo = { size, color, pattern };
        const key = variantKey(combo);
        const variant = byKey.get(key) ?? null;
        out.push({ ...combo, key, label: variantLabel(combo), exists: Boolean(variant), variant });
      }
    }
  }
  return out;
};

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Create one stock-tracked variant row. Quantities start at zero — stock only
 * ever arrives through an explicit restock, so a mistyped variant can never
 * invent inventory.
 */
export const createVariant = async (productDocId, { size = '', color = '', pattern = '', item, category, sku, price } = {}) => {
  if (!productDocId) throw new Error('createVariant requires a product id');

  const payload = {
    product_doc_id: productDocId,
    item: item ?? null,
    category: category ?? null,
    sku: sku ?? null,
    price: price ?? null,
    size,
    color,
    pattern,
    variant_sku: buildVariantSku(sku, { size, color, pattern }),
    total: 0,
    reserved: 0,
    available: 0,
    deleted: false,
  };

  const { data, error } = await supabase.from('inventory').insert(payload).select().single();
  if (error) throw error;
  return normaliseVariant(data);
};

/**
 * Apply a stock delta to one variant.
 *
 * Thin wrapper over the atomic RPC so callers can't accidentally reintroduce
 * the read-modify-write race: two staff restocking the same variant at once
 * both add to the server's current value, not to a stale snapshot.
 *
 * @param {string} variantId  inventory row id
 * @param {number} qtyDelta   units to add (negative to remove)
 * @returns {Promise<{prevTotal, newTotal, ...}|null>}
 */
export const restockVariant = async (variantId, qtyDelta) => {
  const qty = Number(qtyDelta);
  if (!variantId) throw new Error('restockVariant requires a variant id');
  if (!Number.isFinite(qty) || qty === 0) throw new Error('Restock quantity must be a non-zero number');

  return adjustInventoryStockDelta(variantId, {
    totalDelta: qty,
    availableDelta: qty,
  });
};

/**
 * Apply several variant restocks, reporting per-variant outcomes.
 *
 * Runs sequentially rather than in parallel: each call hits the same product's
 * stock-sync path, and concurrent syncs would race each other's writes to
 * products.stock. One failure does not abort the rest — partial success is
 * reported so the caller can tell staff exactly what landed.
 */
export const restockVariants = async (entries = []) => {
  const results = [];
  for (const { variantId, qtyDelta, label } of entries) {
    try {
      const result = await restockVariant(variantId, qtyDelta);
      results.push({ variantId, label, ok: true, result });
    } catch (err) {
      results.push({ variantId, label, ok: false, error: err?.message || 'Restock failed' });
    }
  }
  return results;
};

/**
 * Recompute the product's denormalised colour/pattern fields from its live
 * variants.
 *
 * The customer mobile app reads `products.color` as a comma-joined string and
 * splits it on ',' to build its colour picker, so this format is a contract —
 * changing it breaks that picker.
 */
export const syncProductAttributesFromVariants = async (productDocId) => {
  if (!productDocId) return null;

  const variants = await getProductVariants(productDocId);
  const colors = [...new Set(variants.map((v) => v.color).filter(Boolean))];
  const patterns = [...new Set(variants.map((v) => v.pattern).filter(Boolean))];

  const updates = { updated_at: new Date().toISOString() };
  // Only write dimensions the product actually uses — an empty variant axis
  // must not blank out a value the mobile app is still relying on.
  if (colors.length) {
    updates.color = colors.join(', ');
    updates.baseColor = colors[0];
  }
  if (patterns.length) {
    updates.pattern = patterns[0];
  }

  const { error } = await supabase.from('products').update(updates).eq('id', productDocId);
  if (error) throw error;

  await syncProductStock(productDocId);
  return { colors, patterns };
};
