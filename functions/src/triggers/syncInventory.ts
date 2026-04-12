import * as admin from "firebase-admin";
import {firestore} from "firebase-functions/v2";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

/**
 * Automatically synchronizes product stock levels whenever an inventory item is written.
 * This ensures that the 'products' collection summary always matches the 'inventory' source of truth.
 * Implements the "Self-Healing" status logic based on Available and Reserved inventory.
 */
export const syncInventoryToProduct = firestore.onDocumentWritten("inventory/{invId}", async (event) => {
  const data = event.data;
  if (!data) return null;

  // Get the productId from the inventory document
  const inventoryData = data.after.exists ? data.after.data() : data.before.data();
  if (!inventoryData) return null;

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
  } catch (error) {
    logger.error(`Error syncing inventory for product ${productId}:`, error);
    return null;
  }
});
