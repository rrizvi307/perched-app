jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Share: { share: jest.fn() },
}));

jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      APP_STORE_URL: 'https://apps.apple.com/app/perched-test/id123',
      PLAY_STORE_URL: 'https://play.google.com/store/apps/details?id=app.perched.test',
      DYNAMIC_LINK_DOMAIN: 'links.perched.test',
    },
  },
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

jest.mock('../analytics', () => ({
  track: jest.fn(),
}));

jest.mock('../firebaseClient', () => ({
  ensureFirebase: jest.fn(),
}));

jest.mock('../deepLinking', () => ({
  createDeepLink: (route: string, params?: Record<string, string>) =>
    route === 'invite'
      ? `https://perched.app/invite${params?.referralCode ? `?ref=${params.referralCode}` : ''}`
      : 'https://perched.app',
}));

describe('shareInvite helpers', () => {
  it('builds invite landing links on the canonical invite route', async () => {
    const { getInviteLandingUrl } = await import('../shareInvite');
    expect(getInviteLandingUrl('campus42')).toBe('https://perched.app/invite?ref=CAMPUS42');
  });

  it('builds dynamic invite links around the canonical landing URL', async () => {
    const { getInviteLink } = await import('../shareInvite');
    const link = getInviteLink('campus42');
    expect(link).toContain('https://links.perched.test/?');
    expect(link).toContain(encodeURIComponent('https://perched.app/invite?ref=CAMPUS42'));
  });

  it('selects platform-specific primary app URLs', async () => {
    const { getPrimaryAppUrl } = await import('../shareInvite');
    expect(getPrimaryAppUrl('ios')).toBe('https://apps.apple.com/app/perched-test/id123');
    expect(getPrimaryAppUrl('android')).toBe('https://play.google.com/store/apps/details?id=app.perched.test');
    expect(getPrimaryAppUrl('web')).toBe('https://perched.app');
  });

  it('builds story-card share URLs on the hosted web origin', async () => {
    const { generateStoryCardUrl } = await import('../shareInvite');
    const url = generateStoryCardUrl('Agora Coffee', 'https://img.test/agora.jpg', 'Rehan');
    expect(url).toContain('https://perched.app/story-card?');
    expect(url).toContain('spot=Agora+Coffee');
    expect(url).toContain('user=Rehan');
  });
});
