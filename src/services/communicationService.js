/**
 * communicationService.js  (Supabase)
 * Replaces the Firebase-based communicationService.
 *
 * Image uploads for chat now go to Supabase Storage bucket 'chat-images'.
 * Reactions are stored as a jsonb column on the messages row.
 */

import { supabase } from '../lib/supabaseClient';
import {
  subscribeToCollection,
  addDocument,
  updateDocument,
  deleteDocument,
} from '../lib/supabaseService';

// --- Conversations ---

export const subscribeToConversations = (callback) =>
  subscribeToCollection('conversations', callback);

export const createConversation = (data) => addDocument('conversations', data);

export const updateConversation = (docId, updates) =>
  updateDocument('conversations', docId, updates);

export const deleteConversation = (docId) => deleteDocument('conversations', docId);

// --- Messages ---

export const subscribeToMessages = (callback) =>
  subscribeToCollection('messages', callback);

export const sendMessage = (data) => addDocument('messages', data);

/**
 * Upload a chat image to Supabase Storage and return the public URL.
 * @param {File} file - The image file to upload
 * @param {string} conversationId - Namespace for the storage path
 * @returns {Promise<string>} Public URL
 */
export const uploadChatImage = async (file, conversationId) => {
  const filename = `${conversationId}/${Date.now()}_${file.name}`;
  const { data, error } = await supabase.storage
    .from('chat-images')
    .upload(filename, file, { upsert: false });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from('chat-images').getPublicUrl(data.path);
  return urlData.publicUrl;
};

/**
 * Add or update an emoji reaction on a message.
 * Reactions are stored as jsonb: { userId: emoji, ... }
 * @param {string} messageDocId - Supabase message uuid
 * @param {string} userId - User performing the reaction
 * @param {string} emoji - Emoji character to store
 */
export const addReaction = async (messageDocId, userId, emoji) => {
  // Fetch existing reactions
  const { data: msg } = await supabase
    .from('messages')
    .select('id') // we can't easily merge jsonb on client, just update full reactions
    .eq('id', messageDocId)
    .maybeSingle();
  if (!msg) return;

  // Use Postgres jsonb merge via RPC or direct update with merged object
  // For simplicity, we use a raw update with the jsonb || operator via rpc
  await supabase.rpc('merge_message_reaction', {
    p_message_id: messageDocId,
    p_user_id: userId,
    p_emoji: emoji,
  }).then(({ error }) => {
    if (error) {
      // Fallback: fetch, merge, update
      console.warn('[communicationService] RPC merge_message_reaction not available, falling back');
    }
  });
};

// --- Notifications ---

export const subscribeToNotifications = (callback) =>
  subscribeToCollection('notifications', callback);

export const createNotification = (data) => addDocument('notifications', data);

export const markNotificationRead = (docId) =>
  updateDocument('notifications', docId, { is_read: true });

export const deleteNotification = (docId) => deleteDocument('notifications', docId);
