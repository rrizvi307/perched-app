const canOpenURL = jest.fn();
const openURL = jest.fn();
const handleDeepLink = jest.fn();

jest.mock('expo-linking', () => ({
  canOpenURL,
  openURL,
}));

jest.mock('../deepLinking', () => ({
  handleDeepLink,
}));

jest.mock('../logger', () => ({
  devLog: jest.fn(),
}));

describe('externalLinks', () => {
  beforeEach(() => {
    canOpenURL.mockReset();
    openURL.mockReset();
    handleDeepLink.mockReset();
  });

  it('detects internal perched links', async () => {
    const { isInternalPerchedUrl } = await import('../externalLinks');
    expect(isInternalPerchedUrl('perched://settings')).toBe(true);
    expect(isInternalPerchedUrl('app.perched://spot/abc')).toBe(true);
    expect(isInternalPerchedUrl('  PERCHEd://settings  ')).toBe(true);
    expect(isInternalPerchedUrl('https://perched.app/profile/user123')).toBe(true);
    expect(isInternalPerchedUrl('https://www.perched.app/c/abc')).toBe(true);
    expect(isInternalPerchedUrl('/spot?placeId=demo-place-catalina#top')).toBe(true);
    expect(isInternalPerchedUrl('https://www.google.com/maps?q=29.7604,-95.3698')).toBe(false);
  });

  it('routes internal links in app without external open', async () => {
    const { openExternalLink, resolveAndOpenLink } = await import('../externalLinks');
    handleDeepLink.mockReturnValue(true);

    const result = await openExternalLink('https://perched.app/settings');
    const details = await resolveAndOpenLink('https://perched.app/settings');

    expect(result).toBe(true);
    expect(handleDeepLink).toHaveBeenCalledWith('https://perched.app/settings');
    expect(canOpenURL).not.toHaveBeenCalled();
    expect(openURL).not.toHaveBeenCalled();
    expect(details).toMatchObject({
      decision: 'internal-route',
      destination: 'in-app-router',
      opened: true,
    });
  });

  it('routes relative internal links in app', async () => {
    const { resolveAndOpenLink } = await import('../externalLinks');
    handleDeepLink.mockReturnValue(true);

    const result = await resolveAndOpenLink('/spot?placeId=demo-place-catalina#intel');

    expect(result.decision).toBe('internal-route');
    expect(result.destination).toBe('in-app-router');
    expect(result.normalizedUrl).toBe('https://perched.app/spot?placeId=demo-place-catalina#intel');
    expect(handleDeepLink).toHaveBeenCalledWith('https://perched.app/spot?placeId=demo-place-catalina#intel');
  });

  it('opens external links with expo-linking', async () => {
    const { openExternalLink, resolveAndOpenLink } = await import('../externalLinks');
    canOpenURL.mockResolvedValue(true);

    const result = await openExternalLink('https://www.google.com/maps?q=29.7604,-95.3698');
    const details = await resolveAndOpenLink('https://www.google.com/maps?q=29.7604,-95.3698');

    expect(result).toBe(true);
    expect(canOpenURL).toHaveBeenCalledWith('https://www.google.com/maps?q=29.7604,-95.3698');
    expect(openURL).toHaveBeenCalledWith('https://www.google.com/maps?q=29.7604,-95.3698');
    expect(details).toMatchObject({
      decision: 'external-open',
      destination: 'system-handler',
      opened: true,
    });
  });

  it('treats mailto/tel/sms as external system handlers', async () => {
    const { resolveAndOpenLink } = await import('../externalLinks');
    canOpenURL.mockResolvedValue(true);

    const mailto = await resolveAndOpenLink('mailto:test@example.com');
    const tel = await resolveAndOpenLink('tel:+17135550199');
    const sms = await resolveAndOpenLink('sms:+17135550199');

    expect(mailto.decision).toBe('external-open');
    expect(tel.decision).toBe('external-open');
    expect(sms.decision).toBe('external-open');
    expect(openURL).toHaveBeenCalledWith('mailto:test@example.com');
    expect(openURL).toHaveBeenCalledWith('tel:+17135550199');
    expect(openURL).toHaveBeenCalledWith('sms:+17135550199');
  });

  it('returns false when external link cannot be opened', async () => {
    const { openExternalLink } = await import('../externalLinks');
    canOpenURL.mockResolvedValue(false);

    const result = await openExternalLink('mailto:test@example.com');

    expect(result).toBe(false);
    expect(openURL).not.toHaveBeenCalled();
  });

  it('fails closed on malformed links', async () => {
    const { resolveAndOpenLink } = await import('../externalLinks');
    const result = await resolveAndOpenLink('http://[::1');

    expect(result).toMatchObject({
      decision: 'invalid',
      destination: 'invalid',
      opened: false,
    });
    expect(handleDeepLink).not.toHaveBeenCalled();
    expect(canOpenURL).not.toHaveBeenCalled();
    expect(openURL).not.toHaveBeenCalled();
  });
});
