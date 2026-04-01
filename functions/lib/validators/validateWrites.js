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
exports.validateReservationWrite = exports.validateProductWrite = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const db = admin.firestore();
exports.validateProductWrite = functions.firestore
    .document('products/{productId}')
    .onWrite(async (change, context) => {
    const productId = context.params.productId;
    const newData = change.after.data();
    // Deleted
    if (!newData)
        return null;
    const errors = [];
    // Validate name
    if (typeof newData.name !== 'string' || newData.name.length < 3) {
        errors.push('Product name must be a string with at least 3 characters');
    }
    // Validate price
    if (typeof newData.price !== 'number' || newData.price < 0) {
        errors.push('Product price must be a non-negative number');
    }
    // Validate stock
    if (typeof newData.stockQuantity !== 'number' || newData.stockQuantity < 0) {
        errors.push('Stock quantity must be a non-negative number');
    }
    // Validate arrays
    if (!Array.isArray(newData.sizes) || newData.sizes.length === 0) {
        errors.push('Product must have at least one size');
    }
    if (!Array.isArray(newData.colors) || newData.colors.length === 0) {
        errors.push('Product must have at least one color');
    }
    // If errors, rollback (we cannot reject onWrite natively without rules, but we can throw)
    if (errors.length > 0) {
        console.error(`Invalid product ${productId}:`, errors);
        throw new functions.https.HttpsError('invalid-argument', errors.join(', '));
    }
    // Timestamps
    if (!change.before.exists) {
        await db.collection('products').doc(productId).update({
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // Prevent infinite loops on update by checking if any relevant data changed
        const beforeData = change.before.data();
        const relevantFields = ['name', 'price', 'stockQuantity', 'sizes', 'colors', 'category', 'subCategory', 'images', 'isFeatured', 'model3DURL', 'maskURL'];
        const hasChanged = relevantFields.some(field => {
            const before = beforeData?.[field];
            const after = newData?.[field];
            return JSON.stringify(before) !== JSON.stringify(after);
        });
        if (!hasChanged) {
            return null;
        }
        await db.collection('products').doc(productId).update({
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    return null;
});
exports.validateReservationWrite = functions.firestore
    .document('reservations/{reservationId}')
    .onWrite(async (change, context) => {
    const reservationId = context.params.reservationId;
    const newData = change.after.data();
    if (!newData)
        return null;
    const errors = [];
    const validStatuses = ['pending', 'approved', 'completed', 'cancelled'];
    if (!validStatuses.includes(newData.status)) {
        errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
    }
    if (!(newData.date instanceof admin.firestore.Timestamp) &&
        typeof newData.date !== 'string') {
        errors.push('Date must be a valid timestamp or ISO string');
    }
    if (!newData.customerId) {
        errors.push('customerId is required');
    }
    else {
        const customer = await db.collection('users').doc(newData.customerId).get();
        if (!customer.exists) {
            errors.push('Referenced customer does not exist');
        }
    }
    if (!newData.productId) {
        errors.push('productId is required');
    }
    else {
        const product = await db.collection('products').doc(newData.productId).get();
        if (!product.exists) {
            errors.push('Referenced product does not exist');
        }
    }
    if (errors.length > 0) {
        console.error(`Invalid reservation ${reservationId}:`, errors);
        throw new functions.https.HttpsError('invalid-argument', errors.join(', '));
    }
    return null;
});
//# sourceMappingURL=validateWrites.js.map