describe('linkRouting', () => {
  it('classifies internal scheme links (case-insensitive, trimmed)', async () => {
    const { classifyLink } = await import('../linkRouting');
    const result = classifyLink('  PERCHEd://settings  ');
    expect(result).toMatchObject({
      decision: 'internal-route',
      normalizedUrl: 'PERCHEd://settings',
      reason: 'internal_scheme',
    });
  });

  it('internalDomain_routesInternally', async () => {
    const { classifyLink } = await import('../linkRouting');
    const result = classifyLink('https://perched.app/spot/?placeId=abc#intel');
    expect(result).toMatchObject({
      decision: 'internal-route',
      reason: 'internal_host',
    });
    expect(result.normalizedUrl).toBe('https://perched.app/spot/?placeId=abc#intel');
  });

  it('classifies internal host links case-insensitively and trims whitespace', async () => {
    const { classifyLink } = await import('../linkRouting');
    const result = classifyLink('  HTTPS://WWW.PERCHED.APP/Support/?a=1#Top  ');
    expect(result).toMatchObject({
      decision: 'internal-route',
      reason: 'internal_host',
      normalizedUrl: 'https://www.perched.app/Support/?a=1#Top',
    });
  });

  it('classifies relative links as internal and normalizes to perched.app', async () => {
    const { classifyLink } = await import('../linkRouting');
    expect(classifyLink('/spot?placeId=abc')).toMatchObject({
      decision: 'internal-route',
      normalizedUrl: 'https://perched.app/spot?placeId=abc',
      reason: 'internal_relative',
    });
    expect(classifyLink('?mode=debug')).toMatchObject({
      decision: 'internal-route',
      normalizedUrl: 'https://perched.app/?mode=debug',
      reason: 'internal_relative',
    });
    expect(classifyLink('#section')).toMatchObject({
      decision: 'internal-route',
      normalizedUrl: 'https://perched.app/#section',
      reason: 'internal_relative',
    });
  });

  it('classifies external urls and explicit system schemes', async () => {
    const { classifyLink } = await import('../linkRouting');
    expect(classifyLink('https://www.google.com/maps?q=29.7604,-95.3698')).toMatchObject({
      decision: 'external-open',
      reason: 'external_host',
    });
    expect(classifyLink('mailto:test@example.com')).toMatchObject({
      decision: 'external-open',
      reason: 'external_scheme',
    });
    expect(classifyLink('tel:+17135550199')).toMatchObject({
      decision: 'external-open',
      reason: 'external_scheme',
    });
    expect(classifyLink('sms:+17135550199')).toMatchObject({
      decision: 'external-open',
      reason: 'external_scheme',
    });
  });

  it('fails closed for malformed/empty links', async () => {
    const { classifyLink } = await import('../linkRouting');
    expect(classifyLink('')).toMatchObject({
      decision: 'invalid',
      reason: 'empty',
      normalizedUrl: null,
    });
    expect(classifyLink('http://[::1')).toMatchObject({
      decision: 'invalid',
      reason: 'malformed',
      normalizedUrl: null,
    });
    expect(classifyLink('javascript:alert(1)')).toMatchObject({
      decision: 'invalid',
      reason: 'malformed',
      normalizedUrl: null,
    });
  });
});
