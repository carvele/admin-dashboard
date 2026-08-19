/**
 * reviewService.js (Supabase)
 *
 * Both fetch functions return the same normalized Review shape so consumers
 * never need to know which endpoint was called:
 *
 *   {
 *     id:              string   – review UUID
 *     text:            string   – review body (comment column)
 *     rating:          number
 *     date:            string   – ISO 8601 (created_at column)
 *     userName:        string   – "First Last" or "Guest Explorer"
 *     displayName:     string   – alias for userName (kept for backwards compat)
 *     verifiedPurchase: boolean
 *     images:          string[] | null
 *     productId:       string
 *     productName?:    string   – only populated by getAllReviews
 *   }
 */

import { supabase } from '../lib/supabaseClient';

/** Normalize a raw Supabase review row into the canonical shape. */
function normalizeRow(row, productName) {
  const firstName = row.profiles?.first_name || '';
  const lastName  = row.profiles?.last_name  || '';
  const name = [firstName, lastName].filter(Boolean).join(' ') || 'Guest Explorer';

  return {
    id:              row.id,
    text:            row.comment || '',
    rating:          Number(row.rating),
    date:            row.created_at || new Date().toISOString(),
    userName:        name,
    displayName:     name,
    verifiedPurchase: row.verified_purchase || false,
    images:          row.images || null,
    productId:       row.product_id,
    ...(productName !== undefined ? { productName } : {}),
  };
}

/**
 * Fetch reviews for a single product.
 * @param {string} productId - Product UUID
 * @returns {Promise<Review[]>}
 */
export const getProductReviews = async (productId) => {
  const { data, error } = await supabase
    .from('reviews')
    .select(`
      id,
      product_id,
      user_id,
      rating,
      comment,
      images,
      verified_purchase,
      created_at,
      profiles (first_name, last_name, email)
    `)
    .eq('product_id', productId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(row => normalizeRow(row));
};

/**
 * Delete a review by UUID.
 * @param {string} reviewId - Review UUID
 */
export const deleteReview = async (reviewId) => {
  const { error } = await supabase
    .from('reviews')
    .delete()
    .eq('id', reviewId);

  if (error) throw error;
};

/**
 * Fetch all reviews with pagination, optional rating filter, and optional
 * product name search. Returns the canonical Review shape plus productName.
 */
export const getAllReviews = async (page = 1, limit = 20, rating = null, search = '') => {
  let query;

  if (search) {
    // Use !inner join so ilike on the related table is applied server-side.
    query = supabase
      .from('reviews')
      .select(`
        id,
        product_id,
        user_id,
        rating,
        comment,
        images,
        verified_purchase,
        created_at,
        profiles (first_name, last_name, email),
        products!inner (name)
      `, { count: 'exact' })
      .ilike('products.name', `%${search}%`);
  } else {
    query = supabase
      .from('reviews')
      .select(`
        id,
        product_id,
        user_id,
        rating,
        comment,
        images,
        verified_purchase,
        created_at,
        profiles (first_name, last_name, email),
        products (name)
      `, { count: 'exact' });
  }

  if (rating) query = query.eq('rating', rating);

  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  query = query.order('created_at', { ascending: false }).range(from, to);

  const { data, count, error } = await query;
  if (error) throw error;

  const reviews = (data || []).map(row =>
    normalizeRow(row, row.products?.name || 'Unknown Product')
  );

  return { reviews, count };
};
