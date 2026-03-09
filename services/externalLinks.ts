import * as ExpoLinking from 'expo-linking';
import { handleDeepLink } from '@/services/deepLinking';
import { devLog } from '@/services/logger';
import { classifyLink, isInternalPerchedUrl as isInternalPerchedUrlByRule, type LinkDecision } from './linkRouting';

export type ExternalLinkResult = {
  decision: LinkDecision;
  input: string;
  normalizedUrl: string | null;
  opened: boolean;
  destination: 'in-app-router' | 'system-handler' | 'blocked' | 'invalid';
  reason: string;
};

export function isInternalPerchedUrl(input: string | null | undefined): boolean {
  return isInternalPerchedUrlByRule(input);
}

export async function resolveAndOpenLink(input: string | null | undefined): Promise<ExternalLinkResult> {
  const raw = typeof input === 'string' ? input : '';
  const trimmed = raw.trim();
  const classification = classifyLink(trimmed);

  if (classification.decision === 'invalid' || !classification.normalizedUrl) {
    devLog('invalid link rejected', { input: raw, reason: classification.reason });
    return {
      decision: 'invalid',
      input: raw,
      normalizedUrl: null,
      opened: false,
      destination: 'invalid',
      reason: classification.reason,
    };
  }

  if (classification.decision === 'internal-route') {
    const handled = handleDeepLink(classification.normalizedUrl);
    devLog('link resolver', {
      input: raw,
      normalizedUrl: classification.normalizedUrl,
      decision: 'internal-route',
      destination: handled ? 'in-app-router' : 'blocked',
      handled,
    });
    return {
      decision: 'internal-route',
      input: raw,
      normalizedUrl: classification.normalizedUrl,
      opened: handled,
      destination: handled ? 'in-app-router' : 'blocked',
      reason: classification.reason,
    };
  }

  try {
    const supported = await ExpoLinking.canOpenURL(classification.normalizedUrl);
    if (!supported) {
      devLog('unsupported external link', { input: raw, normalizedUrl: classification.normalizedUrl });
      return {
        decision: 'external-open',
        input: raw,
        normalizedUrl: classification.normalizedUrl,
        opened: false,
        destination: 'blocked',
        reason: 'unsupported',
      };
    }
    await ExpoLinking.openURL(classification.normalizedUrl);
    devLog('link resolver', {
      input: raw,
      normalizedUrl: classification.normalizedUrl,
      decision: 'external-open',
      destination: 'system-handler',
      handled: true,
    });
    return {
      decision: 'external-open',
      input: raw,
      normalizedUrl: classification.normalizedUrl,
      opened: true,
      destination: 'system-handler',
      reason: classification.reason,
    };
  } catch (error) {
    devLog('external link open failed', {
      input: raw,
      normalizedUrl: classification.normalizedUrl,
      error: String(error),
    });
    return {
      decision: 'external-open',
      input: raw,
      normalizedUrl: classification.normalizedUrl,
      opened: false,
      destination: 'blocked',
      reason: 'open_failed',
    };
  }
}

export async function openExternalLink(input: string | null | undefined): Promise<boolean> {
  const result = await resolveAndOpenLink(input);
  return result.opened;
}
