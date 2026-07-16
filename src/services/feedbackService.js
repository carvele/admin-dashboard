/**
 * feedbackService.js  (Supabase)
 * Replaces the Firebase-based feedbackService.
 * Table: public.feedback
 */

import {
  subscribeToCollection,
  deleteDocument,
} from '../lib/supabaseService';

/**
 * Subscribes to the feedback table in real-time, ordered by most recent first.
 * @param {Function} callback - Called with the array of feedback rows.
 * @returns {Function} Unsubscribe function.
 */
export const subscribeToFeedbacks = (callback) => {
  // Include all rows (mobile app may not set deleted=false), then sort client-side
  return subscribeToCollection('feedback', (rows) => {
    const sorted = [...rows].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt) : 0;
      const tb = b.createdAt ? new Date(b.createdAt) : 0;
      return tb - ta;
    });
    callback(sorted);
  }, {}, true /* includeDeleted */);
};

export const deleteFeedback = (docId) => deleteDocument('feedback', docId);
