import { getFirebaseConfigStatus, getMissingFirebaseConfigKeys } from '../firebaseConfig';

describe('firebaseConfig', () => {
  it('marks config complete when all required values are present', () => {
    const status = getFirebaseConfigStatus({
      apiKey: 'api-key',
      authDomain: 'perched.firebaseapp.com',
      projectId: 'perched-prod',
      storageBucket: 'perched-prod.firebasestorage.app',
      messagingSenderId: '1234567890',
      appId: '1:1234567890:web:abc',
      measurementId: '',
    });

    expect(status.configured).toBe(true);
    expect(status.missingKeys).toEqual([]);
  });

  it('reports missing required keys after trimming whitespace', () => {
    expect(
      getMissingFirebaseConfigKeys({
        apiKey: ' api-key ',
        authDomain: '   ',
        projectId: 'perched-prod',
        storageBucket: '',
        messagingSenderId: '1234567890',
        appId: ' ',
      }),
    ).toEqual(['authDomain', 'storageBucket', 'appId']);
  });
});
