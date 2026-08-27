/**
 * productService.js  (Supabase)
 * Replaces the Firebase-based productService.
 *
 * Key mapping decisions:
 *  - Firestore `docId`   → Supabase `id` (uuid)
 *  - Firestore `productDocId` in inventory → Supabase `product_doc_id` (uuid)
 *  - camelCase ↔ snake_case conversion handled by supabaseService helpers
 */

import { supabase } from '../lib/supabaseClient';
import {
  getCollection,
  getDocument,
  addDocument,
  updateDocument,
  softDeleteDocument,
  subscribeToCollection,
  toCamel,
} from '../lib/supabaseService';
import { logAction } from './staffService';
import { queryCache, CACHE_TTL } from '../utils/cache';

// ── Products ────────────────────────────────────────────────

/** Real-time subscription to products. Non-deleted only unless includeDeleted. */
export const subscribeToProducts = (callback, includeDeleted = false) => {
  return subscribeToCollection('products', callback, {}, includeDeleted);
};

export const getProducts = async (includeDeleted = false, maxResults = 0) => {
  const cacheKey = `products_${includeDeleted}_${maxResults}`;
  if (queryCache.has(cacheKey)) return queryCache.get(cacheKey);
  const data = await getCollection('products', includeDeleted, maxResults);
  queryCache.set(cacheKey, data, CACHE_TTL.SHORT);
  return data;
};

export const getProductById = (id) => getDocument('products', id);

export const createProduct = async (productData) => {
  queryCache.invalidateByPrefix('products');
  queryCache.invalidateByPrefix('inventory');
  return addDocument('products', productData);
};

export const updateProduct = async (docId, updates) => {
  await updateDocument('products', docId, updates);
  queryCache.invalidateByPrefix('products');
  queryCache.invalidateByPrefix('inventory');

  // Propagate name/category changes to linked inventory rows
  if (updates.name || updates.category || updates.price || updates.sku || updates.imageUrl) {
    await syncProductUpdateToInventory(docId, updates);
  }
};

/** Soft-archive a product and cascade to its inventory rows. */
export const archiveProduct = async (docId) => {
  queryCache.invalidateByPrefix('products');
  queryCache.invalidateByPrefix('inventory');
  return softDeleteDocument('products', docId);
};

/** Restore a soft-deleted product and its inventory rows. */
export const restoreProduct = async (docId) => {
  const now = new Date().toISOString();

  // Restore product
  const { error: pErr } = await supabase
    .from('products')
    .update({ deleted: false, deleted_at: null, updated_at: now })
    .eq('id', docId);
  if (pErr) throw pErr;

  // Restore linked inventory rows
  const { error: iErr } = await supabase
    .from('inventory')
    .update({ deleted: false, deleted_at: null, updated_at: now })
    .eq('product_doc_id', docId);
  if (iErr) console.warn('[Inventory] Restore cascade failed:', iErr.message);

  queryCache.invalidateByPrefix('products');
  queryCache.invalidateByPrefix('inventory');
};

/** Sync product metadata changes to all linked inventory rows. */
const syncProductUpdateToInventory = async (productDocId, newData) => {
  const { name, category, price, sku } = newData;
  const updates = {};
  if (name !== undefined) updates.item = name;
  if (category !== undefined) updates.category = category;
  // if (price !== undefined) updates.price = price; // PGRST204 fix: price column does not exist on inventory
  if (sku !== undefined) updates.sku = sku;
  if (!Object.keys(updates).length) return;

  updates.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from('inventory')
    .update(updates)
    .eq('product_doc_id', productDocId);
  if (error) console.warn('[Inventory] Sync failed:', error.message);
};

// ── Inventory ────────────────────────────────────────────────

/** Real-time subscription to all inventory rows (including deleted, for history). */
export const subscribeToInventory = (callback) => {
  return subscribeToCollection('inventory', callback, {}, true /* includeDeleted */);
};

export const getInventory = async (maxResults = 0) => {
  const cacheKey = `inventory_${maxResults}`;
  if (queryCache.has(cacheKey)) return queryCache.get(cacheKey);
  const data = await getCollection('inventory', true /* includeDeleted */, maxResults);
  queryCache.set(cacheKey, data, CACHE_TTL.SHORT);
  return data;
};

export const createInventoryItem = async (data) => {
  queryCache.invalidateByPrefix('inventory');
  // Map `productDocId` → `product_doc_id`
  return addDocument('inventory', data);
};

export const updateInventoryItem = async (docId, updates) => {
  queryCache.invalidateByPrefix('inventory');
  const result = await updateDocument('inventory', docId, updates);
  // Re-sync parent product stock. productDocId may be in updates (on create/move),
  // or we need to fetch it from the existing row.
  const productDocId = updates.productDocId || updates.product_doc_id;
  if (productDocId) {
    await syncProductStock(productDocId);
  } else {
    const { data: row } = await supabase.from('inventory').select('product_doc_id').eq('id', docId).maybeSingle();
    await syncProductStock(row?.product_doc_id);
  }
  return result;
};

/**
 * Apply total/available/reserved as atomic deltas rather than absolute
 * values -- use this instead of updateInventoryItem whenever the new value
 * is "current + N", not a value the user typed directly (like handleEdit's
 * exact-count form). adjust_inventory_stock applies the delta server-side in
 * a single UPDATE against the row's live value, so two calls close together
 * (a double-click, two staff acting near-simultaneously) can't silently
 * overwrite each other the way reading a JS-side snapshot then writing an
 * absolute number back can.
 * @returns {{prevTotal, prevAvailable, prevReserved, newTotal, newAvailable, newReserved, productDocId}}
 */
export const adjustInventoryStockDelta = async (docId, { totalDelta = 0, availableDelta = 0, reservedDelta = 0 } = {}) => {
  const { data, error } = await supabase.rpc('adjust_inventory_stock', {
    p_inventory_id: docId,
    p_total_delta: totalDelta,
    p_available_delta: availableDelta,
    p_reserved_delta: reservedDelta,
  });
  if (error) throw error;
  queryCache.invalidateByPrefix('inventory');
  const row = data?.[0];
  if (!row) return null;
  const result = {
    prevTotal: row.prev_total,
    prevAvailable: row.prev_available,
    prevReserved: row.prev_reserved,
    newTotal: row.new_total,
    newAvailable: row.new_available,
    newReserved: row.new_reserved,
    productDocId: row.out_product_doc_id,
  };
  if (result.productDocId) await syncProductStock(result.productDocId);
  return result;
};

/**
 * Recalculates and writes aggregated available/reserved/stock back to the
 * parent product row after any inventory mutation.
 * This is the Supabase-side replacement for the Firebase Cloud Function
 * (functions/src/triggers/syncInventory.ts) which never runs here.
 *
 * @param {string} productDocId - UUID of the parent product
 */
export const syncProductStock = async (productDocId) => {
  if (!productDocId) return;
  try {
    const { data: rows, error } = await supabase
      .from('inventory')
      .select('available, reserved, total')
      .eq('product_doc_id', productDocId)
      .eq('deleted', false);
    if (error) throw error;

    const totAvailable = (rows || []).reduce((s, r) => s + Number(r.available || 0), 0);
    const totReserved  = (rows || []).reduce((s, r) => s + Number(r.reserved  || 0), 0);
    let status = 'In Boutique';
    if (totAvailable <= 0) {
      status = totReserved > 0 ? 'Reserved' : 'Out of Stock';
    }

    await supabase.from('products').update({
      stock: totAvailable,
      status,
      updated_at: new Date().toISOString(),
    }).eq('id', productDocId);

    queryCache.invalidateByPrefix('products');
    queryCache.invalidateByPrefix('inventory');
  } catch (err) {
    console.warn('[syncProductStock] Failed to sync stock to product:', err?.message ?? err);
  }
};

export const archiveInventoryItem = async (docId) => {
  queryCache.invalidateByPrefix('inventory');
  const result = await updateDocument('inventory', docId, {
    deleted: true,
    deleted_at: new Date().toISOString(),
  });
  // Fetch the productDocId so we can re-sync the parent product's stock
  const { data: row } = await supabase.from('inventory').select('product_doc_id').eq('id', docId).maybeSingle();
  await syncProductStock(row?.product_doc_id);
  return result;
};

export const restoreInventoryItem = async (docId) => {
  queryCache.invalidateByPrefix('inventory');
  const result = await updateDocument('inventory', docId, {
    deleted: false,
    deleted_at: null,
  });
  const { data: row } = await supabase.from('inventory').select('product_doc_id').eq('id', docId).maybeSingle();
  await syncProductStock(row?.product_doc_id);
  return result;
};

/**
 * Persists the demand score to a specific inventory document (fire-and-forget).
 */
export const persistDemandScore = async (docId, demandScore, tier, adjustedScore) => {
  try {
    await updateDocument('inventory', docId, {
      demandScore,
      stockTier: tier,
      adjustedScore: parseFloat(adjustedScore.toFixed(4)),
      demandScoredAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[StockHealth] Failed to persist demand score:', err);
  }
};

// ── Stock movement ledger ────────────────────────────────────

/**
 * Append an immutable row to the stock_movements ledger.
 * change_type must be one of: 'manual_adjustment' | 'restock' | 'correction'
 * | 'sale' | 'reservation' (DB CHECK constraint).
 * Ledger rows are product-level; per-size context goes in the note.
 * Fire-and-forget: a ledger failure must never block the stock operation itself.
 */
export const logStockMovement = async (productId, previousStock, newStock, changeType, note = '') => {
  if (!productId) return;
  try {
    const { error } = await supabase.from('stock_movements').insert({
      product_id: productId,
      previous_stock: previousStock,
      new_stock: newStock,
      delta: newStock - previousStock,
      change_type: changeType,
      note: note || null,
    });
    if (error) console.warn('[StockLedger] insert failed:', error.message);
  } catch (err) {
    console.warn('[StockLedger] insert threw:', err);
  }
};

/** Fetch the stock-movement ledger for one product, newest first. */
export const getStockMovements = async (productId, limit = 50) => {
  const { data, error } = await supabase
    .from('stock_movements')
    .select('*')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[StockLedger] fetch failed:', error.message);
    return [];
  }
  return (data ?? []).map(toCamel);
};

/** Record an in-store walk-in sale: deduct stock + create a completed reservation. */
export const recordBoutiqueSale = async (inventoryItem, quantity, user, salePrice = 0) => {
  if (!inventoryItem || quantity <= 0) throw new Error('Invalid sale data');

  // 1. Update Inventory Stock -- delta applied atomically server-side, not
  // against inventoryItem.total/available, which are just a snapshot from
  // whenever this modal opened. Two sales recorded close together used to
  // both subtract from the same stale starting number, silently losing one
  // sale's deduction.
  const result = await adjustInventoryStockDelta(inventoryItem.docId, {
    totalDelta: -quantity,
    availableDelta: -quantity,
  });

  // 1b. Ledger entry (product-level; size noted). Uses the RPC's own
  // before/after rather than the stale snapshot, so the ledger reflects
  // what actually happened even if another mutation landed in between.
  await logStockMovement(
    inventoryItem.productDocId,
    result?.prevTotal ?? inventoryItem.total,
    result?.newTotal ?? inventoryItem.total - quantity,
    'sale',
    `Walk-in sale: ${quantity}× ${inventoryItem.item} (size ${inventoryItem.size})`,
  );

  // 2. Create virtual completed reservation
  const now = new Date().toISOString();
  await supabase.from('reservations').insert({
    product_id: inventoryItem.productDocId || null,
    product_name: inventoryItem.item,
    size: inventoryItem.size,
    quantity,
    rental_price: salePrice || 0,
    status: 'Completed',
    customer_name: 'Walk-in Customer',
    staff_id: user?.uid ?? null,
    created_at: now,
    updated_at: now,
    hidden_in_history: false,
    deleted: false,
  });

  // 3. Audit log -- targets the product (not the inventory row) to match
  // getStockMovements/getLogsForTarget('product', id), which is what
  // ProductForm's history panel actually queries. This entry used to target
  // 'inventory' + the row id, a combination nothing ever queried, so it was
  // captured but never visible anywhere.
  await logAction(user, 'Recorded In-Store Sale', {
    targetType: 'product',
    targetId: inventoryItem.productDocId,
    itemName: inventoryItem.item,
    size: inventoryItem.size,
    quantitySold: quantity,
  });

  return { success: true };
};

// ── Categories ───────────────────────────────────────────────

/**
 * Converts the flat categories table (parent_id FK structure) into the nested
 * shape that ProductForm expects: [{ id, name, subcategories: [{id, name}] }]
 * Top-level rows: parent_id = null
 * Subcategory rows: parent_id = UUID of a top-level row
 */
const buildCategoryTree = (rows) => {
  const parents = rows
    .filter((r) => !r.parentId)  // toCamel converts parent_id → parentId
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  return parents.map((parent) => ({
    id: parent.id,
    name: parent.name,
    slug: parent.slug,
    imageUrl: parent.imageUrl,
    subcategories: rows
      .filter((r) => r.parentId === parent.id)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map((s) => ({ id: s.id, name: s.name, slug: s.slug, imageUrl: s.imageUrl })),
  }));
};

export const subscribeToCategories = (callback) => {
  return subscribeToCollection('categories', (rows) => {
    callback(buildCategoryTree(rows));
  });
};

export const getCategories = async () => {
  const cacheKey = 'categories';
  if (queryCache.has(cacheKey)) return queryCache.get(cacheKey);
  const data = await getCollection('categories');
  const tree = buildCategoryTree(data);
  queryCache.set(cacheKey, tree, CACHE_TTL.SHORT);
  return tree;
};

export const createCategory = (categoryData) => {
  queryCache.invalidateByPrefix('categories');
  return addDocument('categories', categoryData);
};

export const updateCategory = (docId, updates) => {
  queryCache.invalidateByPrefix('categories');
  return updateDocument('categories', docId, updates);
};

export const deleteCategory = (docId) => {
  queryCache.invalidateByPrefix('categories');
  return softDeleteDocument('categories', docId);
};

// ── Admin-managed category CRUD ──────────────────────────────

/**
 * Add a top-level category or a subcategory.
 * @param {string} name
 * @param {string|null} parentId — null for top-level, UUID for subcategory
 */
export const addCategoryAdmin = async (name, parentId = null) => {
  queryCache.invalidateByPrefix('categories');
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const { data, error } = await supabase
    .from('categories')
    .insert({ name, slug, parent_id: parentId || null })
    .select()
    .single();
  if (error) throw error;
  return data;
};

/**
 * Rename an existing category or subcategory.
 * @param {string} id
 * @param {string} newName
 */
export const renameCategoryAdmin = async (id, newName) => {
  queryCache.invalidateByPrefix('categories');
  const slug = newName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const { error } = await supabase
    .from('categories')
    .update({ name: newName, slug })
    .eq('id', id);
  if (error) throw error;
};

/**
 * Delete a category (hard delete).
 * Guard: throws a user-friendly Error if any live product references this
 * category name (in `category` or `sub_category` columns).
 *
 * @param {string} id  — UUID of the category row to delete
 * @param {string} name — display name of the category (for the guard query)
 * @param {boolean} isSubcategory — true if deleting a sub, false for top-level
 */
export const deleteCategoryAdmin = async (id, name, isSubcategory = false) => {
  // 1. Guard: check if any products use this name
  const column = isSubcategory ? 'sub_category' : 'category';
  const { data: usingProducts, error: guardError } = await supabase
    .from('products')
    .select('name')
    .eq(column, name)
    .eq('deleted', false);

  if (guardError) throw guardError;

  if (usingProducts && usingProducts.length > 0) {
    const productList = usingProducts.slice(0, 3).map((p) => `"${p.name}"`).join(', ');
    const extra = usingProducts.length > 3 ? ` and ${usingProducts.length - 3} more` : '';
    throw new Error(
      `Cannot delete "${name}" — it is currently used by ${usingProducts.length} product(s): ${productList}${extra}. Please reassign those products first.`
    );
  }

  // 2. If it's a top-level category, also check if any subcategory rows exist under it
  if (!isSubcategory) {
    const { data: children, error: childErr } = await supabase
      .from('categories')
      .select('id, name')
      .eq('parent_id', id);
    if (childErr) throw childErr;
    if (children && children.length > 0) {
      const names = children.map((c) => `"${c.name}"`).join(', ');
      throw new Error(
        `Cannot delete "${name}" — it still has subcategories: ${names}. Delete or reassign subcategories first.`
      );
    }
  }

  // 3. Perform hard delete
  queryCache.invalidateByPrefix('categories');
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
};


// ── Stock healing ─────────────────────────────────────────────

/**
 * Force-recalculates all inventory reserved stock by scanning active reservations.
 * Healing function for data mismatches.
 */
export const recalculateAllInventoryStock = async () => {
  // 0. Auto-create missing color variants for existing products that have multi-color arrays
  try {
    const { data: prods } = await supabase.from('products').select('*').eq('deleted', false);
    const { data: existingInv } = await supabase.from('inventory').select('*').eq('deleted', false);

    if (prods && existingInv) {
      const newVariantsToCreate = [];
      for (const p of prods) {
        if (!p.color || !p.sizes || !Array.isArray(p.sizes)) continue;
        const colors = typeof p.color === 'string' ? p.color.split(',').map(c => c.trim()).filter(Boolean) : (Array.isArray(p.color) ? p.color : []);
        if (colors.length <= 1) continue;

        const prodInv = existingInv.filter(i => (i.product_doc_id === p.id || i.product_doc_id === p.doc_id || i.sku === p.id));
        const existingCombos = new Set(prodInv.map(i => i.size + '|||' + (i.color || '')));

        for (const size of p.sizes) {
          for (const color of colors) {
            const key = size + '|||' + color;
            if (!existingCombos.has(key)) {
              const skuStr = (p.style_code || p.id || 'ITEM') + '-' + color.toUpperCase().replace(/\s+/g, '') + '-' + size;
              newVariantsToCreate.push({
                product_doc_id: p.id,
                sku: p.style_code || p.id,
                variant_sku: skuStr,
                item: p.name,
                category: p.category || 'Uncategorized',
                size,
                color,
                pattern: '',
                total: 0,
                reserved: 0,
                available: 0,
                deleted: false
              });
            }
          }
        }
      }
      if (newVariantsToCreate.length > 0) {
        await supabase.from('inventory').insert(newVariantsToCreate);
      }
    }
  } catch (err) {
    console.warn('Auto-variant sync notice:', err.message);
  }

  const { error } = await supabase.rpc('recalculate_inventory_stock');
  if (error) throw error;

  queryCache.invalidateByPrefix('inventory');
  queryCache.invalidateByPrefix('products');
};
