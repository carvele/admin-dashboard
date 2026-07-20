/**
 * src/services/inventoryService.js
 * Data-access layer for product-level inventory lookups: color/pattern lists
 * and stock baseline. Per-size stock itself lives in productService.js
 * (the `inventory` table is the canonical stock model — see
 * subscribeToInventory / updateInventoryItem there).
 *
 * Key functions:
 *  - getColorList(), updateColorList()
 *  - getPatternList(), updatePatternList()
 *  - updateStockBaseline()
 */

import { supabase } from '../lib/supabaseClient';
import {
  getCollection,
  updateDocument,
  toCamel,
} from '../lib/supabaseService';

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
  // 1. Get the color name first
  const { data: colorData, error: fetchError } = await supabase
    .from('color_list')
    .select('name')
    .eq('id', colorId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!colorData) return; // Already deleted or doesn't exist

  // 2. Check if any product references this color
  const { data: referencingProducts, error: countError } = await supabase
    .from('products')
    .select('id, name')
    .eq('base_color', colorData.name)
    .eq('deleted', false); // Only active products

  if (countError) throw countError;

  if (referencingProducts && referencingProducts.length > 0) {
    const productNames = referencingProducts.map(p => `"${p.name}"`).join(', ');
    throw new Error(`Cannot delete color "${colorData.name}" because it is still referenced by product(s): ${productNames}.`);
  }

  // 3. Perform delete
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
  // 1. Get the pattern name first
  const { data: patternData, error: fetchError } = await supabase
    .from('pattern_list')
    .select('name')
    .eq('id', patternId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!patternData) return; // Already deleted or doesn't exist

  // 2. Check if any product references this pattern
  const { data: referencingProducts, error: countError } = await supabase
    .from('products')
    .select('id, name')
    .eq('pattern', patternData.name)
    .eq('deleted', false); // Only active products

  if (countError) throw countError;

  if (referencingProducts && referencingProducts.length > 0) {
    const productNames = referencingProducts.map(p => `"${p.name}"`).join(', ');
    throw new Error(`Cannot delete pattern "${patternData.name}" because it is still referenced by product(s): ${productNames}.`);
  }

  // 3. Perform delete
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
  // Use raw column name 'stockbaseline' (Postgres lowercased the unquoted identifier).
  // Cannot go through updateDocument/toSnake — that would produce 'stock_baseline' (wrong).
  const { error } = await supabase
    .from('products')
    .update({ stockbaseline: newBaseline, updated_at: new Date().toISOString() })
    .eq('id', productId);
  if (error) throw error;
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
