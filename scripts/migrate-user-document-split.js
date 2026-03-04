#!/usr/bin/env node

/**
 * Migrate legacy users/{uid} documents into:
 * - publicProfiles/{uid}
 * - socialGraph/{uid}
 * - userPrivate/{uid}
 * while sanitizing users/{uid} down to owner/admin-only metadata.
 *
 * Dry run by default.
 *
 * Usage:
 *   node scripts/migrate-user-document-split.js [--service-account ./service-account.json] [--project my-project] [--apply]
 */

const fs = require('node:fs');
const path = require('node:path');
const admin = require('firebase-admin');

const PUBLIC_PROFILE_FIELDS = new Set([
  'name',
  'nameLower',
  'city',
  'campus',
  'campusOrCity',
  'campusType',
  'handle',
  'coffeeIntents',
  'ambiancePreference',
  'photoUrl',
  'avatarUrl',
  'referralCode',
]);

const SOCIAL_GRAPH_FIELDS = new Set(['friends', 'closeFriends', 'blocked']);
const CONTACT_FIELDS = new Set(['email', 'phone', 'phoneNormalized', 'pushToken']);

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

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const items = [];
  for (const raw of value) {
    const next = asString(raw);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    items.push(next);
  }
  return items;
}

function splitLegacyUserData(data, pushTokenDoc) {
  const publicProfile = {};
  const socialGraph = {};
  const userPrivate = {};

  Object.entries(data || {}).forEach(([key, value]) => {
    if (PUBLIC_PROFILE_FIELDS.has(key)) {
      publicProfile[key] = value;
      return;
    }
    if (SOCIAL_GRAPH_FIELDS.has(key)) {
      socialGraph[key] = normalizeStringArray(value);
      return;
    }
    if (CONTACT_FIELDS.has(key)) {
      userPrivate[key] = value;
      return;
    }
    if (key === 'createdAt' || key === 'updatedAt') {
      return;
    }
    userPrivate[key] = value;
  });

  const scopedPushToken = asString(pushTokenDoc?.token);
  if (scopedPushToken) {
    userPrivate.pushToken = scopedPushToken;
  } else if (asString(data?.pushToken)) {
    userPrivate.pushToken = asString(data.pushToken);
  }

  return { publicProfile, socialGraph, userPrivate };
}

async function migrateUserDocuments(db, apply) {
  const usersSnapshot = await db.collection('users').get();
  const result = {
    usersScanned: usersSnapshot.size,
    publicProfilesWritten: 0,
    socialGraphsWritten: 0,
    userPrivateWritten: 0,
    usersSanitized: 0,
  };

  for (const docs of chunk(usersSnapshot.docs, 125)) {
    const pushTokenDocs = await Promise.all(
      docs.map((doc) => db.collection('pushTokens').doc(doc.id).get().catch(() => null)),
    );

    if (!apply) {
      docs.forEach((doc, index) => {
        const { publicProfile, socialGraph, userPrivate } = splitLegacyUserData(doc.data() || {}, pushTokenDocs[index]?.data?.() || {});
        if (Object.keys(publicProfile).length) result.publicProfilesWritten += 1;
        if (Object.keys(socialGraph).length || doc.data()?.friends || doc.data()?.closeFriends || doc.data()?.blocked) result.socialGraphsWritten += 1;
        if (Object.keys(userPrivate).length) result.userPrivateWritten += 1;
        result.usersSanitized += 1;
      });
      continue;
    }

    const batch = db.batch();
    docs.forEach((doc, index) => {
      const data = doc.data() || {};
      const pushTokenData = pushTokenDocs[index]?.data?.() || {};
      const { publicProfile, socialGraph, userPrivate } = splitLegacyUserData(data, pushTokenData);
      const createdAt = data.createdAt || admin.firestore.FieldValue.serverTimestamp();
      const updatedAt = admin.firestore.FieldValue.serverTimestamp();

      if (Object.keys(publicProfile).length) {
        batch.set(
          db.collection('publicProfiles').doc(doc.id),
          {
            ...publicProfile,
            createdAt,
            updatedAt,
          },
          { merge: true },
        );
        result.publicProfilesWritten += 1;
      }

      batch.set(
        db.collection('socialGraph').doc(doc.id),
        {
          friends: normalizeStringArray(socialGraph.friends),
          closeFriends: normalizeStringArray(socialGraph.closeFriends),
          blocked: normalizeStringArray(socialGraph.blocked),
          createdAt,
          updatedAt,
        },
        { merge: true },
      );
      result.socialGraphsWritten += 1;

      if (Object.keys(userPrivate).length) {
        batch.set(
          db.collection('userPrivate').doc(doc.id),
          {
            ...userPrivate,
            createdAt,
            updatedAt,
          },
          { merge: true },
        );
        result.userPrivateWritten += 1;
      }

      batch.set(
        doc.ref,
        {
          createdAt,
          updatedAt,
          migrationVersion: 2,
          ...Array.from(PUBLIC_PROFILE_FIELDS).reduce((acc, field) => {
            acc[field] = admin.firestore.FieldValue.delete();
            return acc;
          }, {}),
          ...Array.from(SOCIAL_GRAPH_FIELDS).reduce((acc, field) => {
            acc[field] = admin.firestore.FieldValue.delete();
            return acc;
          }, {}),
          ...Array.from(CONTACT_FIELDS).reduce((acc, field) => {
            acc[field] = admin.firestore.FieldValue.delete();
            return acc;
          }, {}),
        },
        { merge: true },
      );
      result.usersSanitized += 1;
    });

    await batch.commit();
  }

  return result;
}

async function main() {
  const args = parseArgs(process.argv);
  const { db, projectId } = initAdmin(args);

  console.log(`[migrate-user-document-split] project=${projectId} mode=${args.apply ? 'apply' : 'dry-run'}`);

  const result = await migrateUserDocuments(db, args.apply);
  console.log(JSON.stringify(result, null, 2));

  if (!args.apply) {
    console.log('Dry run only. Re-run with --apply to persist changes.');
  }
}

main().catch((error) => {
  console.error('[migrate-user-document-split] failed');
  console.error(error);
  process.exitCode = 1;
});
