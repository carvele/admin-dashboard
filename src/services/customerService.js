import {
  getCollection,
  getDocument,
  addDocument,
  updateDocument,
  deleteDocument,
  softDeleteDocument,
  subscribeToCollection,
  getPaginatedCollection,
  query,
  where,
  getDocs,
  collection,
  db,
  serverTimestamp,
} from '../firebase/firestore';

/**
 * @typedef {Object} Customer
 * @property {string} docId
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} email
 * @property {string} status - 'Active', 'Inactive', 'VIP'
 * @property {string} phone
 * @property {number} totalSpent
 * @property {number} wardrobeItems
 * @property {number} reservations
 * @property {string} lastOnline - ISO Date format
 * @property {Date} createdAt - Timestamp
* @property {Object} measurements - AI Scanning Result
 * @property {number} measurements.bust
 * @property {number} measurements.waist
 * @property {number} measurements.hips
 * @property {number} measurements.neckBase
 * @property {number} measurements.shoulderWidth
 * @property {number} measurements.chest
 * @property {number} measurements.sleeveLength
 * @property {number} measurements.height
 * @property {number} measurements.inseam
 * @property {number} measurements.outseam
 * @property {number} measurements.armHole
 */

/**
 * @typedef {Object} Reservation
 * @property {string} docId
 * @property {string} id - Display string 'RES-001'
 * @property {string} customerName - Canonical customer display name
 * @property {string} customerId - Reference identifier
 * @property {string} productName - Canonical product name (use instead of legacy `outfit`)
 * @property {string} productId - Reference to the product document
 * @property {string} size - Selected sizing
 * @property {string} date - ISO format string
 * @property {string} status - 'Pending' | 'To Pay' | 'To Pickup' | 'Confirmed' | 'Fitting' | 'Completed' | 'Cancelled'
 * @property {string} staffId - Assigned staff member ID
 * @property {boolean} countdown - Is approaching urgency
 * @property {boolean} deposit - Paid deposit flag
 * @property {string} paymentStatus - GCash / Cash payment tracking
 * @property {string} paymentType - 'GCash' | 'Cash'
 * @property {string} receiptUrl - Firebase Storage URL for payment proof
 */

/**
 * @typedef {Object} WardrobeItem
 * @property {string} docId
 * @property {string} customer_id
 * @property {string} productDocId
 * @property {string} status - E.g. Default, Checked-Out, Archived
 */

// --- Customers ---

export const subscribeToCustomers = (callback) => {
  return subscribeToCollection('users', callback);
};

export const getCustomers = (maxResults = 0) => {
  return getCollection('users', false, maxResults);
};
export const getCustomerById = (id) => getDocument('users', id);

export const getPaginatedCustomers = (pageSize, lastDoc = null, constraints = [], includeDeleted = false) => {
  return getPaginatedCollection('users', pageSize, lastDoc, constraints, includeDeleted);
};

export const createCustomer = (customerData) => {
  return addDocument('users', { ...customerData, role: 'customer' });
};

export const updateCustomer = (docId, updates) => {
  return updateDocument('users', docId, updates);
};

export const deleteCustomer = (docId) => {
  return softDeleteDocument('users', docId);
};

// --- Reservations ---

export const subscribeToReservations = (callback) => {
  return subscribeToCollection('reservations', callback);
};

export const getReservations = () => getCollection('reservations');

export const createReservation = (data) => addDocument('reservations', data);

export const updateReservation = (docId, updates) => updateDocument('reservations', docId, updates);

export const deleteReservation = (docId) => softDeleteDocument('reservations', docId);

// --- Wardrobe ---

export const getCustomerWardrobe = async (customerId) => {
  return []; // Placeholder for Wardrobe
};

// --- Notifications / Messaging ---

export const sendNotification = async (customerId, customerName, messageText) => {
  // 1. Find or Create Conversation
  const q = query(collection(db, 'conversations'), where('customerId', '==', customerId));
  const snap = await getDocs(q);
  
  let conversationId;
  let conversationDocId;
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (snap.empty) {
    conversationId = `conv_${Date.now()}`;
    const convData = {
      id: conversationId,
      customerId,
      customerName,
      lastMessage: messageText,
      time: timeStr,
      unread: 0,
      updatedAt: serverTimestamp(),
    };
    conversationDocId = await addDocument('conversations', convData);
  } else {
    const convDoc = snap.docs[0];
    conversationId = convDoc.data().id;
    conversationDocId = convDoc.id;
    await updateDocument('conversations', conversationDocId, {
      lastMessage: messageText,
      time: timeStr,
      updatedAt: serverTimestamp(),
    });
  }

  // 2. Send Message
  const messageData = {
    conversationId,
    sender: 'staff',
    text: messageText,
    time: timeStr,
    createdAt: serverTimestamp(),
    id: Date.now(),
  };

  return await addDocument('messages', messageData);
};
