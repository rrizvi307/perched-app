import Constants from 'expo-constants';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
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

export const unstable_settings = {
  initialRouteName: 'signin',
};

export default function RootLayout() {
  initErrorReporting();
  initAnalytics();

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
    void ensureDemoModeReady(user?.id);
  }, [user?.id]);

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
    if (!user || isDemoMode()) return;
    const runSync = async () => {
      try {
        const res = await syncPendingCheckins(5);
        if (res.synced > 0) {
          showToast(`Synced ${res.synced} check-in${res.synced === 1 ? '' : 's'}.`, 'success');
        }
        await syncPendingProfileUpdates(5);
      } catch {}
    };

    // Initialize push notifications
    const setupNotifications = async () => {
      try {
        const token = await initPushNotifications();
        if (token && user?.id) {
          // Save token to Firebase for Cloud Function notifications
          await savePushToken(user.id, token);
        }
        // Schedule weekly recap
        await scheduleWeeklyRecap();
      } catch (error) {
        console.error('Failed to setup notifications:', error);
      }
    };

    const initialTask = Platform.OS === 'web' ? null : InteractionManager.runAfterInteractions(() => {
      void runSync();
      void setupNotifications();
    });

    if (Platform.OS === 'web') {
      void runSync();
      // Skip notifications on web
    } else {
      // Also set up notification response handler
      const notificationSubscription = addNotificationResponseListener((response) => {
        // Handle notification tap - navigate based on type
        const notifType = response.notification.request.content.data?.type;
        if (notifType === 'achievement') {
          // Navigate to achievements screen when implemented
          // router.push('/achievements');
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
        sub.remove();
        notificationSubscription.remove();
      };
    }
  }, [showToast, user]);

  return (
    <ThemeProvider key={`${colorScheme}-${preference}`} value={colorScheme === 'dark' ? darkNavTheme : lightNavTheme}>
      <Stack
	        screenOptions={{
	          headerShown: false,
	          gestureEnabled: true,
	          fullScreenGestureEnabled: true,
	          gestureResponseDistance: { start: 70 },
	        }}
	      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="signin" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="checkin" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen
          name="settings"
	          options={{
	            headerShown: false,
	            gestureEnabled: true,
	            fullScreenGestureEnabled: true,
	            gestureResponseDistance: { start: 70 },
	          }}
	        />
        <Stack.Screen name="verify" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="upgrade" options={{ headerShown: false }} />
        <Stack.Screen name="premium-upgrade" options={{ headerShown: false }} />
        <Stack.Screen name="achievements" options={{ headerShown: false }} />
        <Stack.Screen name="admin-observability" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal', headerShown: true }} />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
