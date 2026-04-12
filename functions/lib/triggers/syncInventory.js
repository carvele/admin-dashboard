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
exports.syncInventoryToProduct = void 0;
const admin = __importStar(require("firebase-admin"));
const v2_1 = require("firebase-functions/v2");
const logger = __importStar(require("firebase-functions/logger"));
const db = admin.firestore();
/**
 * Automatically synchronizes product stock levels whenever an inventory item is written.
 * This ensures that the 'products' collection summary always matches the 'inventory' source of truth.
 * Implements the "Self-Healing" status logic based on Available and Reserved inventory.
 */
exports.syncInventoryToProduct = v2_1.firestore.onDocumentWritten("inventory/{invId}", async (event) => {
    const data = event.data;
    if (!data)
        return null;
    // Get the productId from the inventory document
    const inventoryData = data.after.exists ? data.after.data() : data.before.data();
    if (!inventoryData)
        return null;
    const productId = inventoryData.productDocId;
    if (!productId) {
        logger.warn(`Inventory document ${event.params.invId} missing productDocId. Skipping sync.`);
        return null;
    }
    try {
        // 1. Fetch all active inventory records for this product
        const inventorySnap = await db.collection("inventory")
            .where("productDocId", "==", productId)
            .where("deleted", "==", false)
            .get();
        let totalAvailable = 0;
        let totalReserved = 0;
        inventorySnap.forEach((doc) => {
            const inv = doc.data();
            totalAvailable += Number(inv.available || 0);
            totalReserved += Number(inv.reserved || 0);
        });
        // 2. Determine mathematical status based on aggregated stock
        let status = "In Boutique";
        if (totalAvailable <= 0) {
            status = totalReserved > 0 ? "Reserved" : "Out of Stock";
        }
        logger.info(`Recalculated for product ${productId}: Available=${totalAvailable}, Reserved=${totalReserved}, Status=${status}`);
        // 3. Update the parent product document
        await db.collection("products").doc(productId).update({
            stock: totalAvailable,
            stockQuantity: totalAvailable, // Backup field for legacy app compatibility
            status: status,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return null;
    }
    catch (error) {
        logger.error(`Error syncing inventory for product ${productId}:`, error);
        return null;
    }
});
//# sourceMappingURL=syncInventory.js.map