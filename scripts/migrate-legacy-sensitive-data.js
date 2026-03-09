#!/usr/bin/env node

/**
 * Migrate legacy sensitive fields out of public documents.
 *
 * Dry run by default.
 *
 * Usage:
 *   node scripts/migrate-legacy-sensitive-data.js [--service-account ./service-account.json] [--project my-project] [--apply]
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
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

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePhone(value) {
  const digits = asString(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.startsWith('00') && digits.length > 2) return `+${digits.slice(2)}`;
  if (digits.startsWith('+')) return digits;
  return digits.startsWith('+') ? digits : `+${digits}`;
}

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(asString(apiKey)).digest('hex');
}

function buildApiKeyPreview(apiKey) {
  const normalized = asString(apiKey);
  if (!normalized) return '';
  if (normalized.length <= 18) return normalized;
  return `${normalized.slice(0, 12)}...${normalized.slice(-4)}`;
}

function buildApiKeyMetadata(apiKey) {
  const normalized = asString(apiKey);
  return {
    keyPreview: buildApiKeyPreview(normalized),
    keyLast4: normalized ? normalized.slice(-4) : '',
  };
}

async function migrateLegacyUserPrivacy(db, apply) {
  const snapshot = await db.collection('users').get();
  const result = {
    usersScanned: snapshot.size,
    usersWithPublicContactFields: 0,
    usersWithLegacyPushToken: 0,
    userPrivateWrites: 0,
    pushTokenWrites: 0,
    publicUserDocsSanitized: 0,
    userPrivateConflicts: 0,
    pushTokenConflicts: 0,
  };

  for (const docs of chunk(snapshot.docs, 150)) {
    if (!apply) {
      docs.forEach((doc) => {
        const data = doc.data() || {};
        const hasPublicContact =
          data.email != null ||
          data.phone != null ||
          data.phoneNormalized != null;
        const hasLegacyPushToken = asString(data.pushToken).length > 0;
        if (hasPublicContact) result.usersWithPublicContactFields += 1;
        if (hasLegacyPushToken) result.usersWithLegacyPushToken += 1;
      });
      continue;
    }

    const userPrivateRefs = docs.map((doc) => db.collection('userPrivate').doc(doc.id));
    const pushTokenRefs = docs.map((doc) => db.collection('pushTokens').doc(doc.id));
    const [userPrivateDocs, pushTokenDocs] = await Promise.all([
      Promise.all(userPrivateRefs.map((ref) => ref.get())),
      Promise.all(pushTokenRefs.map((ref) => ref.get())),
    ]);

    const batch = db.batch();

    docs.forEach((doc, index) => {
      const data = doc.data() || {};
      const privateDoc = userPrivateDocs[index];
      const privateData = privateDoc.exists ? (privateDoc.data() || {}) : {};
      const pushTokenDoc = pushTokenDocs[index];
      const pushTokenData = pushTokenDoc.exists ? (pushTokenDoc.data() || {}) : {};

      const rawEmail = asString(data.email);
      const rawPhone = asString(data.phone);
      const rawPhoneNormalized = asString(data.phoneNormalized);
      const normalizedPhone = rawPhone ? normalizePhone(rawPhone) : normalizePhone(rawPhoneNormalized);
      const legacyPushToken = asString(data.pushToken);
      const createdAt = data.createdAt || admin.firestore.FieldValue.serverTimestamp();

      const hasPublicContact = rawEmail || rawPhone || rawPhoneNormalized;
      const hasLegacyPushToken = Boolean(legacyPushToken);

      if (hasPublicContact) result.usersWithPublicContactFields += 1;
      if (hasLegacyPushToken) result.usersWithLegacyPushToken += 1;

      const privatePayload = {};
      let writeUserPrivate = false;

      if (rawEmail) {
        const existingEmail = asString(privateData.email);
        if (!existingEmail) {
          privatePayload.email = rawEmail;
          writeUserPrivate = true;
        } else if (existingEmail !== rawEmail) {
          result.userPrivateConflicts += 1;
        }
      }

      if (rawPhone) {
        const existingPhone = asString(privateData.phone);
        if (!existingPhone) {
          privatePayload.phone = rawPhone;
          writeUserPrivate = true;
        } else if (existingPhone !== rawPhone) {
          result.userPrivateConflicts += 1;
        }
      }

      if (normalizedPhone) {
        const existingPhoneNormalized = asString(privateData.phoneNormalized);
        if (!existingPhoneNormalized) {
          privatePayload.phoneNormalized = normalizedPhone;
          writeUserPrivate = true;
        } else if (existingPhoneNormalized !== normalizedPhone) {
          result.userPrivateConflicts += 1;
        }
      }

      if (writeUserPrivate) {
        batch.set(
          privateDoc.ref,
          {
            ...privatePayload,
            ...(privateDoc.exists ? {} : { createdAt }),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        result.userPrivateWrites += 1;
      }

      if (legacyPushToken) {
        const existingPushToken = asString(pushTokenData.token);
        if (!existingPushToken) {
          batch.set(
            pushTokenDoc.ref,
            {
              userId: doc.id,
              token: legacyPushToken,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          result.pushTokenWrites += 1;
        } else if (existingPushToken !== legacyPushToken) {
          result.pushTokenConflicts += 1;
        }
      }

      if (hasPublicContact || legacyPushToken) {
        batch.set(
          doc.ref,
          {
            email: admin.firestore.FieldValue.delete(),
            phone: admin.firestore.FieldValue.delete(),
            phoneNormalized: admin.firestore.FieldValue.delete(),
            pushToken: admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        result.publicUserDocsSanitized += 1;
      }
    });

    await batch.commit();
  }

  return result;
}

async function migrateLegacyApiKeys(db, apply) {
  const snapshot = await db.collection('apiKeys').get();
  const result = {
    apiKeysScanned: snapshot.size,
    plaintextKeysFound: 0,
    apiKeyDocsSanitized: 0,
    hashIndexWrites: 0,
    hashConflicts: 0,
  };

  for (const docs of chunk(snapshot.docs, 150)) {
    if (!apply) {
      docs.forEach((doc) => {
        const data = doc.data() || {};
        if (asString(data.key)) {
          result.plaintextKeysFound += 1;
        }
      });
      continue;
    }

    const batch = db.batch();
    for (const doc of docs) {
      const data = doc.data() || {};
      const rawKey = asString(data.key);
      const existingHash = asString(data.keyHash);

      if (rawKey) {
        result.plaintextKeysFound += 1;
        const computedHash = hashApiKey(rawKey);
        const metadata = buildApiKeyMetadata(rawKey);

        if (existingHash && existingHash !== computedHash) {
          result.hashConflicts += 1;
        }

        batch.set(
          doc.ref,
          {
            keyHash: computedHash,
            ...metadata,
            key: admin.firestore.FieldValue.delete(),
            updatedAt: Date.now(),
          },
          { merge: true }
        );
        batch.set(
          db.collection('apiKeyHashes').doc(computedHash),
          {
            partnerId: doc.id,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
        result.apiKeyDocsSanitized += 1;
        result.hashIndexWrites += 1;
        continue;
      }

      if (existingHash) {
        batch.set(
          db.collection('apiKeyHashes').doc(existingHash),
          {
            partnerId: doc.id,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
        result.hashIndexWrites += 1;
      }
    }
    await batch.commit();
  }

  return result;
}

async function main() {
  const args = parseArgs(process.argv);
  const { db, projectId } = initAdmin(args);

  console.log(`Project: ${projectId}`);
  console.log(args.apply ? 'Mode: APPLY' : 'Mode: DRY RUN');

  const [userPrivacyResult, apiKeyResult] = await Promise.all([
    migrateLegacyUserPrivacy(db, args.apply),
    migrateLegacyApiKeys(db, args.apply),
  ]);

  console.log('');
  console.log('Legacy user privacy migration');
  console.log(JSON.stringify(userPrivacyResult, null, 2));

  console.log('');
  console.log('Legacy API key migration');
  console.log(JSON.stringify(apiKeyResult, null, 2));

  if (!args.apply) {
    console.log('');
    console.log('Dry run only. Re-run with --apply to write changes.');
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});
