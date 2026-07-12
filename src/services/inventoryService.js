/**
 * src/services/inventoryService.js
 * Data-access layer for inventory feature
 *
 * Follows productService.js pattern:
 *  - Uses supabaseService helpers (getCollection, updateDocument, etc.)
 *  - Handles snake_case ↔ camelCase conversion
 *  - Includes caching where appropriate
 *
 * Key functions:
 *  - getProductWithStock(id) — fetches product + computes currentStock
 *  - getStockMovementHistory(productId) — fetches all movements, newest first
 *  - createStockMovement(req) — appends new movement (only way to change stock)
 *  - getColorList(), updateColorList()
 *  - getPatternList(), updatePatternList()
 */

import { supabase } from '../lib/supabaseClient';
import {
  getCollection,
  getDocument,
  updateDocument,
  toCamel,
} from '../lib/supabaseService';
import { calculateStockStatus, calculateCurrentStock, calculateStockPercentage } from '../lib/calculateStock';

// ── Stock Movement Functions ────────────────────────────────

/**
 * Fetch all stock movements for a product (newest first)
 * @param {string} productId
 * @returns {Promise<Array>} Array of StockMovement objects
 */
export const getStockMovementHistory = async (productId) => {
  const { data, error } = await supabase
    .from('stock_movements')
    .select('*')
    .eq('product_id', productId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data.map(toCamel);
};

/**
 * Create a new stock movement (the ONLY way to change product stock)
 *
 * This function:
 *  1. Fetches current product state
 *  2. Computes currentStock from existing movements
 *  3. Calculates previousStock and delta
 *  4. Inserts into stock_movements (RLS + CHECK constraint enforce immutability)
 *  5. Returns the created movement
 *
 * @param {string} productId
 * @param {number} newStock - The new stock level
 * @param {string} changeType - 'manual_adjustment', 'restock', or 'correction'
 * @param {string} [note] - Optional note
 * @returns {Promise<Object>} Created StockMovement object
 */
export const createStockMovement = async (productId, newStock, changeType, note) => {
  // 1. Get current stock by summing all existing movements
  const movements = await getStockMovementHistory(productId);
  const previousStock = calculateCurrentStock(movements);

  // 2. Calculate delta
  const delta = newStock - previousStock;

  // 3. Insert new movement (RLS will verify admin role)
  const { data, error } = await supabase
    .from('stock_movements')
    .insert({
      product_id: productId,
      previous_stock: previousStock,
      new_stock: newStock,
      delta,
      change_type: changeType,
      note: note || null,
      // created_at and updated_at are auto-set by Postgres DEFAULT
    })
    .select()
    .single();

  if (error) throw error;
  return toCamel(data);
};

// ── Product with Stock Functions ────────────────────────────────

/**
 * Fetch a product with computed stock information
 *
 * @param {string} productId
 * @returns {Promise<Object>} Product object with:
 *   - currentStock: sum of all movements
 *   - stockStatus: calculated from currentStock/stockBaseline
 *   - stockPercentage: percentage of baseline
 */
export const getProductWithStock = async (productId) => {
  // 1. Fetch product
  const product = await getDocument('products', productId);
  if (!product) return null;

  // 2. Fetch all movements for this product
  const movements = await getStockMovementHistory(productId);

  // 3. Compute stock values
  const currentStock = calculateCurrentStock(movements);
  const stockBaseline = product.stockBaseline ?? 10;
  const stockPercentage = calculateStockPercentage(currentStock, stockBaseline);
  const stockStatus = calculateStockStatus(currentStock, stockBaseline);

  // 4. Return enriched product
  return {
    ...product,
    currentStock,
    stockStatus,
    stockPercentage,
  };
};

/**
 * Fetch all products with computed stock (for dashboard)
 *
 * @param {boolean} [includeDeleted=false]
 * @returns {Promise<Array>} Array of Product objects with stock computed
 */
export const getProductsWithStock = async (includeDeleted = false) => {
  const products = await getCollection('products', includeDeleted);

  // For each product, compute stock by fetching movements
  // This is a N+1 query — consider caching/batching in production
  const enriched = await Promise.all(
    products.map(async (p) => {
      try {
        const movements = await getStockMovementHistory(p.id);
        const currentStock = calculateCurrentStock(movements);
        const stockBaseline = p.stockBaseline ?? 10;
        const stockPercentage = calculateStockPercentage(currentStock, stockBaseline);
        const stockStatus = calculateStockStatus(currentStock, stockBaseline);

        return {
          ...p,
          currentStock,
          stockStatus,
          stockPercentage,
        };
      } catch (err) {
        console.error(`Failed to compute stock for product ${p.id}:`, err);
        // Return product with default values if fetch fails
        return {
          ...p,
          currentStock: 0,
          stockStatus: 'ERROR',
          stockPercentage: 0,
        };
      }
    })
  );

  return enriched;
};

// ── Color List Functions ────────────────────────────────

/**
 * Fetch all colors from color_list table
 * @returns {Promise<Array>} Array of ColorList objects
 */
export const getColorList = async () => {
  return getCollection('color_list');
};

/**
 * Add a new color to the color_list table (admin-only via RLS)
 * @param {string} colorName
 * @returns {Promise<Object>} Created ColorList object
 */
export const addColor = async (colorName) => {
  const { data, error } = await supabase
    .from('color_list')
    .insert({ name: colorName })
    .select()
    .single();

  if (error) throw error;
  return toCamel(data);
};

/**
 * Remove a color from the color_list table (admin-only via RLS)
 * @param {number} colorId
 * @returns {Promise<void>}
 */
export const deleteColor = async (colorId) => {
  const { error } = await supabase
    .from('color_list')
    .delete()
    .eq('id', colorId);

  if (error) throw error;
};

// ── Pattern List Functions ────────────────────────────────

/**
 * Fetch all patterns from pattern_list table
 * @returns {Promise<Array>} Array of pattern name strings
 */
export const updateColor=async(id,name)=>{const{data,error}=await supabase.from('color_list').update({name}).eq('id',id).select().single();if(error)throw error;return toCamel(data)};

export const getPatternList = async () => {
  return getCollection('pattern_list');
};

/**
 * Add a new pattern to the pattern_list table (admin-only via RLS)
 * @param {string} patternName
 * @returns {Promise<Object>} Created PatternList object
 */
export const addPattern = async (patternName) => {
  const { data, error } = await supabase
    .from('pattern_list')
    .insert({ name: patternName })
    .select()
    .single();

  if (error) throw error;
  return toCamel(data);
};

/**
 * Remove a pattern from the pattern_list table (admin-only via RLS)
 * @param {number} patternId
 * @returns {Promise<void>}
 */
export const deletePattern = async (patternId) => {
  const { error } = await supabase
    .from('pattern_list')
    .delete()
    .eq('id', patternId);

  if (error) throw error;
};

// ── Update Product Inventory Fields ────────────────────────────────

/**
 * Update a product's stockBaseline (admin-only via RLS)
 * @param {string} productId
 * @param {number} newBaseline
 * @returns {Promise<Object>} Updated product object
 */
export const updatePattern=async(id,name)=>{const{data,error}=await supabase.from('pattern_list').update({name}).eq('id',id).select().single();if(error)throw error;return toCamel(data)};

export const updateStockBaseline = async (productId, newBaseline) => {
  return updateDocument('products', productId, { stockBaseline: newBaseline });
};

/**
 * Update a product's color (admin-only via RLS)
 * @param {string} productId
 * @param {string} newColor
 * @returns {Promise<Object>} Updated product object
 */
export const updateProductColor = async (productId, newColor) => {
  return updateDocument('products', productId, { color: newColor });
};

/**
 * Update a product's pattern (admin-only via RLS)
 * @param {string} productId
 * @param {string} newPattern
 * @returns {Promise<Object>} Updated product object
 */
export const updateProductPattern = async (productId, newPattern) => {
  return updateDocument('products', productId, { pattern: newPattern });
};
