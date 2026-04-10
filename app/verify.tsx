import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import { Body, H1, Label } from '@/components/ui/typography';
import { Button } from '@/components/button';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { devLog } from '@/services/logger';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

function mapVerificationError(error: any) {
  const code = String(error?.code || '');
  if (code === 'resource-exhausted' || code === 'functions/resource-exhausted' || code === 'auth/too-many-requests') {
    return 'Too many verification attempts from this device. Wait a few minutes, then try again.';
  }
  if (code === 'unavailable' || code === 'functions/unavailable' || code === 'network-request-failed') {
    return 'Unable to send verification right now. Check your connection and try again.';
  }
  return 'Unable to send verification right now. Please try again.';
}

export default function Verify() {
  const { resendVerification, refreshUser, signOut, user } = useAuth();
  const color = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const danger = useThemeColor({}, 'danger');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        void (async () => {
          const ok = await refreshUser();
          if (ok) router.replace('/(tabs)/feed');
        })();
      }
      appState.current = nextState;
    });
    return () => {
      sub.remove();
    };
  }, [refreshUser, router]);

  async function doResend() {
    if (!resendVerification) return;
    setLoading(true);
    try {
      await resendVerification();
      setSent(true);
      setError(null);
    } catch (e) {
      devLog('resend error', e);
      setError(mapVerificationError(e));
    } finally {
      setLoading(false);
    }
  }

  async function startOver(pathname: '/signin' | '/signup') {
    setLoading(true);
    try {
      await signOut();
      router.replace(pathname);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <Atmosphere />
      <Label style={{ color: muted, marginBottom: 8 }}>Almost there</Label>
      <H1 style={{ color }}>Verify your email</H1>
      <Body style={{ color, marginTop: 12 }}>
        {user?.email
          ? `Check ${user.email} for a verification link. Open it to activate your account.`
          : 'Check your inbox for a verification link. Open it to activate your account.'}
      </Body>
      <Body style={{ color: muted, marginTop: -8 }}>
        If you do not see it, check spam or promotions, then use resend below if needed.
      </Body>

      <View style={{ height: 18 }} />

      <Button onPress={loading || sent ? undefined : doResend} style={loading || sent ? { opacity: 0.6 } : undefined}>
        {sent ? 'Sent' : 'Resend verification'}
      </Button>
      <View style={{ height: 12 }} />
      {error ? <Text style={{ color: danger }}>{error}</Text> : null}
      <View style={{ height: 12 }} />
      <Pressable
        onPress={async () => {
          setLoading(true);
          const ok = await refreshUser();
          setLoading(false);
          if (ok) router.replace('/(tabs)/feed');
        }}
      >
        <Text style={{ color: primary }}>I verified - continue</Text>
      </Pressable>
      <View style={{ height: 18 }} />
      <View style={[styles.secondaryCard, { borderColor: border, backgroundColor: card }]}>
        <Text style={{ color, fontWeight: '700' }}>Need to change email or restart?</Text>
        <Text style={{ color: muted, marginTop: 6 }}>
          You are still signed in with this unverified account. Sign out first to return to the start of signup.
        </Text>
        <View style={{ height: 12 }} />
        <Pressable
          onPress={() => {
            if (loading) return;
            void startOver('/signup');
          }}
          style={styles.inlineAction}
        >
          <Text style={{ color: primary, fontWeight: '700' }}>Use a different email</Text>
        </Pressable>
        <View style={{ height: 10 }} />
        <Pressable
          onPress={() => {
            if (loading) return;
            void startOver('/signin');
          }}
          style={styles.inlineAction}
        >
          <Text style={{ color: primary, fontWeight: '700' }}>Back to sign in</Text>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, position: 'relative' },
  secondaryCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  inlineAction: {
    alignSelf: 'flex-start',
  },
});
