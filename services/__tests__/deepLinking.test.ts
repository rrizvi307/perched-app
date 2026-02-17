const push = jest.fn();
const track = jest.fn();
const canOpenURL = jest.fn();
const openURL = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push,
  },
}));

jest.mock('../analytics', () => ({
  track,
}));

jest.mock('../sentry', () => ({
  captureException: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn().mockResolvedValue(undefined),
  getItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-linking', () => ({
  parse: (input: string) => {
    const parsed = new URL(input);
    const queryParams: Record<string, string> = {};
    parsed.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });
    return {
      hostname: parsed.hostname || undefined,
      path: parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : undefined,
      queryParams: Object.keys(queryParams).length ? queryParams : undefined,
    };
  },
  getInitialURL: jest.fn().mockResolvedValue(null),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  canOpenURL,
  openURL,
}));

describe('deepLinking', () => {
  beforeEach(() => {
    push.mockReset();
    track.mockReset();
    canOpenURL.mockReset();
    openURL.mockReset();
  });

  it('parsesSettingsDeepLink', async () => {
    const { parseDeepLink } = await import('../deepLinking');
    const result = parseDeepLink('app.perched://settings');
    expect(result).toEqual({ route: 'settings', params: {} });
  });

  it('parsesExpoPrefix_support', async () => {
    const { parseDeepLink } = await import('../deepLinking');
    const result = parseDeepLink('perched://--/support');
    expect(result).toEqual({ route: 'support', params: {} });
  });

  it('routesSettings_withoutInvalidWarning', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { handleDeepLink } = await import('../deepLinking');

    const handled = handleDeepLink('app.perched://settings');

    expect(handled).toBe(true);
    expect(push).toHaveBeenCalledWith('/settings');
    expect(warnSpy).not.toHaveBeenCalledWith('Invalid deep link:', 'app.perched://settings');
    warnSpy.mockRestore();
  });

  it('routesExpoPrefix_support_withoutInvalidWarning', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { handleDeepLink } = await import('../deepLinking');

    const handled = handleDeepLink('perched://--/support');

    expect(handled).toBe(true);
    expect(push).toHaveBeenCalledWith('/support');
    expect(warnSpy).not.toHaveBeenCalledWith('Invalid deep link:', 'perched://--/support');
    warnSpy.mockRestore();
  });

  it('routesHostnameCheckin_withPathId', async () => {
    const { handleDeepLink, parseDeepLink } = await import('../deepLinking');

    const parsed = parseDeepLink('app.perched://checkin/abc123');
    expect(parsed).toEqual({ route: 'checkin', params: { checkinId: 'abc123' } });

    const handled = handleDeepLink('app.perched://checkin/abc123');
    expect(handled).toBe(true);
    expect(push).toHaveBeenCalledWith('/checkin-detail?cid=abc123');
  });

  it('openDeepLink_routesInternalWithoutExternalOpen', async () => {
    const { openDeepLink } = await import('../deepLinking');

    const handled = await openDeepLink('  https://perched.app/settings#top  ');

    expect(handled).toBe(true);
    expect(push).toHaveBeenCalledWith('/settings');
    expect(canOpenURL).not.toHaveBeenCalled();
    expect(openURL).not.toHaveBeenCalled();
  });

  it('openDeepLink_opensTrueExternalUrls', async () => {
    const { openDeepLink } = await import('../deepLinking');
    canOpenURL.mockResolvedValue(true);

    const handled = await openDeepLink('https://www.google.com/maps?q=29.7604,-95.3698');

    expect(handled).toBe(true);
    expect(canOpenURL).toHaveBeenCalledWith('https://www.google.com/maps?q=29.7604,-95.3698');
    expect(openURL).toHaveBeenCalledWith('https://www.google.com/maps?q=29.7604,-95.3698');
  });

  it('normalizesSpotLinkVariants_toCanonicalDestination', async () => {
    const { openDeepLink } = await import('../deepLinking');
    const variants = [
      'perched://spot?placeId=demo-place-catalina',
      'perched://--/spot?placeId=demo-place-catalina',
      'app.perched://spot/demo-place-catalina?placeId=demo-place-catalina',
      'https://perched.app/spot?placeId=demo-place-catalina',
      '/spot?placeId=demo-place-catalina',
    ];

    for (const variant of variants) {
      push.mockReset();
      const handled = await openDeepLink(variant);
      expect(handled).toBe(true);
      expect(push).toHaveBeenCalledWith('/spot?placeId=demo-place-catalina');
    }

    expect(canOpenURL).not.toHaveBeenCalled();
    expect(openURL).not.toHaveBeenCalled();
  });

  it('failsClosed_internalUnroutable_withoutExternalOpen', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { openDeepLink } = await import('../deepLinking');

    const handled = await openDeepLink('perched://--/does-not-exist');

    expect(handled).toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(canOpenURL).not.toHaveBeenCalled();
    expect(openURL).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('Invalid deep link:', 'perched://--/does-not-exist');
    warnSpy.mockRestore();
  });
});
