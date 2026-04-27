const {
  buildUserDocumentRepairPlan,
  isStructurallyBrokenUser,
} = require('../repair-user-document-split.js');

describe('repair user document split helpers', () => {
  it('plans a repair for sanitized users missing public and social docs', () => {
    const plan = buildUserDocumentRepairPlan({
      uid: 'user-1',
      userData: {
        migrationVersion: 2,
        updatedAt: new Date('2026-04-10T02:41:17.000Z'),
      },
      publicData: null,
      privateData: {
        pushToken: 'ExponentPushToken[test]',
      },
      socialData: null,
      authUser: {
        email: 'repair@example.com',
        displayName: '',
        phoneNumber: '',
        emailVerified: true,
        metadata: {
          creationTime: 'Fri, 10 Apr 2026 02:41:15 GMT',
          lastSignInTime: 'Fri, 10 Apr 2026 02:41:15 GMT',
        },
      },
    });

    expect(plan.requiresRepair).toBe(true);
    expect(plan.reasons).toEqual(
      expect.arrayContaining([
        'missing_public_profile',
        'missing_social_graph',
        'users_missing_createdAt',
        'user_private_missing_createdAt',
        'user_private_missing_updatedAt',
      ]),
    );
    expect(plan.userDocPatch.migrationVersion).toBeUndefined();
    expect(plan.userDocPatch.createdAt).toBeInstanceOf(Date);
    expect(plan.publicProfilePatch.createdAt).toBeInstanceOf(Date);
    expect(plan.socialGraphPatch.friends).toEqual([]);
    expect(plan.socialGraphPatch.closeFriends).toEqual([]);
    expect(plan.socialGraphPatch.blocked).toEqual([]);
    expect(plan.userPrivatePatch.email).toBe('repair@example.com');
    expect(plan.userPrivatePatch.emailVerified).toBe(true);
  });

  it('hydrates a missing public profile from auth display data when available', () => {
    const plan = buildUserDocumentRepairPlan({
      uid: 'user-2',
      userData: {
        migrationVersion: 2,
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        updatedAt: new Date('2026-04-02T00:00:00.000Z'),
      },
      publicData: null,
      privateData: null,
      socialData: null,
      authUser: {
        displayName: 'Avery Chen',
        photoURL: 'https://images.test/avatar.jpg',
        metadata: {
          creationTime: 'Tue, 01 Apr 2026 00:00:00 GMT',
        },
      },
    });

    expect(plan.publicProfilePatch.name).toBe('Avery Chen');
    expect(plan.publicProfilePatch.nameLower).toBe('avery chen');
    expect(plan.publicProfilePatch.photoUrl).toBe('https://images.test/avatar.jpg');
  });

  it('recognizes a fully migrated user as structurally healthy', () => {
    expect(
      isStructurallyBrokenUser(
        {
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
          updatedAt: new Date('2026-04-02T00:00:00.000Z'),
          migrationVersion: 2,
        },
        {
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
          updatedAt: new Date('2026-04-02T00:00:00.000Z'),
        },
        {
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
          updatedAt: new Date('2026-04-02T00:00:00.000Z'),
        },
        {
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
          updatedAt: new Date('2026-04-02T00:00:00.000Z'),
          friends: [],
          closeFriends: [],
          blocked: [],
        },
      ),
    ).toBe(false);
  });
});
