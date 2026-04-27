import { registerAuthAccount } from '../authRegistration';
import type { AuthStorageLike } from '../authLocal';

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

describe('registerAuthAccount', () => {
  it('rejects out-of-market signups before account creation', async () => {
    const createAccountWithEmail = jest.fn();

    await expect(
      registerAuthAccount(
        {
          email: 'user@example.com',
          password: 'hunter2',
          city: 'Phoenix',
          handle: 'studyqueen',
          campusType: 'city',
        },
        {
          isFirebaseConfigured: () => true,
          createAccountWithEmail,
          logEvent: jest.fn(),
        },
      ),
    ).rejects.toMatchObject({
      message:
        'Perched is currently available only in Houston, Austin, and select nearby universities.',
      code: 'auth/launch-market-restricted',
    });

    expect(createAccountWithEmail).not.toHaveBeenCalled();
  });

  it('returns a verified local user when Firebase is not configured', async () => {
    const logEvent = jest.fn();
    const storage = createMemoryStorage();
    const user = await registerAuthAccount(
      {
        email: 'user@example.com',
        password: 'hunter2',
        name: 'Maya Patel',
        city: 'Houston',
        handle: 'studyqueen',
        campusType: 'city',
      },
      {
        isFirebaseConfigured: () => false,
        createAccountWithEmail: jest.fn(),
        logEvent,
        storage,
      },
    );

    expect(user.email).toBe('user@example.com');
    expect(user.emailVerified).toBe(true);
    expect(logEvent).toHaveBeenCalledWith('user_registered_local', user.id, {
      city: 'Houston',
      campus: undefined,
      handle: 'studyqueen',
    });
  });

  it('returns an unverified remote user when Firebase registration succeeds', async () => {
    const createAccountWithEmail = jest.fn().mockResolvedValue({
      uid: 'firebase-user-1',
      email: 'user@example.com',
    });
    const logEvent = jest.fn();

    const user = await registerAuthAccount(
      {
        email: 'user@example.com',
        password: 'hunter2',
        name: 'Maya Patel',
        city: 'Houston',
        handle: 'studyqueen',
        campusType: 'city',
        preferences: {
          coffeeIntents: ['deep_work', 'group_study', 'quiet_reading', 'late_night_open'],
          ambiancePreference: 'cozy',
        },
      },
      {
        isFirebaseConfigured: () => true,
        createAccountWithEmail,
        logEvent,
      },
    );

    expect(createAccountWithEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
        city: 'Houston',
        campusOrCity: 'Houston',
        coffeeIntents: ['deep_work', 'group_study', 'quiet_reading'],
      }),
    );
    expect(user).toMatchObject({
      id: 'firebase-user-1',
      email: 'user@example.com',
      emailVerified: false,
      city: 'Houston',
      campusOrCity: 'Houston',
    });
    expect(logEvent).toHaveBeenCalledWith('user_registered', 'firebase-user-1', {
      city: 'Houston',
      campus: undefined,
      handle: 'studyqueen',
    });
  });
});
