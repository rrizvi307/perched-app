import { normalizePhone } from '@/utils/phone';

export type SignupHandleAvailability =
  | 'idle'
  | 'checking'
  | 'available'
  | 'taken'
  | 'invalid';

export type SignupValidationInput = {
  email: string;
  password: string;
  passwordConfirm: string;
  handle: string;
  phone: string;
  city: string;
  loading: boolean;
  handleAvailability: SignupHandleAvailability;
};

export function validateSignupEmail(email: string) {
  return /\S+@\S+\.\S+/.test(email);
}

export function normalizeSignupHandle(handle: string) {
  return handle.trim().toLowerCase().replace(/^@+/, '');
}

export function isSignupHandleValid(handle: string) {
  return !!handle && handle.length >= 3 && /^[a-z0-9_.]{3,20}$/.test(handle);
}

export function deriveSignupFormState(input: SignupValidationInput) {
  const trimmedEmail = input.email.trim();
  const normalizedHandle = normalizeSignupHandle(input.handle);
  const normalizedPhone = input.phone.trim() ? normalizePhone(input.phone.trim()) : null;
  const isEmailValid = validateSignupEmail(trimmedEmail);
  const isPasswordValid = input.password.length >= 6;
  const passwordsMatch = input.password === input.passwordConfirm;
  const isHandleValid = isSignupHandleValid(normalizedHandle);
  const isCityValid = !!input.city;
  const handleReady =
    input.handleAvailability !== 'checking' &&
    input.handleAvailability !== 'taken' &&
    input.handleAvailability !== 'invalid';
  const canSubmit =
    isEmailValid &&
    isPasswordValid &&
    passwordsMatch &&
    isHandleValid &&
    isCityValid &&
    handleReady &&
    !input.loading;

  return {
    isEmailValid,
    isPasswordValid,
    passwordsMatch,
    normalizedPhone,
    normalizedHandle,
    isHandleValid,
    isCityValid,
    handleReady,
    canSubmit,
  };
}
