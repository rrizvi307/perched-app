import { ThemedView } from '@/components/themed-view';
import { Body, H1, Label } from '@/components/ui/typography';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { gapStyle } from '@/utils/layout';
import { exportDetectionCsv, getDetectionLogs, getDetectionMetrics } from '@/services/admin';
import { exportReportsCsv, getReportsRemote, updateReportStatus } from '@/services/moderation';
import Constants from 'expo-constants';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

function getAdminEmails() {
  const extra = (Constants.expoConfig as any)?.extra || {};
  const raw = (extra.ADMIN_EMAILS || extra.ADMIN_EMAIL || '') as string;
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export default function AdminReports() {
  const { user } = useAuth();
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const primary = useThemeColor({}, 'primary');
  const [reports, setReports] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any | null>(null);
  const [detectionLogs, setDetectionLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const admins = useMemo(() => getAdminEmails(), []);
  const isAdmin = !!user?.email && admins.includes(user.email.toLowerCase());

  async function markStatus(id: string, status: 'open' | 'review' | 'resolved') {
    await updateReportStatus(id, status);
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      setLoading(true);
      const items = await getReportsRemote(200);
      setReports(items || []);
      const stats = await getDetectionMetrics(300);
      setMetrics(stats);
      const logs = await getDetectionLogs(200);
      setDetectionLogs(logs || []);
      setLoading(false);
    })();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <ThemedView style={styles.container}>
        <H1 style={{ color: text }}>Admin reports</H1>
        <Body style={{ color: muted, marginTop: 8 }}>You do not have access.</Body>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Label style={{ color: muted, marginBottom: 8 }}>Admin</Label>
      <H1 style={{ color: text }}>Reports</H1>
      <View style={{ height: 10 }} />
      {metrics ? (
        <View style={[styles.card, { borderColor: border, backgroundColor: card }]}>
          <Text style={{ color: text, fontWeight: '700', marginBottom: 6 }}>Auto-detect health</Text>
          <Text style={{ color: muted }}>Total: {metrics.total}</Text>
          <Text style={{ color: muted }}>Success: {metrics.success} ({metrics.successRate}%)</Text>
          <Text style={{ color: muted }}>Failure: {metrics.failure}</Text>
          <Text style={{ color: muted }}>
            Avg distance: {metrics.avgDistanceKm ? `${Math.round(metrics.avgDistanceKm * 1000)}m` : '—'}
          </Text>
          {metrics.sources ? (
            <Text style={{ color: muted }}>
              Sources: {Object.entries(metrics.sources).map(([k, v]) => `${k}:${v}`).join(', ') || '—'}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={{ height: 12 }} />
      <Pressable
        onPress={async () => {
          const csv = exportReportsCsv(reports);
          await Share.share({ message: csv });
        }}
        style={[styles.button, { backgroundColor: primary }]}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Export CSV</Text>
      </Pressable>
      <View style={{ height: 10 }} />
      <Pressable
        onPress={async () => {
          const csv = exportDetectionCsv(detectionLogs);
          await Share.share({ message: csv });
        }}
        style={[styles.button, { borderColor: border, backgroundColor: card }]}
      >
        <Text style={{ color: text, fontWeight: '700' }}>Export detection logs</Text>
      </Pressable>
      <View style={{ height: 12 }} />
      {loading ? <Body style={{ color: muted }}>Loading…</Body> : null}
      {reports.length ? (
        reports.map((r) => (
          <View key={r.id} style={[styles.row, { borderColor: border, backgroundColor: card }]}>
            <Text style={{ color: text, fontWeight: '700' }}>{r.checkinId || 'Unknown check-in'}</Text>
            <Text style={{ color: muted }}>{r.reporterId || 'Anonymous'}</Text>
            {r.reportedUserId ? <Text style={{ color: muted }}>User: {r.reportedUserId}</Text> : null}
            {r.spotName ? <Text style={{ color: muted }}>Spot: {r.spotName}</Text> : null}
            {r.reason ? <Text style={{ color: muted }}>{r.reason}</Text> : null}
            {r.status ? <Text style={{ color: muted }}>Status: {r.status}</Text> : null}
            <View style={[{ flexDirection: 'row', marginTop: 8 }, gapStyle(8)]}>
              <Pressable
                onPress={() => markStatus(r.id, 'review')}
                style={[styles.chip, { borderColor: border }]}
              >
                <Text style={{ color: text }}>Review</Text>
              </Pressable>
              <Pressable
                onPress={() => markStatus(r.id, 'resolved')}
                style={[styles.chip, { borderColor: border }]}
              >
                <Text style={{ color: text }}>Resolve</Text>
              </Pressable>
            </View>
          </View>
        ))
      ) : (
        <Body style={{ color: muted }}>No reports yet.</Body>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  row: { borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 10 },
  card: { borderWidth: 1, borderRadius: 16, padding: 12 },
  button: { padding: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
});
