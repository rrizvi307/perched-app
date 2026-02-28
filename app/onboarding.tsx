import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import { Body, H1, Label } from '@/components/ui/typography';
import { useThemeColor } from '@/hooks/use-theme-color';
import Logo from '@/components/logo';
import { getPermissionPrimerSeen, setOnboardingComplete, setOnboardingProfile, setPermissionPrimerSeen } from '@/storage/local';
import { requestForegroundLocation } from '@/services/location';
import { reverseGeocodeCity } from '@/services/googleMaps';
import { DISCOVERY_INTENT_OPTIONS, type DiscoveryIntent } from '@/services/discoveryIntents';
import { withAlpha } from '@/utils/colors';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type OnboardingStep = 'welcome' | 'permissions' | 'taste';

const AMBIANCE_OPTIONS: { key: 'cozy' | 'modern' | 'rustic' | 'bright' | 'intimate' | 'energetic'; label: string }[] = [
  { key: 'cozy', label: 'Cozy' },
  { key: 'modern', label: 'Modern' },
  { key: 'rustic', label: 'Rustic' },
  { key: 'bright', label: 'Bright' },
  { key: 'intimate', label: 'Intimate' },
  { key: 'energetic', label: 'Energetic' },
];

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const primary = useThemeColor({}, 'primary');

  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [loading, setLoading] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState<boolean | null>(null);
  const [detectedCity, setDetectedCity] = useState<string>('Houston');
  const [coffeeIntents, setCoffeeIntents] = useState<DiscoveryIntent[]>([]);
  const [ambiancePreference, setAmbiancePreference] = useState<'cozy' | 'modern' | 'rustic' | 'bright' | 'intimate' | 'energetic' | null>(null);

  const permissionLabel = useMemo(() => {
    if (locationEnabled === true) return detectedCity ? `Location on · ${detectedCity}` : 'Location on';
    if (locationEnabled === false) return 'Location off';
    return 'Not set yet';
  }, [locationEnabled, detectedCity]);

  async function handleEnableLocation() {
    setLoading(true);
    try {
      await setPermissionPrimerSeen('location', true);
      const loc = await requestForegroundLocation({ ignoreCache: true });
      if (!loc) {
        setLocationEnabled(false);
        return;
      }
      setLocationEnabled(true);
      const city = await reverseGeocodeCity(loc.lat, loc.lng).catch(() => null);
      if (city) setDetectedCity(city);
    } finally {
      setLoading(false);
    }
  }

  async function finishOnboarding() {
    setLoading(true);
    try {
      const primerSeen = await getPermissionPrimerSeen('location').catch(() => false);
      if (!primerSeen && locationEnabled === true) {
        await setPermissionPrimerSeen('location', true).catch(() => {});
      }

      await setOnboardingProfile({
        city: detectedCity || undefined,
        campusOrCity: detectedCity || undefined,
        campusType: detectedCity ? 'city' : undefined,
        coffeeIntents: coffeeIntents.slice(0, 3),
        ambiancePreference,
      });
      await setOnboardingComplete(true);
      router.replace('/signup');
    } finally {
      setLoading(false);
    }
  }

  function toggleIntent(intent: DiscoveryIntent) {
    setCoffeeIntents((prev) => {
      if (prev.includes(intent)) return prev.filter((entry) => entry !== intent);
      if (prev.length >= 3) return prev;
      return [...prev, intent];
    });
  }

  return (
    <ThemedView style={styles.container}>
      <Atmosphere />
      <View style={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Logo size={68} variant="mark" label="Perched" />

        {step === 'welcome' ? (
          <View style={styles.section}>
            <Label style={{ color: muted, marginBottom: 8 }}>Welcome</Label>
            <H1 style={{ color: text }}>Find better spots, faster.</H1>
            <Body style={{ color: muted, marginTop: 10 }}>
              Perched helps you discover great work and study places with simple, real-time intelligence.
            </Body>

            <View style={[styles.infoCard, { borderColor: border, backgroundColor: card }]}>
              <Text style={[styles.infoTitle, { color: text }]}>How it works</Text>
              <Text style={{ color: muted }}>1. Discover spots nearby</Text>
              <Text style={{ color: muted }}>2. Check in with a photo + quick metrics</Text>
              <Text style={{ color: muted }}>3. Help the community find better places</Text>
            </View>

            <Pressable
              onPress={() => setStep('permissions')}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: pressed ? withAlpha(primary, 0.85) : primary },
              ]}
            >
              <Text style={styles.primaryButtonText}>Continue</Text>
            </Pressable>
          </View>
        ) : step === 'permissions' ? (
          <View style={styles.section}>
            <Label style={{ color: muted, marginBottom: 8 }}>Permissions</Label>
            <H1 style={{ color: text }}>Enable location</H1>
            <Body style={{ color: muted, marginTop: 10 }}>
              Location powers nearby discovery and better spot recommendations.
            </Body>

            <View style={[styles.permissionCard, { borderColor: border, backgroundColor: card }]}> 
              <Text style={[styles.permissionTitle, { color: text }]}>Location access</Text>
              <Text style={{ color: muted, marginTop: 6 }}>{permissionLabel}</Text>

              <Pressable
                onPress={handleEnableLocation}
                disabled={loading}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  {
                    borderColor: border,
                    backgroundColor: pressed ? withAlpha(primary, 0.08) : 'transparent',
                    opacity: loading ? 0.6 : 1,
                  },
                ]}
              >
                <Text style={{ color: text, fontWeight: '700' }}>
                  {locationEnabled ? 'Refresh location' : 'Enable location'}
                </Text>
              </Pressable>

              {Platform.OS !== 'web' ? (
                <Text style={{ color: muted, marginTop: 10, fontSize: 12 }}>
                  You can change this anytime in Settings.
                </Text>
              ) : null}
            </View>

            <Pressable
              onPress={() => setStep('taste')}
              disabled={loading}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: pressed ? withAlpha(primary, 0.85) : primary,
                  opacity: loading ? 0.6 : 1,
                },
              ]}
            >
              <Text style={styles.primaryButtonText}>{loading ? 'Loading…' : 'Continue'}</Text>
            </Pressable>

            <Pressable onPress={() => setStep('welcome')} style={styles.linkButton}>
              <Text style={{ color: muted, fontWeight: '600' }}>Back</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.section}>
            <Label style={{ color: muted, marginBottom: 8 }}>Personalize</Label>
            <H1 style={{ color: text }}>What brings you to coffee shops?</H1>
            <Body style={{ color: muted, marginTop: 10 }}>
              Pick what matters most. This helps us rank better spots from day one.
            </Body>

            <View style={[styles.infoCard, { borderColor: border, backgroundColor: card }]}>
              <Text style={[styles.infoTitle, { color: text }]}>Coffee intents (pick up to 3)</Text>
              <View style={styles.chipWrap}>
                {DISCOVERY_INTENT_OPTIONS.map((intent) => {
                  const intentKey = intent.key as DiscoveryIntent;
                  const active = coffeeIntents.includes(intentKey);
                  return (
                    <Pressable
                      key={intent.key}
                      onPress={() => toggleIntent(intentKey)}
                      style={({ pressed }) => [
                        styles.chip,
                        {
                          borderColor: border,
                          backgroundColor: active ? primary : pressed ? withAlpha(primary, 0.08) : 'transparent',
                        },
                      ]}
                    >
                      <Text style={{ color: active ? '#FFFFFF' : text, fontWeight: '700', fontSize: 12 }}>
                        {intent.emoji} {intent.shortLabel}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ color: muted, marginTop: 8, fontSize: 12 }}>
                {coffeeIntents.length ? `${coffeeIntents.length}/3 selected` : 'Optional, but recommended'}
              </Text>
            </View>

            <View style={[styles.infoCard, { borderColor: border, backgroundColor: card }]}>
              <Text style={[styles.infoTitle, { color: text }]}>Preferred ambiance (optional)</Text>
              <View style={styles.chipWrap}>
                {AMBIANCE_OPTIONS.map((option) => {
                  const active = ambiancePreference === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => setAmbiancePreference((prev) => (prev === option.key ? null : option.key))}
                      style={({ pressed }) => [
                        styles.chip,
                        {
                          borderColor: border,
                          backgroundColor: active ? primary : pressed ? withAlpha(primary, 0.08) : 'transparent',
                        },
                      ]}
                    >
                      <Text style={{ color: active ? '#FFFFFF' : text, fontWeight: '700', fontSize: 12 }}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Pressable
              onPress={finishOnboarding}
              disabled={loading}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: pressed ? withAlpha(primary, 0.85) : primary,
                  opacity: loading ? 0.6 : 1,
                },
              ]}
            >
              <Text style={styles.primaryButtonText}>{loading ? 'Finishing…' : 'Finish setup'}</Text>
            </Pressable>

            <Pressable onPress={() => setStep('permissions')} style={styles.linkButton}>
              <Text style={{ color: muted, fontWeight: '600' }}>Back</Text>
            </Pressable>
          </View>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  section: {
    marginTop: 24,
  },
  infoCard: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  permissionCard: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  permissionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  primaryButton: {
    marginTop: 20,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  secondaryButton: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  linkButton: {
    marginTop: 12,
    alignItems: 'center',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});
