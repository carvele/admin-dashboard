import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

const db = admin.firestore();

export const cleanupOldMessages = functions.pubsub
  .schedule('0 2 * * *')  // Daily at 2 AM UTC
  .onRun(async (context) => {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const snap = await db
      .collectionGroup('messages')
      .where('createdAt', '<', ninetyDaysAgo.toISOString())
      .limit(500)
      .get();

    const batch = db.batch();
    let deleteCount = 0;

    snap.forEach((doc) => {
      batch.delete(doc.ref);
      deleteCount++;
    });

    if (deleteCount > 0) {
      await batch.commit();
      console.log(`Deleted ${deleteCount} old messages`);
    }

    return { deleted: deleteCount };
  });

export const cleanupOldFeedback = functions.pubsub
  .schedule('0 3 * * 0')  // Weekly, Sunday at 3 AM UTC
  .onRun(async (context) => {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const snap = await db
      .collection('feedback')
      .where('createdAt', '<', oneYearAgo.toISOString())
      .limit(500)
      .get();

    const batch = db.batch();
    let deleteCount = 0;

    snap.forEach((doc) => {
      batch.delete(doc.ref);
      deleteCount++;
    });

    if (deleteCount > 0) {
      await batch.commit();
      console.log(`Deleted ${deleteCount} old feedback`);
    }

    return { deleted: deleteCount };
  });

export const cleanupDeletedUserData = functions.auth.user().onDelete(
  async (user) => {
    const userId = user.uid;

    try {
      const wardrobeSnap = await db
        .collection('wardrobeItems')
        .where('userId', '==', userId)
        .get();

      const outfitsSnap = await db
        .collection('outfits')
        .where('userId', '==', userId)
        .get();

      const feedbackSnap = await db
        .collection('feedback')
        .where('userId', '==', userId)
        .get();

      const batch = db.batch();

      wardrobeSnap.forEach((doc) => batch.delete(doc.ref));
      outfitsSnap.forEach((doc) => batch.delete(doc.ref));
      feedbackSnap.forEach((doc) => batch.delete(doc.ref));

      await batch.commit();

      console.log(`Cleaned up data for deleted user ${userId}`);
    } catch (error) {
      console.error(`Error cleaning up user ${userId}:`, error);
    }
  }
);
