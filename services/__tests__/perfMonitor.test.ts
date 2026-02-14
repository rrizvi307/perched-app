import { isPermissionDeniedError } from '../permissionErrors';

describe('perfMonitor permission detection', () => {
  it('detects firebase permission-denied codes', () => {
    expect(isPermissionDeniedError({ code: 'permission-denied' })).toBe(true);
    expect(isPermissionDeniedError({ code: 'firestore/permission-denied' })).toBe(true);
  });

  it('detects permission errors by message fallback', () => {
    expect(isPermissionDeniedError({ message: 'Missing or insufficient permissions.' })).toBe(true);
    expect(isPermissionDeniedError({ code: 'PERMISSION_DENIED' })).toBe(true);
  });

  it('does not flag unrelated errors', () => {
    expect(isPermissionDeniedError({ code: 'unavailable', message: 'network timeout' })).toBe(false);
    expect(isPermissionDeniedError(null)).toBe(false);
  });
});
