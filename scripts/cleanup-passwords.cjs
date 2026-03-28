/**
 * One-time migration script: Remove plaintext password fields from Firestore user documents.
 * 
 * Usage:
 *   node scripts/cleanup-passwords.cjs
 * 
 * Prerequisites:
 *   - Firebase CLI must be logged in (`firebase login`)
 *   - Run from the admin-dashboard project root
 * 
 * This uses the Firebase client SDK (same as the app) to authenticate
 * with the currently logged-in Firebase CLI user.
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, updateDoc, doc, deleteField, serverTimestamp } = require('firebase/firestore');

// Same config as the web app
const firebaseConfig = {
  apiKey: "AIzaSyCnpJl0Gf-Hd61z2GhECBQJ2VcnZpY6qCY",
  authDomain: "jeszybotiquear.firebaseapp.com",
  projectId: "jeszybotiquear",
  storageBucket: "jeszybotiquear.firebasestorage.app",
  messagingSenderId: "703249122023",
  appId: "1:703249122023:web:5c50a53a8043a9b5d12b02"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function cleanupPasswords() {
  console.log('🔍 Scanning users collection for plaintext password fields...\n');

  const usersSnap = await getDocs(collection(db, 'users'));

  if (usersSnap.empty) {
    console.log('⚠️  No users found in collection.');
    process.exit(0);
  }

  console.log(`📋 Found ${usersSnap.size} user document(s).\n`);

  let cleaned = 0;
  let skipped = 0;
  let updated = 0;

  for (const docSnap of usersSnap.docs) {
    const data = docSnap.data();
    const updates = {};

    // Remove password field
    if (data.password !== undefined) {
      console.log(`  🔴 ${docSnap.id} (${data.email || 'no email'}) — HAS password field → REMOVING`);
      updates.password = deleteField();
      cleaned++;
    } else {
      console.log(`  ✅ ${docSnap.id} (${data.email || 'no email'}) — no password field`);
      skipped++;
    }

    // Backfill missing role
    if (!data.role) {
      updates.role = 'customer';
      console.log(`     ↳ Adding missing 'role: customer'`);
    }

    // Backfill missing createdAt
    if (!data.createdAt) {
      updates.createdAt = serverTimestamp();
      console.log(`     ↳ Adding missing 'createdAt'`);
    }

    if (Object.keys(updates).length > 0) {
      await updateDoc(doc(db, 'users', docSnap.id), updates);
      updated++;
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`✅ Migration complete!`);
  console.log(`   Passwords removed: ${cleaned}`);
  console.log(`   Already clean: ${skipped}`);
  console.log(`   Total docs updated: ${updated}`);
  console.log(`${'═'.repeat(50)}\n`);
}

cleanupPasswords()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  });
