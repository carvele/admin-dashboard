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
exports.migrateReservationFields = exports.migrateUserFields = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
exports.migrateUserFields = functions.https.onRequest(async (req, res) => {
    const db = admin.firestore();
    const batch = db.batch();
    const users = await db.collection('users').get();
    let migratedCount = 0;
    users.forEach((doc) => {
        const data = doc.data();
        const updates = {};
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
        }
        else if (typeof data.createdAt === 'string') {
            // Already correct
        }
        else if (data.createdAt) {
            // Convert to ISO string
            try {
                updates.createdAt = new Date(data.createdAt).toISOString();
                hasChanges = true;
            }
            catch (e) { }
        }
        if (hasChanges) {
            batch.update(doc.ref, updates);
            migratedCount++;
        }
    });
    await batch.commit();
    res.json({ migratedCount, status: 'success' });
});
exports.migrateReservationFields = functions.https.onRequest(async (req, res) => {
    const db = admin.firestore();
    const batch = db.batch();
    const reservations = await db.collection('reservations').get();
    let migratedCount = 0;
    reservations.forEach((doc) => {
        const data = doc.data();
        const updates = {};
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
//# sourceMappingURL=migrateUserFields.js.map