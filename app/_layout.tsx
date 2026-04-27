import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemePreferenceProvider } from '@/contexts/ThemePreferenceContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ToastProvider, useToast } from '@/contexts/ToastContext';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppHeader } from '@/components/ui/app-header';
import { AppLaunchScreen } from '@/components/ui/app-launch-screen';
import { AnalyticsConsentDialog } from '@/components/analytics-consent';
import { getExpoFirebaseConfig } from '@/services/expoConfig';
import { AuthRouteGuard } from '@/navigation/route-guard';
import { Colors } from '@/constants/theme';
import { useAppBootstrap, useRootServicesBootstrap } from '@/bootstrap/app-bootstrap';

export const unstable_settings = {
  initialRouteName: 'signin',
};

export default function RootLayout() {
  useRootServicesBootstrap();

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
  const { authReady, user } = useAuth();
  const colorScheme = useColorScheme();
  const firebaseConfig = getExpoFirebaseConfig();
  const { showToast } = useToast();
  const activeUserId = user?.id && (!user.email || user.emailVerified) ? user.id : null;
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

  useAppBootstrap({
    activeUserId,
    colorScheme,
    firebaseConfig,
    showToast,
  });

  if (!authReady) {
    return <AppLaunchScreen />;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? darkNavTheme : lightNavTheme}>
      <AuthRouteGuard />
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
        <Stack.Screen
          name="settings"
          options={{
            title: 'Settings',
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
            gestureResponseDistance: { start: 70 },
          }}
        />
        <Stack.Screen name="verify" options={{ title: 'Verify Account', gestureEnabled: false, fullScreenGestureEnabled: false }} />
        <Stack.Screen name="upgrade" options={{ title: 'Account' }} />
        <Stack.Screen name="delete-account" options={{ title: 'Delete Account' }} />
        <Stack.Screen name="premium-upgrade" options={{ title: 'Upgrade' }} />
        <Stack.Screen name="achievements" options={{ title: 'Achievements' }} />
        <Stack.Screen name="admin-observability" options={{ title: 'Observability' }} />
        <Stack.Screen name="admin-reports" options={{ title: 'Reports' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal', headerShown: true }} />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <AnalyticsConsentDialog />
    </ThemeProvider>
  );
}
