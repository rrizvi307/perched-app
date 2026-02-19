import Constants from 'expo-constants';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect, useRef } from 'react';
import { AppState, InteractionManager, Platform } from 'react-native';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemePreferenceProvider, useThemePreference } from '@/contexts/ThemePreferenceContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { initErrorReporting } from '@/services/errorReporting';
import { syncPendingCheckins, syncPendingProfileUpdates } from '@/services/syncPending';
import { ToastProvider, useToast } from '@/contexts/ToastContext';
import { Colors } from '@/constants/theme';
import { ensureDemoModeReady, isDemoMode } from '@/services/demoMode';
import { ErrorBoundary } from '@/components/error-boundary';
import { initDeepLinking } from '@/services/deepLinking';
import { initAnalytics } from '@/services/analytics';
import { learnUserPreferences } from '@/services/recommendations';
import { initPushNotifications, scheduleWeeklyRecap, addNotificationResponseListener } from '@/services/smartNotifications';
import { savePushToken } from '@/services/firebaseClient';
import { AppHeader } from '@/components/ui/app-header';
import { devLog } from '@/services/logger';
import { endPerfMark, markPerfEvent, startPerfMark } from '@/services/perfMarks';

export const unstable_settings = {
  initialRouteName: 'signin',
};

const APP_LAUNCH_MARK_ID = startPerfMark('app_launch_total');

export default function RootLayout() {
  useEffect(() => {
    const initMarkId = startPerfMark('app_init_services');
    try {
      initErrorReporting();
      initAnalytics();
    } finally {
      void endPerfMark(initMarkId, true);
    }
  }, []);

  useEffect(() => {
    // Initialize deep linking
    const cleanup = initDeepLinking();
    return cleanup;
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <ThemePreferenceProvider>
          <ToastProvider>
            <InnerApp />
          </ToastProvider>
        </ThemePreferenceProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

function InnerApp() {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const { preference } = useThemePreference();
  const mapsKey = (Constants.expoConfig as any)?.extra?.GOOGLE_MAPS_API_KEY;
  const firebaseConfig = (Constants.expoConfig as any)?.extra?.FIREBASE_CONFIG;
  const appState = useRef(AppState.currentState);
  const notificationsInitializedForUser = useRef<string | null>(null);
  const interactiveMarked = useRef(false);
  const { showToast } = useToast();
  const lightNavTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: Colors.light.primary,
      background: Colors.light.background,
      card: Colors.light.card,
      text: Colors.light.text,
      border: Colors.light.border,
      notification: Colors.light.accent,
    },
  };
  const darkNavTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: Colors.dark.primary,
      background: Colors.dark.background,
      card: Colors.dark.card,
      text: Colors.dark.text,
      border: Colors.dark.border,
      notification: Colors.dark.accent,
    },
  };

  if (mapsKey && !(global as any).GOOGLE_MAPS_API_KEY) {
    (global as any).GOOGLE_MAPS_API_KEY = mapsKey;
  }
  if (firebaseConfig && !(global as any).FIREBASE_CONFIG) {
    (global as any).FIREBASE_CONFIG = firebaseConfig;
  }

  useEffect(() => {
    let canceled = false;
    if (Platform.OS === 'web') {
      const timer = setTimeout(() => {
        if (!canceled) {
          void ensureDemoModeReady(user?.id);
        }
      }, 200);
      return () => {
        canceled = true;
        clearTimeout(timer);
      };
    }
    const task = InteractionManager.runAfterInteractions(() => {
      if (!canceled) {
        void ensureDemoModeReady(user?.id);
      }
    });
    return () => {
      canceled = true;
      task.cancel();
    };
  }, [user?.id]);

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
    if (!user?.id || isDemoMode()) return;
    const task = InteractionManager.runAfterInteractions(() => {
      void learnUserPreferences(user.id);
    });
    return () => task.cancel();
  }, [user?.id]);

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
    const userId = user?.id;
    if (!userId || isDemoMode()) return;
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

    // Initialize push notifications
    const setupNotifications = async () => {
      const markId = startPerfMark('app_notifications_setup');
      try {
        if (notificationsInitializedForUser.current === userId) return;
        notificationsInitializedForUser.current = userId;

        const token = await initPushNotifications();
        if (token) {
          // Save token to Firebase for Cloud Function notifications
          await savePushToken(userId, token);
        }
        // Schedule weekly recap
        await scheduleWeeklyRecap();
        void endPerfMark(markId, true);
      } catch (error) {
        notificationsInitializedForUser.current = null;
        devLog('Failed to setup notifications:', error);
        void endPerfMark(markId, false, { error: String(error) });
      }
    };

    const initialTask = Platform.OS === 'web' ? null : InteractionManager.runAfterInteractions(() => {
      void runSync();
    });
    const notificationsTimer = Platform.OS === 'web'
      ? null
      : setTimeout(() => {
        void setupNotifications();
      }, 1200);

    if (Platform.OS === 'web') {
      void runSync();
      // Skip notifications on web
    } else {
      // Also set up notification response handler
      const notificationSubscription = addNotificationResponseListener((response) => {
        // Handle notification tap - navigate based on type
        const notifType = response.notification.request.content.data?.type;
        if (notifType === 'achievement') {
          router.push('/achievements');
        }
      });

      const sub = AppState.addEventListener('change', async (next) => {
        if (appState.current.match(/inactive|background/) && next === 'active') {
          try {
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
    }
  }, [showToast, user?.id]);

  return (
    <ThemeProvider key={`${colorScheme}-${preference}`} value={colorScheme === 'dark' ? darkNavTheme : lightNavTheme}>
      <Stack
        screenOptions={{
          headerShown: true,
          header: (props) => <AppHeader {...props} />,
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
          gestureResponseDistance: { start: 70 },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="signin" options={{ title: 'Perched' }} />
        <Stack.Screen name="signup" options={{ title: 'Create Account' }} />
        <Stack.Screen name="onboarding" options={{ title: 'Welcome' }} />
        <Stack.Screen name="checkin" options={{ title: 'Check In', presentation: 'modal' }} />
        <Stack.Screen name="spot" options={{ title: 'Spot' }} />
        <Stack.Screen name="story-card" options={{ title: 'Story Card' }} />
        <Stack.Screen name="story-card.web" options={{ title: 'Story Card' }} />
        <Stack.Screen
          name="settings"
          options={{
            title: 'Settings',
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
            gestureResponseDistance: { start: 70 },
          }}
        />
        <Stack.Screen name="verify" options={{ title: 'Verify Account' }} />
        <Stack.Screen name="upgrade" options={{ title: 'Account' }} />
        <Stack.Screen name="premium-upgrade" options={{ title: 'Upgrade' }} />
        <Stack.Screen name="achievements" options={{ title: 'Achievements' }} />
        <Stack.Screen name="admin-observability" options={{ title: 'Observability' }} />
        <Stack.Screen name="admin-reports" options={{ title: 'Reports' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal', headerShown: true }} />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
