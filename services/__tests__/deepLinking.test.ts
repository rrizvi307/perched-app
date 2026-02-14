const push = jest.fn();
const track = jest.fn();

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
}));

describe('deepLinking', () => {
  beforeEach(() => {
    push.mockReset();
    track.mockReset();
  });

  it('parses settings deep links', async () => {
    const { parseDeepLink } = await import('../deepLinking');
    const result = parseDeepLink('app.perched://settings');
    expect(result).toEqual({ route: 'settings', params: {} });
  });

  it('routes settings deep links without invalid-link warnings', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { handleDeepLink } = await import('../deepLinking');

    const handled = handleDeepLink('app.perched://settings');

    expect(handled).toBe(true);
    expect(push).toHaveBeenCalledWith('/settings');
    expect(warnSpy).not.toHaveBeenCalledWith('Invalid deep link:', 'app.perched://settings');
    warnSpy.mockRestore();
  });

  it('routes hostname-form checkin links with path ids', async () => {
    const { handleDeepLink, parseDeepLink } = await import('../deepLinking');

    const parsed = parseDeepLink('app.perched://checkin/abc123');
    expect(parsed).toEqual({ route: 'checkin', params: { checkinId: 'abc123' } });

    const handled = handleDeepLink('app.perched://checkin/abc123');
    expect(handled).toBe(true);
    expect(push).toHaveBeenCalledWith('/checkin-detail?cid=abc123');
  });
});
