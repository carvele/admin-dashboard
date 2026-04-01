import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

/**
 * Migration script to synchronize the category hierarchy:
 * 1. Renames 'Dresses' to 'Dress' in the products collection.
 * 2. Renames 'Dresses' to 'Dress' in the inventory collection.
 * 3. Populates the 'categories' collection with the unified hierarchy.
 *
 * Quota Safety: Uses batch writes and limit/offset approach if needed.
 */
export const syncCategoryHierarchy = functions.https.onRequest(async (req: functions.https.Request, res: functions.Response) => {
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

  } catch (error: any) {
    console.error('Migration failed:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});
