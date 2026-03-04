import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColor } from '@/hooks/use-theme-color';
import { withAlpha } from '@/utils/colors';
import { IconSymbol } from '@/components/ui/icon-symbol';

type Props = {
  title: string;
  description: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
};

export function FeatureUnavailableScreen({
  title,
  description,
  ctaLabel = 'Go back',
  onCtaPress,
}: Props) {
  const insets = useSafeAreaInsets();
  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const card = useThemeColor({}, 'card');
  const border = useThemeColor({}, 'border');

  return (
    <View style={[styles.container, { backgroundColor: background, paddingTop: insets.top + 24 }]}>
      <View style={[styles.card, { backgroundColor: card, borderColor: withAlpha(border, 0.85) }]}>
        <View style={[styles.iconWrap, { backgroundColor: withAlpha(primary, 0.12) }]}>
          <IconSymbol name="lock.fill" size={24} color={primary} />
        </View>
        <Text style={[styles.title, { color: text }]}>{title}</Text>
        <Text style={[styles.description, { color: muted }]}>{description}</Text>
        {onCtaPress ? (
          <Pressable onPress={onCtaPress} style={[styles.button, { backgroundColor: primary }]}>
            <Text style={styles.buttonLabel}>{ctaLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 14,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    marginTop: 4,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default FeatureUnavailableScreen;
