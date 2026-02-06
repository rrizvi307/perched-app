import { IconSymbol } from '@/components/ui/icon-symbol';
import SpotImage from '@/components/ui/spot-image';
import { useThemeColor } from '@/hooks/use-theme-color';
import { withAlpha } from '@/utils/colors';
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

  const coords = item.example?.spotLatLng || item.example?.location;

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
        <Text style={{ color: muted, marginTop: 6 }} numberOfLines={1}>{subtitle}</Text>
        <Text style={{ color: muted, marginTop: 6 }} numberOfLines={2}>
          {item.description || describeSpot(item.name, item.example?.address)}
          {item.distance !== undefined && item.distance !== Infinity ? ` · ${formatDistance(item.distance)}` : ''}
        </Text>
        {/* Utility Metrics Row */}
        {(item.avgWifiSpeed || item.avgBusyness || item.avgNoiseLevel || item.laptopFriendlyPct !== undefined) && (
          <View style={styles.metricsRow}>
            {item.avgWifiSpeed ? (
              <View style={[styles.metricBadge, { backgroundColor: withAlpha(primary, 0.12) }]}>
                <Text style={{ fontSize: 10 }}>
                  {item.avgWifiSpeed >= 4 ? '🚀' : item.avgWifiSpeed >= 3 ? '📶' : '📶'}
                </Text>
                <Text style={{ color: primary, fontSize: 10, fontWeight: '600', marginLeft: 2 }}>
                  {item.avgWifiSpeed >= 4 ? 'Fast' : item.avgWifiSpeed >= 3 ? 'OK' : 'Slow'}
                </Text>
              </View>
            ) : null}
            {item.avgNoiseLevel ? (
              <View style={[styles.metricBadge, { backgroundColor: withAlpha(accent, 0.12) }]}>
                <Text style={{ fontSize: 10 }}>
                  {item.avgNoiseLevel <= 2 ? '🤫' : item.avgNoiseLevel <= 3.5 ? '💬' : '🎉'}
                </Text>
                <Text style={{ color: accent, fontSize: 10, fontWeight: '600', marginLeft: 2 }}>
                  {item.avgNoiseLevel <= 2 ? 'Quiet' : item.avgNoiseLevel <= 3.5 ? 'Moderate' : 'Lively'}
                </Text>
              </View>
            ) : null}
            {item.avgBusyness ? (
              <View style={[styles.metricBadge, { backgroundColor: withAlpha(muted, 0.15) }]}>
                <Text style={{ fontSize: 10 }}>
                  {item.avgBusyness <= 2 ? '🧘' : item.avgBusyness <= 3 ? '👥' : '🔥'}
                </Text>
                <Text style={{ color: text, fontSize: 10, fontWeight: '600', marginLeft: 2 }}>
                  {item.avgBusyness <= 2 ? 'Calm' : item.avgBusyness <= 3 ? 'Moderate' : 'Busy'}
                </Text>
              </View>
            ) : null}
            {item.laptopFriendlyPct >= 70 ? (
              <View style={[styles.metricBadge, { backgroundColor: withAlpha('#22C55E', 0.15) }]}>
                <Text style={{ fontSize: 10 }}>💻</Text>
                <Text style={{ color: '#22C55E', fontSize: 10, fontWeight: '600', marginLeft: 2 }}>Laptop OK</Text>
              </View>
            ) : null}
          </View>
        )}
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
    prevProps.friendCount === nextProps.friendCount &&
    prevProps.index === nextProps.index &&
    prevProps.showRanks === nextProps.showRanks &&
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
  rankBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
});
