import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '../perched-service-account.json'), 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
});

const db = admin.firestore();

async function checkSpots() {
  console.log('\n🔍 Checking Firestore spots collection...\n');

  const spotsSnapshot = await db.collection('spots').limit(10).get();

  console.log(`Total spots found: ${spotsSnapshot.size}`);

  if (spotsSnapshot.empty) {
    console.log('\n⚠️  No spots found in database.');
    console.log('You may need to:');
    console.log('  1. Seed demo data with scripts/seedDemoAccount.ts');
    console.log('  2. Or create spots manually in the app');
    return;
  }

  console.log('\nFirst 10 spots:');
  spotsSnapshot.docs.forEach((doc, i) => {
    const data = doc.data();
    console.log(`\n${i + 1}. ${doc.id}`);
    console.log(`   Name: ${data.name || 'MISSING'}`);
    console.log(`   PlaceId: ${data.placeId || data.googlePlaceId || 'MISSING'}`);
    console.log(`   Coords: lat=${data.lat}, lng=${data.lng}`);
    console.log(`   Has intel: ${!!data.intel}`);
  });
}

checkSpots()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
