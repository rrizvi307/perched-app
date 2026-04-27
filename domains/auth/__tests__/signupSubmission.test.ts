import {
  mapSignupRegistrationError,
  type SignupSubmissionInput,
  submitSignupForm,
  withAsyncTimeout,
} from '../signupSubmission';

describe('mapSignupRegistrationError', () => {
  it('maps known auth errors to user-facing messages', () => {
    expect(mapSignupRegistrationError({ code: 'auth/email-already-in-use' })).toBe(
      'That email is already in use.',
    );
    expect(mapSignupRegistrationError({ code: 'network-request-failed' })).toBe(
      'Unable to create your account right now. Check your connection and try again.',
    );
  });
});

describe('withAsyncTimeout', () => {
  it('resolves the original promise when it completes in time', async () => {
    await expect(withAsyncTimeout(Promise.resolve('ok'), 50, 'task')).resolves.toBe('ok');
  });
});

describe('submitSignupForm', () => {
  const baseInput: SignupSubmissionInput = {
    email: 'user@example.com',
    password: 'hunter2',
    name: 'Maya Patel',
    city: 'Houston',
    campus: '',
    normalizedHandle: 'studyqueen',
    normalizedPhone: '+17135550123',
    coffeeIntentsPref: ['deep_work', 'group_study'],
    ambiancePreference: 'cozy' as const,
    isEmailValid: true,
    isPasswordValid: true,
    passwordsMatch: true,
    isHandleValid: true,
    isCityValid: true,
    handleAvailability: 'available' as const,
    canCheckHandleAvailability: true,
  };

  it('rejects missing device location before account creation', async () => {
    const register = jest.fn();
    await expect(
      submitSignupForm(baseInput, {
        findUserByHandle: jest.fn().mockResolvedValue(null),
        requestForegroundLocationWithStatus: jest.fn().mockResolvedValue({ coords: null }),
        register,
      }),
    ).resolves.toEqual({
      ok: false,
      authError:
        'Turn on location so we can confirm you are in one of the current launch markets before creating your account.',
    });
    expect(register).not.toHaveBeenCalled();
  });

  it('rejects taken handles before the launch-market gate', async () => {
    const register = jest.fn();
    await expect(
      submitSignupForm(baseInput, {
        findUserByHandle: jest.fn().mockResolvedValue({ id: 'existing-user' }),
        requestForegroundLocationWithStatus: jest.fn(),
        register,
      }),
    ).resolves.toEqual({
      ok: false,
      authError: 'That username is taken.',
    });
    expect(register).not.toHaveBeenCalled();
  });

  it('submits using the resolved market and campus type when validation passes', async () => {
    const register = jest.fn().mockResolvedValue(undefined);
    await expect(
      submitSignupForm(
        {
          ...baseInput,
          city: 'Phoenix',
          campus: 'Rice University',
        },
        {
          findUserByHandle: jest.fn().mockResolvedValue(null),
          requestForegroundLocationWithStatus: jest.fn().mockResolvedValue({
            coords: { lat: 29.7174, lng: -95.4018 },
          }),
          register,
        },
      ),
    ).resolves.toEqual({ ok: true });

    expect(register).toHaveBeenCalledWith(
      'user@example.com',
      'hunter2',
      'Maya Patel',
      'Houston',
      'studyqueen',
      'campus',
      'Rice University',
      '+17135550123',
      {
        coffeeIntents: ['deep_work', 'group_study'],
        ambiancePreference: 'cozy',
      },
    );
  });
});
