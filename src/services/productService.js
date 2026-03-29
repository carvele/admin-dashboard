import {
  getCollection,
  getDocument,
  addDocument,
  updateDocument,
  deleteDocument,
  softDeleteDocument,
  subscribeToCollection,
  syncProductUpdateToInventory,
} from '../firebase/firestore';

/**
 * @typedef {Object} Product
 * @property {string} docId - Auto-generated Firestore document ID
 * @property {string} id - The SKU or unique product identifier across the app
 * @property {string} name - Product canonical name
 * @property {string} category - Assigned catalog category
 * @property {number} price - Retail price
 * @property {string} material - Fabric composition
 * @property {string} color - Primary color descriptive string
 * @property {string} fitAndSizing - Fit standard (e.g. Regular Fit)
 * @property {string} season - Operational season
 * @property {string} occasion - Targeted event usage
 * @property {string[]} sizes - Array of available sizes
 * @property {string} visibility - 'Published' | 'Draft'
 * @property {boolean} featured - Is featured globally
 * @property {number} stock - Sum total internal stock
 * @property {string[]} tags - Associated metadata tags
 * @property {string} imageUrl - Main thumbnail uri
 * @property {string[]} images - Carousel array uris
 * @property {string} description - Long description narrative
 * @property {string} careInstructions - Care handling text
 * @property {string} styleCode - Legacy mapping code equivalent to SKU usually
 * @property {string} created_by - User identifier that minted record
 */

/**
 * @typedef {Object} Category
 * @property {string} docId
 * @property {string} id
 * @property {string} name
 * @property {string[]} [subcategories] - Optional nested paths
 */

/**
 * @typedef {Object} InventoryItem
 * @property {string} docId
 * @property {string} productDocId - Relational link to Product Document
 * @property {string} sku - Product code
 * @property {string} item - Normalized product Name
 * @property {string} category - Normalized product Category
 * @property {string} size - The discrete size enum this record represents
 * @property {number} total - Grand capacity
 * @property {number} reserved - Currently checked out constraint
 * @property {number} available - Computable total - reserved
 */

/**
 * Subscribes to real-time streams of the global product catalog.
 * @param {Function} callback - Returns Array of Products
 */
export const subscribeToProducts = (callback) => {
  return subscribeToCollection('products', callback);
};

export const getProducts = () => getCollection('products');
export const getProductById = (id) => getDocument('products', id);

export const createProduct = async (productData) => {
  return addDocument('products', productData);
};

export const updateProduct = async (docId, updates) => {
  await updateDocument('products', docId, updates);
  // Auto-propagate specific column updates to Inventory mapping
  if (updates.name || updates.category) {
    await syncProductUpdateToInventory(docId, updates);
  }
};

export const deleteProduct = async (docId) => {
  return softDeleteDocument('products', docId);
};

// --- Inventory Layer ---

export const subscribeToInventory = (callback) => {
  return subscribeToCollection('inventory', callback);
};

export const getInventory = () => getCollection('inventory');

export const createInventoryItem = (data) => {
  return addDocument('inventory', data);
};

export const updateInventoryItem = (docId, updates) => {
  return updateDocument('inventory', docId, updates);
};

export const deleteInventoryItem = (docId) => {
  return softDeleteDocument('inventory', docId);
};

// --- Category Layer ---

export const subscribeToCategories = (callback) => {
  return subscribeToCollection('categories', callback);
};

export const getCategories = () => getCollection('categories');

export const createCategory = (categoryData) => {
  return addDocument('categories', categoryData);
};

export const updateCategory = (docId, updates) => {
  return updateDocument('categories', docId, updates);
};

export const deleteCategory = (docId) => {
  return softDeleteDocument('categories', docId);
};
