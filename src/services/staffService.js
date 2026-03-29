import { db } from '../firebase/config';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  serverTimestamp,
  onSnapshot,
  arrayUnion,
} from 'firebase/firestore';
import { withRetry, getCollection, getDocument } from '../firebase/firestore'; // Keep using inner generic wrappers

/**
 * @typedef {Object} Staff
 * @property {string} docId
 * @property {string} name
 * @property {string} email
 * @property {string} role - Enum string role ('Admin', 'Manager', 'Staff')
 * @property {string} id - Generic profile UID
 */

/**
 * @typedef {Object} Device
 * @property {string} docId - MD5 fingerprint UID
 * @property {string} status - 'pending', 'approved', 'rejected'
 * @property {string} userAgent
 * @property {string} lastSeen
 * @property {string} name
 * @property {string} staffEmail
 * @property {string} staffName
 * @property {number} failedAttempts
 * @property {string | null} lockoutUntil
 * @property {Object[]} loginHistory
 */

/**
 * @typedef {Object} AuditLog
 * @property {string} docId
 * @property {string} userId
 * @property {string} userName
 * @property {string} action
 * @property {Date} timestamp
 */

export const getStaffMembers = () => getCollection('staff');

/** Get Staff Profile by Email */
export const getStaffByEmail = async (email) => {
  return withRetry('getStaffByEmail', async () => {
    const q = query(collection(db, 'staff'), where('email', '==', email));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const staffDoc = snap.docs[0];
      return { id: staffDoc.id, ...staffDoc.data() };
    }
    return null;
  });
};

/** Register a device fingerprint as pending approval */
export const registerDevice = async (fingerprint, userAgent, staffEmail = '', staffName = '') => {
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
export const subscribeToDeviceStatus = (fingerprint, callback) => {
  const docRef = doc(db, 'devices', fingerprint);
  return onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
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

export const updateDeviceSecurity = async (fingerprint, attempts, lockoutTime) => {
  const deviceRef = doc(db, 'devices', fingerprint);
  await updateDoc(deviceRef, {
    failedAttempts: attempts,
    lockoutUntil: lockoutTime,
  });
};

export const subscribeToDevices = (callback) => {
  const q = query(collection(db, 'devices'));
  return onSnapshot(q, (snap) => {
    const data = snap.docs.map((d) => ({ ...d.data(), id: d.id, customId: d.data().id }));
    callback(data);
  });
};

export const updateDeviceStatus = async (fingerprint, status) => {
  const deviceRef = doc(db, 'devices', fingerprint);
  await updateDoc(deviceRef, { status, updatedAt: serverTimestamp() });
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
