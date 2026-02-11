import { useThemeColor } from '@/hooks/use-theme-color';
import type { BestForCategory, HoursStatus, SmartSpotData, VibeTag } from '@/services/smartDataService';
import { withAlpha } from '@/utils/colors';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type SmartSpotInfoProps = {
  smartData: SmartSpotData;
  compact?: boolean;
};

// Icons and labels for "Best For" categories
const BEST_FOR_CONFIG: Record<BestForCategory, { icon: string; label: string }> = {
  dates: { icon: 'heart', label: 'Dates' },
  groups: { icon: 'people', label: 'Groups' },
  solo: { icon: 'person', label: 'Solo' },
  laptop_work: { icon: 'laptop', label: 'Laptop Work' },
  meetings: { icon: 'briefcase', label: 'Meetings' },
  reading: { icon: 'book', label: 'Reading' },
  studying: { icon: 'school', label: 'Studying' },
  casual_hangout: { icon: 'chatbubbles', label: 'Hangout' },
  quick_coffee: { icon: 'cafe', label: 'Quick Coffee' },
  brunch: { icon: 'restaurant', label: 'Brunch' },
};

// Vibe tag colors
const VIBE_COLORS: Record<VibeTag, string> = {
  cozy: '#F59E0B',
  modern: '#3B82F6',
  industrial: '#6B7280',
  vintage: '#A855F7',
  minimalist: '#10B981',
  artsy: '#EC4899',
  rustic: '#92400E',
  trendy: '#EF4444',
  quiet: '#6366F1',
  lively: '#F97316',
};

function CoffeeRating({ rating }: { rating: number }) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');

  // Display as coffee beans (filled/empty)
  const fullBeans = Math.floor(rating);
  const halfBean = rating % 1 >= 0.5;
  const emptyBeans = 5 - fullBeans - (halfBean ? 1 : 0);

  return (
    <View style={styles.ratingRow}>
      <Ionicons name="cafe" size={14} color="#92400E" />
      <Text style={[styles.ratingLabel, { color: text }]}>Coffee Quality</Text>
      <View style={styles.beansContainer}>
        {[...Array(fullBeans)].map((_, i) => (
          <Text key={`full-${i}`} style={styles.bean}>☕</Text>
        ))}
        {halfBean && <Text style={[styles.bean, { opacity: 0.5 }]}>☕</Text>}
        {[...Array(emptyBeans)].map((_, i) => (
          <Text key={`empty-${i}`} style={[styles.bean, { opacity: 0.2 }]}>☕</Text>
        ))}
      </View>
      <Text style={[styles.ratingValue, { color: muted }]}>{rating.toFixed(1)}</Text>
    </View>
  );
}

function HoursStatusBadge({ hours }: { hours: HoursStatus }) {
  if (!hours) return null;

  const bgColor = hours.isOpen
    ? hours.closingSoon
      ? withAlpha('#F59E0B', 0.15)
      : withAlpha('#10B981', 0.15)
    : withAlpha('#EF4444', 0.15);

  const textColor = hours.isOpen
    ? hours.closingSoon
      ? '#D97706'
      : '#059669'
    : '#DC2626';

  const statusText = hours.isOpen
    ? hours.closingSoon
      ? `Closes soon (${hours.closesAt})`
      : `Open until ${hours.closesAt}`
    : `Closed · Opens ${hours.opensAt}`;

  return (
    <View style={[styles.hoursBadge, { backgroundColor: bgColor }]}>
      <View style={[styles.statusDot, { backgroundColor: textColor }]} />
      <Text style={[styles.hoursText, { color: textColor }]}>{statusText}</Text>
    </View>
  );
}

function ExternalRatings({ smartData }: { smartData: SmartSpotData }) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');

  if (!smartData.googleRating && !smartData.yelpRating) return null;

  return (
    <View style={styles.externalRatings}>
      {smartData.googleRating && (
        <View style={styles.ratingBadge}>
          <Text style={styles.ratingIcon}>G</Text>
          <Text style={[styles.ratingNumber, { color: text }]}>
            {smartData.googleRating.toFixed(1)}
          </Text>
          <Text style={[styles.reviewCount, { color: muted }]}>
            ({smartData.googleReviewCount?.toLocaleString()})
          </Text>
        </View>
      )}
      {smartData.yelpRating && (
        <View style={styles.ratingBadge}>
          <Text style={[styles.ratingIcon, { color: '#D32323' }]}>Y</Text>
          <Text style={[styles.ratingNumber, { color: text }]}>
            {smartData.yelpRating.toFixed(1)}
          </Text>
          <Text style={[styles.reviewCount, { color: muted }]}>
            ({smartData.yelpReviewCount?.toLocaleString()})
          </Text>
        </View>
      )}
      {smartData.priceLevel && (
        <View style={styles.priceBadge}>
          <Text style={[styles.priceText, { color: text }]}>{smartData.priceLevel}</Text>
        </View>
      )}
    </View>
  );
}

function BestForSection({ bestFor, compact }: { bestFor: BestForCategory[]; compact?: boolean }) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const surface = useThemeColor({}, 'surface');

  if (!bestFor?.length) return null;

  const displayItems = compact ? bestFor.slice(0, 3) : bestFor;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: text }]}>Best For</Text>
      <View style={styles.tagsContainer}>
        {displayItems.map((category) => {
          const config = BEST_FOR_CONFIG[category];
          if (!config) return null;
          return (
            <View key={category} style={[styles.bestForTag, { backgroundColor: surface }]}>
              <Ionicons name={config.icon as any} size={12} color={muted} />
              <Text style={[styles.bestForLabel, { color: text }]}>{config.label}</Text>
            </View>
          );
        })}
        {compact && bestFor.length > 3 && (
          <Text style={[styles.moreText, { color: muted }]}>+{bestFor.length - 3} more</Text>
        )}
      </View>
    </View>
  );
}

function VibesSection({ vibes, compact }: { vibes: VibeTag[]; compact?: boolean }) {
  const text = useThemeColor({}, 'text');

  if (!vibes?.length) return null;

  const displayItems = compact ? vibes.slice(0, 4) : vibes;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: text }]}>Vibe</Text>
      <View style={styles.tagsContainer}>
        {displayItems.map((vibe) => {
          const color = VIBE_COLORS[vibe] || '#6B7280';
          return (
            <View key={vibe} style={[styles.vibeTag, { backgroundColor: withAlpha(color, 0.15) }]}>
              <Text style={[styles.vibeLabel, { color }]}>
                {vibe.charAt(0).toUpperCase() + vibe.slice(1)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function FeaturesSection({ smartData }: { smartData: SmartSpotData }) {
  const muted = useThemeColor({}, 'muted');

  const features: { icon: string; label: string }[] = [];

  if (smartData.hasOutdoorSeating) features.push({ icon: 'sunny', label: 'Outdoor Seating' });
  if (smartData.servesFood) features.push({ icon: 'restaurant', label: 'Serves Food' });
  if (smartData.servesAlcohol) features.push({ icon: 'wine', label: 'Serves Alcohol' });
  if (smartData.petFriendly) features.push({ icon: 'paw', label: 'Pet Friendly' });
  if (smartData.hours?.openLate) features.push({ icon: 'moon', label: 'Open Late' });
  if (smartData.hours?.openEarly) features.push({ icon: 'sunny', label: 'Opens Early' });

  if (!features.length) return null;

  return (
    <View style={styles.featuresRow}>
      {features.map((feature, i) => (
        <View key={i} style={styles.featureItem}>
          <Ionicons name={feature.icon as any} size={12} color={muted} />
          <Text style={[styles.featureLabel, { color: muted }]}>{feature.label}</Text>
        </View>
      ))}
    </View>
  );
}

function BusynessPrediction({ smartData }: { smartData: SmartSpotData }) {
  const text = useThemeColor({}, 'text');

  if (!smartData.predictedBusyness && !smartData.busyPrediction) return null;

  const predictedBusyness = Math.max(0, Math.min(100, smartData.predictedBusyness ?? 0));
  const busynessColor = predictedBusyness < 40
    ? '#10B981'
    : predictedBusyness < 70
      ? '#F59E0B'
      : '#EF4444';

  return (
    <View style={styles.predictionRow}>
      <Ionicons name="analytics" size={14} color={busynessColor} />
      <Text style={[styles.predictionText, { color: text }]}>{smartData.busyPrediction}</Text>
      <View style={[styles.busynessBar, { backgroundColor: withAlpha(busynessColor, 0.2) }]}>
        <View
          style={[
            styles.busynessFill,
            { width: `${predictedBusyness}%`, backgroundColor: busynessColor },
          ]}
        />
      </View>
    </View>
  );
}

export default function SmartSpotInfo({ smartData, compact = false }: SmartSpotInfoProps) {
  return (
    <View style={styles.container}>
      {/* Hours status */}
      <HoursStatusBadge hours={smartData.hours!} />

      {/* External ratings (Google, Yelp, Price) */}
      <ExternalRatings smartData={smartData} />

      {/* Coffee quality rating */}
      {smartData.coffeeQuality && <CoffeeRating rating={smartData.coffeeQuality} />}

      {/* Busyness prediction */}
      <BusynessPrediction smartData={smartData} />

      {/* Best for categories */}
      <BestForSection bestFor={smartData.bestFor} compact={compact} />

      {/* Vibe tags */}
      <VibesSection vibes={smartData.vibes} compact={compact} />

      {/* Features */}
      {!compact && <FeaturesSection smartData={smartData} />}
    </View>
  );
}

// Compact version for list items
export function SmartSpotBadges({ smartData }: { smartData: SmartSpotData }) {
  const muted = useThemeColor({}, 'muted');

  return (
    <View style={styles.compactBadges}>
      {/* Hours indicator */}
      {smartData.hours && (
        <View style={[
          styles.miniStatusDot,
          { backgroundColor: smartData.hours.isOpen ? '#10B981' : '#EF4444' },
        ]} />
      )}

      {/* Combined rating */}
      {smartData.combinedRating && (
        <View style={styles.miniRating}>
          <Ionicons name="star" size={10} color="#F59E0B" />
          <Text style={[styles.miniRatingText, { color: muted }]}>
            {smartData.combinedRating.toFixed(1)}
          </Text>
        </View>
      )}

      {/* Price */}
      {smartData.priceLevel && (
        <Text style={[styles.miniPrice, { color: muted }]}>{smartData.priceLevel}</Text>
      )}

      {/* Coffee quality (if high) */}
      {smartData.coffeeQuality && smartData.coffeeQuality >= 4.5 && (
        <View style={styles.miniCoffee}>
          <Text style={styles.miniCoffeeEmoji}>☕</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    gap: 12,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  hoursBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  hoursText: {
    fontSize: 12,
    fontWeight: '600',
  },
  externalRatings: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingIcon: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4285F4', // Google blue
  },
  ratingNumber: {
    fontSize: 13,
    fontWeight: '600',
  },
  reviewCount: {
    fontSize: 11,
  },
  priceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  priceText: {
    fontSize: 12,
    fontWeight: '600',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  beansContainer: {
    flexDirection: 'row',
    marginLeft: 4,
  },
  bean: {
    fontSize: 12,
  },
  ratingValue: {
    fontSize: 12,
    marginLeft: 4,
  },
  bestForTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    gap: 4,
  },
  bestForLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  moreText: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  vibeTag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  vibeLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  featuresRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  featureLabel: {
    fontSize: 11,
  },
  predictionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  predictionText: {
    fontSize: 12,
    flex: 1,
  },
  busynessBar: {
    width: 60,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  busynessFill: {
    height: '100%',
    borderRadius: 2,
  },
  compactBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniStatusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  miniRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  miniRatingText: {
    fontSize: 10,
  },
  miniPrice: {
    fontSize: 10,
  },
  miniCoffee: {
    marginLeft: 2,
  },
  miniCoffeeEmoji: {
    fontSize: 10,
  },
});
