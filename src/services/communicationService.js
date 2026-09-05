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
  normaliseRow,
} from '../lib/supabaseService';

// --- Conversations ---

export const subscribeToConversations = (callback) =>
  subscribeToCollection('conversations', callback);

export const createConversation = (data) => addDocument('conversations', data);

export const updateConversation = (docId, updates) =>
  updateDocument('conversations', docId, updates);

export const deleteConversation = (docId) => deleteDocument('conversations', docId);

// --- Messages ---

export const subscribeToMessages = (conversationId, callback) => {
  if (!conversationId) return () => {};

  let localMessages = [];

  const doFetch = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(100);
      
    if (error) {
      console.error('[Supabase] fetch messages error:', error.message);
      return callback([]);
    }
    // We must normalise rows if the rest of the app expects camelCase
    localMessages = (data ?? []).map(normaliseRow);
    callback([...localMessages]);
  };

  doFetch();

  const channel = supabase
    .channel(`msgs_${conversationId}_${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
      if (payload.eventType === 'INSERT') {
        localMessages.push(normaliseRow(payload.new));
      } else if (payload.eventType === 'UPDATE') {
        const updatedMsg = normaliseRow(payload.new);
        localMessages = localMessages.map(msg => msg.id === updatedMsg.id ? updatedMsg : msg);
      } else if (payload.eventType === 'DELETE') {
        localMessages = localMessages.filter(msg => msg.id !== payload.old.id);
      }
      callback([...localMessages]);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

export const sendMessage = (data) => addDocument('messages', data);

/**
 * Mark a batch of messages delivered. Mirrors the mobile app's markDelivered
 * -- called with the ids of customer-authored messages the admin dashboard
 * has just received (live or on initial load), so a customer's checkmark
 * moves from Sent to Delivered as soon as any staff browser tab has it,
 * regardless of which conversation they have open.
 * @param {string[]} messageIds
 */
export const markMessagesDelivered = async (messageIds) => {
  if (!messageIds || messageIds.length === 0) return;
  const { error } = await supabase
    .from('messages')
    .update({ delivered_at: new Date().toISOString() })
    .in('id', messageIds)
    .is('delivered_at', null);
  if (error) console.error('[Supabase] markMessagesDelivered failed:', error.message);
};

/**
 * Mark every unread customer message in a conversation as read. Mirrors the
 * mobile app's markAsRead (which marks staff messages read when the customer
 * opens the chat) -- without this half, a customer's "Sent" checkmark never
 * became "Seen" no matter how many times staff opened or replied to the
 * conversation, because nothing on the admin side ever touched read_at.
 * @param {string} conversationId
 * @param {string} customerId - only the customer's own messages get marked
 */
export const markMessagesRead = async (conversationId, customerId) => {
  if (!conversationId) return;
  const nowIso = new Date().toISOString();

  // Reading implies delivery
  let delQuery = supabase
    .from('messages')
    .update({ delivered_at: nowIso })
    .eq('conversation_id', conversationId)
    .is('delivered_at', null);
  if (customerId) delQuery = delQuery.eq('sender_id', customerId);
  await delQuery;

  // Mark messages as read
  let readQuery = supabase
    .from('messages')
    .update({ read_at: nowIso })
    .eq('conversation_id', conversationId)
    .is('read_at', null);
  if (customerId) readQuery = readQuery.eq('sender_id', customerId);
  const { error } = await readQuery;
  if (error) console.error('[Supabase] markMessagesRead failed:', error.message);

  // Clear unread count on conversation table
  const { error: convErr } = await supabase
    .from('conversations')
    .update({ unread_staff: 0 })
    .eq('id', conversationId);
  if (convErr) console.error('[Supabase] markMessagesRead conversation update failed:', convErr.message);
};

/**
 * Edit a previously sent text message. Mirrors the mobile app's editMessage:
 * text + edited_at only, no ownership check here -- the caller (Messages.jsx)
 * only ever offers this on the staff's own messages.
 * @param {string} messageDocId
 * @param {string} text
 */
export const editMessage = async (messageDocId, text) => {
  const { error } = await supabase
    .from('messages')
    .update({ text, edited_at: new Date().toISOString() })
    .eq('id', messageDocId);
  if (error) throw error;
};

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
  try {
    const { error } = await supabase.rpc('merge_message_reaction', {
      _message_id: messageDocId,
      _user_id: userId,
      _emoji: emoji
    });
    if (error) throw error;
  } catch (err) {
    console.error('Error updating reaction:', err);
  }
};

// --- Notifications ---

export const subscribeToNotifications = (callback) =>
  subscribeToCollection('notifications', callback);

export const createNotification = (data) => addDocument('notifications', data);

export const markNotificationRead = (docId) =>
  updateDocument('notifications', docId, { is_read: true });

export const deleteNotification = (docId) => deleteDocument('notifications', docId);

// --- Auto-Reply Settings ---

export const DEFAULT_AUTO_REPLY_MESSAGE =
  'Thank you for your message! We have received it and notified the Jezsy Staff. Please wait patiently while a staff member reviews your message and responds to you. 💕';

/**
 * Fetch automatic message acknowledgment settings from public.settings.
 */
export const getAutoReplySettings = async () => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'autoReply')
      .maybeSingle();

    if (error) throw error;
    return {
      enabled: data?.value?.enabled ?? true,
      message: data?.value?.message || DEFAULT_AUTO_REPLY_MESSAGE,
    };
  } catch (err) {
    console.error('Error fetching autoReply settings:', err);
    return {
      enabled: true,
      message: DEFAULT_AUTO_REPLY_MESSAGE,
    };
  }
};

/**
 * Update automatic message acknowledgment settings in public.settings.
 */
export const updateAutoReplySettings = async ({ enabled, message }) => {
  const payload = {
    key: 'autoReply',
    value: {
      enabled: Boolean(enabled),
      message: message?.trim() || DEFAULT_AUTO_REPLY_MESSAGE,
    },
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('settings').upsert(payload, { onConflict: 'key' });
  if (error) throw error;
};

