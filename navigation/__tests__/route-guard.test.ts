import { getAuthRedirectTarget } from '../auth-routing';

describe('getAuthRedirectTarget', () => {
  it('waits until auth is ready before redirecting', () => {
    expect(
      getAuthRedirectTarget({
        authReady: false,
        segments: ['signin'],
        user: null,
      })
    ).toBeNull();
  });

  it('sends signed-out users on protected routes to signin', () => {
    expect(
      getAuthRedirectTarget({
        authReady: true,
        segments: ['(tabs)', 'feed'],
        user: null,
      })
    ).toBe('/signin');
  });

  it('allows signed-out users on public info routes', () => {
    expect(
      getAuthRedirectTarget({
        authReady: true,
        segments: ['support'],
        user: null,
      })
    ).toBeNull();
  });

  it('sends unverified users to verify from non-public routes', () => {
    expect(
      getAuthRedirectTarget({
        authReady: true,
        segments: ['checkin'],
        user: { email: 'user@example.com', emailVerified: false },
      })
    ).toBe('/verify');
  });

  it('allows unverified users to remain on verify', () => {
    expect(
      getAuthRedirectTarget({
        authReady: true,
        segments: ['verify'],
        user: { email: 'user@example.com', emailVerified: false },
      })
    ).toBeNull();
  });

  it('sends verified users away from auth landing routes', () => {
    expect(
      getAuthRedirectTarget({
        authReady: true,
        segments: ['signin'],
        user: { email: 'user@example.com', emailVerified: true },
      })
    ).toBe('/(tabs)/feed');
  });

  it('allows verified users to remain on public info routes', () => {
    expect(
      getAuthRedirectTarget({
        authReady: true,
        segments: ['terms'],
        user: { email: 'user@example.com', emailVerified: true },
      })
    ).toBeNull();
  });
});
