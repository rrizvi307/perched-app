import { useThemeColor } from '@/hooks/use-theme-color';
import {
  formatAccessibility,
  formatDietaryOptions,
  formatDrinkSpecialty,
  formatLifestyleTag,
  getDiscoveryBadge,
  type LifestyleSpotData,
} from '@/services/lifestyleDataService';
import { withAlpha } from '@/utils/colors';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

type LifestyleSpotInfoProps = {
  data: LifestyleSpotData;
  compact?: boolean;
};

function DiscoveryBadge({ data }: { data: LifestyleSpotData }) {
  const badge = getDiscoveryBadge(data);
  if (!badge) return null;

  return (
    <View style={[styles.discoveryBadge, { backgroundColor: withAlpha(badge.color, 0.15) }]}>
      <Text style={styles.discoveryEmoji}>{badge.emoji}</Text>
      <Text style={[styles.discoveryLabel, { color: badge.color }]}>{badge.label}</Text>
    </View>
  );
}

function SignatureDrinks({ data }: { data: LifestyleSpotData }) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const surface = useThemeColor({}, 'surface');

  if (!data.signatureDrinks?.length) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: text }]}>Signature Drinks</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.drinksScroll}>
        {data.signatureDrinks.map((drink, i) => (
          <View key={i} style={[styles.drinkCard, { backgroundColor: surface }]}>
            {drink.isPopular && (
              <View style={styles.popularBadge}>
                <Text style={styles.popularText}>🔥 Popular</Text>
              </View>
            )}
            <Text style={[styles.drinkName, { color: text }]}>{drink.name}</Text>
            <Text style={[styles.drinkDesc, { color: muted }]} numberOfLines={2}>
              {drink.description}
            </Text>
            {drink.price && (
              <Text style={[styles.drinkPrice, { color: text }]}>{drink.price}</Text>
            )}
            {drink.dietary?.length ? (
              <View style={styles.dietaryRow}>
                {drink.dietary.map((d, j) => (
                  <Text key={j} style={[styles.dietaryMini, { color: muted }]}>
                    {d === 'vegan' ? '🌱' : d === 'dairy-free' ? '🥛' : ''}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function DrinkSpecialties({ data }: { data: LifestyleSpotData }) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');

  if (!data.drinkSpecialties?.length) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: text }]}>Known For</Text>
      <View style={styles.tagsWrap}>
        {data.drinkSpecialties.slice(0, 5).map((specialty) => (
          <View key={specialty} style={[styles.specialtyTag, { backgroundColor: withAlpha('#92400E', 0.1) }]}>
            <Text style={{ color: '#92400E', fontSize: 12, fontWeight: '500' }}>
              ☕ {formatDrinkSpecialty(specialty)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function DietaryOptions({ data }: { data: LifestyleSpotData }) {
  const text = useThemeColor({}, 'text');

  if (!data.dietaryOptions?.length) return null;

  const formatted = formatDietaryOptions(data.dietaryOptions);

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: text }]}>Dietary Options</Text>
      <View style={styles.tagsWrap}>
        {formatted.map((option, i) => (
          <View key={i} style={[styles.dietaryTag, { backgroundColor: withAlpha('#10B981', 0.1) }]}>
            <Text style={{ color: '#059669', fontSize: 12, fontWeight: '500' }}>{option}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function LifestyleTags({ data, compact }: { data: LifestyleSpotData; compact?: boolean }) {
  const text = useThemeColor({}, 'text');

  if (!data.lifestyleTags?.length) return null;

  const tags = compact ? data.lifestyleTags.slice(0, 4) : data.lifestyleTags;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: text }]}>Perfect For</Text>
      <View style={styles.tagsWrap}>
        {tags.map((tag) => {
          const { label, emoji } = formatLifestyleTag(tag);
          return (
            <View key={tag} style={[styles.lifestyleTag, { backgroundColor: withAlpha('#8B5CF6', 0.1) }]}>
              <Text style={{ fontSize: 12 }}>{emoji}</Text>
              <Text style={{ color: '#7C3AED', fontSize: 12, fontWeight: '500', marginLeft: 4 }}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function AccessibilityFeatures({ data }: { data: LifestyleSpotData }) {
  const muted = useThemeColor({}, 'muted');

  if (!data.accessibility?.length) return null;

  return (
    <View style={styles.accessRow}>
      {data.accessibility.slice(0, 4).map((feature) => (
        <Text key={feature} style={[styles.accessText, { color: muted }]}>
          {formatAccessibility(feature)}
        </Text>
      ))}
    </View>
  );
}

function WaitTimeInfo({ data }: { data: LifestyleSpotData }) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');

  if (!data.typicalWaitMinutes && !data.reservationRecommended) return null;

  return (
    <View style={[styles.waitInfo, { backgroundColor: withAlpha('#F59E0B', 0.1) }]}>
      {data.typicalWaitMinutes ? (
        <Text style={{ color: '#D97706', fontSize: 12 }}>
          ⏱️ ~{data.typicalWaitMinutes} min typical wait
        </Text>
      ) : null}
      {data.reservationRecommended && (
        <Text style={{ color: '#D97706', fontSize: 12, marginLeft: data.typicalWaitMinutes ? 8 : 0 }}>
          📅 Reservations recommended
        </Text>
      )}
    </View>
  );
}

function EventsInfo({ data }: { data: LifestyleSpotData }) {
  const muted = useThemeColor({}, 'muted');

  const events: string[] = [];
  if (data.hasLiveMusic) events.push('🎵 Live Music');
  if (data.hasEvents) events.push('📅 Events');
  if (data.hasHappyHour) events.push(`🍹 Happy Hour ${data.happyHourTimes || ''}`);

  if (!events.length) return null;

  return (
    <View style={styles.eventsRow}>
      {events.map((event, i) => (
        <Text key={i} style={[styles.eventText, { color: muted }]}>{event}</Text>
      ))}
    </View>
  );
}

function SocialProof({ data }: { data: LifestyleSpotData }) {
  const muted = useThemeColor({}, 'muted');

  if (!data.instagramMentions && !data.aestheticScore) return null;

  return (
    <View style={styles.socialRow}>
      {data.instagramMentions ? (
        <Text style={[styles.socialText, { color: muted }]}>
          📸 {data.instagramMentions.toLocaleString()} Instagram posts
        </Text>
      ) : null}
      {data.aestheticScore ? (
        <Text style={[styles.socialText, { color: muted }]}>
          ✨ Aesthetic: {data.aestheticScore}/5
        </Text>
      ) : null}
    </View>
  );
}

export default function LifestyleSpotInfo({ data, compact = false }: LifestyleSpotInfoProps) {
  return (
    <View style={styles.container}>
      {/* Discovery Badge (Trending, Hidden Gem, etc.) */}
      <DiscoveryBadge data={data} />

      {/* Lifestyle Tags - What it's perfect for */}
      <LifestyleTags data={data} compact={compact} />

      {/* Signature Drinks */}
      {!compact && <SignatureDrinks data={data} />}

      {/* Drink Specialties */}
      <DrinkSpecialties data={data} />

      {/* Dietary Options */}
      {!compact && <DietaryOptions data={data} />}

      {/* Wait Time / Reservations */}
      <WaitTimeInfo data={data} />

      {/* Events & Happy Hour */}
      <EventsInfo data={data} />

      {/* Accessibility Features */}
      {!compact && <AccessibilityFeatures data={data} />}

      {/* Social Proof */}
      {!compact && <SocialProof data={data} />}
    </View>
  );
}

// Compact badges for list items
export function LifestyleBadges({ data }: { data: LifestyleSpotData }) {
  const badge = getDiscoveryBadge(data);
  const muted = useThemeColor({}, 'muted');

  return (
    <View style={styles.compactBadges}>
      {badge && (
        <View style={[styles.miniBadge, { backgroundColor: withAlpha(badge.color, 0.15) }]}>
          <Text style={{ fontSize: 10 }}>{badge.emoji}</Text>
          <Text style={{ color: badge.color, fontSize: 9, fontWeight: '600', marginLeft: 2 }}>
            {badge.label}
          </Text>
        </View>
      )}
      {data.lifestyleTags?.includes('dog_friendly') && (
        <Text style={{ fontSize: 12 }}>🐕</Text>
      )}
      {data.lifestyleTags?.includes('kid_friendly') && (
        <Text style={{ fontSize: 12 }}>👶</Text>
      )}
      {data.accessibility?.includes('patio_seating') && (
        <Text style={{ fontSize: 12 }}>☀️</Text>
      )}
      {data.dietaryOptions?.includes('vegan') && (
        <Text style={{ fontSize: 12 }}>🌱</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    gap: 14,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  discoveryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  discoveryEmoji: {
    fontSize: 14,
  },
  discoveryLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  specialtyTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  dietaryTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  lifestyleTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  drinksScroll: {
    marginHorizontal: -4,
  },
  drinkCard: {
    width: 160,
    padding: 12,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  popularBadge: {
    marginBottom: 6,
  },
  popularText: {
    fontSize: 10,
    color: '#EF4444',
    fontWeight: '600',
  },
  drinkName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  drinkDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  drinkPrice: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  dietaryRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  dietaryMini: {
    fontSize: 12,
    marginRight: 4,
  },
  accessRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  accessText: {
    fontSize: 11,
  },
  waitInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  eventsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  eventText: {
    fontSize: 12,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 12,
  },
  socialText: {
    fontSize: 11,
  },
  compactBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
});
