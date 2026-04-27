import {
  buildSignupLocationResults,
  hydrateSignupFromOnboardingProfile,
  resolveDetectedLaunchCity,
  resolveSignupCampusSelection,
  resolveSignupCitySelection,
} from '../signupEligibility';

describe('resolveDetectedLaunchCity', () => {
  it('accepts supported launch cities and clears the notice', () => {
    expect(resolveDetectedLaunchCity('Houston, TX')).toEqual({
      city: 'Houston',
      cityQuery: 'Houston',
      launchMarketNotice: null,
    });
  });

  it('surfaces a restriction notice for unsupported cities', () => {
    expect(resolveDetectedLaunchCity('Phoenix')).toEqual({
      city: '',
      cityQuery: 'Phoenix',
      launchMarketNotice:
        'Perched is currently available only in Houston, Austin, and select nearby universities. We will open more markets soon.',
    });
  });
});

describe('buildSignupLocationResults', () => {
  it('filters city search results to the launch footprint', () => {
    expect(
      buildSignupLocationResults('city', 'h', ['Houston, TX', 'Phoenix']),
    ).toEqual(['Houston']);
  });

  it('canonicalizes supported campus matches and falls back when remote results are empty', () => {
    expect(
      buildSignupLocationResults('campus', 'ut', ['UT Austin']),
    ).toEqual(['University of Texas at Austin']);
    expect(buildSignupLocationResults('campus', 'ucla', [])).toEqual([]);
  });
});

describe('selection helpers', () => {
  it('canonicalizes city and campus selections', () => {
    expect(resolveSignupCitySelection('Austin, TX')).toBe('Austin');
    expect(resolveSignupCampusSelection('Rice')).toEqual({
      campus: 'Rice University',
      city: 'Houston',
    });
  });
});

describe('hydrateSignupFromOnboardingProfile', () => {
  it('hydrates city, campus, and taste preferences from onboarding profile data', () => {
    expect(
      hydrateSignupFromOnboardingProfile({
        name: 'Maya Patel',
        campus: 'UT Austin',
        campusType: 'campus',
        coffeeIntents: ['deep_work', 'group_study', 'quiet_reading', 'late_night_open'],
        ambiancePreference: 'cozy',
      }),
    ).toEqual({
      name: 'Maya Patel',
      city: 'Austin',
      cityQuery: 'Austin',
      campus: 'University of Texas at Austin',
      campusQuery: 'University of Texas at Austin',
      coffeeIntentsPref: ['deep_work', 'group_study', 'quiet_reading'],
      ambiancePreference: 'cozy',
    });
  });
});
