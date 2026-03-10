jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        ENV: 'production',
      },
    },
  },
}));

jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    Version: '18.0',
  },
}));

jest.mock('expo-device', () => ({
  brand: 'Apple',
  modelName: 'iPhone',
  osName: 'iOS',
  osVersion: '18.0',
  deviceYearClass: 2024,
}));

jest.mock('../sentry', () => ({
  addBreadcrumb: jest.fn(),
}));

jest.mock('../logger', () => ({
  devLog: jest.fn(),
}));

jest.mock('../logEvent', () => ({
  logEvent: jest.fn(async () => {}),
}));

jest.unmock('../analytics');

import { addBreadcrumb } from '../sentry';
import {
  initAnalytics,
  trackEngagement,
  trackPremiumConversion,
  trackRevenue,
  trackScreen,
  trackTiming,
} from '../analytics';

describe('analytics wrapper event naming', () => {
  const mockedBreadcrumb = addBreadcrumb as jest.MockedFunction<typeof addBreadcrumb>;

  beforeAll(() => {
    (global as any).__DEV__ = false;
  });

  beforeEach(() => {
    mockedBreadcrumb.mockClear();
    initAnalytics();
    mockedBreadcrumb.mockClear();
  });

  it('uses semantic event names for wrapper helpers', () => {
    trackScreen('Feed');
    trackTiming('render', 'feed', 123);
    trackRevenue(9.99, 'USD');
    trackEngagement('weekly');

    const eventNames = mockedBreadcrumb.mock.calls.map((call) => call[0]);
    expect(eventNames).toEqual(
      expect.arrayContaining([
        'screen_viewed',
        'timing_recorded',
        'revenue_tracked',
        'engagement_tracked',
      ]),
    );
    expect(eventNames).not.toContain('app_opened');
  });

  it('tracks premium conversion with the dedicated premium event name', async () => {
    await trackPremiumConversion('annual');

    const eventNames = mockedBreadcrumb.mock.calls.map((call) => call[0]);
    expect(eventNames).toContain('premium_converted');
  });
});
