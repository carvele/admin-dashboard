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
import { queryCache, CACHE_TTL } from '../utils/cache';

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

export const getProducts = async (maxResults = 0) => {
  const cacheKey = `products_${maxResults}`;
  if (queryCache.has(cacheKey)) return queryCache.get(cacheKey);
  const data = await getCollection('products', false, maxResults);
  queryCache.set(cacheKey, data, CACHE_TTL.SHORT);
  return data;
};

export const getProductById = (id) => getDocument('products', id);

export const createProduct = async (productData) => {
  queryCache.invalidateByPrefix('products');
  queryCache.invalidateByPrefix('inventory');
  return addDocument('products', productData);
};

export const updateProduct = async (docId, updates) => {
  await updateDocument('products', docId, updates);
  queryCache.invalidateByPrefix('products');
  queryCache.invalidateByPrefix('inventory');
  // Auto-propagate specific column updates to Inventory mapping
  if (updates.name || updates.category) {
    await syncProductUpdateToInventory(docId, updates);
  }
};

export const deleteProduct = async (docId) => {
  queryCache.invalidateByPrefix('products');
  queryCache.invalidateByPrefix('inventory');
  return deleteDocument('products', docId);
};

// --- Inventory Layer ---

export const subscribeToInventory = (callback) => {
  return subscribeToCollection('inventory', callback);
};

export const getInventory = async (maxResults = 0) => {
  const cacheKey = `inventory_${maxResults}`;
  if (queryCache.has(cacheKey)) return queryCache.get(cacheKey);
  const data = await getCollection('inventory', false, maxResults);
  queryCache.set(cacheKey, data, CACHE_TTL.SHORT);
  return data;
};

export const createInventoryItem = (data) => {
  queryCache.invalidateByPrefix('inventory');
  return addDocument('inventory', data);
};

export const updateInventoryItem = (docId, updates) => {
  queryCache.invalidateByPrefix('inventory');
  return updateDocument('inventory', docId, updates);
};

export const deleteInventoryItem = (docId) => {
  queryCache.invalidateByPrefix('inventory');
  return deleteDocument('inventory', docId);
};

// --- Category Layer ---

export const subscribeToCategories = (callback) => {
  return subscribeToCollection('categories', callback);
};

export const getCategories = async () => {
  const cacheKey = 'categories';
  if (queryCache.has(cacheKey)) return queryCache.get(cacheKey);
  const data = await getCollection('categories');
  queryCache.set(cacheKey, data, CACHE_TTL.LONG);
  return data;
};

export const createCategory = (categoryData) => {
  queryCache.invalidateByPrefix('categories');
  return addDocument('categories', categoryData);
};

export const updateCategory = (docId, updates) => {
  queryCache.invalidateByPrefix('categories');
  return updateDocument('categories', docId, updates);
};

export const deleteCategory = (docId) => {
  queryCache.invalidateByPrefix('categories');
  return softDeleteDocument('categories', docId);
};

/**
 * Force-recalculates all inventory reserved stock by scanning active reservations.
 * This is a "healing" function to fix data mismatches.
 */
export const recalculateAllInventoryStock = async () => {
  const { db } = await import('../firebase/config');
  const { collection, getDocs, query, where, writeBatch, serverTimestamp, doc } = await import('firebase/firestore');

  // 1. Get all active reservations (any status that still holds inventory)
  const resQuery = query(
    collection(db, 'reservations'),
    where('status', 'in', ['Pending', 'To Pay', 'To Pickup', 'Confirmed', 'Fitting'])
  );
  const resSnap = await getDocs(resQuery);
  const activeRes = resSnap.docs.map(d => d.data());

  // 2. Get all inventory items
  const invSnap = await getDocs(collection(db, 'inventory'));
  
  const batch = writeBatch(db);
  
  // 3. Process each inventory item
  invSnap.docs.forEach((invDoc) => {
    const invData = invDoc.data();
    const invDocId = invDoc.id;
    
    // Find matching reservations for this item+size
    const matchingReservations = activeRes.filter(r => {
      const productId = r.productId || '';
      const productName = r.productName || r.outfit || '';
      const resSize = r.size || '';
      
      return (
        resSize === invData.size &&
        (productId === invData.productDocId || 
         productId === invData.sku || 
         productName === invData.item)
      );
    });

    const newReserved = matchingReservations.length;
    const newAvailable = Math.max(0, (invData.total || 0) - newReserved);

    // Only update if changed
    if (invData.reserved !== newReserved || invData.available !== newAvailable) {
      batch.update(invDoc.ref, {
        reserved: newReserved,
        available: newAvailable,
        updatedAt: serverTimestamp()
      });
    }
  });

  await batch.commit();

  // 4. Aggregate by Product and sync status/stock
  const updatedInvSnap = await getDocs(collection(db, 'inventory'));
  const productMap = {}; // productDocId -> { available, reserved }

  updatedInvSnap.docs.forEach(doc => {
    const data = doc.data();
    const pId = data.productDocId;
    if (pId) {
      if (!productMap[pId]) productMap[pId] = { available: 0, reserved: 0 };
      productMap[pId].available += (data.available || 0);
      productMap[pId].reserved += (data.reserved || 0);
    }
  });

  const productEntries = Object.entries(productMap);
  for (let i = 0; i < productEntries.length; i += 450) {
    const chunk = productEntries.slice(i, i + 450);
    const finalBatch = writeBatch(db);
    
    for (const [pId, stats] of chunk) {
      let status = 'In Boutique';
      if (stats.available <= 0) {
        status = stats.reserved > 0 ? 'Reserved' : 'Out of Stock';
      }

      finalBatch.update(doc(db, 'products', pId), {
        stock: stats.available,
        status: status
      });
    }
    await finalBatch.commit();
  }

  queryCache.invalidateByPrefix('inventory');
  queryCache.invalidateByPrefix('products');
};
