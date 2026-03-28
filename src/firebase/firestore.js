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
import { measureAsync, trackError } from '../utils/analytics';

// ── Resilience & Monitoring ─────────────────────────────────

/** Execute an asynchronous operation with retry logic and performance monitoring */
export const withRetry = async (operationName, asyncFn, maxRetries = 3) => {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await measureAsync(operationName, asyncFn);
    } catch (err) {
      attempt++;
      console.warn(`[Firestore] '${operationName}' failed (attempt ${attempt}/${maxRetries}):`, err.message);
      if (attempt >= maxRetries) {
        trackError(`firestore_${operationName}_failed`, { error: err.message, attempts: attempt });
        throw err;
      }
      // Wait before retrying (exponential backoff)
      await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt - 1)));
    }
  }
};

// ── Generic CRUD helpers ──────────────────────────────────

/** Get all documents from a collection */
export const getCollection = async (collectionName) => {
  return withRetry(`getCollection_${collectionName}`, async () => {
    const snap = await getDocs(collection(db, collectionName));
    return snap.docs.map(d => {
      const data = d.data();
      return { ...data, customId: data.id || null, id: d.id, docId: d.id };
    });
  });
};

/** Get a single document by ID */
export const getDocument = async (collectionName, docId) => {
  return withRetry(`getDocument_${collectionName}`, async () => {
    const snap = await getDoc(doc(db, collectionName, docId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  });
};

/** Add a new document (auto-ID) */
export const addDocument = async (collectionName, data) => {
  return withRetry(`addDocument_${collectionName}`, async () => {
    const ref = await addDoc(collection(db, collectionName), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return ref.id;
  });
};

/** Get Staff Profile by Email */
export const getStaffByEmail = async (email) => {
  return withRetry('getStaffByEmail', async () => {
    const q = query(collection(db, 'staff'), where('email', '==', email));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const doc = snap.docs[0];
      return { id: doc.id, ...doc.data() };
    }
    return null;
  });
};

/** Update an existing document */
export const updateDocument = async (collectionName, docId, data) => {
  return withRetry(`updateDocument_${collectionName}`, async () => {
    await updateDoc(doc(db, collectionName, docId), {
      ...data,
      updatedAt: serverTimestamp()
    });
  });
};

/** Set/Overwrite a document (creates if doesn't exist) */
export const setDocument = async (collectionName, docId, data) => {
  return withRetry(`setDocument_${collectionName}`, async () => {
    await setDoc(doc(db, collectionName, docId), {
      ...data,
      updatedAt: serverTimestamp()
    }, { merge: true });
  });
};

/** Delete a document */
export const deleteDocument = async (collectionName, docId) => {
  return withRetry(`deleteDocument_${collectionName}`, async () => {
    await deleteDoc(doc(db, collectionName, docId));
  });
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

/** Subscribe to a collection in real time. Returns an unsubscribe function.
 *  onError is called when the snapshot listener encounters an error (e.g. quota exhausted).
 */
export const subscribeToCollection = (collectionName, callback, queryConstraints = [], onError) => {
  const q = query(collection(db, collectionName), ...queryConstraints);
  return onSnapshot(q, (snap) => {
    const data = snap.docs.map(d => {
      const docData = d.data();
      return { ...docData, customId: docData.id || null, id: d.id, docId: d.id };
    });
    callback(data);
  }, (error) => {
    console.error(`[Firestore] Subscription error on "${collectionName}":`, error.message);
    // Call with empty data so loading states resolve instead of spinning forever
    callback([]);
    if (onError) onError(error);
  });
};

// ── Device Management helpers ─────────────────────────────

/** Register a device fingerprint as pending approval */
export const registerDevice = async (fingerprint, userAgent, staffEmail = '', staffName = '') => {
  const { arrayUnion } = await import('firebase/firestore');
  const docRef = doc(db, 'devices', fingerprint);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    await setDoc(docRef, {
      id: fingerprint,
      status: 'pending',
      userAgent,
      lastSeen: new Date().toISOString(),
      name: userAgent ? userAgent.substring(0, 50) : 'Unknown Device',
      staffEmail: staffEmail || '',
      staffName: staffName || '',
      failedAttempts: 0,
      lockoutUntil: null,
      loginHistory: [{ email: staffEmail, time: new Date().toISOString() }]
    });
  } else {
    const updates = { lastSeen: new Date().toISOString() };
    if (staffEmail) {
      updates.staffEmail = staffEmail;
      updates.staffName = staffName || '';
      updates.loginHistory = arrayUnion({ email: staffEmail, time: new Date().toISOString() });
    }
    await updateDoc(docRef, updates);
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
