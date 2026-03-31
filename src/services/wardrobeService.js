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

export const getSuggestedOutfits = () => {
  return getCollection('suggestedOutfits');
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
