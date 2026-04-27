import { Colors } from '@/constants/theme';
import { savePushToken } from '@/services/repositories/notificationRepository';
import { initAnalytics } from '@/services/analytics';
import { isAnalyticsConsentGranted, seedAnalyticsConsent } from '@/services/analyticsConsent';
import { initDeepLinking } from '@/services/deepLinking';
import { isDemoMode, ensureDemoModeReady } from '@/services/demoMode';
import { initErrorReporting } from '@/services/errorReporting';
import { refreshFirebaseAppCheckToken, seedCachedAppCheckToken } from '@/services/firebaseAppCheck';
import { seedCachedIdToken } from '@/services/repositories/authRepository';
import { devLog } from '@/services/logger';
import { endPerfMark, markPerfEvent, startPerfMark } from '@/services/perfMarks';
import { primeProviderProxyAccess } from '@/services/providerProxy';
import { learnUserPreferences } from '@/services/recommendations';
import {
  addNotificationResponseListener,
  hasPushNotificationPermission,
  initPushNotifications,
  scheduleWeeklyRecap,
} from '@/services/smartNotifications';
import { syncPendingCheckins, syncPendingProfileUpdates } from '@/services/syncPending';
import { cleanupDemoDataForRealUser } from '@/storage/local';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, InteractionManager, Platform } from 'react-native';

const APP_LAUNCH_MARK_ID = startPerfMark('app_launch_total');

type FirebaseConfigShape = Record<string, unknown> | null | undefined;

type UseAppBootstrapOptions = {
  activeUserId: string | null;
  colorScheme: string | null | undefined;
  firebaseConfig: FirebaseConfigShape;
  showToast: (message: string, tone?: 'success' | 'error' | 'warning' | 'info') => void;
};

export function ensureGlobalFirebaseConfig(firebaseConfig: FirebaseConfigShape) {
  if (
    Object.values(firebaseConfig || {}).some((value) => typeof value === 'string' && value.trim().length > 0) &&
    !(global as any).FIREBASE_CONFIG
  ) {
    (global as any).FIREBASE_CONFIG = firebaseConfig;
  }
}

export function useRootServicesBootstrap() {
  useEffect(() => {
    initErrorReporting();
  }, []);

  useEffect(() => {
    const cleanup = initDeepLinking();
    return cleanup;
  }, []);

  useEffect(() => {
    const initMarkId = startPerfMark('app_init_services');
    if (Platform.OS === 'web') {
      const timer = setTimeout(() => {
        void (async () => {
          try {
            await seedAnalyticsConsent();
            if (isAnalyticsConsentGranted()) {
              initAnalytics();
            }
          } finally {
            void endPerfMark(initMarkId, true);
          }
        })();
      }, 250);
      return () => clearTimeout(timer);
    }

    const task = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        try {
          await seedAnalyticsConsent();
          if (isAnalyticsConsentGranted()) {
            initAnalytics();
          }
        } finally {
          void endPerfMark(initMarkId, true);
        }
      })();
    });
    return () => task.cancel();
  }, []);
}

export function useAppBootstrap({
  activeUserId,
  colorScheme,
  firebaseConfig,
  showToast,
}: UseAppBootstrapOptions) {
  const appState = useRef(AppState.currentState);
  const notificationsInitializedForUser = useRef<string | null>(null);
  const interactiveMarked = useRef(false);
  const router = useRouter();

  ensureGlobalFirebaseConfig(firebaseConfig);

  useEffect(() => {
    let canceled = false;
    if (Platform.OS === 'web') {
      const timer = setTimeout(() => {
        if (!canceled) {
          void ensureDemoModeReady(activeUserId || undefined);
        }
      }, 200);
      return () => {
        canceled = true;
        clearTimeout(timer);
      };
    }
    const task = InteractionManager.runAfterInteractions(() => {
      if (!canceled) {
        void ensureDemoModeReady(activeUserId || undefined);
      }
    });
    return () => {
      canceled = true;
      task.cancel();
    };
  }, [activeUserId]);

  useEffect(() => {
    if (!activeUserId) return;
    if (isDemoMode()) return;
    void cleanupDemoDataForRealUser(activeUserId);
  }, [activeUserId]);

  useEffect(() => {
    if (interactiveMarked.current) return;
    const markInteractive = () => {
      if (interactiveMarked.current) return;
      interactiveMarked.current = true;
      void endPerfMark(APP_LAUNCH_MARK_ID, true);
      void markPerfEvent('app_launch_interactive');
    };

    if (Platform.OS === 'web') {
      const id = requestAnimationFrame(markInteractive);
      return () => cancelAnimationFrame(id);
    }

    const task = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(markInteractive);
    });
    return () => task.cancel();
  }, []);

  useEffect(() => {
    if (!activeUserId || isDemoMode()) return;
    const task = InteractionManager.runAfterInteractions(() => {
      void learnUserPreferences(activeUserId);
    });
    return () => task.cancel();
  }, [activeUserId]);

  useEffect(() => {
    void seedCachedIdToken();
    void seedCachedAppCheckToken();
  }, []);

  useEffect(() => {
    if (!activeUserId || isDemoMode()) return;
    let canceled = false;
    if (Platform.OS === 'web') {
      const timer = setTimeout(() => {
        if (canceled) return;
        void primeProviderProxyAccess(true);
        void refreshFirebaseAppCheckToken(true);
      }, 400);
      return () => {
        canceled = true;
        clearTimeout(timer);
      };
    }

    const task = InteractionManager.runAfterInteractions(() => {
      if (canceled) return;
      void primeProviderProxyAccess(true);
      void refreshFirebaseAppCheckToken(true);
    });
    return () => {
      canceled = true;
      task.cancel();
    };
  }, [activeUserId]);

  useEffect(() => {
    if (activeUserId) return;
    notificationsInitializedForUser.current = null;
  }, [activeUserId]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    try {
      const bg = colorScheme === 'dark' ? Colors.dark.background : Colors.light.background;
      document.body.style.backgroundColor = bg;
      document.documentElement.style.backgroundColor = bg;
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      document.body.style.width = '100%';
      document.body.style.maxWidth = '100%';
      document.body.style.minHeight = '100%';
      document.body.style.overflowX = 'hidden';
      document.body.style.display = 'block';
      document.documentElement.style.width = '100%';
      document.documentElement.style.maxWidth = '100%';
      document.documentElement.style.height = '100%';
      document.documentElement.style.margin = '0';
      document.documentElement.style.padding = '0';
      const root = document.getElementById('root') || document.getElementById('__next');
      if (root) {
        root.style.width = '100%';
        root.style.maxWidth = '100%';
        root.style.margin = '0';
        root.style.display = 'flex';
        root.style.flexDirection = 'column';
        root.style.alignItems = 'stretch';
        root.style.justifyContent = 'flex-start';
        root.style.height = '100%';
        root.style.boxSizing = 'border-box';
        Array.from(root.children).forEach((child) => {
          if (child instanceof HTMLElement) {
            child.style.width = '100%';
            child.style.maxWidth = '100%';
            child.style.margin = '0';
          }
        });
      }
    } catch {}
  }, [colorScheme]);

  useEffect(() => {
    if (!activeUserId || isDemoMode()) return;

    const runSync = async () => {
      const markId = startPerfMark('app_pending_sync');
      try {
        const res = await syncPendingCheckins(5);
        if (res.synced > 0) {
          showToast(`Synced ${res.synced} check-in${res.synced === 1 ? '' : 's'}.`, 'success');
        }
        await syncPendingProfileUpdates(5);
        void endPerfMark(markId, true);
      } catch (error) {
        void endPerfMark(markId, false, { error: String(error) });
      }
    };

    const setupNotifications = async () => {
      const markId = startPerfMark('app_notifications_setup');
      try {
        if (notificationsInitializedForUser.current === activeUserId) return;
        notificationsInitializedForUser.current = activeUserId;

        const token = await initPushNotifications({ requestPermission: false });
        if (token) {
          await savePushToken(activeUserId, token);
        }
        if (await hasPushNotificationPermission()) {
          await scheduleWeeklyRecap();
        }
        void endPerfMark(markId, true);
      } catch (error) {
        notificationsInitializedForUser.current = null;
        devLog('Failed to setup notifications:', error);
        void endPerfMark(markId, false, { error: String(error) });
      }
    };

    const initialTask =
      Platform.OS === 'web'
        ? null
        : InteractionManager.runAfterInteractions(() => {
            void runSync();
          });
    const notificationsTimer =
      Platform.OS === 'web'
        ? null
        : setTimeout(() => {
            void setupNotifications();
          }, 1200);

    if (Platform.OS === 'web') {
      void runSync();
      return () => {
        if (notificationsTimer) clearTimeout(notificationsTimer);
      };
    }

    const notificationSubscription = addNotificationResponseListener((response) => {
      const notifType = response.notification.request.content.data?.type;
      if (notifType === 'achievement') {
        router.push('/achievements');
      }
    });

    const sub = AppState.addEventListener('change', async (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        try {
          await refreshFirebaseAppCheckToken();
          const res = await syncPendingCheckins(5);
          if (res.synced > 0) {
            showToast(`Synced ${res.synced} check-in${res.synced === 1 ? '' : 's'}.`, 'success');
          }
        } catch {}
      }
      appState.current = next;
    });

    return () => {
      initialTask?.cancel?.();
      if (notificationsTimer) clearTimeout(notificationsTimer);
      sub.remove();
      notificationSubscription.remove();
    };
  }, [activeUserId, router, showToast]);
}
