/**
 * reviewService.js (Supabase)
 * Replaces Firebase query/delete functions for product reviews.
 */

import { supabase } from '../lib/supabaseClient';

/**
 * Fetch reviews for a specific product, including user profiles details.
 * @param {string} productId - Product UUID
 * @returns {Promise<Array>} List of formatted reviews
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
      profiles (
        first_name,
        last_name,
        email
      )
    `)
    .eq('product_id', productId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map(row => {
    const firstName = row.profiles?.first_name || '';
    const lastName = row.profiles?.last_name || '';
    const userName = [firstName, lastName].filter(Boolean).join(' ') || 'Guest Explorer';

    return {
      docId: row.id,
      productId: row.product_id,
      userId: row.user_id,
      rating: Number(row.rating),
      reviewText: row.comment,
      images: row.images,
      timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      userName,
      displayName: userName
    };
  });
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
 * Fetch all reviews with pagination, optional rating filter, and optional product search.
 */
export const getAllReviews = async (page = 1, limit = 20, rating = null, search = '') => {
  let query = supabase
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

  if (rating) {
    query = query.eq('rating', rating);
  }

  // We can't do ilike on related table directly in PostgREST unless we use !inner,
  // but if the relationship is simple, we might just filter client-side or use !inner.
  // Using !inner for products to allow search.
  if (search) {
    query = supabase
      .from('reviews')
      .select(`
        id,
        product_id,
        user_id,
        rating,
        comment,
        images,
        created_at,
        profiles (first_name, last_name, email),
        products!inner (name)
      `, { count: 'exact' })
      .ilike('products.name', `%${search}%`);
      
    if (rating) {
      query = query.eq('rating', rating);
    }
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  query = query.order('created_at', { ascending: false }).range(from, to);

  const { data, count, error } = await query;
  if (error) throw error;

  const formatted = (data || []).map(row => {
    const firstName = row.profiles?.first_name || '';
    const lastName = row.profiles?.last_name || '';
    return {
      id: row.id,
      productId: row.product_id,
      productName: row.products?.name || 'Unknown Product',
      userId: row.user_id,
      rating: Number(row.rating),
      comment: row.comment,
      images: row.images,
      createdAt: row.created_at,
      verifiedPurchase: row.verified_purchase || false,
      userName: [firstName, lastName].filter(Boolean).join(' ') || 'Guest Explorer',
    };
  });

  return { reviews: formatted, count };
};
