import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

interface CollectionPath {
  name: string;
  hasIdField: boolean;
}

const COLLECTIONS_WITH_REDUNDANT_IDS: CollectionPath[] = [
  { name: 'users', hasIdField: false },
  { name: 'products', hasIdField: true },
  { name: 'reservations', hasIdField: true },
  { name: 'messages', hasIdField: true },
  { name: 'conversations', hasIdField: true },
  { name: 'wardrobeItems', hasIdField: true },
  { name: 'outfits', hasIdField: true },
];

export const removeRedundantIds = functions.https.onRequest(async (req, res) => {
  const db = admin.firestore();
  const results: Record<string, number> = {};

  for (const collection of COLLECTIONS_WITH_REDUNDANT_IDS) {
    if (!collection.hasIdField) continue;

    const docs = await db.collection(collection.name).get();
    const batch = db.batch();
    let count = 0;

    docs.forEach((doc) => {
      const data = doc.data();
      if (data.id !== undefined || data.customId !== undefined) {
        batch.update(doc.ref, {
          id: admin.firestore.FieldValue.delete(),
          customId: admin.firestore.FieldValue.delete()
        });
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
    }
    results[collection.name] = count;
  }

  res.json({ results, status: 'success' });
});
