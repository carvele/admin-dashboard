import {
  getCollection,
  subscribeToCollection,
  addDocument,
  updateDocument,
  deleteDocument,
  query,
  where,
  collection,
  getPaginatedCollection,
} from '../firebase/firestore';
import { getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';

export const subscribeToReservations = (callback) => {
  return subscribeToCollection('reservations', callback);
};

export const getPaginatedReservations = (pageSize, lastDoc = null, constraints = []) => {
  return getPaginatedCollection('reservations', pageSize, lastDoc, constraints);
};

export const getReservations = (maxResults = 0) => {
  return getCollection('reservations', false, maxResults);
};

export const getReservationsByProduct = async (productId, productName) => {
  const { getDocs } = await import('firebase/firestore');
  const snap1 = await getDocs(query(collection(db, 'reservations'), where('productId', '==', productId)));
  // Legacy support for when only name was stored
  let snap2 = { docs: [] };
  if (productName) {
    snap2 = await getDocs(query(collection(db, 'reservations'), where('productName', '==', productName)));
    if (snap2.empty) {
      snap2 = await getDocs(query(collection(db, 'reservations'), where('outfit', '==', productName)));
    }
  }
  
  const allDocs = [...snap1.docs, ...snap2.docs];
  // Deduplicate
  const uniqueMap = new Map();
  allDocs.forEach(doc => {
    uniqueMap.set(doc.id, { docId: doc.id, id: doc.data().id, ...doc.data() });
  });
  
  return Array.from(uniqueMap.values()).sort((a, b) => b.timestamp - a.timestamp);
};

export const createReservation = (data) => {
  return addDocument('reservations', data);
};

export const updateReservation = (docId, updates) => {
  return updateDocument('reservations', docId, updates);
};

export const deleteReservation = (docId) => {
  return deleteDocument('reservations', docId);
};

export const adjustInventoryForReservation = async (productIdOrName, size, delta, isConsume = false) => {
  try {
    // 1. Try to find by productId (Doc ID or SKU)
    let q = query(
      collection(db, 'inventory'),
      where('productDocId', '==', productIdOrName),
      where('size', '==', size)
    );
    let snap = await getDocs(q);

    // 2. If not found, try by SKU
    if (snap.empty) {
      q = query(
        collection(db, 'inventory'),
        where('sku', '==', productIdOrName),
        where('size', '==', size)
      );
      snap = await getDocs(q);
    }

    // 3. Final fallback: try by Name (item field)
    if (snap.empty) {
      q = query(
        collection(db, 'inventory'),
        where('item', '==', productIdOrName),
        where('size', '==', size)
      );
      snap = await getDocs(q);
    }

    if (!snap.empty) {
      const invDoc = snap.docs[0];
      const data = invDoc.data();
      
      if (isConsume) {
        const amount = Math.abs(delta);
        await updateDocument('inventory', invDoc.id, {
          total: Math.max(0, (data.total || 0) - amount),
          reserved: Math.max(0, (data.reserved || 0) - amount),
        });
        console.log(`[Inventory] Consumed stock for ${productIdOrName} (${size}): ${amount}`);
      } else {
        await updateDocument('inventory', invDoc.id, {
          available: Math.max(0, (data.available || 0) + delta),
          reserved: Math.max(0, (data.reserved || 0) - delta),
        });
        console.log(`[Inventory] Adjusted stock for ${productIdOrName} (${size}): ${delta}`);
      }
    } else {
      console.warn(`[Inventory] No matching item found for ${productIdOrName} (${size})`);
    }
  } catch (err) {
    console.warn('Stock adjustment failed:', err);
  }
};

/**
 * Repairs reservation data by looking up the actual customer name and product name.
 * This is a powerful healing tool for when the End-User app sends IDs instead of Names.
 */
export const repairReservationData = async (reservation, signal = null) => {
  const currentCustomerName = reservation.customerName || reservation.customer || '';
  const customerId = reservation.customerId || '';
  
  const currentProductName = reservation.productName || reservation.outfit || '';
  const productId = reservation.productId || '';

  const isId = (str) => /^[a-zA-Z0-9]{15,30}$/.test(str);
  
  let updates = {};

  try {
    const { getDocument } = await import('../firebase/firestore');

    // 1. Repair Customer Name
    if (customerId && (!currentCustomerName || isId(currentCustomerName))) {
      const userDoc = await getDocument('users', customerId);
      if (userDoc) {
        const realName = userDoc.name || 
                          (userDoc.firstName ? `${userDoc.firstName} ${userDoc.lastName || ''}`.trim() : null) ||
                          (userDoc.first_name ? `${userDoc.first_name} ${userDoc.last_name || ''}`.trim() : null) ||
                          userDoc.email || 
                          'User';
        if (realName && realName !== currentCustomerName) {
          updates.customerName = realName;
          // Note: do NOT write legacy `customer` alias — standardised on `customerName`
        }
      }
    }

    // 2. Repair Product Name
    if (productId && (!currentProductName || isId(currentProductName))) {
      const prodDoc = await getDocument('products', productId);
      if (prodDoc) {
        if (prodDoc.name && prodDoc.name !== currentProductName) {
          updates.productName = prodDoc.name;
          // Note: do NOT write legacy `outfit` alias — standardised on `productName`
          // Also repair image if missing
          if (!reservation.imageUrl && prodDoc.images?.[0]) {
            updates.imageUrl = prodDoc.images[0];
          }
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      const { updateDocument } = await import('../firebase/firestore');
      await updateDocument('reservations', reservation.docId, updates);
      console.log(`[Healer] Repaired data for reservation ${reservation.id}`);
      return true;
    }
  } catch (err) {
    console.warn(`[Healer] Failed to repair data for reservation ${reservation.id}:`, err);
  }
  return false;
};
