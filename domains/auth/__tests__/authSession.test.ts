import {
  buildAuthProfileBackfill,
  buildAuthUserFromCached,
  buildAuthUserFromRemote,
  normalizeAuthLocationFields,
} from '../authSession';

describe('authSession helpers', () => {
  it('normalizes city and campus values from campusOrCity', () => {
    expect(normalizeAuthLocationFields({ campusType: 'city', campusOrCity: 'Houston' })).toEqual({
      city: 'Houston',
      campus: undefined,
      campusOrCity: 'Houston',
      campusType: 'city',
    });
    expect(normalizeAuthLocationFields({ campusType: 'campus', campusOrCity: 'Rice University' })).toEqual({
      city: undefined,
      campus: 'Rice University',
      campusOrCity: 'Rice University',
      campusType: 'campus',
    });
  });

  it('builds a fast cached auth user snapshot', () => {
    const user = buildAuthUserFromCached(
      { uid: 'u1', email: 'test@example.com', emailVerified: false, phoneNumber: '+17135550123' },
      {
        name: 'Rehan',
        handle: 'rehan',
        campusType: 'city',
        campusOrCity: 'Austin',
        photoUrl: 'https://cdn/profile.jpg',
        coffeeIntents: ['quiet'],
        ambiancePreference: 'cozy',
      }
    );

    expect(user).toEqual({
      id: 'u1',
      email: 'test@example.com',
      emailVerified: false,
      name: 'Rehan',
      handle: 'rehan',
      city: 'Austin',
      campus: undefined,
      campusOrCity: 'Austin',
      campusType: 'city',
      phone: '+17135550123',
      photoUrl: 'https://cdn/profile.jpg',
      coffeeIntents: ['quiet'],
      ambiancePreference: 'cozy',
    });
  });

  it('prefers remote profile data when building the merged auth user', () => {
    const user = buildAuthUserFromRemote({
      authUser: { uid: 'u1', email: 'test@example.com', emailVerified: true, phoneNumber: '+17135550123' },
      cached: {
        name: 'Old Name',
        handle: 'oldhandle',
        city: 'Houston',
        coffeeIntents: ['quiet'],
        ambiancePreference: 'cozy',
      },
      publicData: {
        name: 'New Name',
        handle: 'newhandle',
        campusType: 'campus',
        campusOrCity: 'Rice University',
        photoUrl: 'https://cdn/new.jpg',
        coffeeIntents: ['social'],
      },
      privateData: {
        phone: '+15125550123',
      },
    });

    expect(user).toEqual({
      id: 'u1',
      email: 'test@example.com',
      emailVerified: true,
      name: 'New Name',
      handle: 'newhandle',
      city: 'Houston',
      campus: 'Rice University',
      campusOrCity: 'Rice University',
      campusType: 'campus',
      phone: '+15125550123',
      photoUrl: 'https://cdn/new.jpg',
      coffeeIntents: ['social'],
      ambiancePreference: 'cozy',
    });
  });

  it('builds only the missing remote profile backfill fields', () => {
    const backfill = buildAuthProfileBackfill({
      cached: {
        name: 'Rehan',
        handle: 'rehan',
        city: 'Houston',
        campus: 'Rice University',
        campusOrCity: 'Rice University',
        campusType: 'campus',
        phone: '+17135550123',
        photoUrl: 'https://cdn/profile.jpg',
        coffeeIntents: ['quiet', 'study'],
        ambiancePreference: 'cozy',
      },
      publicData: {
        name: 'Rehan',
      },
      privateData: {},
      email: 'test@example.com',
    });

    expect(backfill).toEqual({
      handle: 'rehan',
      city: 'Houston',
      campus: 'Rice University',
      campusOrCity: 'Rice University',
      campusType: 'campus',
      phone: '+17135550123',
      photoUrl: 'https://cdn/profile.jpg',
      coffeeIntents: ['quiet', 'study'],
      ambiancePreference: 'cozy',
      email: 'test@example.com',
    });
  });
});
