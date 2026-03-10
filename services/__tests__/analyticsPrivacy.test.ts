import { buildPasswordResetTelemetry } from '../analyticsPrivacy';

describe('analyticsPrivacy', () => {
  it('redacts raw email and only keeps presence + domain', () => {
    const telemetry = buildPasswordResetTelemetry('Test.User+alias@Example.COM');

    expect(telemetry).toEqual({
      email_present: true,
      email_domain: 'example.com',
    });
    expect(Object.values(telemetry).join(' ')).not.toContain('test.user');
    expect(Object.values(telemetry).join(' ')).not.toContain('alias');
  });

  it('handles empty email values safely', () => {
    expect(buildPasswordResetTelemetry('')).toEqual({ email_present: false });
    expect(buildPasswordResetTelemetry('   ')).toEqual({ email_present: false });
  });
});
