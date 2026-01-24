import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import { Body, H1, Label } from '@/components/ui/typography';
import { tokens } from '@/constants/tokens';
import { getLocationOptions } from '@/constants/locations';
import { reverseGeocodeCity, searchLocations } from '@/services/googleMaps';
import { useThemeColor } from '@/hooks/use-theme-color';
import Logo from '@/components/logo';
import PermissionSheet from '@/components/ui/permission-sheet';
import { getPermissionPrimerSeen, setOnboardingComplete, setOnboardingProfile, setPermissionPrimerSeen } from '@/storage/local';
import { getForegroundLocationIfPermitted, requestForegroundLocation } from '@/services/location';
import { withAlpha } from '@/utils/colors';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const color = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const primary = useThemeColor({}, 'primary');
  const surface = useThemeColor({}, 'surface');
  const background = useThemeColor({}, 'background');
  const highlight = withAlpha(primary, 0.1);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [campus, setCampus] = useState('');
  const [loading, setLoading] = useState(false);
  const [locStatus, setLocStatus] = useState<'idle' | 'granted' | 'denied'>('idle');
  const [showLocationPrimer, setShowLocationPrimer] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [cityTouched, setCityTouched] = useState(false);
  const [cityResults, setCityResults] = useState<string[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [campusQuery, setCampusQuery] = useState('');
  const [campusTouched, setCampusTouched] = useState(false);
  const [campusResults, setCampusResults] = useState<string[]>([]);
  const [campusLoading, setCampusLoading] = useState(false);
  const [detectingCity, setDetectingCity] = useState(false);
  const [geoBias, setGeoBias] = useState<{ lat: number; lng: number } | null>(null);
  const canContinue = !!city;
  const logoSize = height < 740 ? 56 : 64;

  useEffect(() => {
    if (city && !cityTouched) setCityQuery(city);
  }, [city, cityTouched]);

  useEffect(() => {
    if (campus && !campusTouched) setCampusQuery(campus);
  }, [campus, campusTouched]);

  useEffect(() => {
    (async () => {
      const pos = await getForegroundLocationIfPermitted();
      if (pos) setGeoBias(pos);
    })().catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!geoBias || cityTouched || city) return;
    setDetectingCity(true);
    (async () => {
      const detected = await reverseGeocodeCity(geoBias.lat, geoBias.lng);
      if (cancelled || !detected || cityTouched || city) return;
      setCity(detected);
      setCityQuery(detected);
    })()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDetectingCity(false);
      });
    return () => {
      cancelled = true;
    };
  }, [geoBias, cityTouched, city]);

  useEffect(() => {
    let alive = true;
    if (!cityQuery.trim()) {
      setCityResults([]);
      setCityLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      setCityLoading(true);
      try {
        const remote = await searchLocations(cityQuery, 'city', 8, geoBias || undefined);
        const names = remote.map((r) => r.name);
        const fallback = getLocationOptions('city', cityQuery).slice(0, 8);
        if (alive) setCityResults(names.length ? names : fallback);
      } catch {
        if (alive) setCityResults(getLocationOptions('city', cityQuery).slice(0, 8));
      } finally {
        if (alive) setCityLoading(false);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [cityQuery, geoBias]);

  useEffect(() => {
    let alive = true;
    if (!campusQuery.trim()) {
      setCampusResults([]);
      setCampusLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      setCampusLoading(true);
      try {
        const remote = await searchLocations(campusQuery, 'campus', 8, geoBias || undefined);
        const names = remote.map((r) => r.name);
        const fallback = getLocationOptions('campus', campusQuery).slice(0, 8);
        if (alive) setCampusResults(names.length ? names : fallback);
      } catch {
        if (alive) setCampusResults(getLocationOptions('campus', campusQuery).slice(0, 8));
      } finally {
        if (alive) setCampusLoading(false);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [campusQuery, geoBias]);

  async function handleContinue() {
    // onboarding now redirects to signup/signin flow
    if (!city) {
      alert('Please select a city to personalize your feed.');
      return;
    }
    setLoading(true);
    try {
      await setOnboardingProfile({ name: name.trim() || undefined, city: city.trim() || undefined, campus: campus.trim() || undefined });
      await setOnboardingComplete(true);
    } catch {}
    // navigate to signup
    router.push('/signup');
    setLoading(false);
  }

  async function requestLocation() {
    try {
      const seen = await getPermissionPrimerSeen('location');
      if (!seen) {
        setShowLocationPrimer(true);
        return;
      }
      const pos = await requestForegroundLocation();
      if (pos?.lat && pos?.lng) {
        setLocStatus('granted');
        setGeoBias({ lat: pos.lat, lng: pos.lng });
        if (!city && !cityTouched) {
          const detected = await reverseGeocodeCity(pos.lat, pos.lng);
          if (detected) {
            setCity(detected);
            setCityQuery(detected);
          }
        }
      } else {
        setLocStatus('denied');
      }
    } catch {
      setLocStatus('denied');
    }
  }

  return (
    <ThemedView style={styles.container}>
      <Atmosphere />
      {Platform.OS !== 'web' ? (
        <PermissionSheet
          visible={showLocationPrimer}
          title="Location access"
          body="Location helps show nearby third places and map pins."
          bullets={['We only store your spot when you check in', 'Exact location only for friends']}
          confirmLabel="Enable location"
          onConfirm={async () => {
            setShowLocationPrimer(false);
            await setPermissionPrimerSeen('location', true);
            await requestLocation();
          }}
          onCancel={() => setShowLocationPrimer(false)}
        />
      ) : null}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: Math.max(20, insets.top + 16), paddingBottom: insets.bottom + 180, flexGrow: 1 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          showsVerticalScrollIndicator={false}
        >
          <Logo size={logoSize} variant="mark" label="Perched" />
          <Label style={{ color: muted, opacity: 1, marginBottom: 8, marginTop: 8 }}>Welcome</Label>
          <H1 style={{ color }}>Find your people, in real places.</H1>
          <Body style={{ color, marginTop: 12 }}>
            See where friends are studying or working, then tap in with a photo and a note.
          </Body>

        <View style={{ height: 18 }} />
        <View style={[styles.infoCard, { borderColor: border, backgroundColor: surface }]}>
          <Text style={{ color, fontWeight: '700', marginBottom: 6 }}>Privacy built in</Text>
          <Text style={{ color: muted }}>Posts expire after 12 hours.</Text>
          <Text style={{ color: muted }}>Choose who sees each check-in.</Text>
          <Text style={{ color: muted }}>Exact locations stay with friends.</Text>
        </View>

        <TextInput
          placeholder="Your name"
          value={name}
          onChangeText={setName}
          maxLength={40}
          placeholderTextColor={muted}
          style={[styles.input, { borderColor: border, backgroundColor: background, fontSize: tokens.type.body.fontSize, color }]}
        />
        <Label style={{ color: muted, opacity: 1, marginBottom: 6 }}>City</Label>
        <TextInput
          placeholder="Search cities"
          placeholderTextColor={muted}
          value={cityQuery}
          onChangeText={(text) => {
            setCityTouched(true);
            setCityQuery(text);
          }}
          style={[styles.input, { borderColor: border, backgroundColor: background, fontSize: tokens.type.body.fontSize, color }]}
        />
        {detectingCity && !city ? <Text style={{ color: muted, marginBottom: 8 }}>Detecting your city...</Text> : null}
        {cityLoading ? <Text style={{ color: muted, marginBottom: 8 }}>Searching...</Text> : null}
        {cityQuery.trim().length ? (
          <View style={[styles.suggestionList, { borderColor: border, backgroundColor: background }]}>
            {(cityResults.length ? cityResults : getLocationOptions('city', cityQuery).slice(0, 8)).map((option) => (
              <Pressable
                key={option}
                onPress={() => {
                  setCity(option);
                  setCityQuery(option);
                  setCityTouched(true);
                }}
                style={({ pressed }) => [
                  styles.locationRow,
                  { borderColor: border, backgroundColor: pressed ? highlight : 'transparent' },
                ]}
              >
                <Text style={{ color, fontWeight: '600' }}>{option}</Text>
              </Pressable>
            ))}
            {!cityResults.length && !cityLoading ? (
              <Text style={{ color: muted, marginTop: 8 }}>No matches yet.</Text>
            ) : null}
          </View>
        ) : (
          <Text style={{ color: muted, marginBottom: 8 }}>Start typing to see matches.</Text>
        )}
        {geoBias && !cityQuery.trim().length ? (
          <Pressable
            onPress={async () => {
              setDetectingCity(true);
              const detected = await reverseGeocodeCity(geoBias.lat, geoBias.lng);
              setDetectingCity(false);
              if (!detected) return;
              setCityTouched(true);
              setCity(detected);
              setCityQuery(detected);
            }}
            style={[styles.inlineButton, { borderColor: border }]}
          >
            <Text style={{ color: primary, fontWeight: '600' }}>Use current city</Text>
          </Pressable>
        ) : null}
        {!city ? (
          <Text style={{ color: muted, marginBottom: 8 }}>Choose a city to personalize Explore.</Text>
        ) : null}

        <Label style={{ color: muted, opacity: 1, marginBottom: 6 }}>Campus (optional)</Label>
        <TextInput
          placeholder="Search campuses"
          placeholderTextColor={muted}
          value={campusQuery}
          onChangeText={(text) => {
            setCampusTouched(true);
            setCampusQuery(text);
          }}
          style={[styles.input, { borderColor: border, backgroundColor: background, fontSize: tokens.type.body.fontSize, color }]}
        />
        {campusLoading ? <Text style={{ color: muted, marginBottom: 8 }}>Searching...</Text> : null}
        {campusQuery.trim().length ? (
          <View style={[styles.suggestionList, { borderColor: border, backgroundColor: background }]}>
            {(campusResults.length ? campusResults : getLocationOptions('campus', campusQuery).slice(0, 8)).map((option) => (
              <Pressable
                key={option}
                onPress={() => {
                  setCampus(option);
                  setCampusQuery(option);
                  setCampusTouched(true);
                }}
                style={({ pressed }) => [
                  styles.locationRow,
                  { borderColor: border, backgroundColor: pressed ? highlight : 'transparent' },
                ]}
              >
                <Text style={{ color, fontWeight: '600' }}>{option}</Text>
              </Pressable>
            ))}
            {!campusResults.length && !campusLoading ? (
              <Text style={{ color: muted, marginTop: 8 }}>No matches yet.</Text>
            ) : null}
          </View>
        ) : (
          <Text style={{ color: muted, marginBottom: 8 }}>Add a campus to find classmates.</Text>
        )}

        <View style={{ height: 12 }} />

        <Pressable
          onPress={requestLocation}
          style={({ pressed }) => [
            styles.locationButton,
            { borderColor: border, backgroundColor: pressed ? highlight : 'transparent' },
            locStatus === 'granted' ? { opacity: 0.7 } : null,
          ]}
          disabled={locStatus === 'granted'}
        >
          <Text style={{ color: primary, fontWeight: '600' }}>
            {locStatus === 'granted' ? 'Location enabled' : 'Enable location (optional)'}
          </Text>
        </Pressable>

        <View style={{ height: 12 }} />

        <Pressable
          onPress={handleContinue}
          style={[styles.primary, { backgroundColor: primary }, loading || !canContinue ? { opacity: 0.5 } : undefined]}
          disabled={loading || !canContinue}
        >
          <Text style={styles.primaryText}>{loading ? 'Joining...' : !canContinue ? 'Select a city' : 'Get started'}</Text>
        </Pressable>
        <View style={{ height: 10 }} />
        <Pressable onPress={() => router.push('/signin')}>
          <Text style={{ color: primary, fontWeight: '600' }}>Already have an account? Sign in</Text>
        </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  scroll: { paddingHorizontal: 20 },
  input: { borderWidth: 1, padding: 12, borderRadius: 14, marginBottom: 12 },
  locationButton: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  inlineButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginBottom: 12, alignSelf: 'flex-start' },
  primary: { height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFFFF', fontWeight: '700' },
  infoCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  locationRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  suggestionList: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
  },
});
