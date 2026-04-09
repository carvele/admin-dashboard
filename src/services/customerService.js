import {
  getCollection,
  getDocument,
  addDocument,
  updateDocument,
  deleteDocument,
  softDeleteDocument,
  subscribeToCollection,
  getPaginatedCollection,
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
  // Uses a query block via getCollection (if customized further) or currently just fetches globally
  // and filters client side, but standardizes it as an API extension point.
  // We'll leave it simple for now or proxy it if needed down the line.
  return []; // Placeholder for Wardrobe
};
