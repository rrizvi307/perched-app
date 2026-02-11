import Constants from 'expo-constants';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { withAlpha } from '@/utils/colors';
import {
  DEFAULT_FILTERS,
  type FilterState,
} from '@/services/filterPolicy';
export type { FilterState } from '@/services/filterPolicy';
export {
  CLIENT_FILTERS,
  DEFAULT_FILTERS,
  FIRESTORE_FILTERS,
  MAX_FIRESTORE_FILTERS,
  getActiveFilterCount,
  getActiveFirestoreFilterCount,
  hasActiveFilters,
  normalizeQueryFilters,
} from '@/services/filterPolicy';

const DISTANCE_OPTIONS = [0.5, 1, 2, 3, 5] as const;
const PRICE_OPTIONS: ('$' | '$$' | '$$$')[] = ['$', '$$', '$$$'];
const NOISE_OPTIONS: FilterState['noiseLevel'][] = ['any', 'quiet', 'moderate', 'loud'];

export function isIntelV1Enabled() {
  const raw = (Constants.expoConfig as any)?.extra?.INTEL_V1_ENABLED;
  return raw === true || raw === 'true' || raw === 1 || raw === '1';
}

export function FilterBottomSheet({
  visible,
  onDismiss,
  onApply,
  currentFilters,
}: {
  visible: boolean;
  onDismiss: () => void;
  onApply: (filters: FilterState) => void;
  currentFilters?: FilterState;
}) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const primary = useThemeColor({}, 'primary');
  const accent = useThemeColor({}, 'accent');

  const intelEnabled = useMemo(() => isIntelV1Enabled(), []);
  const [local, setLocal] = useState<FilterState>(currentFilters || DEFAULT_FILTERS);

  useEffect(() => {
    if (!visible) return;
    setLocal(currentFilters || DEFAULT_FILTERS);
  }, [visible, currentFilters]);

  function togglePrice(level: '$' | '$$' | '$$$') {
    setLocal((prev) => {
      if (prev.priceLevel.includes(level)) {
        return { ...prev, priceLevel: prev.priceLevel.filter((p) => p !== level) };
      }
      return { ...prev, priceLevel: [...prev.priceLevel, level] };
    });
  }

  function renderChip({
    label,
    selected,
    onPress,
  }: {
    label: string;
    selected: boolean;
    onPress: () => void;
  }) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.chip,
          {
            borderColor: selected ? primary : border,
            backgroundColor: selected ? withAlpha(primary, 0.14) : pressed ? withAlpha(primary, 0.08) : card,
          },
        ]}
      >
        <Text style={{ color: selected ? primary : text, fontWeight: selected ? '700' : '600' }}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={[styles.sheet, { borderColor: border, backgroundColor: card }]} onPress={() => undefined}>
          <View style={[styles.handle, { backgroundColor: withAlpha(text, 0.2) }]} />
          <Text style={[styles.title, { color: text }]}>Filters</Text>
          <Text style={{ color: muted, marginTop: 4, marginBottom: 12 }}>
            {intelEnabled ? 'Tune results using live + inferred intelligence.' : 'Basic filter mode is active.'}
          </Text>

          <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={styles.content}>
            <View style={styles.rowBlock}>
              <Text style={[styles.sectionLabel, { color: text }]}>Distance</Text>
              <View style={styles.chipRow}>
                {DISTANCE_OPTIONS.map((mile) =>
                  renderChip({
                    label: `${mile} mi`,
                    selected: local.distance === mile,
                    onPress: () => setLocal((prev) => ({ ...prev, distance: mile })),
                  })
                )}
              </View>
            </View>

            <View style={styles.rowBlock}>
              <View style={styles.switchRow}>
                <Text style={[styles.sectionLabel, { color: text }]}>Open now</Text>
                <Switch
                  value={local.openNow}
                  onValueChange={(value) => setLocal((prev) => ({ ...prev, openNow: value }))}
                  trackColor={{ false: border, true: withAlpha(primary, 0.5) }}
                  thumbColor={local.openNow ? primary : '#FFFFFF'}
                />
              </View>
            </View>

            <View style={styles.rowBlock}>
              <Text style={[styles.sectionLabel, { color: text }]}>Price</Text>
              <View style={styles.chipRow}>
                {PRICE_OPTIONS.map((price) =>
                  renderChip({
                    label: price,
                    selected: local.priceLevel.includes(price),
                    onPress: () => togglePrice(price),
                  })
                )}
              </View>
            </View>

            {intelEnabled ? (
              <>
                <View style={styles.rowBlock}>
                  <Text style={[styles.sectionLabel, { color: text }]}>Noise level</Text>
                  <View style={styles.chipRow}>
                    {NOISE_OPTIONS.map((noise) =>
                      renderChip({
                        label: noise === 'any' ? 'Any' : noise[0].toUpperCase() + noise.slice(1),
                        selected: local.noiseLevel === noise,
                        onPress: () => setLocal((prev) => ({ ...prev, noiseLevel: noise })),
                      })
                    )}
                  </View>
                </View>

                <View style={styles.rowBlock}>
                  <View style={styles.switchRow}>
                    <Text style={[styles.sectionLabel, { color: text }]}>Not crowded right now</Text>
                    <Switch
                      value={local.notCrowded}
                      onValueChange={(value) => setLocal((prev) => ({ ...prev, notCrowded: value }))}
                      trackColor={{ false: border, true: withAlpha(primary, 0.5) }}
                      thumbColor={local.notCrowded ? primary : '#FFFFFF'}
                    />
                  </View>
                </View>

                <View style={styles.rowBlock}>
                  <View style={styles.switchRow}>
                    <Text style={[styles.sectionLabel, { color: text }]}>High rated (4+)</Text>
                    <Switch
                      value={local.highRated}
                      onValueChange={(value) => setLocal((prev) => ({ ...prev, highRated: value }))}
                      trackColor={{ false: border, true: withAlpha(primary, 0.5) }}
                      thumbColor={local.highRated ? primary : '#FFFFFF'}
                    />
                  </View>
                </View>

                <View style={styles.rowBlock}>
                  <View style={styles.switchRow}>
                    <Text style={[styles.sectionLabel, { color: text }]}>Good for studying</Text>
                    <Switch
                      value={local.goodForStudying}
                      onValueChange={(value) => setLocal((prev) => ({ ...prev, goodForStudying: value }))}
                      trackColor={{ false: border, true: withAlpha(primary, 0.5) }}
                      thumbColor={local.goodForStudying ? primary : '#FFFFFF'}
                    />
                  </View>
                </View>

                <View style={styles.rowBlock}>
                  <View style={styles.switchRow}>
                    <Text style={[styles.sectionLabel, { color: text }]}>Good for meetings</Text>
                    <Switch
                      value={local.goodForMeetings}
                      onValueChange={(value) => setLocal((prev) => ({ ...prev, goodForMeetings: value }))}
                      trackColor={{ false: border, true: withAlpha(primary, 0.5) }}
                      thumbColor={local.goodForMeetings ? primary : '#FFFFFF'}
                    />
                  </View>
                </View>
              </>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              onPress={() => setLocal(DEFAULT_FILTERS)}
              style={({ pressed }) => [
                styles.secondaryButton,
                { borderColor: border, backgroundColor: pressed ? withAlpha(primary, 0.08) : card },
              ]}
            >
              <Text style={{ color: muted, fontWeight: '700' }}>Reset</Text>
            </Pressable>
            <Pressable
              onPress={() => onApply(local)}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: pressed ? accent : primary },
              ]}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Apply Filters</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  handle: {
    width: 48,
    height: 5,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
  },
  content: {
    paddingBottom: 10,
  },
  rowBlock: {
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  primaryButton: {
    flex: 1.4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
});
