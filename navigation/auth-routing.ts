type GuardUser = {
  email?: string;
  emailVerified?: boolean;
} | null;

type AuthRedirectParams = {
  authReady: boolean;
  segments: string[];
  user: GuardUser;
};

const PUBLIC_INFO_ROUTES = new Set(['privacy', 'reset', 'support', 'terms']);
const AUTH_LANDING_ROUTES = new Set(['index', 'signin', 'signup']);

function normalizeSegments(segments: string[]): string[] {
  return segments.filter((segment) => segment && !segment.startsWith('('));
}

function currentLeaf(segments: string[]): string {
  const normalized = normalizeSegments(segments);
  return normalized[normalized.length - 1] || 'index';
}

export function getAuthRedirectTarget({
  authReady,
  segments,
  user,
}: AuthRedirectParams): string | null {
  if (!authReady) return null;

  const leaf = currentLeaf(segments);
  const isPublicInfoRoute = PUBLIC_INFO_ROUTES.has(leaf);
  const isAuthLandingRoute = AUTH_LANDING_ROUTES.has(leaf);
  const isVerifyRoute = leaf === 'verify';
  const requiresAuthenticatedSession = !isPublicInfoRoute && !isAuthLandingRoute && !isVerifyRoute;

  if (!user) {
    if (leaf === 'index' || isVerifyRoute || requiresAuthenticatedSession) {
      return '/signin';
    }
    return null;
  }

  const needsEmailVerification = !!user.email && !user.emailVerified;
  if (needsEmailVerification) {
    if (!isVerifyRoute && !isPublicInfoRoute) {
      return '/verify';
    }
    return null;
  }

  if (isAuthLandingRoute || isVerifyRoute) {
    return '/(tabs)/feed';
  }

  return null;
}
