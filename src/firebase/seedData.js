import { addDocument, setDocument } from './firestore';
import {
  mockReservations,
  mockCustomers,
  mockConversations,
  mockMessages,
  mockCatalog,
  mockWardrobeItems,
  mockOutfits,
  mockInventory,
  analyticsConvRate
} from '../data/mockData';

export const seedDatabase = async () => {
  try {
    console.log("Starting data seed...");
    
    // Reservations
    for (const res of mockReservations) {
      const matchedProduct = mockCatalog.find(p => p.name === res.productName);
      const resDocId = await addDocument('reservations', {
        ...res,
        countdown: undefined,
        customerName: res.customerName,
        productName: res.productName,
        reservationDate: new Date(res.reservationDate),
        rentalPrice: matchedProduct?.price || 0,
        imageUrl: matchedProduct?.image || '',
        customerId: '',       // Will be linked when a real user signs up
        productId: matchedProduct?.id || '',
        timestamp: Date.now()
      });
      await addDocument(`reservations/${resDocId}/items`, {
        item_id: `res_it_${Date.now()}_${res.id}`,
        variant_id: res.productName,
        size: res.size || 'M',
        quantity: 1
      });
    }
    console.log("Seeded reservations");

    // App Users (Customers from the Android app)
    for (const cust of mockCustomers) {
      await addDocument('users', { ...cust, role: 'customer' });
    }
    console.log("Seeded app users");

    // Staff (Dashboard team members)
    const staffMembers = [
      { name: 'Maria Santos', email: 'maria@jezsycollection.com', role: 'Sales Staff', status: 'active' },
      { name: 'Carlos Reyes', email: 'carlos@jezsycollection.com', role: 'Sales Staff', status: 'active' },
      { name: 'Admin User', email: 'admin@jezsycollection.com', role: 'Admin', status: 'active' },
    ];
    for (const s of staffMembers) {
      await addDocument('staff', s);
    }
    console.log("Seeded staff");

    // Settings
    await setDocument('settings', 'storeInfo', {
      storeName: 'JezSy Collection',
      email: 'admin@jezsycollection.com',
      phone: '+63 912 345 6789',
      address: '123 Fashion Street, Makati City, Philippines'
    });
    
    await setDocument('settings', 'security', {
      adminPin: 'superadmin'
    });
    console.log("Seeded basic settings");

    // Conversations
    for (const conv of mockConversations) {
      await addDocument('conversations', conv);
    }
    console.log("Seeded conversations");

    // Messages
    for (const msg of mockMessages) {
      await addDocument('messages', msg);
    }
    console.log("Seeded messages");

    // Products (Catalog)
    for (const item of mockCatalog) {
      const { image, ...rest } = item;
      await addDocument('products', { 
        ...rest, 
        imageUrl: image, // Legacy fallback
        image: { secure_url: image, public_id: `seed_mock_${item.id}` }, // ERD Schema
        timestamp: Date.now()
      });
    }
    console.log("Seeded products");

    // Wardrobe Items (Normalized: each item is its own document with userId)
    for (const wi of mockWardrobeItems) {
      await addDocument('wardrobeItems', wi);
    }
    console.log("Seeded wardrobeItems (normalized)");

    // Outfits (Normalized: top-level collection with userId)
    for (const outfit of mockOutfits) {
      await addDocument('outfits', outfit);
    }
    console.log("Seeded outfits (normalized)");

    // Inventory
    for (const inv of mockInventory) {
      await addDocument('inventory', inv);
    }
    console.log("Seeded inventory");

    // Analytics
    for (const a of analyticsConvRate) {
      await addDocument('analyticsConvRate', a);
    }
    console.log("Seeded analytics");

    return { success: true, message: "All mock data has been seeded to Firestore!" };
  } catch (error) {
    console.error("Error seeding data:", error);
    return { success: false, message: error.message };
  }
};
