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
