import { isExpoDevClientLink } from '../deepLinkGuards';

describe('deepLinkGuards', () => {
  it('returns true for expo dev and expo go links', () => {
    expect(isExpoDevClientLink('exp://192.168.0.2:8081')).toBe(true);
    expect(
      isExpoDevClientLink('app.perched://expo-development-client/?url=http%3A%2F%2F192.168.0.2%3A8081')
    ).toBe(true);
    expect(isExpoDevClientLink('perched://expo-go/something')).toBe(true);
  });

  it('returns false for app deep links', () => {
    expect(isExpoDevClientLink('perched://profile/user123')).toBe(false);
    expect(isExpoDevClientLink('https://perched.app/spot/abc')).toBe(false);
    expect(isExpoDevClientLink('')).toBe(false);
  });
});
