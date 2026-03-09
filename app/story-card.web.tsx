import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import SpotImage from '@/components/ui/spot-image';
import { tokens } from '@/constants/tokens';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { buildStoryCard, renderStoryCardSVG } from '@/services/storyCards';
import { withAlpha } from '@/utils/colors';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

type StoryMode = 'light' | 'dark';

function normalizeStoryMode(input: unknown, fallback: StoryMode): StoryMode {
  if (input === 'light' || input === 'dark') return input;
  return fallback;
}

export default function StoryCardWebScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const systemScheme = useColorScheme();

  const backgroundColor = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const primary = useThemeColor({}, 'primary');
  const highlight = withAlpha(primary, 0.12);

  const mode = normalizeStoryMode(params.mode, systemScheme === 'dark' ? 'dark' : 'light');
  const [svg, setSvg] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user?.id) return;
      setLoading(true);
      try {
        const payload = await buildStoryCard(user.id, { name: user.name, handle: user.handle });
        if (!active) return;
        setSvg(renderStoryCardSVG(payload, { mode, width: 1080, height: 1920 }));
      } catch {
        if (!active) return;
        setSvg(renderStoryCardSVG({ topSpots: [], totalPosts: 0, estimatedHours: 0, uniqueCount: 0 }, { mode, width: 1080, height: 1920 }));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [mode, user?.handle, user?.id, user?.name]);

  const dataUrl = useMemo(() => {
    if (!svg) return '';
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, [svg]);

  return (
    <ThemedView style={styles.container}>
      <Atmosphere variant="cool" />

      <View style={styles.body}>
        <View style={[styles.previewFrame, { borderColor: withAlpha(border, 0.9), backgroundColor: withAlpha(card, 0.98) }]}>
          {loading ? (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator color={primary} />
              <Text style={{ color: muted, marginTop: 8 }}>Building your recap…</Text>
            </View>
          ) : null}
          {dataUrl ? <SpotImage source={{ uri: dataUrl }} style={styles.image} /> : <View style={[styles.emptyState, { backgroundColor }]} />}
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              if (!dataUrl) return;
              try {
                window.open(dataUrl, '_blank', 'noopener,noreferrer');
              } catch {}
            }}
            disabled={!dataUrl || loading}
            style={({ pressed }) => [
              styles.actionButton,
              { borderColor: border, backgroundColor: pressed ? highlight : card },
              (!dataUrl || loading) ? { opacity: 0.6 } : null,
            ]}
          >
            <Text style={{ color: text, fontWeight: '800' }}>Open SVG</Text>
          </Pressable>
        </View>
        <Text style={{ color: muted, fontSize: 12, marginTop: 10 }}>
          Tip: open the card in a new tab, then right-click → “Save image as…”.
        </Text>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 18, paddingTop: 8 },
  previewFrame: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    width: '100%',
    aspectRatio: 9 / 16,
  },
  image: { width: '100%', height: '100%' },
  loadingOverlay: {
    position: 'absolute',
    zIndex: 2,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: { flex: 1 },
  actions: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.space.s12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
});
