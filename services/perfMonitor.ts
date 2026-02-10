import AsyncStorage from '@react-native-async-storage/async-storage';

const PERF_METRICS_KEY = '@perched_perf_metrics_v1';
const MAX_SAMPLE_COUNT = 80;
const MAX_METRIC_COUNT = 80;
const FLUSH_DEBOUNCE_MS = 1500;

type PerfMetricStoreEntry = {
  count: number;
  errorCount: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
  updatedAt: number;
  samples: number[];
};

type PerfMetricPublicEntry = {
  name: string;
  count: number;
  errorCount: number;
  errorRate: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  lastMs: number;
  updatedAt: number;
};

let store: Record<string, PerfMetricStoreEntry> = {};
let hydrated = false;
let dirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function clampDuration(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, 120_000);
}

function computeP95(samples: number[]): number {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return sorted[index];
}

async function ensureHydrated(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(PERF_METRICS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, PerfMetricStoreEntry> | null;
    if (!parsed || typeof parsed !== 'object') return;
    store = parsed;
  } catch {
    store = {};
  }
}

async function flushNow(): Promise<void> {
  if (!dirty) return;
  dirty = false;
  try {
    await AsyncStorage.setItem(PERF_METRICS_KEY, JSON.stringify(store));
  } catch {
    // Ignore telemetry persistence failures.
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushNow();
  }, FLUSH_DEBOUNCE_MS);
}

export async function recordPerfMetric(name: string, durationMs: number, ok: boolean = true): Promise<void> {
  if (!name) return;
  await ensureHydrated();
  const normalizedDuration = clampDuration(durationMs);
  const existing = store[name] || {
    count: 0,
    errorCount: 0,
    totalMs: 0,
    maxMs: 0,
    lastMs: 0,
    updatedAt: Date.now(),
    samples: [],
  };

  existing.count += 1;
  existing.errorCount += ok ? 0 : 1;
  existing.totalMs += normalizedDuration;
  existing.maxMs = Math.max(existing.maxMs, normalizedDuration);
  existing.lastMs = normalizedDuration;
  existing.updatedAt = Date.now();
  existing.samples.push(normalizedDuration);
  if (existing.samples.length > MAX_SAMPLE_COUNT) {
    existing.samples = existing.samples.slice(existing.samples.length - MAX_SAMPLE_COUNT);
  }
  store[name] = existing;

  const keys = Object.keys(store);
  if (keys.length > MAX_METRIC_COUNT) {
    const oldest = keys.sort((a, b) => (store[a]?.updatedAt || 0) - (store[b]?.updatedAt || 0))[0];
    if (oldest) delete store[oldest];
  }

  dirty = true;
  scheduleFlush();
}

export async function getPerfMetricsSnapshot(): Promise<PerfMetricPublicEntry[]> {
  await ensureHydrated();
  return Object.entries(store)
    .map(([name, value]) => {
      const count = value.count || 0;
      const errorCount = value.errorCount || 0;
      const avgMs = count > 0 ? value.totalMs / count : 0;
      const p95Ms = computeP95(value.samples || []);
      return {
        name,
        count,
        errorCount,
        errorRate: count > 0 ? errorCount / count : 0,
        avgMs,
        p95Ms,
        maxMs: value.maxMs || 0,
        lastMs: value.lastMs || 0,
        updatedAt: value.updatedAt || 0,
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function clearPerfMetrics(): Promise<void> {
  store = {};
  dirty = false;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  try {
    await AsyncStorage.removeItem(PERF_METRICS_KEY);
  } catch {
    // Ignore.
  }
}

