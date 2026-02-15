import { useThemeColor } from '@/hooks/use-theme-color';
import type { PlaceIntelligence, ScoreBreakdown, ScoreFactorSource } from '@/services/placeIntelligence';
import { withAlpha } from '@/utils/colors';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = {
  visible: boolean;
  intelligence: PlaceIntelligence;
  checkinCount?: number;
  onDismiss: () => void;
};

const FACTOR_LABELS: { key: keyof ScoreBreakdown; label: string; icon: string }[] = [
  { key: 'wifi', label: 'WiFi', icon: '📶' },
  { key: 'noise', label: 'Noise', icon: '🔇' },
  { key: 'busyness', label: 'Busyness', icon: '👥' },
  { key: 'laptop', label: 'Laptop Friendly', icon: '💻' },
  { key: 'tags', label: 'Tags', icon: '🏷️' },
  { key: 'externalRating', label: 'External Rating', icon: '⭐' },
  { key: 'venueType', label: 'Venue Type', icon: '🏢' },
  { key: 'openStatus', label: 'Open / Closed', icon: '🕐' },
  { key: 'momentum', label: 'Trend', icon: '📈' },
];

function sourceLabel(source: ScoreFactorSource): string {
  switch (source) {
    case 'checkin':
      return 'From checkins';
    case 'inferred':
      return 'Inferred from reviews';
    case 'api':
      return 'External data';
    case 'none':
      return 'No data';
  }
}

function sourceColor(source: ScoreFactorSource): string {
  switch (source) {
    case 'checkin':
      return '#22C55E';
    case 'inferred':
      return '#F59E0B';
    case 'api':
      return '#3B82F6';
    case 'none':
      return '#94A3B8';
  }
}

export default function ScoreBreakdownSheet({ visible, intelligence, checkinCount, onDismiss }: Props) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');

  const workScore = intelligence.workScore;
  const scoreTone = workScore >= 78 ? '#22C55E' : workScore >= 62 ? '#F59E0B' : '#F97316';
  const breakdown = intelligence.scoreBreakdown;
  const hasInferred = breakdown
    ? Object.values(breakdown).some((factor: any) => factor?.source === 'inferred')
    : false;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={[styles.sheet, { borderColor: border, backgroundColor: card }]} onPress={() => {}}>
          <View style={[styles.handle, { backgroundColor: withAlpha(text, 0.2) }]} />

          <View style={styles.header}>
            <View
              style={[
                styles.scoreBubble,
                {
                  backgroundColor: withAlpha(scoreTone, 0.15),
                  borderColor: withAlpha(scoreTone, 0.4),
                },
              ]}
            >
              <Text style={{ color: scoreTone, fontSize: 28, fontWeight: '800' }}>{workScore}</Text>
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={{ color: text, fontSize: 18, fontWeight: '800' }}>Work Score</Text>
              <Text style={{ color: muted, fontSize: 13, marginTop: 2 }}>
                {Math.round(intelligence.confidence * 100)}% confidence
              </Text>
            </View>
          </View>

          <ScrollView style={styles.factorList} showsVerticalScrollIndicator={false}>
            {FACTOR_LABELS.map(({ key, label, icon }) => {
              const factor = breakdown[key];
              const value = typeof factor === 'object' && 'value' in factor
                ? factor.value
                : (factor as any)?.value ?? 0;
              const source: ScoreFactorSource | null =
                typeof factor === 'object' && 'source' in factor ? (factor as any).source : null;

              return (
                <View key={key} style={[styles.factorRow, { borderBottomColor: border }]}>
                  <Text style={{ fontSize: 16, width: 28 }}>{icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
                    {source ? (
                      <View style={[styles.sourcePill, { backgroundColor: withAlpha(sourceColor(source), 0.14) }]}>
                        <Text style={{ color: sourceColor(source), fontSize: 10, fontWeight: '700' }}>
                          {sourceLabel(source)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    style={{
                      color: value > 0 ? '#22C55E' : value < 0 ? '#F97316' : muted,
                      fontSize: 15,
                      fontWeight: '700',
                    }}
                  >
                    {value > 0 ? '+' : ''}
                    {value}
                  </Text>
                </View>
              );
            })}
          </ScrollView>

          <Text style={{ color: muted, fontSize: 12, textAlign: 'center', marginTop: 12, marginBottom: 8 }}>
            {(checkinCount ?? 0) > 0
              ? `Based on ${checkinCount} checkin${checkinCount === 1 ? '' : 's'}`
              : hasInferred
                ? 'Based on review analysis'
                : 'Limited data available'}
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 16,
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  scoreBubble: {
    width: 64,
    height: 64,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factorList: {
    maxHeight: 400,
  },
  factorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sourcePill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
});
