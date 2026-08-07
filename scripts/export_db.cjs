const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Ensure service account key exists
const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error("Error: serviceAccountKey.json not found in the root directory.");
    console.error("Please download it from Firebase Console -> Project Settings -> Service Accounts.");
    process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// List of all known collections in your project
const collections = [
    "ar_assets",
    "categories",
    "conversations",
    "devices",
    "favorites",
    "feedback",
    "inventory",
    "logs",
    "messages",
    "notifications",
    "outfits",
    "product_reviews",
    "products",
    "reservations",
    "settings",
    "staff",
    "users",
    "wardrobeItems"
];

async function exportDatabase() {
    console.log("Starting database export...");
    const dump = {};

    for (const colName of collections) {
        console.log(`Exporting collection: ${colName}...`);
        const snapshot = await db.collection(colName).get();
        dump[colName] = {};
        
        snapshot.forEach(doc => {
            dump[colName][doc.id] = doc.data();
        });
    }

    const outputPath = path.join(__dirname, '../database_dump.json');
    fs.writeFileSync(outputPath, JSON.stringify(dump, null, 2));
    console.log(`\nExport complete! Data saved to ${outputPath}`);
}

exportDatabase().catch(console.error);
