import { useAuth } from '@/contexts/AuthContext';
import { useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { getAuthRedirectTarget } from './auth-routing';

export function AuthRouteGuard() {
  const { authReady, user } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const rootNavigationState = useRootNavigationState();

  const redirectTarget = useMemo(
    () =>
      getAuthRedirectTarget({
        authReady,
        segments,
        user,
      }),
    [authReady, segments, user]
  );

  useEffect(() => {
    if (!rootNavigationState?.key) return;
    if (!redirectTarget) return;
    router.replace(redirectTarget as any);
  }, [redirectTarget, rootNavigationState?.key, router]);

  return null;
}
