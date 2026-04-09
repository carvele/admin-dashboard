import {
  getCollection,
  subscribeToCollection,
  addDocument,
  updateDocument,
  deleteDocument,
} from '../firebase/firestore';

export const subscribeToSuggestedOutfits = (callback) => {
  return subscribeToCollection('suggestedOutfits', callback);
};

export const getSuggestedOutfits = (maxResults = 0) => {
  return getCollection('suggestedOutfits', false, maxResults);
};

export const createSuggestedOutfit = (data) => {
  return addDocument('suggestedOutfits', data);
};

export const updateSuggestedOutfit = (docId, updates) => {
  return updateDocument('suggestedOutfits', docId, updates);
};

export const deleteSuggestedOutfit = (docId) => {
  return deleteDocument('suggestedOutfits', docId);
};

/**
 * Subscribe to Android customer wardrobe items.
 * This is the canonical collection that the Android app writes to
 * via FirebaseCollections.WARDROBE_ITEMS ("wardrobeItems").
 */
export const subscribeToWardrobeItems = (callback) => {
  return subscribeToCollection('wardrobeItems', callback);
};

export const getWardrobeItems = (maxResults = 0) => {
  return getCollection('wardrobeItems', false, maxResults);
};

/**
 * AR-session digital wardrobe (separate from the customer wardrobe panel).
 * @deprecated Use `subscribeToWardrobeItems` for customer wardrobe data.
 */
export const subscribeToDigitalWardrobe = (callback) => {
  return subscribeToCollection('digital_wardrobe', callback);
};

export const subscribeToARSessions = (callback) => {
  return subscribeToCollection('ar_sessions', callback);
};

export const getARSessions = () => {
  return getCollection('ar_sessions');
};

export const subscribeToARAssets = (callback) => {
  return subscribeToCollection('ar_assets', callback);
};

export const getARAssets = () => {
  return getCollection('ar_assets');
};
