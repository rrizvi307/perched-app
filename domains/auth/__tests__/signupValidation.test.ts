import {
  deriveSignupFormState,
  normalizeSignupHandle,
  validateSignupEmail,
} from '../signupValidation';

describe('validateSignupEmail', () => {
  it('accepts well-formed emails and rejects malformed ones', () => {
    expect(validateSignupEmail('user@example.com')).toBe(true);
    expect(validateSignupEmail('not-an-email')).toBe(false);
  });
});

describe('normalizeSignupHandle', () => {
  it('trims, lowercases, and strips leading @ characters', () => {
    expect(normalizeSignupHandle('  @@StudyQueen  ')).toBe('studyqueen');
  });
});

describe('deriveSignupFormState', () => {
  it('returns a submit-ready state for a valid form', () => {
    expect(
      deriveSignupFormState({
        email: 'user@example.com',
        password: 'hunter2',
        passwordConfirm: 'hunter2',
        handle: '@studyqueen',
        phone: '+1 (713) 555-0123',
        city: 'Houston',
        loading: false,
        handleAvailability: 'available',
      }),
    ).toMatchObject({
      isEmailValid: true,
      isPasswordValid: true,
      passwordsMatch: true,
      normalizedHandle: 'studyqueen',
      normalizedPhone: '+17135550123',
      isHandleValid: true,
      isCityValid: true,
      handleReady: true,
      canSubmit: true,
    });
  });

  it('blocks submit when handle availability is unresolved or invalid', () => {
    expect(
      deriveSignupFormState({
        email: 'user@example.com',
        password: 'hunter2',
        passwordConfirm: 'hunter2',
        handle: '@bad handle',
        phone: '',
        city: '',
        loading: false,
        handleAvailability: 'checking',
      }),
    ).toMatchObject({
      isHandleValid: false,
      isCityValid: false,
      handleReady: false,
      canSubmit: false,
    });
  });
});
