import {
  subscribeToCollection,
  addDocument,
  updateDocument,
  deleteDocument,
} from '../firebase/firestore';

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
 * @property {string} time
 */

/**
 * @typedef {Object} Notification
 * @property {string} docId
 * @property {string} id - Generic Notification ID
 * @property {string} type - System/Alert type
 * @property {string} title
 * @property {string} message
 * @property {boolean} read
 * @property {Date} timestamp
 */

// --- Conversations ---

export const subscribeToConversations = (callback) => {
  return subscribeToCollection('conversations', callback);
};

export const createConversation = (data) => addDocument('conversations', data);

export const updateConversation = (docId, updates) =>
  updateDocument('conversations', docId, updates);

export const deleteConversation = (docId) => deleteDocument('conversations', docId);

// --- Messages ---

export const subscribeToMessages = (callback) => {
  return subscribeToCollection('messages', callback);
};

export const sendMessage = (data) => addDocument('messages', data);

// --- Notifications ---

export const subscribeToNotifications = (callback) => {
  return subscribeToCollection('notifications', callback);
};

export const createNotification = (data) => addDocument('notifications', data);

export const markNotificationRead = (docId) =>
  updateDocument('notifications', docId, { isRead: true, read: true });

export const deleteNotification = (docId) => deleteDocument('notifications', docId);
