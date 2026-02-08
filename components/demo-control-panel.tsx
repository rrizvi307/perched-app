import { View, Text, Pressable, StyleSheet, Switch, ScrollView, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { IconSymbol } from './ui/icon-symbol';
import { PolishedCard } from './ui/polished-card';
import { PremiumButton } from './ui/premium-button';
import { useThemeColor } from '@/hooks/use-theme-color';
import { seedDemoFeed, clearDemoData, getDemoStats } from '@/services/demoDataManager';
import { isDemoMode, setDemoMode } from '@/services/demoMode';

interface DemoControlPanelProps {
  onClose: () => void;
}

/**
 * Demo Control Panel - Toggle demo mode for filming and presentations
 * Access via: Triple-tap the settings icon or add /demo route
 */
export function DemoControlPanel({ onClose }: DemoControlPanelProps) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const success = useThemeColor({}, 'success');
  const border = useThemeColor({}, 'border');

  const [demoEnabled, setDemoEnabled] = useState(isDemoMode());
  const [stats, setStats] = useState({ checkinsCount: 0, usersCount: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    const demoStats = await getDemoStats();
    setStats(demoStats);
  };

  const handleToggleDemo = async (value: boolean) => {
    if (value) {
      // Enable demo mode
      Alert.alert(
        'Enable Demo Mode',
        'This will populate your feed with realistic demo data. Perfect for filming and presentations.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Enable',
            style: 'default',
            onPress: async () => {
              setLoading(true);
              await setDemoMode(true);
              await seedDemoFeed();
              setDemoEnabled(true);
              await loadStats();
              setLoading(false);
            },
          },
        ]
      );
    } else {
      // Disable demo mode
      Alert.alert(
        'Disable Demo Mode',
        'This will remove all demo data and return to your real data.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disable',
            style: 'destructive',
            onPress: async () => {
              setLoading(true);
              await setDemoMode(false);
              await clearDemoData();
              setDemoEnabled(false);
              await loadStats();
              setLoading(false);
            },
          },
        ]
      );
    }
  };

  const handleRefreshDemo = async () => {
    setLoading(true);
    await clearDemoData();
    await seedDemoFeed();
    await loadStats();
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: text }]}>🎬 Demo Control</Text>
            <Text style={[styles.subtitle, { color: muted }]}>
              Perfect for filming and presentations
            </Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <IconSymbol name="xmark" size={20} color={muted} />
          </Pressable>
        </View>

        {/* Demo Status */}
        <PolishedCard variant="elevated" pressable={false}>
          <View style={styles.statusRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: muted }]}>Demo Mode</Text>
              <Text style={[styles.value, { color: demoEnabled ? success : text }]}>
                {demoEnabled ? 'Active' : 'Inactive'}
              </Text>
            </View>
            <Switch
              value={demoEnabled}
              onValueChange={handleToggleDemo}
              disabled={loading}
            />
          </View>

          {demoEnabled && (
            <View style={[styles.banner, { backgroundColor: success, opacity: 0.1, marginTop: 12 }]}>
              <Text style={[styles.bannerText, { color: success }]}>
                ✓ Demo data is active. Great for filming!
              </Text>
            </View>
          )}
        </PolishedCard>

        {/* Stats */}
        {demoEnabled && (
          <PolishedCard variant="outlined" pressable={false}>
            <Text style={[styles.sectionTitle, { color: text }]}>Demo Data Stats</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: primary }]}>
                  {stats.checkinsCount}
                </Text>
                <Text style={[styles.statLabel, { color: muted }]}>
                  Check-ins
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: primary }]}>
                  {stats.usersCount}
                </Text>
                <Text style={[styles.statLabel, { color: muted }]}>
                  Demo Users
                </Text>
              </View>
            </View>

            <PremiumButton
              onPress={handleRefreshDemo}
              variant="secondary"
              size="medium"
              icon="arrow.clockwise"
              loading={loading}
              fullWidth
              style={{ marginTop: 16 }}
            >
              Refresh Demo Data
            </PremiumButton>
          </PolishedCard>
        )}

        {/* Demo Scenarios */}
        <PolishedCard variant="outlined" pressable={false}>
          <Text style={[styles.sectionTitle, { color: text }]}>Demo Scenarios</Text>

          <View style={styles.scenario}>
            <Text style={[styles.scenarioTitle, { color: text }]}>🎥 Filming Ready</Text>
            <Text style={[styles.scenarioDesc, { color: muted }]}>
              Feed populated with 20+ realistic check-ins
            </Text>
          </View>

          <View style={styles.scenario}>
            <Text style={[styles.scenarioTitle, { color: text }]}>👥 Social Features</Text>
            <Text style={[styles.scenarioDesc, { color: muted }]}>
              Demo friends, requests, and interactions
            </Text>
          </View>

          <View style={styles.scenario}>
            <Text style={[styles.scenarioTitle, { color: text }]}>🏫 Campus Mode</Text>
            <Text style={[styles.scenarioDesc, { color: muted }]}>
              University check-ins and campus filtering
            </Text>
          </View>

          <View style={styles.scenario}>
            <Text style={[styles.scenarioTitle, { color: text }]}>🔥 Streaks & Gamification</Text>
            <Text style={[styles.scenarioDesc, { color: muted }]}>
              Active streaks, achievements unlocked
            </Text>
          </View>
        </PolishedCard>

        {/* Quick Actions */}
        <PolishedCard variant="outlined" pressable={false}>
          <Text style={[styles.sectionTitle, { color: text }]}>Quick Actions</Text>

          <PremiumButton
            onPress={async () => {
              Alert.alert(
                'Clear All Data',
                'This will remove ALL data (including your real data). Only use for fresh testing.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: async () => {
                      setLoading(true);
                      await clearDemoData();
                      await setDemoMode(false);
                      setDemoEnabled(false);
                      await loadStats();
                      setLoading(false);
                      Alert.alert('Success', 'All data cleared. Fresh start!');
                    },
                  },
                ]
              );
            }}
            variant="danger"
            size="medium"
            icon="trash.fill"
            fullWidth
          >
            Clear All Data (Fresh Start)
          </PremiumButton>
        </PolishedCard>

        {/* Tips */}
        <View style={[styles.tips, { borderColor: border }]}>
          <Text style={[styles.tipsTitle, { color: text }]}>💡 Tips for Demo Filming</Text>
          <Text style={[styles.tipText, { color: muted }]}>
            • Enable demo mode before recording{'\n'}
            • Use Refresh Demo Data for variety{'\n'}
            • Toggle campus filter to show features{'\n'}
            • Demo friends appear automatically{'\n'}
            • Disable after filming for real testing
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontSize: 13,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  value: {
    fontSize: 20,
    fontWeight: '700',
  },
  banner: {
    padding: 12,
    borderRadius: 8,
  },
  bannerText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scenario: {
    marginBottom: 16,
  },
  scenarioTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  scenarioDesc: {
    fontSize: 14,
    lineHeight: 20,
  },
  tips: {
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 14,
    lineHeight: 22,
  },
});
