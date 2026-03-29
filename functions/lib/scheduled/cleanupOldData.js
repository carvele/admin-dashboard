"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupDeletedUserData = exports.cleanupOldFeedback = exports.cleanupOldMessages = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const db = admin.firestore();
exports.cleanupOldMessages = functions.pubsub
    .schedule('0 2 * * *') // Daily at 2 AM UTC
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
exports.cleanupOldFeedback = functions.pubsub
    .schedule('0 3 * * 0') // Weekly, Sunday at 3 AM UTC
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
exports.cleanupDeletedUserData = functions.auth.user().onDelete(async (user) => {
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
    }
    catch (error) {
        console.error(`Error cleaning up user ${userId}:`, error);
    }
});
//# sourceMappingURL=cleanupOldData.js.map