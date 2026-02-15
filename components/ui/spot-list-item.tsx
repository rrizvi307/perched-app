import SpotImage from '@/components/ui/spot-image';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { PlaceIntelligence } from '@/services/placeIntelligence';
import { withAlpha } from '@/utils/colors';
import Constants from 'expo-constants';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type SpotListItemProps = {
  item: any;
  index: number;
  tags: string[];
  friendCount: number;
  subtitle: string;
  mapKey: string | null;
  maxSpotCount: number;
  showRanks: boolean;
  intelligence?: PlaceIntelligence | null;
  onScorePress?: () => void;
  onPress: () => void;
  describeSpot: (name?: string, address?: string) => string;
  formatDistance: (distanceKm?: number) => string;
};

// Memoized component to prevent unnecessary re-renders
const SpotListItem = React.memo<SpotListItemProps>(({
  item,
  index,
  tags,
  friendCount,
  subtitle,
  mapKey,
  maxSpotCount,
  showRanks,
  intelligence,
  onScorePress,
  onPress,
  describeSpot,
  formatDistance,
}) => {
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const accent = useThemeColor({}, 'accent');
  const highlight = withAlpha(primary, 0.12);
  const badgeFill = withAlpha(accent, 0.16);
  const rawIntelFlag = (Constants.expoConfig as any)?.extra?.INTEL_V1_ENABLED;
  const intelV1Enabled = rawIntelFlag === true || rawIntelFlag === 'true' || rawIntelFlag === 1 || rawIntelFlag === '1';

  const coords = item.example?.spotLatLng || item.example?.location;
  const intelNoise = item?.display?.noise || item?.live?.noise || item?.intel?.inferredNoise;
  const intelNoiseSource = item?.display?.noiseSource || (item?.live?.noise ? 'live' : item?.intel?.inferredNoise ? 'inferred' : null);
  const intelRating = item?.intel?.avgRating || item?.rating;
  const intelPrice = item?.intel?.priceLevel;
  const workScore = intelligence?.workScore;
  const workScoreTone = typeof workScore === 'number'
    ? workScore >= 78
      ? '#22C55E'
      : workScore >= 62
        ? '#F59E0B'
        : '#F97316'
    : muted;
  const smartHighlight = intelligence?.highlights?.[0] || intelligence?.useCases?.[0] || null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderColor: border, backgroundColor: pressed ? highlight : card },
      ]}
    >
      {mapKey && coords ? (
        <SpotImage
          source={{
            uri: `https://maps.googleapis.com/maps/api/staticmap?center=${coords.lat},${coords.lng}&zoom=15&size=200x100&markers=color:red%7C${coords.lat},${coords.lng}${mapKey ? `&key=${mapKey}` : ''}`,
          }}
          style={styles.thumb}
        />
      ) : (
        <View style={[styles.thumb, { backgroundColor: border, alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ color: muted, fontSize: 11 }}>Map unavailable</Text>
        </View>
      )}
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ color: text, fontWeight: '700' }} numberOfLines={1}>{item.name}</Text>
        {intelligence ? (
          <View style={styles.smartRow}>
            <Pressable
              onPress={onScorePress}
              disabled={!onScorePress}
              style={[
                styles.workScoreBadge,
                {
                  borderColor: withAlpha(workScoreTone, 0.4),
                  backgroundColor: withAlpha(workScoreTone, 0.15),
                },
              ]}
            >
              <View style={[styles.workScoreDot, { backgroundColor: workScoreTone }]} />
              <Text style={{ color: workScoreTone, fontSize: 11, fontWeight: '800' }}>
                {Math.round(intelligence.workScore)} Work Score
              </Text>
            </Pressable>
            {intelligence.bestTime !== 'anytime' ? (
              <View style={[styles.bestTimeChip, { borderColor: border }]}>
                <Text style={{ color: muted, fontSize: 10, fontWeight: '700', textTransform: 'capitalize' }}>
                  Best {intelligence.bestTime}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {smartHighlight ? (
          <View style={[styles.highlightChip, { borderColor: border, backgroundColor: withAlpha(primary, 0.08) }]}>
            <Text style={{ color: text, fontSize: 11, fontWeight: '600' }} numberOfLines={1}>
              {smartHighlight}
            </Text>
          </View>
        ) : null}
        {/* Distance and walk time - prominent display */}
        {item.distance !== undefined && item.distance !== Infinity && item.distance > 0 ? (
          <Text style={{ color: primary, fontSize: 12, fontWeight: '600', marginTop: 4 }}>
            📍 {formatDistance(item.distance)}
          </Text>
        ) : null}
        {/* Here Now indicator */}
        {item.hereNowCount > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <View style={[styles.hereNowBadge, { backgroundColor: withAlpha('#10B981', 0.15) }]}>
              <View style={styles.hereNowDot} />
              <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '600', marginLeft: 4 }}>
                {item.hereNowCount} here now
              </Text>
            </View>
            {item.hereNowUsers && item.hereNowUsers.length > 0 ? (
              <View style={styles.avatarStack}>
                {item.hereNowUsers.slice(0, 3).map((user: any, idx: number) => (
                  <View
                    key={user.userId}
                    style={[
                      styles.miniAvatar,
                      { marginLeft: idx > 0 ? -8 : 4, zIndex: 3 - idx, borderColor: card }
                    ]}
                  >
                    {user.userPhotoUrl ? (
                      <SpotImage
                        source={{ uri: user.userPhotoUrl }}
                        style={{ width: 20, height: 20, borderRadius: 10 }}
                      />
                    ) : (
                      <Text style={{ fontSize: 10 }}>👤</Text>
                    )}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
        <Text style={{ color: muted, marginTop: 4, fontSize: 12 }} numberOfLines={1}>{subtitle}</Text>
        {/* Utility Metrics Row */}
        {(item.avgWifiSpeed || item.avgBusyness || item.avgNoiseLevel || item.topOutletAvailability) && (
          <View style={styles.metricsRow}>
            {item.avgWifiSpeed ? (
              <View style={[styles.metricBadge, {
                backgroundColor: item.avgWifiSpeed >= 4
                  ? withAlpha('#22C55E', 0.15)
                  : item.avgWifiSpeed >= 3
                  ? withAlpha('#F59E0B', 0.15)
                  : withAlpha('#EF4444', 0.15)
              }]}>
                <Text style={{ fontSize: 10 }}>
                  {item.avgWifiSpeed >= 4 ? '🚀' : item.avgWifiSpeed >= 3 ? '📶' : '📶'}
                </Text>
                <Text style={{
                  color: item.avgWifiSpeed >= 4 ? '#22C55E' : item.avgWifiSpeed >= 3 ? '#F59E0B' : '#EF4444',
                  fontSize: 10,
                  fontWeight: '600',
                  marginLeft: 2
                }}>
                  {item.avgWifiSpeed >= 4 ? 'Fast' : item.avgWifiSpeed >= 3 ? 'OK' : 'Slow'}
                </Text>
              </View>
            ) : null}
            {item.avgNoiseLevel ? (
              <View style={[styles.metricBadge, {
                backgroundColor: item.avgNoiseLevel <= 2
                  ? withAlpha('#22C55E', 0.15)
                  : item.avgNoiseLevel <= 3.5
                  ? withAlpha('#F59E0B', 0.15)
                  : withAlpha('#F97316', 0.15)
              }]}>
                <Text style={{ fontSize: 10 }}>
                  {item.avgNoiseLevel <= 2 ? '🤫' : item.avgNoiseLevel <= 3.5 ? '💬' : '🎉'}
                </Text>
                <Text style={{
                  color: item.avgNoiseLevel <= 2 ? '#22C55E' : item.avgNoiseLevel <= 3.5 ? '#F59E0B' : '#F97316',
                  fontSize: 10,
                  fontWeight: '600',
                  marginLeft: 2
                }}>
                  {item.avgNoiseLevel <= 2 ? 'Quiet' : item.avgNoiseLevel <= 3.5 ? 'Moderate' : 'Lively'}
                </Text>
              </View>
            ) : null}
            {item.avgBusyness ? (
              <View style={[styles.metricBadge, {
                backgroundColor: item.avgBusyness <= 2
                  ? withAlpha('#22C55E', 0.15)
                  : item.avgBusyness <= 3
                  ? withAlpha('#F59E0B', 0.15)
                  : withAlpha('#F97316', 0.15)
              }]}>
                <Text style={{ fontSize: 10 }}>
                  {item.avgBusyness <= 2 ? '🧘' : item.avgBusyness <= 3 ? '👥' : '🔥'}
                </Text>
                <Text style={{
                  color: item.avgBusyness <= 2 ? '#22C55E' : item.avgBusyness <= 3 ? '#F59E0B' : '#F97316',
                  fontSize: 10,
                  fontWeight: '600',
                  marginLeft: 2
                }}>
                  {item.avgBusyness <= 2 ? 'Calm' : item.avgBusyness <= 3 ? 'Moderate' : 'Busy'}
                </Text>
              </View>
            ) : null}
            {item.topOutletAvailability && (item.topOutletAvailability === 'plenty' || item.topOutletAvailability === 'some') ? (
              <View style={[styles.metricBadge, { backgroundColor: withAlpha('#22C55E', 0.15) }]}>
                <Text style={{ fontSize: 10 }}>🔌</Text>
                <Text style={{ color: '#22C55E', fontSize: 10, fontWeight: '600', marginLeft: 2 }}>
                  {item.topOutletAvailability === 'plenty' ? 'Outlets' : 'Some Outlets'}
                </Text>
              </View>
            ) : null}
          </View>
        )}
        {intelV1Enabled && (intelNoise || intelRating || intelPrice) ? (
          <View style={styles.metricsRow}>
            {intelNoise ? (
              <View style={[styles.metricBadge, { backgroundColor: withAlpha(intelNoiseSource === 'live' ? '#22C55E' : '#64748B', 0.15) }]}>
                <Text style={{ fontSize: 10 }}>{intelNoiseSource === 'live' ? '🔴' : '📊'}</Text>
                <Text style={{ color: intelNoiseSource === 'live' ? '#22C55E' : '#64748B', fontSize: 10, fontWeight: '700', marginLeft: 2 }}>
                  {String(intelNoise)}
                  {intelNoiseSource === 'inferred' ? ' (inferred)' : ''}
                </Text>
              </View>
            ) : null}
            {typeof intelRating === 'number' ? (
              <View style={[styles.metricBadge, { backgroundColor: withAlpha('#F59E0B', 0.15) }]}>
                <Text style={{ fontSize: 10 }}>⭐</Text>
                <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: '700', marginLeft: 2 }}>
                  {intelRating.toFixed(1)}
                </Text>
              </View>
            ) : null}
            {intelPrice ? (
              <View style={[styles.metricBadge, { backgroundColor: withAlpha('#06B6D4', 0.15) }]}>
                <Text style={{ color: '#0891B2', fontSize: 10, fontWeight: '700' }}>{intelPrice}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {intelV1Enabled && !intelNoise && !intelRating && !intelPrice ? (
          <Text style={{ color: muted, marginTop: 6, fontSize: 11 }}>No ratings yet</Text>
        ) : null}
        {tags.length > 0 && (
          <View style={styles.tagRow}>
            {tags.map((tag) => (
              <View key={`${item.name}-${tag}`} style={[styles.tagChip, { backgroundColor: badgeFill, borderColor: border }]}>
                <Text style={{ color: accent, fontSize: 11, fontWeight: '600' }}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
        {item.seed && item.rating ? (
          <Text style={{ color: muted, marginTop: 6 }} numberOfLines={1}>
            {item.rating ? `${item.rating.toFixed(1)} ★${item.ratingCount ? ` · ${item.ratingCount} reviews` : ''}` : ''}
          </Text>
        ) : null}
        {!item.seed && (
          <View style={[styles.countBar, { backgroundColor: border }]}>
            <View style={[styles.countFill, { backgroundColor: primary, width: `${Math.max(6, (item.count / maxSpotCount) * 100)}%` }]} />
          </View>
        )}
      </View>
      {showRanks && (
        <View style={[styles.rankBadge, { backgroundColor: badgeFill, borderColor: border }]}>
          <Text style={{ color: accent, fontSize: 11, fontWeight: '700' }}>{`#${index + 1}`}</Text>
        </View>
      )}
    </Pressable>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for better memoization
  return (
    prevProps.item.name === nextProps.item.name &&
    prevProps.item.count === nextProps.item.count &&
    prevProps.item.hereNowCount === nextProps.item.hereNowCount &&
    prevProps.item.intel?.avgRating === nextProps.item.intel?.avgRating &&
    prevProps.item.intel?.priceLevel === nextProps.item.intel?.priceLevel &&
    prevProps.item.display?.noise === nextProps.item.display?.noise &&
    prevProps.item.display?.noiseSource === nextProps.item.display?.noiseSource &&
    prevProps.friendCount === nextProps.friendCount &&
    prevProps.index === nextProps.index &&
    prevProps.showRanks === nextProps.showRanks &&
    prevProps.intelligence?.workScore === nextProps.intelligence?.workScore &&
    prevProps.intelligence?.bestTime === nextProps.intelligence?.bestTime &&
    (prevProps.intelligence?.highlights?.[0] || '') === (nextProps.intelligence?.highlights?.[0] || '') &&
    (prevProps.intelligence?.useCases?.[0] || '') === (nextProps.intelligence?.useCases?.[0] || '') &&
    prevProps.onScorePress === nextProps.onScorePress &&
    prevProps.tags.length === nextProps.tags.length &&
    prevProps.item.openNow === nextProps.item.openNow
  );
});

SpotListItem.displayName = 'SpotListItem';

export default SpotListItem;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  thumb: {
    width: 100,
    height: 80,
    borderRadius: 10,
  },
  smartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    flexWrap: 'wrap',
    gap: 6,
  },
  workScoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6,
  },
  workScoreDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  bestTimeChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  highlightChip: {
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  metricsRow: {
    flexDirection: 'row',
    marginTop: 8,
    flexWrap: 'wrap',
    gap: 6,
  },
  metricBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagRow: {
    flexDirection: 'row',
    marginTop: 8,
    flexWrap: 'wrap',
    gap: 6,
  },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  countBar: {
    height: 4,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  countFill: {
    height: '100%',
    borderRadius: 2,
  },
  hereNowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  hereNowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  miniAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#f0f0f0',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rankBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
});
