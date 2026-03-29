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
  serverTimestamp,
  writeBatch,
  limit,
  startAfter,
} from 'firebase/firestore';
import { measureAsync, trackError } from '../utils/analytics';

/**
 * Syncs product changes (name, category) to all associated inventory records.
 */
export const syncProductUpdateToInventory = async (productDocId, newData) => {
  const { name, category } = newData;
  if (!name && !category) return; // Nothing to sync

  return withRetry(`syncProductUpdateToInventory`, async () => {
    const q = query(collection(db, 'inventory'), where('productDocId', '==', productDocId));
    const snap = await getDocs(q);

    if (snap.empty) return;

    const batch = writeBatch(db);
    snap.docs.forEach((d) => {
      const updates = {};
      if (name) updates.item = name;
      if (category) updates.category = category;
      batch.update(d.ref, { ...updates, updatedAt: serverTimestamp() });
    });

    await batch.commit();
  });
};

// ── Resilience & Monitoring ─────────────────────────────────

/** Execute an asynchronous operation with retry logic and performance monitoring */
export const withRetry = async (operationName, asyncFn, maxRetries = 3) => {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await measureAsync(operationName, asyncFn);
    } catch (err) {
      attempt++;
      console.warn(
        `[Firestore] '${operationName}' failed (attempt ${attempt}/${maxRetries}):`,
        err.message,
      );
      if (attempt >= maxRetries) {
        trackError(`firestore_${operationName}_failed`, { error: err.message, attempts: attempt });
        throw err;
      }
      // Wait before retrying (exponential backoff)
      await new Promise((res) => setTimeout(res, 1000 * Math.pow(2, attempt - 1)));
    }
  }
};

// ── Generic CRUD helpers ──────────────────────────────────

/** Get all documents from a collection (filters out soft-deleted by default) */
export const getCollection = async (collectionName, includeDeleted = false) => {
  return withRetry(`getCollection_${collectionName}`, async () => {
    let q = query(collection(db, collectionName));
    if (!includeDeleted) {
      q = query(q, where('deleted', '!=', true));
    }
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return { ...data, customId: data.id || null, id: d.id, docId: d.id };
    });
  });
};

/** Get a paginated list of documents from a collection (filters out soft-deleted by default) */
export const getPaginatedCollection = async (
  collectionName,
  pageSize,
  lastDoc = null,
  queryConstraints = [],
  includeDeleted = false,
) => {
  return withRetry(`getPaginatedCollection_${collectionName}`, async () => {
    let baseConstraints = [...queryConstraints];
    if (!includeDeleted) {
      baseConstraints.push(where('deleted', '!=', true));
    }

    let qArgs = [...baseConstraints, limit(pageSize)];
    if (lastDoc) {
      qArgs.push(startAfter(lastDoc));
    }
    const q = query(collection(db, collectionName), ...qArgs);
    const snap = await getDocs(q);
    const data = snap.docs.map((d) => {
      const docData = d.data();
      return { ...docData, customId: docData.id || null, id: d.id, docId: d.id };
    });
    const lastVisible = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    return { data, lastVisible, hasMore: snap.docs.length === pageSize };
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
      deleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
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
      updatedAt: serverTimestamp(),
    });
  });
};

/** Set/Overwrite a document (creates if doesn't exist) */
export const setDocument = async (collectionName, docId, data) => {
  return withRetry(`setDocument_${collectionName}`, async () => {
    await setDoc(
      doc(db, collectionName, docId),
      {
        ...data,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });
};

/** Delete a document (hard delete) */
export const deleteDocument = async (collectionName, docId) => {
  return withRetry(`deleteDocument_${collectionName}`, async () => {
    await deleteDoc(doc(db, collectionName, docId));
  });
};

/** Mark a document as deleted (soft delete) */
export const softDeleteDocument = async (collectionName, docId) => {
  return withRetry(`softDeleteDocument_${collectionName}`, async () => {
    await updateDoc(doc(db, collectionName, docId), {
      deleted: true,
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
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
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.error('Failed to log action:', err);
  }
};

// ── Real-time listeners ───────────────────────────────────

/** Subscribe to a collection in real time (filters out soft-deleted by default) */
export const subscribeToCollection = (
  collectionName,
  callback,
  queryConstraints = [],
  onError,
  includeDeleted = false,
) => {
  let finalConstraints = [...queryConstraints];
  if (!includeDeleted) {
    finalConstraints.push(where('deleted', '!=', true));
  }

  const q = query(collection(db, collectionName), ...finalConstraints);
  return onSnapshot(
    q,
    (snap) => {
      const data = snap.docs.map((d) => {
        const docData = d.data();
        return { ...docData, customId: docData.id || null, id: d.id, docId: d.id };
      });
      callback(data);
    },
    (error) => {
      console.error(`[Firestore] Subscription error on "${collectionName}":`, error.message);
      // Call with empty data so loading states resolve instead of spinning forever
      callback([]);
      if (onError) onError(error);
    },
  );
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
      loginHistory: [{ email: staffEmail, time: new Date().toISOString() }],
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
  return onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
        // Update lastAccess while we are here (fire and forget)
        updateDoc(docRef, { lastAccess: serverTimestamp() }).catch(() => {});
        callback(docSnap.data());
      } else {
        callback(null);
      }
    },
    (error) => {
      console.error('Error listening to device:', error);
      callback(null);
    },
  );
};

/** Update device security metrics (Lockout) */
export const updateDeviceSecurity = async (fingerprint, attempts, lockoutTime) => {
  const deviceRef = doc(db, 'devices', fingerprint);
  await updateDoc(deviceRef, {
    failedAttempts: attempts,
    lockoutUntil: lockoutTime,
  });
};

// Re-export useful Firestore utilities for use in pages
export { query, where, orderBy, serverTimestamp, collection, doc, onSnapshot };
