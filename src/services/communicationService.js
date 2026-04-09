import {
  subscribeToCollection,
  addDocument,
  updateDocument,
  deleteDocument,
} from '../firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * @typedef {Object} Conversation
 * @property {string} docId
 * @property {string} id
 * @property {string} customerName
 * @property {string} customerId
 * @property {string} lastMessage
 * @property {string} time
 * @property {number} unread
 */

/**
 * @typedef {Object} Message
 * @property {string} docId
 * @property {number | string} id
 * @property {string} conversationId
 * @property {string} sender - 'staff' | 'customer'
 * @property {string} text - Message body
 * @property {string} imageUrl - Optional Firebase Storage URL for image messages
 * @property {string} messageType - 'text' | 'image'
 * @property {Object} reactions - Map of userId → emoji
 * @property {string} time
 */

/**
 * @typedef {Object} Notification
 * @property {string} docId
 * @property {string} id
 * @property {string} type
 * @property {string} title
 * @property {string} message
 * @property {boolean} read
 * @property {Date} timestamp
 */

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
 * Upload a chat image to Firebase Storage and return the download URL.
 * @param {File} file - The image file to upload
 * @param {string} conversationId - Namespace for the storage path
 * @returns {Promise<string>} Download URL
 */
export const uploadChatImage = (file, conversationId) => {
  return new Promise((resolve, reject) => {
    const storage = getStorage();
    const filename = `chat-images/${conversationId}/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, filename);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      () => {},
      (error) => reject(error),
      () => getDownloadURL(uploadTask.snapshot.ref).then(resolve).catch(reject)
    );
  });
};

/**
 * Add or update an emoji reaction on a message.
 * @param {string} messageDocId - Firestore doc ID of the message
 * @param {string} userId - User performing the reaction
 * @param {string} emoji - Emoji character to store
 */
export const addReaction = async (messageDocId, userId, emoji) => {
  const msgRef = doc(db, 'messages', messageDocId);
  await updateDoc(msgRef, { [`reactions.${userId}`]: emoji });
};

// --- Notifications ---

export const subscribeToNotifications = (callback) =>
  subscribeToCollection('notifications', callback);

export const createNotification = (data) => addDocument('notifications', data);

export const markNotificationRead = (docId) =>
  updateDocument('notifications', docId, { isRead: true });

export const deleteNotification = (docId) => deleteDocument('notifications', docId);
