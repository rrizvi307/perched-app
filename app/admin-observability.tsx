import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { ensureFirebase } from '@/services/firebaseClient';
import { getCacheHitRate, getCacheStats } from '@/services/cacheLayer';
import { getPerfMetricsSnapshot } from '@/services/perfMonitor';
import { SLO_DEFINITIONS, calculateSLOCompliance, isSLOViolation } from '@/services/sloConfig';
import { withAlpha } from '@/utils/colors';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  VictoryAxis,
  VictoryBar,
  VictoryChart,
  VictoryLine,
  VictoryPie,
  VictoryTheme,
} from 'victory-native';

type AdminStatus = 'checking' | 'allowed' | 'denied';

type MetricPoint = {
  id: string;
  operation: string;
  count: number;
  errorCount: number;
  errorRate: number;
  avgMs: number;
  p50: number;
  p95: number;
  p99: number;
  maxMs: number;
  lastMs: number;
  timestamp: number;
  source: 'remote' | 'local';
};

type ViolationPoint = {
  id: string;
  operation: string;
  type: string;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
};

type CacheStatsState = {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  avgHitRate: number;
};

type ChartPoint = { x: number; y: number };

type ComplianceState = 'green' | 'yellow' | 'red' | 'unknown';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = 15000;
const KEY_OPERATIONS = ['checkin_query', 'b2b_spot_data', 'place_intelligence', 'checkin_create'] as const;

const OPERATION_ALIASES: Record<string, string> = {
  firebase_get_checkins_remote: 'checkin_query',
  firebase_get_checkins_for_user: 'checkin_query',
  firebase_get_approved_checkins: 'checkin_query',
  place_intelligence_build: 'place_intelligence',
  b2bGetSpotData: 'b2b_spot_data',
  b2b_get_spot_data: 'b2b_spot_data',
  checkin_create_remote: 'checkin_create',
};

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toMillis(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    try {
      return (value as { toMillis: () => number }).toMillis();
    } catch {
      return 0;
    }
  }
  if (value && typeof (value as { seconds?: number }).seconds === 'number') {
    return ((value as { seconds: number }).seconds || 0) * 1000;
  }
  const parsed = new Date(value as string).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeOperationName(operation: string): string {
  const trimmed = operation.trim();
  if (!trimmed) return trimmed;
  return OPERATION_ALIASES[trimmed] || trimmed;
}

function normalizeErrorRate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value > 1) return value / 100;
  if (value < 0) return 0;
  return value;
}

function formatHourLabel(timestampMs: number): string {
  const dt = new Date(timestampMs);
  const hour = dt.getHours();
  const period = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 || 12;
  return `${display}${period}`;
}

function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

function formatTimestamp(timestampMs: number): string {
  if (!timestampMs) return 'Unknown';
  const dt = new Date(timestampMs);
  return `${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function countMetricFailures(metric: MetricPoint, operation: string): number {
  const slo = SLO_DEFINITIONS[operation];
  if (!slo) return 0;
  let failures = 0;
  if (metric.p50 > slo.p50Target) failures += 1;
  if (metric.p95 > slo.p95Target) failures += 1;
  if (metric.p99 > slo.p99Target) failures += 1;
  if (metric.errorRate > slo.errorRateTarget) failures += 1;
  return failures;
}

function getComplianceState(metric: MetricPoint | null, operation: string): ComplianceState {
  if (!metric) return 'unknown';
  const failures = countMetricFailures(metric, operation);
  if (failures === 0) return 'green';
  if (failures <= 2) return 'yellow';
  return 'red';
}

function parseMetricFromDoc(id: string, data: Record<string, unknown>): MetricPoint | null {
  const rawOperation =
    typeof data.operation === 'string'
      ? data.operation
      : typeof data.name === 'string'
        ? data.name
        : '';
  const operation = normalizeOperationName(rawOperation);
  if (!operation) return null;

  const timestamp =
    toMillis(data.timestamp) ||
    toMillis(data.updatedAt) ||
    Date.now();

  return {
    id,
    operation,
    count: toNumber(data.count),
    errorCount: toNumber(data.errorCount),
    errorRate: normalizeErrorRate(toNumber(data.errorRate)),
    avgMs: toNumber(data.avgMs),
    p50: toNumber(data.p50),
    p95: toNumber(data.p95),
    p99: toNumber(data.p99),
    maxMs: toNumber(data.maxMs),
    lastMs: toNumber(data.lastMs),
    timestamp,
    source: 'remote',
  };
}

function buildHourlyLatencySeries(metrics: MetricPoint[]): {
  p50: ChartPoint[];
  p95: ChartPoint[];
  p99: ChartPoint[];
} {
  const now = Date.now();
  const start = now - 23 * HOUR_MS;
  const buckets = Array.from({ length: 24 }, (_, idx) => ({
    x: start + idx * HOUR_MS,
    p50: 0,
    p95: 0,
    p99: 0,
    count: 0,
  }));

  metrics.forEach((metric) => {
    if (metric.timestamp < start || metric.timestamp > now) return;
    const offset = Math.floor((metric.timestamp - start) / HOUR_MS);
    if (offset < 0 || offset >= buckets.length) return;
    const bucket = buckets[offset];
    bucket.p50 += metric.p50;
    bucket.p95 += metric.p95;
    bucket.p99 += metric.p99;
    bucket.count += 1;
  });

  return {
    p50: buckets.map((b) => ({ x: b.x, y: b.count ? b.p50 / b.count : 0 })),
    p95: buckets.map((b) => ({ x: b.x, y: b.count ? b.p95 / b.count : 0 })),
    p99: buckets.map((b) => ({ x: b.x, y: b.count ? b.p99 / b.count : 0 })),
  };
}

export default function AdminObservabilityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const background = useThemeColor({}, 'background');
  const card = useThemeColor({}, 'card');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const primary = useThemeColor({}, 'primary');
  const accent = useThemeColor({}, 'accent');
  const success = useThemeColor({}, 'success');
  const danger = useThemeColor({}, 'danger');

  const [adminStatus, setAdminStatus] = useState<AdminStatus>('checking');
  const [remoteMetrics, setRemoteMetrics] = useState<MetricPoint[]>([]);
  const [localMetrics, setLocalMetrics] = useState<MetricPoint[]>([]);
  const [violations, setViolations] = useState<ViolationPoint[]>([]);
  const [cacheStats, setCacheStats] = useState<CacheStatsState>({
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
    avgHitRate: 0,
  });
  const [cacheHitRate, setCacheHitRate] = useState(0);
  const [cacheTrend, setCacheTrend] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState(Date.now());

  useEffect(() => {
    let active = true;

    async function verifyAdmin() {
      if (!user) {
        if (active) {
          setAdminStatus('denied');
          router.replace('/');
        }
        return;
      }

      const contextAdmin =
        (user as any)?.auth?.token?.admin === true ||
        (user as any)?.token?.admin === true ||
        (user as any)?.admin === true;

      if (contextAdmin) {
        if (active) setAdminStatus('allowed');
        return;
      }

      const fb = ensureFirebase();
      const currentUser = fb?.auth?.()?.currentUser;
      if (!currentUser || typeof currentUser.getIdTokenResult !== 'function') {
        if (active) {
          setAdminStatus('denied');
          router.replace('/');
        }
        return;
      }

      try {
        const token = await currentUser.getIdTokenResult();
        const isAdmin = token?.claims?.admin === true;
        if (!active) return;
        if (isAdmin) {
          setAdminStatus('allowed');
        } else {
          setAdminStatus('denied');
          router.replace('/');
        }
      } catch {
        if (!active) return;
        setAdminStatus('denied');
        router.replace('/');
      }
    }

    void verifyAdmin();

    return () => {
      active = false;
    };
  }, [router, user]);

  useEffect(() => {
    if (adminStatus !== 'allowed') return;

    let active = true;
    let unsubscribeMetrics: (() => void) | null = null;
    let unsubscribeViolations: (() => void) | null = null;

    const refreshLocalTelemetry = async () => {
      try {
        const snapshot = await getPerfMetricsSnapshot();
        if (!active) return;

        const now = Date.now();
        const nextLocalMetrics: MetricPoint[] = snapshot.map((metric) => ({
          id: `local-${metric.name}`,
          operation: normalizeOperationName(metric.name),
          count: toNumber(metric.count),
          errorCount: toNumber(metric.errorCount),
          errorRate: normalizeErrorRate(toNumber(metric.errorRate)),
          avgMs: toNumber(metric.avgMs),
          p50: toNumber((metric as Record<string, unknown>).p50Ms),
          p95: toNumber(metric.p95Ms),
          p99: toNumber((metric as Record<string, unknown>).p99Ms),
          maxMs: toNumber(metric.maxMs),
          lastMs: toNumber(metric.lastMs),
          timestamp: now,
          source: 'local',
        }));

        setLocalMetrics(nextLocalMetrics);
        const stats = await getCacheStats();
        const rate = getCacheHitRate();
        setCacheStats(stats);
        setCacheHitRate(rate);
        setCacheTrend((prev) => [...prev, { x: now, y: rate * 100 }].slice(-24));
      } catch {
        if (active) setErrorMessage('Failed to refresh local telemetry snapshot.');
      }
    };

    void refreshLocalTelemetry();

    const interval = setInterval(() => {
      void refreshLocalTelemetry();
    }, REFRESH_INTERVAL_MS);

    const fb = ensureFirebase();
    if (!fb) {
      setLoading(false);
      return () => {
        active = false;
        clearInterval(interval);
      };
    }

    const db = fb.firestore();
    const since = Date.now() - DAY_MS;

    unsubscribeMetrics = db
      .collection('performanceMetrics')
      .where('timestamp', '>', since)
      .orderBy('timestamp', 'desc')
      .limit(500)
      .onSnapshot(
        (snapshot: any) => {
          if (!active) return;
          const next: MetricPoint[] = [];
          snapshot.forEach((doc: any) => {
            const data = (doc.data() || {}) as Record<string, unknown>;
            const parsed = parseMetricFromDoc(doc.id, data);
            if (parsed) next.push(parsed);
          });
          setRemoteMetrics(next);
          setLastUpdated(Date.now());
          setLoading(false);
        },
        () => {
          if (!active) return;
          setErrorMessage('Unable to subscribe to performanceMetrics in Firestore.');
          setLoading(false);
        }
      );

    unsubscribeViolations = db
      .collection('sloViolations')
      .orderBy('timestamp', 'desc')
      .limit(20)
      .onSnapshot(
        (snapshot: any) => {
          if (!active) return;
          const next: ViolationPoint[] = [];
          snapshot.forEach((doc: any) => {
            const data = (doc.data() || {}) as Record<string, unknown>;
            const severityRaw = typeof data.severity === 'string' ? data.severity.toLowerCase() : 'medium';
            const severity =
              severityRaw === 'low' || severityRaw === 'medium' || severityRaw === 'high' || severityRaw === 'critical'
                ? severityRaw
                : 'medium';
            next.push({
              id: doc.id,
              operation: normalizeOperationName(String(data.operation || data.name || 'unknown')),
              type: String(data.type || data.metric || 'slo'),
              timestamp: toMillis(data.timestamp) || Date.now(),
              severity,
            });
          });
          setViolations(next);
        },
        () => {
          if (!active) return;
          setErrorMessage('Unable to subscribe to sloViolations in Firestore.');
        }
      );

    return () => {
      active = false;
      clearInterval(interval);
      if (unsubscribeMetrics) unsubscribeMetrics();
      if (unsubscribeViolations) unsubscribeViolations();
    };
  }, [adminStatus]);

  const latestMetricsByOperation = useMemo(() => {
    const merged = [...remoteMetrics, ...localMetrics].sort((a, b) => b.timestamp - a.timestamp);
    const map = new Map<string, MetricPoint>();
    merged.forEach((metric) => {
      if (!map.has(metric.operation)) map.set(metric.operation, metric);
    });
    return map;
  }, [remoteMetrics, localMetrics]);

  const keyOperationRows = useMemo(() => {
    return KEY_OPERATIONS.map((operation) => {
      const metric = latestMetricsByOperation.get(operation) || null;
      const slo = SLO_DEFINITIONS[operation];
      const state = getComplianceState(metric, operation);
      const compliance = metric
        ? Math.round(calculateSLOCompliance(operation, metric.p50, metric.p95, metric.p99, metric.errorRate) * 100)
        : null;
      return { operation, metric, slo, state, compliance };
    });
  }, [latestMetricsByOperation]);

  const complianceSummary = useMemo(() => {
    const withData = Object.keys(SLO_DEFINITIONS)
      .map((operation) => ({ operation, metric: latestMetricsByOperation.get(operation) }))
      .filter((item): item is { operation: string; metric: MetricPoint } => !!item.metric);

    const compliantCount = withData.filter((item) =>
      !isSLOViolation(item.operation, item.metric.p50, item.metric.p95, item.metric.p99, item.metric.errorRate)
    ).length;

    const total = withData.length;
    const violationCount = Math.max(0, total - compliantCount);
    const percentage = total > 0 ? Math.round((compliantCount / total) * 100) : 0;

    return {
      total,
      compliantCount,
      violationCount,
      percentage,
      pieData: [
        { x: 'Compliant', y: compliantCount },
        { x: 'Violations', y: violationCount || (total === 0 ? 1 : 0) },
      ],
    };
  }, [latestMetricsByOperation]);

  const sourceMetrics = remoteMetrics.length > 0 ? remoteMetrics : localMetrics;

  const latencySeries = useMemo(() => buildHourlyLatencySeries(sourceMetrics), [sourceMetrics]);

  const latencyTargets = useMemo(() => {
    const avg = <K extends 'p50Target' | 'p95Target' | 'p99Target'>(key: K): number => {
      const values = KEY_OPERATIONS.map((op) => SLO_DEFINITIONS[op][key]);
      return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
    };
    const xs = latencySeries.p50.map((point) => point.x);
    return {
      p50: xs.map((x) => ({ x, y: avg('p50Target') })),
      p95: xs.map((x) => ({ x, y: avg('p95Target') })),
      p99: xs.map((x) => ({ x, y: avg('p99Target') })),
    };
  }, [latencySeries]);

  const errorRateData = useMemo(() => {
    return keyOperationRows.map((row) => ({
      x: row.slo.displayName,
      y: (row.metric?.errorRate || 0) * 100,
      violation: row.metric ? row.metric.errorRate > row.slo.errorRateTarget : false,
    }));
  }, [keyOperationRows]);

  const derivedViolations = useMemo(() => {
    const rows: ViolationPoint[] = [];
    keyOperationRows.forEach((row) => {
      if (!row.metric) return;
      const metric = row.metric;
      if (metric.p50 > row.slo.p50Target) {
        rows.push({
          id: `${row.operation}-p50-${metric.timestamp}`,
          operation: row.operation,
          type: 'p50',
          timestamp: metric.timestamp,
          severity: 'medium',
        });
      }
      if (metric.p95 > row.slo.p95Target) {
        rows.push({
          id: `${row.operation}-p95-${metric.timestamp}`,
          operation: row.operation,
          type: 'p95',
          timestamp: metric.timestamp,
          severity: 'high',
        });
      }
      if (metric.p99 > row.slo.p99Target) {
        rows.push({
          id: `${row.operation}-p99-${metric.timestamp}`,
          operation: row.operation,
          type: 'p99',
          timestamp: metric.timestamp,
          severity: 'high',
        });
      }
      if (metric.errorRate > row.slo.errorRateTarget) {
        rows.push({
          id: `${row.operation}-error-${metric.timestamp}`,
          operation: row.operation,
          type: 'errorRate',
          timestamp: metric.timestamp,
          severity: 'critical',
        });
      }
    });
    return rows.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
  }, [keyOperationRows]);

  const displayedViolations = violations.length > 0 ? violations : derivedViolations;

  const slowOperations = useMemo(() => {
    const rows = Array.from(latestMetricsByOperation.entries())
      .filter(([operation]) => !!SLO_DEFINITIONS[operation])
      .map(([operation, metric]) => {
        const slo = SLO_DEFINITIONS[operation];
        const compliance = Math.round(
          calculateSLOCompliance(operation, metric.p50, metric.p95, metric.p99, metric.errorRate) * 100
        );
        return {
          operation,
          displayName: slo.displayName,
          p95: metric.p95,
          target: slo.p95Target,
          compliance,
          violation: metric.p95 > slo.p95Target,
        };
      })
      .sort((a, b) => b.p95 - a.p95)
      .slice(0, 10);

    return rows;
  }, [latestMetricsByOperation]);

  const statusColor = (state: ComplianceState) => {
    if (state === 'green') return success;
    if (state === 'yellow') return '#F59E0B';
    if (state === 'red') return danger;
    return muted;
  };

  if (adminStatus === 'checking') {
    return (
      <View style={[styles.center, { backgroundColor: background }]}> 
        <ActivityIndicator size="large" color={primary} />
        <Text style={[styles.loadingText, { color: muted }]}>Checking admin access…</Text>
      </View>
    );
  }

  if (adminStatus !== 'allowed') {
    return (
      <View style={[styles.center, { backgroundColor: background }]}> 
        <Text style={[styles.deniedTitle, { color: text }]}>Access denied</Text>
        <Text style={[styles.loadingText, { color: muted }]}>Redirecting to home…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: background }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: text }]}>Observability Dashboard</Text>
          <Text style={[styles.subtitle, { color: muted }]}>Real-time performance + SLO health</Text>
          <Text style={[styles.lastUpdated, { color: muted }]}>Updated {formatTimestamp(lastUpdated)}</Text>
        </View>
        <Pressable
          onPress={() => router.replace('/')}
          style={[styles.homeButton, { borderColor: border, backgroundColor: card }]}
        >
          <IconSymbol name="house.fill" size={16} color={text} />
          <Text style={[styles.homeButtonText, { color: text }]}>Home</Text>
        </Pressable>
      </View>

      {errorMessage ? (
        <View style={[styles.errorBanner, { backgroundColor: withAlpha(danger, 0.12), borderColor: withAlpha(danger, 0.4) }]}> 
          <Text style={[styles.errorText, { color: danger }]}>{errorMessage}</Text>
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: card, borderColor: border }]}> 
        <Text style={[styles.cardTitle, { color: text }]}>SLO Compliance Summary</Text>
        <Text style={[styles.complianceValue, { color: text }]}>{complianceSummary.percentage}%</Text>
        <Text style={[styles.complianceMeta, { color: muted }]}>
          {complianceSummary.compliantCount} compliant / {complianceSummary.total} monitored operations
        </Text>
        <VictoryPie
          width={320}
          height={180}
          theme={VictoryTheme.material}
          colorScale={[success, danger]}
          data={complianceSummary.pieData}
          innerRadius={48}
          labels={({ datum }: { datum: { x: string; y: number } }) => `${datum.x}: ${datum.y}`}
          style={{ labels: { fill: text, fontSize: 11 } }}
        />
      </View>

      <View style={styles.keyGrid}>
        {keyOperationRows.map((row) => (
          <View key={row.operation} style={[styles.keyCard, { backgroundColor: card, borderColor: border }]}> 
            <View style={styles.keyHeader}>
              <Text style={[styles.keyTitle, { color: text }]}>{row.slo.displayName}</Text>
              <View style={[styles.statusDot, { backgroundColor: statusColor(row.state) }]} />
            </View>
            <Text style={[styles.keyLatency, { color: text }]}>
              p95: {Math.round(row.metric?.p95 || 0)}ms / {row.slo.p95Target}ms
            </Text>
            <Text style={[styles.keyMeta, { color: muted }]}> 
              p50 {Math.round(row.metric?.p50 || 0)} • p99 {Math.round(row.metric?.p99 || 0)}
            </Text>
            <Text style={[styles.keyMeta, { color: muted }]}> 
              error {formatPercent((row.metric?.errorRate || 0) * 100, 2)}
            </Text>
            <Text style={[styles.keyMeta, { color: muted }]}> 
              compliance {row.compliance === null ? 'N/A' : `${row.compliance}%`}
            </Text>
          </View>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: card, borderColor: border }]}> 
        <Text style={[styles.cardTitle, { color: text }]}>Latency Trends (24h)</Text>
        {loading ? <ActivityIndicator color={primary} style={{ marginVertical: 8 }} /> : null}
        <VictoryChart theme={VictoryTheme.material} height={260} padding={{ top: 20, left: 58, right: 20, bottom: 42 }}>
          <VictoryAxis
            tickValues={latencySeries.p50.filter((_, idx) => idx % 4 === 0).map((point) => point.x)}
            tickFormat={(value: string | number) => formatHourLabel(Number(value))}
            style={{ tickLabels: { fill: muted, fontSize: 10 }, axis: { stroke: border }, grid: { stroke: border } }}
          />
          <VictoryAxis
            dependentAxis
            tickFormat={(value: string | number) => `${Math.round(Number(value))}ms`}
            style={{ tickLabels: { fill: muted, fontSize: 10 }, axis: { stroke: border }, grid: { stroke: withAlpha(border, 0.6) } }}
          />
          <VictoryLine data={latencySeries.p50} style={{ data: { stroke: '#2563EB', strokeWidth: 2 } }} />
          <VictoryLine data={latencySeries.p95} style={{ data: { stroke: '#F59E0B', strokeWidth: 2 } }} />
          <VictoryLine data={latencySeries.p99} style={{ data: { stroke: '#DC2626', strokeWidth: 2 } }} />
          <VictoryLine data={latencyTargets.p50} style={{ data: { stroke: '#2563EB', strokeDasharray: '4,4', opacity: 0.5 } }} />
          <VictoryLine data={latencyTargets.p95} style={{ data: { stroke: '#F59E0B', strokeDasharray: '4,4', opacity: 0.5 } }} />
          <VictoryLine data={latencyTargets.p99} style={{ data: { stroke: '#DC2626', strokeDasharray: '4,4', opacity: 0.5 } }} />
        </VictoryChart>
      </View>

      <View style={[styles.card, { backgroundColor: card, borderColor: border }]}> 
        <Text style={[styles.cardTitle, { color: text }]}>Error Rates by Operation</Text>
        <VictoryChart theme={VictoryTheme.material} height={240} domainPadding={{ x: 20, y: 16 }} padding={{ top: 20, left: 58, right: 18, bottom: 66 }}>
          <VictoryAxis style={{ tickLabels: { fill: muted, fontSize: 9, angle: -20 }, axis: { stroke: border }, grid: { stroke: border } }} />
          <VictoryAxis
            dependentAxis
            tickFormat={(value: string | number) => `${Number(value).toFixed(1)}%`}
            style={{ tickLabels: { fill: muted, fontSize: 10 }, axis: { stroke: border }, grid: { stroke: withAlpha(border, 0.6) } }}
          />
          <VictoryBar
            data={errorRateData}
            style={{
              data: {
                fill: (args: { datum?: { violation?: boolean } }) => (args.datum?.violation ? danger : success),
              },
              labels: { fill: text, fontSize: 10 },
            }}
            labels={({ datum }: { datum: { y: number } }) => `${datum.y.toFixed(2)}%`}
          />
        </VictoryChart>
      </View>

      <View style={[styles.card, { backgroundColor: card, borderColor: border }]}> 
        <Text style={[styles.cardTitle, { color: text }]}>Recent SLO Violations</Text>
        {displayedViolations.length === 0 ? (
          <Text style={[styles.emptyText, { color: muted }]}>No violations in the current window.</Text>
        ) : (
          displayedViolations.map((violation) => (
            <View key={violation.id} style={[styles.tableRow, { borderBottomColor: border }]}> 
              <View style={{ flex: 1 }}>
                <Text style={[styles.tablePrimary, { color: text }]}>{SLO_DEFINITIONS[violation.operation]?.displayName || violation.operation}</Text>
                <Text style={[styles.tableSecondary, { color: muted }]}>{formatTimestamp(violation.timestamp)}</Text>
              </View>
              <Text style={[styles.tableBadge, { color: danger }]}>{violation.type}</Text>
              <Text style={[styles.tableSecondary, { color: muted }]}>{violation.severity}</Text>
            </View>
          ))
        )}
      </View>

      <View style={[styles.card, { backgroundColor: card, borderColor: border }]}> 
        <Text style={[styles.cardTitle, { color: text }]}>Slowest Operations (Top 10 by p95)</Text>
        {slowOperations.length === 0 ? (
          <Text style={[styles.emptyText, { color: muted }]}>No operation metrics available yet.</Text>
        ) : (
          slowOperations.map((operation) => (
            <View key={operation.operation} style={[styles.tableRow, { borderBottomColor: border }]}> 
              <View style={{ flex: 1 }}>
                <Text style={[styles.tablePrimary, { color: text }]}>{operation.displayName}</Text>
                <Text style={[styles.tableSecondary, { color: muted }]}>Compliance {operation.compliance}%</Text>
              </View>
              <Text style={[styles.tablePrimary, { color: operation.violation ? danger : success }]}>
                {Math.round(operation.p95)}ms / {operation.target}ms
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={[styles.card, { backgroundColor: card, borderColor: border }]}> 
        <Text style={[styles.cardTitle, { color: text }]}>Cache Performance</Text>
        <Text style={[styles.cacheHitRate, { color: text }]}>{formatPercent(cacheHitRate * 100, 1)} hit rate</Text>
        <View style={styles.cacheStatsRow}>
          <Text style={[styles.cacheStat, { color: muted }]}>Hits: {cacheStats.hits}</Text>
          <Text style={[styles.cacheStat, { color: muted }]}>Misses: {cacheStats.misses}</Text>
          <Text style={[styles.cacheStat, { color: muted }]}>Evictions: {cacheStats.evictions}</Text>
          <Text style={[styles.cacheStat, { color: muted }]}>Size: {cacheStats.size}</Text>
        </View>
        <VictoryChart theme={VictoryTheme.material} height={180} padding={{ top: 20, left: 58, right: 18, bottom: 34 }}>
          <VictoryAxis
            tickValues={cacheTrend.filter((_, idx) => idx % 4 === 0).map((point) => point.x)}
            tickFormat={(value: string | number) => formatHourLabel(Number(value))}
            style={{ tickLabels: { fill: muted, fontSize: 9 }, axis: { stroke: border }, grid: { stroke: border } }}
          />
          <VictoryAxis
            dependentAxis
            tickFormat={(value: string | number) => `${Math.round(Number(value))}%`}
            style={{ tickLabels: { fill: muted, fontSize: 9 }, axis: { stroke: border }, grid: { stroke: withAlpha(border, 0.6) } }}
          />
          <VictoryLine data={cacheTrend} style={{ data: { stroke: accent, strokeWidth: 2.5 } }} />
        </VictoryChart>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 44 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 10, fontSize: 14 },
  deniedTitle: { fontSize: 20, fontWeight: '700' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { marginTop: 4, fontSize: 14, fontWeight: '500' },
  lastUpdated: { marginTop: 4, fontSize: 12 },
  homeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  homeButtonText: { fontSize: 13, fontWeight: '600' },
  errorBanner: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorText: { fontSize: 13, fontWeight: '600' },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  complianceValue: { fontSize: 34, fontWeight: '800', lineHeight: 40 },
  complianceMeta: { fontSize: 13, marginTop: 2 },
  keyGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 2 },
  keyCard: {
    width: '48.5%',
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
  },
  keyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  keyTitle: { flex: 1, fontSize: 13, fontWeight: '700', paddingRight: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  keyLatency: { fontSize: 13, fontWeight: '700' },
  keyMeta: { marginTop: 2, fontSize: 12 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
    gap: 10,
  },
  tablePrimary: { fontSize: 13, fontWeight: '600' },
  tableSecondary: { fontSize: 12 },
  tableBadge: { fontSize: 12, fontWeight: '700', minWidth: 68, textTransform: 'uppercase' },
  emptyText: { fontSize: 13, paddingVertical: 4 },
  cacheHitRate: { fontSize: 30, fontWeight: '800', marginTop: 2 },
  cacheStatsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4, marginBottom: 4 },
  cacheStat: { fontSize: 12 },
});
