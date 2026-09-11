/**
 * src/services/productComplementService.js
 *
 * Admin access to `product_complements` -- the "Complete the Look" curated
 * cross-sell links customers see on the mobile product page.
 *
 * Direct supabase.from() calls, not the generic addDocument/updateDocument
 * helpers in lib/supabaseService.js: that table has column-level GRANTs
 * (audit columns like created_by/updated_at are intentionally not grantable
 * to `authenticated`), and the generic helpers assume a table where the
 * caller's role can read/write every column. Keeping this file's own
 * explicit column lists means a future generic-helper change can't silently
 * start requesting a column this role was never granted.
 */

import { supabase } from '../lib/supabaseClient';
import { toCamel } from '../lib/supabaseService';

const SELECT_COLUMNS = 'id, product_id, complementary_product_id, sort_order, origin, is_active';

const normalise = (row) => toCamel(row);

/**
 * Curated complement links for one product (active and inactive), sorted
 * for admin display.
 */
export const listComplements = async (productId) => {
  if (!productId) return [];
  const { data, error } = await supabase
    .from('product_complements')
    .select(SELECT_COLUMNS)
    .eq('product_id', productId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(normalise);
};

/**
 * Add a manually curated complement link.
 */
export const addComplement = async (productId, complementaryProductId, { origin = 'manual', sortOrder = 0 } = {}) => {
  if (!productId || !complementaryProductId) throw new Error('addComplement requires both product ids');

  const { data, error } = await supabase
    .from('product_complements')
    .insert({
      product_id: productId,
      complementary_product_id: complementaryProductId,
      sort_order: sortOrder,
      origin,
      is_active: true,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return normalise(data);
};

/**
 * Update a complement link's sort order, origin, or active state.
 */
export const updateComplement = async (id, updates = {}) => {
  if (!id) throw new Error('updateComplement requires an id');

  const payload = {};
  if (updates.sortOrder !== undefined) payload.sort_order = updates.sortOrder;
  if (updates.origin !== undefined) payload.origin = updates.origin;
  if (updates.isActive !== undefined) payload.is_active = updates.isActive;

  const { data, error } = await supabase
    .from('product_complements')
    .update(payload)
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return normalise(data);
};

/**
 * Remove a complement link entirely (hard delete -- this table has no
 * soft-delete column; deactivate via updateComplement if the link should be
 * recoverable).
 */
export const removeComplement = async (id) => {
  if (!id) throw new Error('removeComplement requires an id');
  const { error } = await supabase.from('product_complements').delete().eq('id', id);
  if (error) throw error;
};

/**
 * Promote a suggestion (from getStyledLookSuggestions or an algorithmic
 * pick) into a real, active complement link. Idempotent: promoting an
 * already-active link is a server-side no-op, not a fresh audit event --
 * see the promote_product_complement_suggestion migration for why this has
 * to be an RPC rather than a client-side upsert.
 */
export const promoteSuggestion = async (productId, complementaryProductId, { origin = 'styled_look_suggestion', sortOrder = 0 } = {}) => {
  if (!productId || !complementaryProductId) throw new Error('promoteSuggestion requires both product ids');

  const { data, error } = await supabase.rpc('promote_product_complement_suggestion', {
    p_product_id: productId,
    p_complementary_product_id: complementaryProductId,
    p_origin: origin,
    p_sort_order: sortOrder,
  });
  if (error) throw error;

  const row = data?.[0];
  if (!row) return null;
  return {
    id: row.out_id,
    productId: row.out_product_id,
    complementaryProductId: row.out_complementary_product_id,
    sortOrder: row.out_sort_order,
  };
};

/**
 * Styled-look siblings for a product: other products sharing at least one
 * pose_guide with it, ranked by how many looks they're paired in. This is
 * the same Tier 2 source the mobile app's completeTheLookService.ts reads,
 * surfaced here as suggestions staff can promote into curated links.
 */
export const getStyledLookSuggestions = async (productId, limit = 12) => {
  if (!productId) return [];

  const { data: ownLinks, error: ownError } = await supabase
    .from('pose_guide_products')
    .select('pose_guide_id')
    .eq('product_id', productId);
  if (ownError) throw ownError;

  const poseGuideIds = [...new Set((ownLinks ?? []).map((r) => r.pose_guide_id).filter(Boolean))];
  if (poseGuideIds.length === 0) return [];

  const { data: siblingLinks, error: siblingError } = await supabase
    .from('pose_guide_products')
    .select('product_id, pose_guide_id, sort_order')
    .in('pose_guide_id', poseGuideIds)
    .neq('product_id', productId);
  if (siblingError) throw siblingError;

  const byProduct = new Map();
  for (const row of siblingLinks ?? []) {
    if (!row.product_id) continue;
    const entry = byProduct.get(row.product_id) ?? { sharedLookCount: 0, minSortOrder: Infinity };
    entry.sharedLookCount += 1;
    entry.minSortOrder = Math.min(entry.minSortOrder, row.sort_order ?? 0);
    byProduct.set(row.product_id, entry);
  }

  const ranked = [...byProduct.entries()]
    .sort((a, b) => b[1].sharedLookCount - a[1].sharedLookCount || a[1].minSortOrder - b[1].minSortOrder)
    .slice(0, limit);
  if (ranked.length === 0) return [];

  const productIds = ranked.map(([pid]) => pid);
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name, image_url, price, sale_price')
    .in('id', productIds)
    .eq('deleted', false);
  if (productsError) throw productsError;

  const productById = new Map((products ?? []).map((p) => [p.id, p]));
  return ranked
    .map(([pid, stats]) => {
      const product = productById.get(pid);
      if (!product) return null;
      return { ...normalise(product), sharedLookCount: stats.sharedLookCount };
    })
    .filter(Boolean);
};
