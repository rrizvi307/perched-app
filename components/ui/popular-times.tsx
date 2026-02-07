import { useThemeColor } from '@/hooks/use-theme-color';
import { withAlpha } from '@/utils/colors';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type PopularTimesProps = {
  popularHours?: number[]; // Array of 24 values (one per hour)
  checkinCount?: number;
  compact?: boolean;
};

// Get current hour
function getCurrentHour(): number {
  return new Date().getHours();
}

// Get label for hour
function getHourLabel(hour: number): string {
  if (hour === 0) return '12a';
  if (hour === 12) return '12p';
  if (hour < 12) return `${hour}a`;
  return `${hour - 12}p`;
}

// Get busyness level text
function getBusynessText(value: number, max: number): string {
  if (max === 0) return 'No data';
  const pct = value / max;
  if (pct === 0) return 'Not busy';
  if (pct < 0.25) return 'Usually not busy';
  if (pct < 0.5) return 'Usually a little busy';
  if (pct < 0.75) return 'Usually busy';
  return 'Usually very busy';
}

export default function PopularTimes({ popularHours, checkinCount = 0, compact = false }: PopularTimesProps) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');

  const hourlyData = popularHours || new Array(24).fill(0);
  const maxValue = Math.max(...hourlyData, 1);
  const currentHour = getCurrentHour();

  // Show hours from 6am to 11pm (typical cafe hours)
  const displayHours = compact
    ? [8, 10, 12, 14, 16, 18, 20] // Fewer bars for compact view
    : [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

  const currentValue = hourlyData[currentHour];
  const busynessText = getBusynessText(currentValue, maxValue);

  if (checkinCount < 3) {
    return (
      <View style={styles.container}>
        <Text style={[styles.title, { color: text }]}>Popular Times</Text>
        <Text style={[styles.noData, { color: muted }]}>
          Not enough data yet. Check in to help!
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: text }]}>Popular Times</Text>
        <View style={[styles.currentBadge, { backgroundColor: withAlpha(primary, 0.15) }]}>
          <View style={[styles.liveDot, { backgroundColor: primary }]} />
          <Text style={[styles.currentText, { color: primary }]}>{busynessText}</Text>
        </View>
      </View>

      <View style={styles.chartContainer}>
        <View style={styles.barsContainer}>
          {displayHours.map((hour) => {
            const value = hourlyData[hour];
            const heightPct = maxValue > 0 ? (value / maxValue) * 100 : 0;
            const isCurrent = hour === currentHour;

            return (
              <View key={hour} style={styles.barWrapper}>
                <View style={styles.barBackground}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: `${Math.max(heightPct, 4)}%`,
                        backgroundColor: isCurrent ? primary : withAlpha(primary, 0.4),
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.hourLabel, { color: isCurrent ? primary : muted }]}>
                  {getHourLabel(hour)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  currentText: {
    fontSize: 11,
    fontWeight: '600',
  },
  noData: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  chartContainer: {
    height: 60,
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 45,
    gap: 2,
  },
  barWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  barBackground: {
    width: '100%',
    height: 40,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: '80%',
    borderRadius: 2,
    minHeight: 2,
  },
  hourLabel: {
    fontSize: 9,
    marginTop: 4,
  },
});
