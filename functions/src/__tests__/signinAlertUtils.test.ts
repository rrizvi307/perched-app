import {
  normalizeProviderError,
  resolveSendgridFailure,
  shouldThrottleSigninAlert,
} from '../signinAlertUtils';

describe('signinAlertUtils', () => {
  describe('shouldThrottleSigninAlert', () => {
    it('does not throttle when there is no previous send timestamp', () => {
      expect(shouldThrottleSigninAlert(0, 1_000, 120_000)).toBe(false);
      expect(shouldThrottleSigninAlert(-1, 1_000, 120_000)).toBe(false);
    });

    it('throttles when inside the configured throttle window', () => {
      expect(shouldThrottleSigninAlert(1_000, 100_000, 120_000)).toBe(true);
    });

    it('does not throttle at or beyond the boundary window', () => {
      expect(shouldThrottleSigninAlert(1_000, 121_000, 120_000)).toBe(false);
      expect(shouldThrottleSigninAlert(1_000, 180_000, 120_000)).toBe(false);
    });
  });

  describe('resolveSendgridFailure', () => {
    it('uses non-empty response text when available', () => {
      expect(resolveSendgridFailure(500, ' quota exceeded ')).toBe('quota exceeded');
    });

    it('falls back to status code token when response text is empty', () => {
      expect(resolveSendgridFailure(429, '')).toBe('sendgrid_429');
      expect(resolveSendgridFailure(503, null)).toBe('sendgrid_503');
    });
  });

  describe('normalizeProviderError', () => {
    it('prefers Error.message values', () => {
      expect(normalizeProviderError(new Error('timeout'))).toBe('timeout');
    });

    it('normalizes string and non-error values', () => {
      expect(normalizeProviderError(' network_down ')).toBe('network_down');
      expect(normalizeProviderError({ code: 'EFAIL' })).toBe('[object Object]');
    });
  });
});
