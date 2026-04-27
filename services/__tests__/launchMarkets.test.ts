import {
  findLaunchCampus,
  findLaunchCity,
  getLaunchLocationOptions,
  getLaunchMarketLocationRequiredMessage,
  getLaunchMarketSignupMessage,
  isWithinLaunchMarket,
  validateLaunchMarketSignup,
} from '../launchMarkets';

describe('launch markets', () => {
  it('matches supported launch cities and rejects unsupported ones', () => {
    expect(findLaunchCity('Houston')?.name).toBe('Houston');
    expect(findLaunchCity('Austin, TX')?.name).toBe('Austin');
    expect(findLaunchCity('Phoenix')).toBeNull();
  });

  it('matches supported nearby campuses and rejects unsupported campuses', () => {
    expect(findLaunchCampus('Rice')?.name).toBe('Rice University');
    expect(findLaunchCampus('UT Austin')?.name).toBe('University of Texas at Austin');
    expect(findLaunchCampus('Arizona State University')).toBeNull();
  });

  it('limits signup options to the supported launch cities and campuses', () => {
    expect(getLaunchLocationOptions('city', '')).toEqual(['Houston', 'Austin']);
    expect(getLaunchLocationOptions('city', 'phoenix')).toEqual([]);
    expect(getLaunchLocationOptions('campus', 'texas')).toContain('Texas A&M University');
    expect(getLaunchLocationOptions('campus', 'ucla')).toEqual([]);
  });

  it('allows supported selections and rejects unsupported selections', () => {
    expect(validateLaunchMarketSignup({ city: 'Houston', campus: null }).allowed).toBe(true);
    expect(validateLaunchMarketSignup({ city: 'Phoenix', campus: null })).toEqual({
      allowed: false,
      code: 'auth/launch-market-restricted',
      message: getLaunchMarketSignupMessage(),
    });
    expect(validateLaunchMarketSignup({ city: 'Phoenix', campus: 'Rice University' }).allowed).toBe(true);
  });

  it('rejects device locations outside the current launch footprint', () => {
    expect(isWithinLaunchMarket({ lat: 29.7604, lng: -95.3698 })).toBe(true);
    expect(isWithinLaunchMarket({ lat: 33.4484, lng: -112.0740 })).toBe(false);
    expect(validateLaunchMarketSignup({
      city: 'Houston',
      campus: null,
      deviceLocation: { lat: 33.4484, lng: -112.0740 },
    })).toEqual({
      allowed: false,
      code: 'auth/outside-launch-market',
      message: `${getLaunchMarketSignupMessage()} We will open more markets soon.`,
    });
  });

  it('exposes the location-required message for signup gating', () => {
    expect(getLaunchMarketLocationRequiredMessage()).toContain('Turn on location');
  });
});
