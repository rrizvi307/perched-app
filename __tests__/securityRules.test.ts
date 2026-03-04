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
const hasRulesEmulator =
  Boolean(process.env.FIRESTORE_EMULATOR_HOST) ||
  Boolean(process.env.FIREBASE_EMULATOR_HUB);
const describeRulesSuite = hasRulesEmulator ? describe : describe.skip;

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

describeRulesSuite('security rules', () => {
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

    it('allows publicProfiles reads but keeps users and socialGraph owner-only', async () => {
      const aliceDb = testEnv.authenticatedContext('alice').firestore();
      const bobDb = testEnv.authenticatedContext('bob').firestore();

      await assertSucceeds(
        aliceDb.collection('publicProfiles').doc('alice').set({
          createdAt: 1,
          name: 'Alice',
        }),
      );

      await seedFirestore('users', 'alice', {
        createdAt: 1,
        migrationVersion: 2,
      });
      await seedFirestore('socialGraph', 'alice', {
        createdAt: 1,
        friends: ['bob'],
        closeFriends: [],
        blocked: [],
      });

      await assertSucceeds(bobDb.collection('publicProfiles').doc('alice').get());
      await assertSucceeds(aliceDb.collection('users').doc('alice').get());
      await assertFails(bobDb.collection('users').doc('alice').get());
      await assertSucceeds(aliceDb.collection('socialGraph').doc('alice').get());
      await assertFails(bobDb.collection('socialGraph').doc('alice').get());
    });

    it('blocks account and contact fields from publicProfiles and raw users writes', async () => {
      const aliceDb = testEnv.authenticatedContext('alice').firestore();

      await assertFails(
        aliceDb.collection('publicProfiles').doc('alice-contact').set({
          createdAt: 1,
          name: 'Alice Contact',
          email: 'alice@example.com',
        }),
      );

      await assertFails(
        aliceDb.collection('users').doc('alice-public').set({
          createdAt: 1,
          name: 'Should not live in users',
        }),
      );

      await assertFails(
        aliceDb.collection('users').doc('alice-push').set({
          createdAt: 1,
          pushToken: 'ExponentPushToken[abc]',
        }),
      );
    });

    it('blocks direct client check-in creation', async () => {
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

      await assertFails(
        verifiedDb.collection('checkins').doc('checkin-verified').set({
          userId: 'verified',
          createdAt: 1,
          spotName: 'Cafe',
          visibility: 'public',
        }),
      );

      await assertFails(
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

    it('allows authenticated spot reads but blocks client spot writes', async () => {
      await seedFirestore('spots', 'spot-1', {
        name: 'Campus Cafe',
        placeId: 'spot-1',
        geoHash: '9vk1abc',
        lat: 29.72,
        lng: -95.34,
        intel: {
          category: 'cafe',
          avgRating: 4.5,
          isOpenNow: true,
          priceLevel: '$$',
          inferredNoise: 'quiet',
          inferredNoiseConfidence: 0.8,
          hasWifi: true,
          wifiConfidence: 0.9,
          goodForStudying: true,
          goodForMeetings: true,
          source: 'api+nlp',
          lastUpdated: 1,
          reviewCount: 24,
        },
        live: {
          noise: 'quiet',
          busyness: 'some',
          checkinCount: 12,
          lastCheckinAt: 1,
        },
        display: {
          noise: 'quiet',
          noiseSource: 'live',
          noiseLabel: 'Quiet now',
          busyness: 'some',
          busynessSource: 'live',
          busynessLabel: 'Some activity',
        },
      });

      const aliceDb = testEnv.authenticatedContext('alice').firestore();

      await assertSucceeds(aliceDb.collection('spots').doc('spot-1').get());
      await assertFails(
        aliceDb.collection('spots').doc('spot-1').set({
          name: 'Tampered Spot',
        }, { merge: true }),
      );
    });

    it('enforces parent check-in visibility for reactions', async () => {
      await seedFirestore('socialGraph', 'owner', {
        createdAt: 1,
        friends: ['friend-user'],
        closeFriends: [],
        blocked: [],
      });
      await seedFirestore('checkins', 'friends-checkin', {
        userId: 'owner',
        createdAt: 1,
        spotName: 'Cafe',
        visibility: 'friends',
      });

      await seedFirestore('reactions', 'owner-reaction', {
        checkinId: 'friends-checkin',
        type: 'like',
        userId: 'owner',
        createdAt: 1,
      });

      const friendDb = testEnv.authenticatedContext('friend-user').firestore();
      const strangerDb = testEnv.authenticatedContext('stranger-user').firestore();

      await assertSucceeds(friendDb.collection('reactions').doc('owner-reaction').get());
      await assertFails(strangerDb.collection('reactions').doc('owner-reaction').get());
      await assertFails(
        strangerDb.collection('reactions').doc('stranger-reaction').set({
          checkinId: 'friends-checkin',
          type: 'like',
          userId: 'stranger-user',
          createdAt: 1,
        }),
      );
    });

    it('enforces parent check-in visibility for comments', async () => {
      await seedFirestore('socialGraph', 'owner', {
        createdAt: 1,
        friends: ['friend-user'],
        closeFriends: [],
        blocked: [],
      });
      await seedFirestore('checkins', 'friends-checkin', {
        userId: 'owner',
        createdAt: 1,
        spotName: 'Cafe',
        visibility: 'friends',
      });

      await seedFirestore('comments', 'owner-comment', {
        checkinId: 'friends-checkin',
        text: 'Hidden from strangers',
        userId: 'owner',
        createdAt: 1,
      });

      const friendDb = testEnv.authenticatedContext('friend-user').firestore();
      const strangerDb = testEnv.authenticatedContext('stranger-user').firestore();

      await assertSucceeds(friendDb.collection('comments').doc('owner-comment').get());
      await assertFails(strangerDb.collection('comments').doc('owner-comment').get());
      await assertFails(
        strangerDb.collection('comments').doc('stranger-comment').set({
          checkinId: 'friends-checkin',
          text: 'Should not be allowed',
          userId: 'stranger-user',
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
      await seedFirestore('socialGraph', 'owner', {
        createdAt: 1,
        friends: ['friend-user'],
        closeFriends: [],
        blocked: [],
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
      await seedFirestore('socialGraph', 'owner', {
        createdAt: 1,
        friends: ['friend-user', 'close-user'],
        closeFriends: ['close-user'],
        blocked: [],
      });
      await seedCheckinMedia('owner', 'close-only.jpg', 'close');

      const closeFriendStorage = testEnv.authenticatedContext('close-user').storage(TEST_BUCKET);
      const regularFriendStorage = testEnv.authenticatedContext('friend-user').storage(TEST_BUCKET);

      await assertSucceeds(closeFriendStorage.ref('checkins/owner/close-only.jpg').getMetadata());
      await assertFails(regularFriendStorage.ref('checkins/owner/close-only.jpg').getMetadata());
    });
  });
});
