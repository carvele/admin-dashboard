import { subscribeToCollection, orderBy, deleteDocument } from '../firebase/firestore';

/**
 * Subscribes to the feedback collection in real-time, ordered by timestamp descending.
 * @param {Function} callback - Called with the array of feedback data.
 * @returns {Function} Unsubscribe function.
 */
export const subscribeToFeedbacks = (callback) => {
  // We use includeDeleted = true because mobile users might not set deleted: false when creating feedbacks.
  return subscribeToCollection('feedback', callback, [orderBy('timestamp', 'desc')], undefined, true);
};

export const deleteFeedback = (docId) => {
  return deleteDocument('feedback', docId);
};
