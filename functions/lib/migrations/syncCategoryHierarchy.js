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
exports.syncCategoryHierarchy = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
/**
 * Migration script to synchronize the category hierarchy:
 * 1. Renames 'Dresses' to 'Dress' in the products collection.
 * 2. Renames 'Dresses' to 'Dress' in the inventory collection.
 * 3. Populates the 'categories' collection with the unified hierarchy.
 *
 * Quota Safety: Uses batch writes and limit/offset approach if needed.
 */
exports.syncCategoryHierarchy = functions.https.onRequest(async (req, res) => {
    const db = admin.firestore();
    const batch = db.batch();
    let productsMigrated = 0;
    let inventoryMigrated = 0;
    try {
        // 1. Migrate Products (Dresses -> Dress)
        const productsSnap = await db.collection('products')
            .where('category', '==', 'Dresses')
            .limit(500) // Safety limit for single batch
            .get();
        productsSnap.forEach((doc) => {
            batch.update(doc.ref, {
                category: 'Dress',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            productsMigrated++;
        });
        // 2. Migrate Inventory (Dresses -> Dress)
        const inventorySnap = await db.collection('inventory')
            .where('category', '==', 'Dresses')
            .limit(500)
            .get();
        inventorySnap.forEach((doc) => {
            batch.update(doc.ref, {
                category: 'Dress',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            inventoryMigrated++;
        });
        // 3. Populate Categories Collection
        const categories = [
            {
                name: 'Tops',
                subcategories: [
                    { name: 'Innerwear', subSubcategories: ['Sports Bra', 'Bra'] },
                    { name: 'Outerwear', subSubcategories: ['Sporty Top', 'Knitted Tops', 'Blazers', 'T-Shirt'] },
                ],
                order: 1
            },
            { name: 'Dress', subcategories: [], order: 2 },
            { name: 'Bags', subcategories: [], order: 3 },
            {
                name: 'Bottoms',
                subcategories: [
                    { name: 'Skirts', subSubcategories: [] },
                    { name: 'Jeans', subSubcategories: [] },
                    { name: 'Pants', subSubcategories: [] },
                    { name: 'Shorts', subSubcategories: [] },
                ],
                order: 4
            },
            {
                name: 'Footwear',
                subcategories: [
                    { name: 'Shoes', subSubcategories: [] },
                    { name: 'Heels', subSubcategories: [] },
                    { name: 'Sandals', subSubcategories: [] },
                ],
                order: 5
            },
        ];
        for (const cat of categories) {
            const catRef = db.collection('categories').doc(cat.name);
            batch.set(catRef, {
                ...cat,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                deleted: false
            }, { merge: true });
        }
        await batch.commit();
        res.json({
            status: 'success',
            message: 'Category hierarchy synchronized successfully.',
            migrated: {
                products: productsMigrated,
                inventory: inventoryMigrated,
                categoriesCount: categories.length
            }
        });
    }
    catch (error) {
        console.error('Migration failed:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});
//# sourceMappingURL=syncCategoryHierarchy.js.map