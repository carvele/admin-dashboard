import {
  getCollection,
  subscribeToCollection,
  addDocument,
  updateDocument,
  deleteDocument,
  query,
  where,
  collection,
} from '../firebase/firestore';
import { getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';

export const subscribeToReservations = (callback) => {
  return subscribeToCollection('reservations', callback);
};

export const getPaginatedReservations = (pageSize, lastDoc = null, constraints = []) => {
  const { getPaginatedCollection } = require('../firebase/firestore');
  return getPaginatedCollection('reservations', pageSize, lastDoc, constraints);
};

export const getReservations = () => {
  return getCollection('reservations');
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

export const adjustInventoryForReservation = async (outfit, size, delta) => {
  try {
    const q2 = query(
      collection(db, 'inventory'),
      where('item', '==', outfit),
      where('size', '==', size),
    );
    const snap = await getDocs(q2);
    if (!snap.empty) {
      const invDoc = snap.docs[0];
      const data = invDoc.data();
      await updateDocument('inventory', invDoc.id, {
        available: Math.max(0, (data.available || 0) + delta),
        reserved: Math.max(0, (data.reserved || 0) - delta),
      });
    }
  } catch (err) {
    console.warn('Stock adjustment failed:', err);
  }
};
