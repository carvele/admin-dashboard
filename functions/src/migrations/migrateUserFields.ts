import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export const migrateUserFields = functions.https.onRequest(async (req, res) => {
  const db = admin.firestore();
  const batch = db.batch();
  const users = await db.collection('users').get();
  let migratedCount = 0;

  users.forEach((doc) => {
    const data = doc.data();
    const updates: any = {};
    let hasChanges = false;

    // Normalize field names
    if (data.first_name && !data.firstName) {
      updates.firstName = data.first_name;
      updates.first_name = admin.firestore.FieldValue.delete();
      hasChanges = true;
    }

    if (data.last_name && !data.lastName) {
      updates.lastName = data.last_name;
      updates.last_name = admin.firestore.FieldValue.delete();
      hasChanges = true;
    }

    // Remove redundant userId field
    if (data.userId) {
      updates.userId = admin.firestore.FieldValue.delete();
      hasChanges = true;
    }

    // Normalize timestamps to ISO strings
    if (data.createdAt instanceof admin.firestore.Timestamp) {
      // Already correct
    } else if (typeof data.createdAt === 'string') {
      // Already correct
    } else if (data.createdAt) {
      // Convert to ISO string
      try {
        updates.createdAt = new Date(data.createdAt).toISOString();
        hasChanges = true;
      } catch (e) { }
    }

    if (hasChanges) {
      batch.update(doc.ref, updates);
      migratedCount++;
    }
  });

  await batch.commit();
  res.json({ migratedCount, status: 'success' });
});

export const migrateReservationFields = functions.https.onRequest(async (req, res) => {
  const db = admin.firestore();
  const batch = db.batch();
  const reservations = await db.collection('reservations').get();
  let migratedCount = 0;

  reservations.forEach((doc) => {
    const data = doc.data();
    const updates: any = {};
    let hasChanges = false;

    // Rename productName → productId
    if (data.productName && !data.productId) {
      updates.productId = data.productName;
      updates.productName = admin.firestore.FieldValue.delete();
      hasChanges = true;
    }

    // Rename reservationDate → date
    if (data.reservationDate && !data.date) {
      updates.date = data.reservationDate;
      updates.reservationDate = admin.firestore.FieldValue.delete();
      hasChanges = true;
    }

    // Remove redundant id field
    if (data.id === doc.id || data.id) {
      updates.id = admin.firestore.FieldValue.delete();
      hasChanges = true;
    }

    // Normalize status enum
    if (data.status && typeof data.status === 'string') {
      const normalizedStatus = data.status.toLowerCase();
      if (!['pending', 'approved', 'completed', 'cancelled'].includes(normalizedStatus)) {
        updates.status = 'pending'; // Default fallback
        hasChanges = true;
      }
    }

    if (hasChanges) {
      batch.update(doc.ref, updates);
      migratedCount++;
    }
  });

  await batch.commit();
  res.json({ migratedCount, status: 'success' });
});
