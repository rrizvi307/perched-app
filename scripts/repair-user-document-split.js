#!/usr/bin/env node

/**
 * Repair structurally broken split-user documents after migration.
 *
 * Targets users where `users/{uid}` exists but one or more of:
 * - `publicProfiles/{uid}`
 * - `userPrivate/{uid}`
 * - `socialGraph/{uid}`
 *
 * are missing or missing required structural timestamps.
 *
 * Dry run by default.
 *
 * Usage:
 *   node scripts/repair-user-document-split.js [--service-account ./service-account.json] [--project my-project] [--uid abc123] [--apply]
 */

const fs = require('node:fs');
const path = require('node:path');
const admin = require('firebase-admin');

const EXPECTED_MIGRATION_VERSION = 2;
const USERS_ALLOWED_FIELDS = new Set(['createdAt', 'updatedAt', 'migrationVersion']);

function parseArgs(argv) {
  const args = {
    serviceAccount: null,
    projectId: '',
    apply: false,
    uids: [],
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
    } else if (key === '--uid' && value) {
      args.uids.push(String(value).trim());
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

  return { db: admin.firestore(), auth: admin.auth(), projectId };
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

function normalizePhone(value) {
  const input = asString(value);
  if (!input) return '';
  const normalized = input.replace(/[^\d+]/g, '');
  return normalized.startsWith('+') ? normalized : normalized.replace(/[^\d]/g, '');
}

function coerceDate(value) {
  if (!value) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value?.toDate === 'function') {
    const converted = value.toDate();
    return converted instanceof Date && Number.isFinite(converted.getTime()) ? converted : null;
  }
  if (typeof value?._seconds === 'number') {
    return new Date(value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1000000));
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value);
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed);
  }
  return null;
}

function pickDate(...values) {
  for (const value of values) {
    const next = coerceDate(value);
    if (next) return next;
  }
  return null;
}

function buildUserDocumentRepairPlan({
  uid,
  userData = {},
  publicData = null,
  privateData = null,
  socialData = null,
  authUser = null,
}) {
  const publicExists = Boolean(publicData);
  const privateExists = Boolean(privateData);
  const socialExists = Boolean(socialData);

  const createdAt =
    pickDate(
      userData?.createdAt,
      publicData?.createdAt,
      privateData?.createdAt,
      socialData?.createdAt,
      authUser?.metadata?.creationTime,
      authUser?.creationTime,
    ) || new Date();
  const updatedAt =
    pickDate(
      userData?.updatedAt,
      publicData?.updatedAt,
      privateData?.updatedAt,
      socialData?.updatedAt,
      authUser?.metadata?.lastSignInTime,
      authUser?.lastSignInTime,
      createdAt,
    ) || new Date();

  const canonicalName =
    asString(publicData?.name) ||
    asString(privateData?.name) ||
    asString(authUser?.displayName);
  const canonicalHandle =
    asString(publicData?.handle) ||
    asString(privateData?.handle);
  const canonicalPhotoUrl =
    asString(publicData?.photoUrl) ||
    asString(publicData?.avatarUrl) ||
    asString(authUser?.photoURL);
  const canonicalCity =
    asString(publicData?.city) ||
    asString(privateData?.city) ||
    asString(userData?.city);
  const canonicalCampus =
    asString(publicData?.campus) ||
    asString(privateData?.campus) ||
    asString(userData?.campus);
  const canonicalCampusOrCity =
    asString(publicData?.campusOrCity) ||
    asString(privateData?.campusOrCity) ||
    asString(userData?.campusOrCity) ||
    canonicalCampus ||
    canonicalCity;
  const canonicalCampusType =
    asString(publicData?.campusType) ||
    asString(privateData?.campusType) ||
    asString(userData?.campusType);
  const canonicalEmail =
    asString(privateData?.email) ||
    asString(authUser?.email);
  const canonicalPhone =
    asString(privateData?.phone) ||
    asString(authUser?.phoneNumber);
  const canonicalPhoneNormalized =
    asString(privateData?.phoneNormalized) ||
    normalizePhone(canonicalPhone);
  const canonicalCoffeeIntents = Array.isArray(publicData?.coffeeIntents)
    ? publicData.coffeeIntents.slice(0, 3)
    : [];
  const canonicalAmbiancePreference = asString(publicData?.ambiancePreference);

  const publicProfilePatch = {};
  if (!publicExists || !publicData?.createdAt) publicProfilePatch.createdAt = createdAt;
  if (!publicExists || !publicData?.updatedAt) publicProfilePatch.updatedAt = updatedAt;
  if (!publicExists) {
    if (canonicalName) {
      publicProfilePatch.name = canonicalName;
      publicProfilePatch.nameLower = canonicalName.toLowerCase();
    }
    if (canonicalHandle) publicProfilePatch.handle = canonicalHandle.toLowerCase();
    if (canonicalPhotoUrl) publicProfilePatch.photoUrl = canonicalPhotoUrl;
    if (canonicalCity) publicProfilePatch.city = canonicalCity;
    if (canonicalCampus) publicProfilePatch.campus = canonicalCampus;
    if (canonicalCampusOrCity) publicProfilePatch.campusOrCity = canonicalCampusOrCity;
    if (canonicalCampusType) publicProfilePatch.campusType = canonicalCampusType;
    if (canonicalCoffeeIntents.length) publicProfilePatch.coffeeIntents = canonicalCoffeeIntents;
    if (canonicalAmbiancePreference) publicProfilePatch.ambiancePreference = canonicalAmbiancePreference;
  }

  const socialGraphPatch = {};
  if (!socialExists || !socialData?.createdAt) socialGraphPatch.createdAt = createdAt;
  if (!socialExists || !socialData?.updatedAt) socialGraphPatch.updatedAt = updatedAt;
  if (!socialExists || !Array.isArray(socialData?.friends)) {
    socialGraphPatch.friends = normalizeStringArray(socialData?.friends);
  }
  if (!socialExists || !Array.isArray(socialData?.closeFriends)) {
    socialGraphPatch.closeFriends = normalizeStringArray(socialData?.closeFriends);
  }
  if (!socialExists || !Array.isArray(socialData?.blocked)) {
    socialGraphPatch.blocked = normalizeStringArray(socialData?.blocked);
  }

  const userPrivatePatch = {};
  if (!privateExists || !privateData?.createdAt) userPrivatePatch.createdAt = createdAt;
  if (!privateExists || !privateData?.updatedAt) userPrivatePatch.updatedAt = updatedAt;
  if (!privateData?.email && canonicalEmail) userPrivatePatch.email = canonicalEmail;
  if (typeof privateData?.emailVerified !== 'boolean' && typeof authUser?.emailVerified === 'boolean') {
    userPrivatePatch.emailVerified = authUser.emailVerified;
  }
  if (!privateData?.phone && canonicalPhone) userPrivatePatch.phone = canonicalPhone;
  if (!privateData?.phoneNormalized && canonicalPhoneNormalized) {
    userPrivatePatch.phoneNormalized = canonicalPhoneNormalized;
  }

  const userDocPatch = {};
  if (!userData?.createdAt) userDocPatch.createdAt = createdAt;
  if (!userData?.updatedAt) userDocPatch.updatedAt = updatedAt;
  if (userData?.migrationVersion !== EXPECTED_MIGRATION_VERSION) {
    userDocPatch.migrationVersion = EXPECTED_MIGRATION_VERSION;
  }

  const reasons = [];
  if (!publicExists) reasons.push('missing_public_profile');
  if (!privateExists) reasons.push('missing_user_private');
  if (!socialExists) reasons.push('missing_social_graph');
  if (!userData?.createdAt) reasons.push('users_missing_createdAt');
  if (!userData?.updatedAt) reasons.push('users_missing_updatedAt');
  if (userData?.migrationVersion !== EXPECTED_MIGRATION_VERSION) reasons.push('users_wrong_migration_version');
  if (privateExists && !privateData?.createdAt) reasons.push('user_private_missing_createdAt');
  if (privateExists && !privateData?.updatedAt) reasons.push('user_private_missing_updatedAt');
  if (publicExists && !publicData?.createdAt) reasons.push('public_profile_missing_createdAt');
  if (publicExists && !publicData?.updatedAt) reasons.push('public_profile_missing_updatedAt');
  if (socialExists && !socialData?.createdAt) reasons.push('social_graph_missing_createdAt');
  if (socialExists && !socialData?.updatedAt) reasons.push('social_graph_missing_updatedAt');

  return {
    uid,
    requiresRepair:
      reasons.length > 0,
    reasons,
    authFound: Boolean(authUser),
    publicProfilePatch,
    socialGraphPatch,
    userPrivatePatch,
    userDocPatch,
  };
}

function isStructurallyBrokenUser(userData, publicData, privateData, socialData) {
  if (!userData) return false;
  if (!publicData || !privateData || !socialData) return true;
  if (!userData.createdAt || !userData.updatedAt || userData.migrationVersion !== EXPECTED_MIGRATION_VERSION) {
    return true;
  }
  if (!publicData.createdAt || !publicData.updatedAt) return true;
  if (!privateData.createdAt || !privateData.updatedAt) return true;
  if (!socialData.createdAt || !socialData.updatedAt) return true;
  return false;
}

async function loadAuthUsers(auth, uids) {
  const map = new Map();
  for (const uid of uids) {
    try {
      const user = await auth.getUser(uid);
      map.set(uid, user);
    } catch (error) {
      if (String(error?.code || '') !== 'auth/user-not-found') {
        throw error;
      }
      map.set(uid, null);
    }
  }
  return map;
}

async function repairUserDocuments(db, auth, apply, targetUids = []) {
  const [usersSnapshot, publicProfilesSnapshot, userPrivateSnapshot, socialGraphSnapshot] = await Promise.all([
    db.collection('users').get(),
    db.collection('publicProfiles').get(),
    db.collection('userPrivate').get(),
    db.collection('socialGraph').get(),
  ]);

  const publicProfilesById = new Map(publicProfilesSnapshot.docs.map((doc) => [doc.id, doc.data() || {}]));
  const userPrivateById = new Map(userPrivateSnapshot.docs.map((doc) => [doc.id, doc.data() || {}]));
  const socialGraphById = new Map(socialGraphSnapshot.docs.map((doc) => [doc.id, doc.data() || {}]));

  const requestedUidSet = new Set(targetUids.filter(Boolean));
  const candidateDocs = usersSnapshot.docs.filter((doc) => {
    if (requestedUidSet.size > 0 && !requestedUidSet.has(doc.id)) return false;
    return isStructurallyBrokenUser(
      doc.data() || {},
      publicProfilesById.get(doc.id) || null,
      userPrivateById.get(doc.id) || null,
      socialGraphById.get(doc.id) || null,
    );
  });

  const authUsersById = await loadAuthUsers(auth, candidateDocs.map((doc) => doc.id));
  const plans = candidateDocs.map((doc) =>
    buildUserDocumentRepairPlan({
      uid: doc.id,
      userData: doc.data() || {},
      publicData: publicProfilesById.get(doc.id) || null,
      privateData: userPrivateById.get(doc.id) || null,
      socialData: socialGraphById.get(doc.id) || null,
      authUser: authUsersById.get(doc.id) || null,
    }),
  );

  const repairPlans = plans.filter((plan) => plan.requiresRepair);

  const result = {
    usersScanned: usersSnapshot.size,
    candidateUsers: candidateDocs.length,
    usersRepaired: repairPlans.length,
    usersMissingAuthRecord: repairPlans.filter((plan) => !plan.authFound).map((plan) => plan.uid),
    repairedUsers: repairPlans.map((plan) => ({
      uid: plan.uid,
      reasons: plan.reasons,
      authFound: plan.authFound,
      writes: {
        users: Object.keys(plan.userDocPatch),
        publicProfiles: Object.keys(plan.publicProfilePatch),
        userPrivate: Object.keys(plan.userPrivatePatch),
        socialGraph: Object.keys(plan.socialGraphPatch),
      },
    })),
  };

  if (!apply || repairPlans.length === 0) {
    return result;
  }

  for (const plansChunk of chunk(repairPlans, 125)) {
    const batch = db.batch();
    plansChunk.forEach((plan) => {
      if (Object.keys(plan.userDocPatch).length) {
        batch.set(db.collection('users').doc(plan.uid), plan.userDocPatch, { merge: true });
      }
      if (Object.keys(plan.publicProfilePatch).length) {
        batch.set(db.collection('publicProfiles').doc(plan.uid), plan.publicProfilePatch, { merge: true });
      }
      if (Object.keys(plan.userPrivatePatch).length) {
        batch.set(db.collection('userPrivate').doc(plan.uid), plan.userPrivatePatch, { merge: true });
      }
      if (Object.keys(plan.socialGraphPatch).length) {
        batch.set(db.collection('socialGraph').doc(plan.uid), plan.socialGraphPatch, { merge: true });
      }
    });
    await batch.commit();
  }

  return result;
}

async function main() {
  const args = parseArgs(process.argv);
  const { db, auth, projectId } = initAdmin(args);

  console.log(`[repair-user-document-split] project=${projectId} mode=${args.apply ? 'apply' : 'dry-run'}`);
  if (args.uids.length) {
    console.log(`[repair-user-document-split] scoped_uids=${args.uids.join(',')}`);
  }

  const result = await repairUserDocuments(db, auth, args.apply, args.uids);
  console.log(JSON.stringify(result, null, 2));

  if (!args.apply) {
    console.log('Dry run only. Re-run with --apply to persist changes.');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[repair-user-document-split] failed');
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  buildUserDocumentRepairPlan,
  coerceDate,
  isStructurallyBrokenUser,
  normalizePhone,
  normalizeStringArray,
};
