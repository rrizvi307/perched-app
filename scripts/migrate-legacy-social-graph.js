#!/usr/bin/env node

/**
 * Migrate legacy social-graph documents to the canonical users/{userId} model.
 *
 * Dry run by default.
 *
 * Usage:
 *   node scripts/migrate-legacy-social-graph.js [--service-account ./service-account.json] [--project my-project] [--apply]
 */

const fs = require('node:fs');
const path = require('node:path');
const admin = require('firebase-admin');

function parseArgs(argv) {
  const args = {
    serviceAccount: null,
    projectId: '',
    apply: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--service-account' && value) {
      args.serviceAccount = value;
      i += 1;
    } else if (key === '--project' && value) {
      args.projectId = value;
      i += 1;
    } else if (key === '--apply') {
      args.apply = true;
    }
  }

  return args;
}

function initAdmin(args) {
  let credential;
  let serviceJson = null;

  if (args.serviceAccount) {
    const fullPath = path.resolve(process.cwd(), args.serviceAccount);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Service account file not found: ${fullPath}`);
    }
    serviceJson = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    credential = admin.credential.cert(serviceJson);
  }

  const projectId =
    args.projectId ||
    process.env.FIREBASE_PROJECT_ID ||
    serviceJson?.project_id ||
    process.env.GCLOUD_PROJECT ||
    '';

  if (!projectId) {
    throw new Error('Missing projectId. Pass --project or set FIREBASE_PROJECT_ID.');
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      ...(credential ? { credential } : {}),
      projectId,
    });
  }

  return { db: admin.firestore(), projectId };
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function asId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const items = [];
  for (const raw of value) {
    const id = asId(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    items.push(id);
  }
  return items;
}

async function migrateLegacyFriends(db, apply) {
  const snapshot = await db.collection('friends').get();
  let migratedAccepted = 0;
  let skippedNonAccepted = 0;

  for (const docs of chunk(snapshot.docs, 200)) {
    if (!apply) {
      docs.forEach((doc) => {
        const data = doc.data() || {};
        const status = asId(data.status);
        if (status === 'accepted') {
          migratedAccepted += 1;
        } else {
          skippedNonAccepted += 1;
        }
      });
      continue;
    }

    const batch = db.batch();
    for (const doc of docs) {
      const data = doc.data() || {};
      const userId = asId(data.userId);
      const friendId = asId(data.friendId);
      const status = asId(data.status);

      if (userId && friendId && status === 'accepted') {
        batch.set(
          db.collection('users').doc(userId),
          { friends: admin.firestore.FieldValue.arrayUnion(friendId) },
          { merge: true }
        );
        migratedAccepted += 1;
      } else {
        skippedNonAccepted += 1;
      }

      batch.delete(doc.ref);
    }
    await batch.commit();
  }

  return {
    totalDocs: snapshot.size,
    migratedAccepted,
    skippedNonAccepted,
  };
}

function collectBlockedPairs(blockedUsersDocs, safetySettingsDocs) {
  const pairKeys = new Set();
  const pairs = [];

  const addPair = (blockerId, blockedId) => {
    const blocker = asId(blockerId);
    const blocked = asId(blockedId);
    if (!blocker || !blocked || blocker === blocked) return;
    const key = `${blocker}__${blocked}`;
    if (pairKeys.has(key)) return;
    pairKeys.add(key);
    pairs.push({ blockerId: blocker, blockedId: blocked });
  };

  blockedUsersDocs.forEach((doc) => {
    const data = doc.data() || {};
    addPair(data.blockerId, data.blockedId);
  });

  safetySettingsDocs.forEach((doc) => {
    const userId = doc.id;
    const blockedUsers = normalizeStringArray(doc.data()?.blockedUsers);
    blockedUsers.forEach((blockedId) => addPair(userId, blockedId));
  });

  return pairs;
}

async function migrateLegacyBlocks(db, apply) {
  const [blockedUsersSnapshot, safetySettingsSnapshot] = await Promise.all([
    db.collection('blockedUsers').get(),
    db.collection('safetySettings').get(),
  ]);

  const pairs = collectBlockedPairs(blockedUsersSnapshot.docs, safetySettingsSnapshot.docs);
  const settingsWithBlockedUsers = safetySettingsSnapshot.docs.filter((doc) =>
    normalizeStringArray(doc.data()?.blockedUsers).length > 0
  );

  if (apply) {
    for (const pairChunk of chunk(pairs, 90)) {
      const batch = db.batch();
      for (const pair of pairChunk) {
        batch.set(
          db.collection('users').doc(pair.blockerId),
          {
            blocked: admin.firestore.FieldValue.arrayUnion(pair.blockedId),
            friends: admin.firestore.FieldValue.arrayRemove(pair.blockedId),
            closeFriends: admin.firestore.FieldValue.arrayRemove(pair.blockedId),
          },
          { merge: true }
        );
        batch.set(
          db.collection('users').doc(pair.blockedId),
          {
            friends: admin.firestore.FieldValue.arrayRemove(pair.blockerId),
            closeFriends: admin.firestore.FieldValue.arrayRemove(pair.blockerId),
          },
          { merge: true }
        );
        batch.delete(db.collection('friendRequests').doc(`${pair.blockerId}_${pair.blockedId}`));
        batch.delete(db.collection('friendRequests').doc(`${pair.blockedId}_${pair.blockerId}`));
      }
      await batch.commit();
    }

    for (const docs of chunk(blockedUsersSnapshot.docs, 450)) {
      const batch = db.batch();
      docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }

    for (const docs of chunk(settingsWithBlockedUsers, 200)) {
      const batch = db.batch();
      docs.forEach((doc) => {
        batch.set(
          doc.ref,
          {
            blockedUsers: admin.firestore.FieldValue.delete(),
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      });
      await batch.commit();
    }
  }

  return {
    blockedUsersDocs: blockedUsersSnapshot.size,
    safetySettingsWithBlockedUsers: settingsWithBlockedUsers.length,
    uniqueBlockedPairs: pairs.length,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const { db, projectId } = initAdmin(args);

  console.log(`Project: ${projectId}`);
  console.log(args.apply ? 'Mode: APPLY' : 'Mode: DRY RUN');

  const [friendsResult, blocksResult] = await Promise.all([
    migrateLegacyFriends(db, args.apply),
    migrateLegacyBlocks(db, args.apply),
  ]);

  console.log('');
  console.log('Legacy friends migration');
  console.log(JSON.stringify(friendsResult, null, 2));

  console.log('');
  console.log('Legacy block migration');
  console.log(JSON.stringify(blocksResult, null, 2));

  if (!args.apply) {
    console.log('');
    console.log('Dry run only. Re-run with --apply to write changes.');
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});
