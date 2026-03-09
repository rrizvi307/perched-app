#!/usr/bin/env node

/**
 * Verify the canonical user-document split migration.
 *
 * Checks:
 * - collection counts match across users/publicProfiles/userPrivate/socialGraph
 * - every users/{uid} has matching docs in publicProfiles, userPrivate, socialGraph
 * - no orphan split docs exist without a corresponding users/{uid}
 * - users/{uid} contains only createdAt, updatedAt, migrationVersion
 * - users/{uid}.migrationVersion matches the expected canonical split version
 * - legacy/private/social fields do not leak into the wrong collections
 *
 * Exits non-zero on any failure.
 *
 * Usage:
 *   node scripts/verify-user-document-split.js [--service-account ./service-account.json] [--project my-project]
 */

const fs = require('node:fs');
const path = require('node:path');
const admin = require('firebase-admin');

const EXPECTED_MIGRATION_VERSION = 2;

const USERS_ALLOWED_FIELDS = new Set(['createdAt', 'updatedAt', 'migrationVersion']);

const PUBLIC_PROFILE_FIELDS = new Set([
  'name',
  'nameLower',
  'city',
  'campus',
  'campusOrCity',
  'campusType',
  'handle',
  'photoUrl',
  'avatarUrl',
  'coffeeIntents',
  'ambiancePreference',
  'referralCode',
]);

const SOCIAL_GRAPH_FIELDS = new Set(['friends', 'closeFriends', 'blocked']);

const PRIVATE_ACCOUNT_FIELDS = new Set([
  'email',
  'phone',
  'phoneNormalized',
  'pushToken',
  'premium',
  'premiumStatus',
  'premiumUntil',
  'streakDays',
  'totalReferrals',
  'premiumWeeksEarned',
  'subscriptionId',
  'autoRenew',
  'period',
  'checkInCount',
  'badgesUnlocked',
  'emailVerified',
]);

const LEGACY_ALIAS_FIELDS = new Set([
  'displayName',
  'username',
  'userHandle',
  'photoURL',
]);

const PUBLIC_PROFILE_FORBIDDEN_FIELDS = new Set([
  ...Array.from(PRIVATE_ACCOUNT_FIELDS),
  ...Array.from(SOCIAL_GRAPH_FIELDS),
  ...Array.from(LEGACY_ALIAS_FIELDS),
]);

const USER_PRIVATE_FORBIDDEN_FIELDS = new Set([
  ...Array.from(PUBLIC_PROFILE_FIELDS),
  ...Array.from(SOCIAL_GRAPH_FIELDS),
  ...Array.from(LEGACY_ALIAS_FIELDS),
]);

const SOCIAL_GRAPH_FORBIDDEN_FIELDS = new Set([
  ...Array.from(PUBLIC_PROFILE_FIELDS),
  ...Array.from(PRIVATE_ACCOUNT_FIELDS),
  ...Array.from(LEGACY_ALIAS_FIELDS),
]);

function parseArgs(argv) {
  const args = {
    serviceAccount: null,
    projectId: '',
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

function setFromSnapshot(snapshot) {
  return new Set(snapshot.docs.map((doc) => doc.id));
}

function difference(source, target) {
  return Array.from(source).filter((id) => !target.has(id)).sort();
}

function inspectUsersDoc(doc) {
  const data = doc.data() || {};
  const presentKeys = Object.keys(data).sort();
  const disallowedKeys = presentKeys.filter((key) => !USERS_ALLOWED_FIELDS.has(key));
  const missingRequiredKeys = Array.from(USERS_ALLOWED_FIELDS).filter(
    (key) => !Object.prototype.hasOwnProperty.call(data, key),
  );
  const migrationVersionOk = data.migrationVersion === EXPECTED_MIGRATION_VERSION;

  if (!disallowedKeys.length && !missingRequiredKeys.length && migrationVersionOk) {
    return null;
  }

  return {
    uid: doc.id,
    presentKeys,
    disallowedKeys,
    missingRequiredKeys,
    migrationVersion: data.migrationVersion,
    expectedMigrationVersion: EXPECTED_MIGRATION_VERSION,
  };
}

function inspectForbiddenFields(snapshot, collectionName, forbiddenFields) {
  return snapshot.docs
    .map((doc) => {
      const data = doc.data() || {};
      const presentKeys = Object.keys(data).sort();
      const forbidden = presentKeys.filter((key) => forbiddenFields.has(key));
      if (!forbidden.length) return null;
      return {
        collection: collectionName,
        uid: doc.id,
        presentKeys,
        forbiddenFields: forbidden,
      };
    })
    .filter(Boolean);
}

function printSection(title, payload) {
  console.log(title);
  console.log(JSON.stringify(payload, null, 2));
  console.log('');
}

async function main() {
  const args = parseArgs(process.argv);
  const { db, projectId } = initAdmin(args);

  const [usersSnapshot, publicProfilesSnapshot, userPrivateSnapshot, socialGraphSnapshot] = await Promise.all([
    db.collection('users').get(),
    db.collection('publicProfiles').get(),
    db.collection('userPrivate').get(),
    db.collection('socialGraph').get(),
  ]);

  const userIds = setFromSnapshot(usersSnapshot);
  const publicProfileIds = setFromSnapshot(publicProfilesSnapshot);
  const userPrivateIds = setFromSnapshot(userPrivateSnapshot);
  const socialGraphIds = setFromSnapshot(socialGraphSnapshot);

  const counts = {
    projectId,
    users: usersSnapshot.size,
    publicProfiles: publicProfilesSnapshot.size,
    userPrivate: userPrivateSnapshot.size,
    socialGraph: socialGraphSnapshot.size,
  };

  const missingSplitDocs = {
    publicProfiles: difference(userIds, publicProfileIds),
    userPrivate: difference(userIds, userPrivateIds),
    socialGraph: difference(userIds, socialGraphIds),
  };

  const orphanSplitDocs = {
    publicProfiles: difference(publicProfileIds, userIds),
    userPrivate: difference(userPrivateIds, userIds),
    socialGraph: difference(socialGraphIds, userIds),
  };

  const usersViolations = usersSnapshot.docs
    .map((doc) => inspectUsersDoc(doc))
    .filter(Boolean);

  const leakageViolations = {
    publicProfiles: inspectForbiddenFields(
      publicProfilesSnapshot,
      'publicProfiles',
      PUBLIC_PROFILE_FORBIDDEN_FIELDS,
    ),
    userPrivate: inspectForbiddenFields(
      userPrivateSnapshot,
      'userPrivate',
      USER_PRIVATE_FORBIDDEN_FIELDS,
    ),
    socialGraph: inspectForbiddenFields(
      socialGraphSnapshot,
      'socialGraph',
      SOCIAL_GRAPH_FORBIDDEN_FIELDS,
    ),
  };

  const invariantChecks = [
    {
      name: 'count(publicProfiles) == count(users)',
      pass: counts.publicProfiles === counts.users,
      expected: counts.users,
      actual: counts.publicProfiles,
    },
    {
      name: 'count(userPrivate) == count(users)',
      pass: counts.userPrivate === counts.users,
      expected: counts.users,
      actual: counts.userPrivate,
    },
    {
      name: 'count(socialGraph) == count(users)',
      pass: counts.socialGraph === counts.users,
      expected: counts.users,
      actual: counts.socialGraph,
    },
    {
      name: 'every users/{uid} has publicProfiles/{uid}',
      pass: missingSplitDocs.publicProfiles.length === 0,
      missingCount: missingSplitDocs.publicProfiles.length,
      missingIds: missingSplitDocs.publicProfiles,
    },
    {
      name: 'every users/{uid} has userPrivate/{uid}',
      pass: missingSplitDocs.userPrivate.length === 0,
      missingCount: missingSplitDocs.userPrivate.length,
      missingIds: missingSplitDocs.userPrivate,
    },
    {
      name: 'every users/{uid} has socialGraph/{uid}',
      pass: missingSplitDocs.socialGraph.length === 0,
      missingCount: missingSplitDocs.socialGraph.length,
      missingIds: missingSplitDocs.socialGraph,
    },
    {
      name: 'publicProfiles contains no orphan docs',
      pass: orphanSplitDocs.publicProfiles.length === 0,
      orphanCount: orphanSplitDocs.publicProfiles.length,
      orphanIds: orphanSplitDocs.publicProfiles,
    },
    {
      name: 'userPrivate contains no orphan docs',
      pass: orphanSplitDocs.userPrivate.length === 0,
      orphanCount: orphanSplitDocs.userPrivate.length,
      orphanIds: orphanSplitDocs.userPrivate,
    },
    {
      name: 'socialGraph contains no orphan docs',
      pass: orphanSplitDocs.socialGraph.length === 0,
      orphanCount: orphanSplitDocs.socialGraph.length,
      orphanIds: orphanSplitDocs.socialGraph,
    },
    {
      name: `all users/{uid}.migrationVersion == ${EXPECTED_MIGRATION_VERSION}`,
      pass: usersViolations.every((violation) => violation.migrationVersion === EXPECTED_MIGRATION_VERSION),
      violationCount: usersViolations.filter(
        (violation) => violation.migrationVersion !== EXPECTED_MIGRATION_VERSION,
      ).length,
      violatingIds: usersViolations
        .filter((violation) => violation.migrationVersion !== EXPECTED_MIGRATION_VERSION)
        .map((violation) => violation.uid),
    },
  ];

  const residualFieldViolations = {
    users: {
      violationCount: usersViolations.length,
      violations: usersViolations,
    },
    publicProfiles: {
      violationCount: leakageViolations.publicProfiles.length,
      violations: leakageViolations.publicProfiles,
    },
    userPrivate: {
      violationCount: leakageViolations.userPrivate.length,
      violations: leakageViolations.userPrivate,
    },
    socialGraph: {
      violationCount: leakageViolations.socialGraph.length,
      violations: leakageViolations.socialGraph,
    },
  };

  const failedInvariantCount = invariantChecks.filter((check) => !check.pass).length;
  const residualViolationCount =
    usersViolations.length +
    leakageViolations.publicProfiles.length +
    leakageViolations.userPrivate.length +
    leakageViolations.socialGraph.length;
  const passed = failedInvariantCount === 0 && residualViolationCount === 0;

  printSection('SECTION 1  COLLECTION COUNTS', counts);
  printSection('SECTION 2  INVARIANT CHECK RESULTS', invariantChecks);
  printSection('SECTION 3  RESIDUAL FIELD VIOLATIONS', residualFieldViolations);
  printSection('SECTION 4  MIGRATION PASS/FAIL', {
    status: passed ? 'PASS' : 'FAIL',
    expectedMigrationVersion: EXPECTED_MIGRATION_VERSION,
    failedInvariantCount,
    residualViolationCount,
    checkedUserCount: counts.users,
  });

  if (!passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('SECTION 1  COLLECTION COUNTS');
  console.error(JSON.stringify({ error: error?.message || String(error) }, null, 2));
  console.error('');
  console.error('SECTION 2  INVARIANT CHECK RESULTS');
  console.error(JSON.stringify([], null, 2));
  console.error('');
  console.error('SECTION 3  RESIDUAL FIELD VIOLATIONS');
  console.error(JSON.stringify({}, null, 2));
  console.error('');
  console.error('SECTION 4  MIGRATION PASS/FAIL');
  console.error(JSON.stringify({ status: 'FAIL', error: error?.message || String(error) }, null, 2));
  process.exitCode = 1;
});
