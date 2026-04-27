import {
  buildLocalAuthSessionUser,
  clearLocalAuthSession,
  createLocalDemoAuthSession,
  findLocalAuthSessionByEmail,
  loadLocalAuthSession,
  persistLocalAuthSession,
  type AuthStorageLike,
} from '../authLocal';

function createMemoryStorage(): AuthStorageLike {
  const map = new Map<string, string>();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

describe('buildLocalAuthSessionUser', () => {
  it('derives campusOrCity and trims preferences to the supported size', () => {
    expect(
      buildLocalAuthSessionUser({
        id: 'user-1',
        email: 'maya@example.com',
        name: 'Maya Patel',
        city: 'Houston',
        campus: 'Rice University',
        campusType: 'campus',
        handle: 'mayap',
        emailVerified: true,
        preferences: {
          coffeeIntents: ['deep_work', 'group_study', 'quiet_reading', 'late_night_open'],
          ambiancePreference: 'cozy',
        },
      }),
    ).toMatchObject({
      id: 'user-1',
      campusOrCity: 'Rice University',
      campusType: 'campus',
      coffeeIntents: ['deep_work', 'group_study', 'quiet_reading'],
      ambiancePreference: 'cozy',
      emailVerified: true,
    });
  });
});

describe('local auth storage helpers', () => {
  it('persists and reloads the local auth session', () => {
    const storage = createMemoryStorage();
    const session = buildLocalAuthSessionUser({
      id: 'user-1',
      email: 'maya@example.com',
      city: 'Houston',
      campusType: 'city',
      handle: 'mayap',
      emailVerified: true,
    });

    expect(persistLocalAuthSession(session, { appendToUserList: true, storage })).toBe(true);
    expect(loadLocalAuthSession(storage)).toEqual(session);
    expect(findLocalAuthSessionByEmail('MAYA@example.com', storage)).toEqual(session);
    expect(clearLocalAuthSession(storage)).toBe(true);
    expect(loadLocalAuthSession(storage)).toBeNull();
  });

  it('creates a demo auth session with sane defaults', () => {
    const demo = createLocalDemoAuthSession({ name: 'Demo User' });
    expect(demo.id.startsWith('local-')).toBe(true);
    expect(demo.email?.includes('@local')).toBe(true);
    expect(demo.city).toBe('Houston');
    expect(demo.campusType).toBe('city');
    expect(demo.emailVerified).toBe(true);
  });
});
