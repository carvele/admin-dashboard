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
exports.removeRedundantIds = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const COLLECTIONS_WITH_REDUNDANT_IDS = [
    { name: 'users', hasIdField: false },
    { name: 'products', hasIdField: true },
    { name: 'reservations', hasIdField: true },
    { name: 'messages', hasIdField: true },
    { name: 'conversations', hasIdField: true },
    { name: 'wardrobeItems', hasIdField: true },
    { name: 'outfits', hasIdField: true },
];
exports.removeRedundantIds = functions.https.onRequest(async (req, res) => {
    const db = admin.firestore();
    const results = {};
    for (const collection of COLLECTIONS_WITH_REDUNDANT_IDS) {
        if (!collection.hasIdField)
            continue;
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
//# sourceMappingURL=removeRedundantIds.js.map