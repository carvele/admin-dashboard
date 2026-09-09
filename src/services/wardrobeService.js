/**
 * wardrobeService.js  (Supabase)
 * Replaces the Firebase-based wardrobeService.
 *
 * Table mapping:
 *  suggestedOutfits  → public.suggested_outfits
 *  wardrobeItems     → public.wardrobe_items
 *  ar_sessions       → public.ar_sessions
 *  ar_assets         → public.ar_assets
 */

import {
  getCollection,
  subscribeToCollection,
  addDocument,
  updateDocument,
  deleteDocument,
} from '../lib/supabaseService';

// ── Suggested Outfits ────────────────────────────────────────

export const subscribeToSuggestedOutfits = (callback) =>
  subscribeToCollection('suggested_outfits', callback);

export const getSuggestedOutfits = (maxResults = 0) =>
  getCollection('suggested_outfits', false, maxResults);

export const createSuggestedOutfit = (data) =>
  addDocument('suggested_outfits', data);

export const updateSuggestedOutfit = (docId, updates) =>
  updateDocument('suggested_outfits', docId, updates);

export const deleteSuggestedOutfit = (docId) =>
  deleteDocument('suggested_outfits', docId);

// ── Wardrobe Items (customer wardrobe) ───────────────────────

export const subscribeToWardrobeItems = (callback) =>
  subscribeToCollection('wardrobe_items', callback);

export const getWardrobeItems = (maxResults = 0) =>
  getCollection('wardrobe_items', false, maxResults);

// ── AR Sessions ──────────────────────────────────────────────

export const subscribeToARSessions = (callback) =>
  subscribeToCollection('ar_sessions', callback);

export const getARSessions = () =>
  getCollection('ar_sessions');

// ── AR Assets ────────────────────────────────────────────────

export const subscribeToARAssets = (callback) =>
  subscribeToCollection('ar_assets', callback);

export const getARAssets = () =>
  getCollection('ar_assets');

export const createARAsset = (data) =>
  addDocument('ar_assets', data);

export const updateARAsset = (docId, updates) =>
  updateDocument('ar_assets', docId, updates);

export const deleteARAsset = (docId) =>
  deleteDocument('ar_assets', docId);

// ── Pose Guides ──────────────────────────────────────────────

export const subscribeToPoseGuides = (callback) =>
  subscribeToCollection('pose_guides', callback);

export const createPoseGuide = (data) => {
  const {
    id,
    name,
    category,
    image_url = null,
    description = null,
    occasion = null,
    style_tags = [],
    difficulty = 'easy',
    is_featured = false,
    base_pose_type = 'front',
    sort_order = 0,
  } = data;
  return import('../lib/supabaseService').then(({ upsertDocument }) =>
    upsertDocument('pose_guides', {
      id,
      name,
      category,
      image_url,
      description,
      occasion,
      style_tags,
      difficulty,
      is_featured,
      base_pose_type,
      sort_order,
      deleted: false,
    })
  );
};

export const updatePoseGuide = (docId, updates) =>
  updateDocument('pose_guides', docId, updates);

export const deletePoseGuide = (docId) =>
  deleteDocument('pose_guides', docId);

// Atomic write path: upserts the pose and reconciles its product links in
// one DB transaction via save_pose_guide (see jezsy-mobile-app migration
// 20260910140000_save_pose_guide_atomic.sql), replacing the older pattern
// of an upsert followed by a separate Promise.all of link/unlink calls,
// which could leave a pose saved with a stale product list on partial
// failure.
export const savePoseGuide = async (data) => {
  const {
    id,
    name,
    category,
    image_url = null,
    description = null,
    occasion = null,
    style_tags = [],
    difficulty = 'easy',
    is_featured = false,
    base_pose_type = 'front',
    sort_order = 0,
    product_ids = [],
  } = data;
  const { supabase } = await import('../lib/supabaseService');
  const { error } = await supabase.rpc('save_pose_guide', {
    p_id: id,
    p_name: name,
    p_category: category,
    p_image_url: image_url,
    p_description: description,
    p_occasion: occasion,
    p_style_tags: style_tags,
    p_difficulty: difficulty,
    p_is_featured: is_featured,
    p_base_pose_type: base_pose_type,
    p_sort_order: sort_order,
    p_product_ids: product_ids,
  });
  if (error) throw error;
};

// ── Pose Guide Products ──────────────────────────────────────

export const getPoseGuideProducts = async (poseId) => {
  const { supabase } = await import('../lib/supabaseService');
  const { data, error } = await supabase
    .from('pose_guide_products')
    .select('*, product:products(*)')
    .eq('pose_guide_id', poseId);
  if (error) {
    console.error('Error fetching pose_guide_products:', error);
    return [];
  }
  return data || [];
};

export const linkProductToPose = async (poseId, productId) => {
  const { supabase } = await import('../lib/supabaseService');
  const { data, error } = await supabase
    .from('pose_guide_products')
    .upsert({ pose_guide_id: poseId, product_id: productId }, { onConflict: 'pose_guide_id,product_id' });
  if (error) throw error;
  return data;
};

export const unlinkProductFromPose = async (poseId, productId) => {
  const { supabase } = await import('../lib/supabaseService');
  const { error } = await supabase
    .from('pose_guide_products')
    .delete()
    .eq('pose_guide_id', poseId)
    .eq('product_id', productId);
  if (error) throw error;
};

