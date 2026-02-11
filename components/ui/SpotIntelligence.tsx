import { useThemeColor } from '@/hooks/use-theme-color';
import { formatTimeAgo, isStale } from '@/services/formatters';
import type { SpotDisplay, SpotIntel } from '@/services/spotSchema';
import { withAlpha } from '@/utils/colors';
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { ConfidenceBar } from './ConfidenceBar';

type SourceKind = 'live' | 'inferred' | 'blended';

interface SpotIntelligenceProps {
  intel?: SpotIntel | null;
  display?: SpotDisplay | null;
  liveCheckinCount?: number;
  containerStyle?: StyleProp<ViewStyle>;
  showAttribution?: boolean;
}

function titleizeMetric(value: string) {
  return value
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function hasSignals(intel?: SpotIntel | null, display?: SpotDisplay | null) {
  return Boolean(
    intel &&
      (
        intel.priceLevel ||
        typeof intel.avgRating === 'number' ||
        intel.inferredNoise ||
        intel.hasWifi ||
        intel.goodForStudying ||
        intel.goodForMeetings ||
        display?.noise ||
        display?.busyness
      )
  );
}

function buildNoiseText(
  display: SpotDisplay | null | undefined,
  intel: SpotIntel | null | undefined,
  liveCheckinCount: number
) {
  const noise = display?.noise || intel?.inferredNoise;
  if (!noise) return null;

  const explicit = display?.noiseLabel;
  if (explicit && explicit.trim() && explicit !== 'No data yet') return explicit;

  const source = (display?.noiseSource || (intel?.inferredNoise ? 'inferred' : undefined)) as SourceKind | undefined;
  const metric = titleizeMetric(noise);

  if (source === 'live' && liveCheckinCount > 0) return `${metric} (${liveCheckinCount} check-ins)`;
  if (source === 'blended') return `${metric} (blended)`;
  if (source === 'inferred') return `${metric} (inferred from reviews)`;
  return metric;
}

function buildBusynessText(display: SpotDisplay | null | undefined, liveCheckinCount: number) {
  const busyness = display?.busyness;
  if (!busyness) return null;

  const explicit = display?.busynessLabel;
  if (explicit && explicit.trim() && explicit !== 'No recent data') return explicit;

  const metric = titleizeMetric(busyness);
  if (liveCheckinCount > 0) return `${metric} (${liveCheckinCount} check-ins)`;
  return metric;
}

function getWifiLabel(confidence: number) {
  if (confidence >= 0.8) return 'Likely strong';
  if (confidence >= 0.5) return 'Likely available';
  return 'Mentioned in reviews';
}

export function SpotIntelligence({
  intel,
  display,
  liveCheckinCount = 0,
  containerStyle,
  showAttribution = true,
}: SpotIntelligenceProps) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const success = useThemeColor({}, 'success');
  const primary = useThemeColor({}, 'primary');
  const socialBlue = useThemeColor({}, 'socialBlue');

  const hasIntel = hasSignals(intel, display);
  const noiseText = buildNoiseText(display, intel, liveCheckinCount);
  const busynessText = buildBusynessText(display, liveCheckinCount);
  const noiseSource = (display?.noiseSource || (intel?.inferredNoise ? 'inferred' : undefined)) as SourceKind | undefined;
  const hasStaleIntel = Boolean(intel?.lastUpdated && isStale(intel.lastUpdated));

  if (!hasIntel) {
    return (
      <View style={[styles.emptyContainer, { borderColor: border }, containerStyle]}>
        <Text style={[styles.emptyTitle, { color: text }]}>No intelligence yet</Text>
        <Text style={[styles.emptyDescription, { color: muted }]}>
          Be the first to check in with WiFi, noise, and busyness metrics.
        </Text>
        <Text style={[styles.emptyHint, { color: muted }]}>
          Your contribution helps everyone find better spots faster.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { borderColor: border }, containerStyle]}>
      <Text style={[styles.title, { color: text }]}>Spot Intelligence</Text>

      {intel?.priceLevel ? (
        <IntelligenceRow label="Price" value={intel.priceLevel} textColor={text} mutedColor={muted} />
      ) : null}

      {typeof intel?.avgRating === 'number' ? (
        <IntelligenceRow
          label="Rating"
          value={`${intel.avgRating.toFixed(1)} stars`}
          textColor={text}
          mutedColor={muted}
          source="inferred"
          sourceColors={{ live: success, inferred: muted, blended: socialBlue }}
        />
      ) : null}

      {noiseText ? (
        <>
          <IntelligenceRow
            label="Noise"
            value={noiseText}
            textColor={text}
            mutedColor={muted}
            source={noiseSource}
            sourceColors={{ live: success, inferred: muted, blended: socialBlue }}
          />
          {(noiseSource === 'inferred' || noiseSource === 'blended') && typeof intel?.inferredNoiseConfidence === 'number' ? (
            <ConfidenceBar confidence={intel.inferredNoiseConfidence} label="Noise confidence" />
          ) : null}
        </>
      ) : null}

      {busynessText ? (
        <IntelligenceRow
          label="Busyness"
          value={busynessText}
          textColor={text}
          mutedColor={muted}
          source={(display?.busynessSource || 'live') as SourceKind}
          sourceColors={{ live: success, inferred: muted, blended: socialBlue }}
        />
      ) : null}

      {intel?.hasWifi ? (
        <>
          <IntelligenceRow
            label="WiFi"
            value={getWifiLabel(intel.wifiConfidence)}
            textColor={text}
            mutedColor={muted}
            source="inferred"
            sourceColors={{ live: success, inferred: muted, blended: socialBlue }}
          />
          <ConfidenceBar confidence={intel.wifiConfidence} label="WiFi confidence" />
        </>
      ) : null}

      {intel?.goodForStudying || intel?.goodForMeetings ? (
        <View style={styles.tagRow}>
          {intel?.goodForStudying ? (
            <View style={[styles.tag, { borderColor: border, backgroundColor: withAlpha(primary, 0.12) }]}>
              <Text style={[styles.tagText, { color: text }]}>Good for studying</Text>
            </View>
          ) : null}
          {intel?.goodForMeetings ? (
            <View style={[styles.tag, { borderColor: border, backgroundColor: withAlpha(primary, 0.12) }]}>
              <Text style={[styles.tagText, { color: text }]}>Good for meetings</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {intel?.lastUpdated ? (
        <Text style={[styles.lastUpdated, { color: muted }]}>Updated {formatTimeAgo(intel.lastUpdated)}</Text>
      ) : null}

      {hasStaleIntel ? (
        <View style={[styles.staleWarning, { borderColor: '#F59E0B', backgroundColor: withAlpha('#F59E0B', 0.12) }]}>
          <Text style={styles.staleWarningText}>Data may be outdated. Check in to refresh this spot.</Text>
        </View>
      ) : null}

      {showAttribution ? (
        <Text style={[styles.attribution, { color: muted }]}>Ratings from Google + Yelp</Text>
      ) : null}
    </View>
  );
}

interface IntelligenceRowProps {
  label: string;
  value: string;
  textColor: string;
  mutedColor: string;
  source?: SourceKind;
  sourceColors?: Record<SourceKind, string>;
}

function IntelligenceRow({
  label,
  value,
  textColor,
  mutedColor,
  source,
  sourceColors,
}: IntelligenceRowProps) {
  const sourceLabel = source ? source.charAt(0).toUpperCase() + source.slice(1) : null;
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: mutedColor }]}>{label}</Text>
      <View style={styles.rowValueWrap}>
        <Text style={[styles.rowValue, { color: textColor }]}>{value}</Text>
        {source && sourceLabel && sourceColors ? (
          <View style={[styles.badge, { backgroundColor: sourceColors[source] || mutedColor }]}>
            <Text style={styles.badgeText}>{sourceLabel}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  rowLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  rowValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'flex-end',
  },
  rowValue: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    flexShrink: 1,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  tag: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  lastUpdated: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
  },
  staleWarning: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  staleWarningText: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '600',
  },
  attribution: {
    marginTop: 8,
    fontSize: 11,
  },
  emptyContainer: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptyDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  emptyHint: {
    fontSize: 12,
    marginTop: 6,
  },
});
