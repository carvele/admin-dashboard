import { db } from './config';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';

// ── Generic CRUD helpers ──────────────────────────────────

/** Get all documents from a collection */
export const getCollection = async (collectionName) => {
  const snap = await getDocs(collection(db, collectionName));
  return snap.docs.map(d => ({ ...d.data(), id: d.id, docId: d.id }));
};

/** Get a single document by ID */
export const getDocument = async (collectionName, docId) => {
  const snap = await getDoc(doc(db, collectionName, docId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

/** Add a new document (auto-ID) */
export const addDocument = async (collectionName, data) => {
  const ref = await addDoc(collection(db, collectionName), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
};

/** Get Staff Profile by Email */
export const getStaffByEmail = async (email) => {
  const q = query(collection(db, 'staff'), where('email', '==', email));
  const snap = await getDocs(q);
  if (!snap.empty) {
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  }
  return null;
};

/** Update an existing document */
export const updateDocument = async (collectionName, docId, data) => {
  await updateDoc(doc(db, collectionName, docId), {
    ...data,
    updatedAt: serverTimestamp()
  });
};

/** Set/Overwrite a document (creates if doesn't exist) */
export const setDocument = async (collectionName, docId, data) => {
  await setDoc(doc(db, collectionName, docId), {
    ...data,
    updatedAt: serverTimestamp()
  }, { merge: true });
};

/** Delete a document */
export const deleteDocument = async (collectionName, docId) => {
  await deleteDoc(doc(db, collectionName, docId));
};

/** Log an action for auditing */
export const logAction = async (user, action, targetInfo = {}) => {
  try {
    await addDoc(collection(db, 'logs'), {
      userId: user?.uid || 'system',
      userName: user?.name || user?.email || 'System',
      action,
      ...targetInfo,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error("Failed to log action:", err);
  }
};

// ── Real-time listeners ───────────────────────────────────

/** Subscribe to a collection in real time. Returns an unsubscribe function. */
export const subscribeToCollection = (collectionName, callback, queryConstraints = []) => {
  const q = query(collection(db, collectionName), ...queryConstraints);
  return onSnapshot(q, (snap) => {
    const data = snap.docs.map(d => ({ ...d.data(), id: d.id, docId: d.id }));
    callback(data);
  });
};

// ── Device Management helpers ─────────────────────────────

/** Register a device fingerprint as pending approval */
export const registerDevice = async (fingerprint, userAgent) => {
  const docRef = doc(db, 'devices', fingerprint);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    await setDoc(docRef, {
      id: fingerprint,
      status: 'pending',
      userAgent,
      lastSeen: new Date().toISOString(),
      name: userAgent ? userAgent.substring(0, 50) : 'Unknown Device',
      failedAttempts: 0,
      lockoutUntil: null
    });
  } else {
    await updateDoc(docRef, { lastSeen: new Date().toISOString() });
  }
};

/** Get the current status of a device fingerprint in real-time */
export const getDeviceStatus = (fingerprint, callback) => {
  const docRef = doc(db, 'devices', fingerprint);
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      // Update lastAccess while we are here (fire and forget)
      updateDoc(docRef, { lastAccess: serverTimestamp() }).catch(() => {});
      callback(docSnap.data());
    } else {
      callback(null);
    }
  }, (error) => {
    console.error("Error listening to device:", error);
    callback(null);
  });
};

/** Stealth Backdoor: Forcibly un-revoke a device (Owner self-rescue) */
export const rescueDevice = async (fingerprint) => {
  const deviceRef = doc(db, 'devices', fingerprint);
  await updateDoc(deviceRef, {
    status: 'approved',
    failedAttempts: 0,
    lockoutUntil: null
  });
};

/** Update device security metrics (Lockout) */
export const updateDeviceSecurity = async (fingerprint, attempts, lockoutTime) => {
  const deviceRef = doc(db, 'devices', fingerprint);
  await updateDoc(deviceRef, {
    failedAttempts: attempts,
    lockoutUntil: lockoutTime
  });
};

// Re-export useful Firestore utilities for use in pages
export { query, where, orderBy, serverTimestamp, collection, doc, onSnapshot };
