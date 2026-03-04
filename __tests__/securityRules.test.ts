import fs from 'fs';
import path from 'path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const PROJECT_ID = 'demo-perched-rules';
const TEST_BUCKET = `gs://${PROJECT_ID}.appspot.com`;

const firestoreRules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
const storageRules = fs.readFileSync(path.resolve(process.cwd(), 'storage.rules'), 'utf8');

let testEnv: RulesTestEnvironment;

async function seedFirestore(
  collection: string,
  docId: string,
  data: Record<string, unknown>,
) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection(collection).doc(docId).set(data);
  });
}

async function seedCheckinMedia(
  ownerId: string,
  filename: string,
  visibility: 'public' | 'friends' | 'close',
) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context
      .storage(TEST_BUCKET)
      .ref(`checkins/${ownerId}/${filename}`)
      .putString('seed-image', 'raw', {
        contentType: 'image/jpeg',
        customMetadata: {
          ownerId,
          mediaKind: 'checkin',
          visibility,
        },
      } as any);
  });
}

describe('security rules', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: firestoreRules },
      storage: { rules: storageRules },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.clearStorage();
  });

  describe('firestore.rules', () => {
    it('allows users to read only their own userPrivate doc', async () => {
      await seedFirestore('userPrivate', 'alice', {
        email: 'alice@example.com',
        phone: '+15551234567',
        phoneNormalized: '15551234567',
        createdAt: 1,
        updatedAt: 1,
      });

      const aliceDb = testEnv.authenticatedContext('alice').firestore();
      const bobDb = testEnv.authenticatedContext('bob').firestore();

      await assertSucceeds(aliceDb.collection('userPrivate').doc('alice').get());
      await assertFails(bobDb.collection('userPrivate').doc('alice').get());
    });

    it('blocks public users doc writes that include private contact fields', async () => {
      const aliceDb = testEnv.authenticatedContext('alice').firestore();

      await assertSucceeds(
        aliceDb.collection('users').doc('alice').set({
          createdAt: 1,
          name: 'Alice',
        }),
      );

      await assertFails(
        aliceDb.collection('users').doc('alice-contact').set({
          createdAt: 1,
          name: 'Alice Contact',
          email: 'alice@example.com',
        }),
      );

      await assertFails(
        aliceDb.collection('users').doc('alice-push').set({
          createdAt: 1,
          name: 'Alice Push',
          pushToken: 'ExponentPushToken[abc]',
        }),
      );
    });

    it('requires verified email or phone auth for check-in creation', async () => {
      const unverifiedDb = testEnv
        .authenticatedContext('unverified', { email: 'unverified@example.com', email_verified: false })
        .firestore();
      const verifiedDb = testEnv
        .authenticatedContext('verified', { email: 'verified@example.com', email_verified: true })
        .firestore();
      const phoneDb = testEnv
        .authenticatedContext('phone-user', { phone_number: '+15557654321' })
        .firestore();

      await assertFails(
        unverifiedDb.collection('checkins').doc('checkin-unverified').set({
          userId: 'unverified',
          createdAt: 1,
          spotName: 'Cafe',
          visibility: 'public',
        }),
      );

      await assertSucceeds(
        verifiedDb.collection('checkins').doc('checkin-verified').set({
          userId: 'verified',
          createdAt: 1,
          spotName: 'Cafe',
          visibility: 'public',
        }),
      );

      await assertSucceeds(
        phoneDb.collection('checkins').doc('checkin-phone').set({
          userId: 'phone-user',
          createdAt: 1,
          spotName: 'Cafe',
          visibility: 'friends',
        }),
      );
    });

    it('blocks client writes to weekly raffle entries', async () => {
      const aliceDb = testEnv.authenticatedContext('alice').firestore();

      await assertFails(
        aliceDb.collection('weeklyRaffleEntries').doc('alice_2026-03-02').set({
          userId: 'alice',
          weekKey: '2026-03-02',
          createdAt: 1,
        }),
      );
    });
  });

  describe('storage.rules', () => {
    it('allows owners to upload check-in media only with valid metadata', async () => {
      const aliceStorage = testEnv.authenticatedContext('alice').storage(TEST_BUCKET);

      await assertSucceeds(
        Promise.resolve(aliceStorage.ref('checkins/alice/valid.jpg').putString('image-bytes', 'raw', {
          contentType: 'image/jpeg',
          customMetadata: {
            ownerId: 'alice',
            mediaKind: 'checkin',
            visibility: 'friends',
          },
        } as any)),
      );

      await assertFails(
        Promise.resolve(aliceStorage.ref('checkins/alice/invalid.jpg').putString('image-bytes', 'raw', {
          contentType: 'image/jpeg',
          customMetadata: {
            ownerId: 'alice',
            mediaKind: 'checkin',
            visibility: 'private',
          },
        } as any)),
      );
    });

    it('allows only authorized friends to read friends-only check-in media', async () => {
      await seedFirestore('users', 'owner', {
        createdAt: 1,
        friends: ['friend-user'],
        closeFriends: [],
      });
      await seedCheckinMedia('owner', 'friend-only.jpg', 'friends');

      const friendStorage = testEnv.authenticatedContext('friend-user').storage(TEST_BUCKET);
      const strangerStorage = testEnv.authenticatedContext('stranger-user').storage(TEST_BUCKET);
      const ownerStorage = testEnv.authenticatedContext('owner').storage(TEST_BUCKET);

      await assertSucceeds(ownerStorage.ref('checkins/owner/friend-only.jpg').getMetadata());
      await assertSucceeds(friendStorage.ref('checkins/owner/friend-only.jpg').getMetadata());
      await assertFails(strangerStorage.ref('checkins/owner/friend-only.jpg').getMetadata());
    });

    it('allows only close friends to read close-friends check-in media', async () => {
      await seedFirestore('users', 'owner', {
        createdAt: 1,
        friends: ['friend-user', 'close-user'],
        closeFriends: ['close-user'],
      });
      await seedCheckinMedia('owner', 'close-only.jpg', 'close');

      const closeFriendStorage = testEnv.authenticatedContext('close-user').storage(TEST_BUCKET);
      const regularFriendStorage = testEnv.authenticatedContext('friend-user').storage(TEST_BUCKET);

      await assertSucceeds(closeFriendStorage.ref('checkins/owner/close-only.jpg').getMetadata());
      await assertFails(regularFriendStorage.ref('checkins/owner/close-only.jpg').getMetadata());
    });
  });
});
