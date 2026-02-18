import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import { Body, H1, Label } from '@/components/ui/typography';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { devLog } from '@/services/logger';
import { Button } from '@/components/button';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

export default function Verify() {
  const { resendVerification, refreshUser } = useAuth();
  const color = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const danger = useThemeColor({}, 'danger');
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
      const msg = (e as any)?.message || String(e);
      setError(`Unable to send verification: ${msg}`);
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
        Check your inbox for a verification link. Open it to activate your account. If you do not see it, check spam or promotions.
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
        <Text style={{ color: primary }}>I verified — continue</Text>
      </Pressable>
      {__DEV__ ? (
        <Pressable
          onPress={() => {
            router.replace('/(tabs)/feed');
          }}
          style={{ marginTop: 14 }}
        >
          <Text style={{ color: primary, fontWeight: '600' }}>Continue without email (dev)</Text>
        </Pressable>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, padding: 20, position: 'relative' } });
