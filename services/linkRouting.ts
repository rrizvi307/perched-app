export type LinkDecision = 'internal-route' | 'external-open' | 'invalid';

export interface LinkClassification {
  decision: LinkDecision;
  normalizedUrl: string | null;
  reason:
    | 'empty'
    | 'internal_scheme'
    | 'internal_host'
    | 'internal_relative'
    | 'external_host'
    | 'external_scheme'
    | 'malformed';
}

const INTERNAL_SCHEMES = new Set(['perched', 'app.perched', 'exp+perched']);
const INTERNAL_HOSTS = new Set(['perched.app', 'www.perched.app', 'app.perched']);
const INTERNAL_HOST_PREFIXES = ['perched.', 'www.perched.'];
const INTERNAL_BASE_URL = 'https://perched.app';
const EXTERNAL_SCHEMES = new Set(['http', 'https', 'mailto', 'tel', 'sms']);

function safeTrim(input: string | null | undefined): string {
  return typeof input === 'string' ? input.trim() : '';
}

function isInternalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();
  if (!host) return false;
  if (INTERNAL_HOSTS.has(host)) return true;
  return INTERNAL_HOST_PREFIXES.some((prefix) => host.startsWith(prefix));
}

function normalizeRelativeInternalUrl(raw: string): string {
  if (raw.startsWith('/')) return `${INTERNAL_BASE_URL}${raw}`;
  if (raw.startsWith('?') || raw.startsWith('#')) return `${INTERNAL_BASE_URL}/${raw}`;
  return `${INTERNAL_BASE_URL}/${raw}`;
}

function safeUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function classifyLink(rawInput: string | null | undefined): LinkClassification {
  const input = safeTrim(rawInput);
  if (!input) {
    return { decision: 'invalid', normalizedUrl: null, reason: 'empty' };
  }

  if (input.startsWith('/') || input.startsWith('?') || input.startsWith('#')) {
    return {
      decision: 'internal-route',
      normalizedUrl: normalizeRelativeInternalUrl(input),
      reason: 'internal_relative',
    };
  }

  const schemeMatch = input.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  const scheme = schemeMatch?.[1]?.toLowerCase() || '';
  if (scheme && INTERNAL_SCHEMES.has(scheme)) {
    return { decision: 'internal-route', normalizedUrl: input, reason: 'internal_scheme' };
  }

  const parsed = safeUrl(input);
  if (!parsed) {
    return { decision: 'invalid', normalizedUrl: null, reason: 'malformed' };
  }

  const normalized = parsed.toString();
  if (isInternalHost(parsed.hostname)) {
    return { decision: 'internal-route', normalizedUrl: normalized, reason: 'internal_host' };
  }

  const parsedScheme = parsed.protocol.replace(':', '').toLowerCase();
  if (EXTERNAL_SCHEMES.has(parsedScheme)) {
    return {
      decision: 'external-open',
      normalizedUrl: normalized,
      reason: parsedScheme === 'http' || parsedScheme === 'https' ? 'external_host' : 'external_scheme',
    };
  }

  return { decision: 'invalid', normalizedUrl: null, reason: 'malformed' };
}

export function isInternalPerchedUrl(rawInput: string | null | undefined): boolean {
  return classifyLink(rawInput).decision === 'internal-route';
}
