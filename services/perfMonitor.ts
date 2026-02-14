import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { ensureFirebase } from './firebaseClient';
import { isPermissionDeniedError } from './permissionErrors';

const PERF_METRICS_KEY = '@perched_perf_metrics_v1';
const MAX_SAMPLE_COUNT = 80;
const MAX_METRIC_COUNT = 80;
const FLUSH_DEBOUNCE_MS = 1500;
const FIRESTORE_PERSIST_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const FIRESTORE_BATCH_SIZE = 20; // Max metrics to persist per batch
let perfFirestorePermissionWarned = false;

function isPerfFirestorePersistenceEnabled() {
  const expoFlag = (Constants.expoConfig as any)?.extra?.PERF_FIRESTORE_ENABLED;
  const globalFlag = (global as any)?.PERF_FIRESTORE_ENABLED;
  const envFlag = process.env.EXPO_PUBLIC_ENABLE_PERF_FIRESTORE;
  return expoFlag === true || globalFlag === true || envFlag === '1';
}

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
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  lastMs: number;
  updatedAt: number;
};

let store: Record<string, PerfMetricStoreEntry> = {};
let hydrated = false;
let dirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let firestorePersistTimer: ReturnType<typeof setTimeout> | null = null;
let lastFirestorePersist = 0;
let nativePerfModule:
  | {
      startTrace: (name: string) => Promise<{ stop: () => Promise<void> | void }> | { stop: () => Promise<void> | void };
    }
  | null
  | undefined;

function clampDuration(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, 120_000);
}

function getNativePerfModule() {
  if (nativePerfModule !== undefined) return nativePerfModule;
  try {
    const loaded = require('@react-native-firebase/perf');
    const perfFactory = loaded?.default ?? loaded;
    nativePerfModule = typeof perfFactory === 'function' ? perfFactory() : null;
  } catch {
    nativePerfModule = null;
  }
  return nativePerfModule;
}

/**
 * Compute percentile from samples array
 * @param samples Array of duration samples in milliseconds
 * @param percentile Value between 0 and 1 (e.g., 0.50 for p50, 0.95 for p95)
 */
function computePercentile(samples: number[], percentile: number): number {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * percentile));
  return sorted[index];
}

function computeP50(samples: number[]): number {
  return computePercentile(samples, 0.50);
}

function computeP95(samples: number[]): number {
  return computePercentile(samples, 0.95);
}

function computeP99(samples: number[]): number {
  return computePercentile(samples, 0.99);
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
  const timer = flushTimer as unknown as { unref?: () => void };
  if (typeof timer?.unref === 'function') {
    timer.unref();
  }
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
  scheduleFirestorePersist();
}

export async function getPerfMetricsSnapshot(): Promise<PerfMetricPublicEntry[]> {
  await ensureHydrated();
  return Object.entries(store)
    .map(([name, value]) => {
      const count = value.count || 0;
      const errorCount = value.errorCount || 0;
      const avgMs = count > 0 ? value.totalMs / count : 0;
      const samples = value.samples || [];
      const p50Ms = computeP50(samples);
      const p95Ms = computeP95(samples);
      const p99Ms = computeP99(samples);
      return {
        name,
        count,
        errorCount,
        errorRate: count > 0 ? errorCount / count : 0,
        avgMs,
        p50Ms,
        p95Ms,
        p99Ms,
        maxMs: value.maxMs || 0,
        lastMs: value.lastMs || 0,
        updatedAt: value.updatedAt || 0,
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Persist current metrics to Firestore for long-term storage and analysis
 * This runs periodically (every 5 minutes) to avoid excessive writes
 */
async function persistMetricsToFirestore(): Promise<void> {
  try {
    // Disabled by default. Client-side telemetry persistence can generate noisy permission errors
    // unless rules explicitly allow this collection (recommended only for controlled diagnostics).
    if (!isPerfFirestorePersistenceEnabled()) return;

    const fb = await ensureFirebase();
    if (!fb) {
      console.warn('Firebase not available, skipping metrics persistence');
      return;
    }

    const authUid = fb.auth?.()?.currentUser?.uid;
    if (!authUid) return;

    const db = fb.firestore();
    const now = Date.now();

    // Get metrics snapshot
    await ensureHydrated();
    const entries = Object.entries(store);

    if (entries.length === 0) {
      return; // Nothing to persist
    }

    // Batch write metrics to Firestore (max 20 per batch to avoid quota issues)
    const batches: typeof entries[] = [];
    for (let i = 0; i < entries.length; i += FIRESTORE_BATCH_SIZE) {
      batches.push(entries.slice(i, i + FIRESTORE_BATCH_SIZE));
    }

    for (const batch of batches) {
      const writes = batch.map(async ([name, value]) => {
        const samples = value.samples || [];
        const count = value.count || 0;
        const metricDoc = {
          operation: name,
          count,
          errorCount: value.errorCount || 0,
          errorRate: count > 0 ? (value.errorCount || 0) / count : 0,
          avgMs: count > 0 ? value.totalMs / count : 0,
          p50: computeP50(samples),
          p95: computeP95(samples),
          p99: computeP99(samples),
          maxMs: value.maxMs || 0,
          lastMs: value.lastMs || 0,
          timestamp: now,
          updatedAt: value.updatedAt || now,
        };

        // Add to performanceMetrics collection
        await db.collection('performanceMetrics').add(metricDoc);
      });

      await Promise.all(writes);
    }

    lastFirestorePersist = now;
    console.log(`Persisted ${entries.length} performance metrics to Firestore`);
  } catch (error: any) {
    if (isPermissionDeniedError(error)) {
      if (!perfFirestorePermissionWarned) {
        perfFirestorePermissionWarned = true;
        console.warn('Skipping performanceMetrics Firestore persistence: permission denied');
      }
      return;
    }
    console.error('Error persisting metrics to Firestore:', error);
    // Don't throw - telemetry failures should not break the app
  }
}

/**
 * Schedule periodic Firestore persistence
 * Runs every 5 minutes to avoid excessive Firestore writes
 */
function scheduleFirestorePersist(): void {
  if (firestorePersistTimer) return;

  // Check if enough time has passed since last persist
  const now = Date.now();
  const timeSinceLastPersist = now - lastFirestorePersist;

  if (timeSinceLastPersist < FIRESTORE_PERSIST_INTERVAL_MS) {
    // Schedule for later
    const delay = FIRESTORE_PERSIST_INTERVAL_MS - timeSinceLastPersist;
    firestorePersistTimer = setTimeout(() => {
      firestorePersistTimer = null;
      void persistMetricsToFirestore();
      scheduleFirestorePersist(); // Reschedule for next interval
    }, delay);
  } else {
    // Persist now and schedule next
    void persistMetricsToFirestore();
    firestorePersistTimer = setTimeout(() => {
      firestorePersistTimer = null;
      void persistMetricsToFirestore();
      scheduleFirestorePersist(); // Reschedule for next interval
    }, FIRESTORE_PERSIST_INTERVAL_MS);
  }

  // Unref timer to prevent blocking process exit
  const timer = firestorePersistTimer as unknown as { unref?: () => void };
  if (typeof timer?.unref === 'function') {
    timer.unref();
  }
}

export async function clearPerfMetrics(): Promise<void> {
  store = {};
  dirty = false;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (firestorePersistTimer) {
    clearTimeout(firestorePersistTimer);
    firestorePersistTimer = null;
  }
  try {
    await AsyncStorage.removeItem(PERF_METRICS_KEY);
  } catch {
    // Ignore.
  }
}

export async function trackScreenLoad(screenName: string): Promise<() => Promise<void>> {
  const safeScreenName = String(screenName || 'unknown_screen').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 80);
  const metricName = `screen_load_${safeScreenName}`;
  const startedAt = Date.now();
  const nativePerf = getNativePerfModule();
  let trace: { stop: () => Promise<void> | void } | null = null;

  if (nativePerf) {
    try {
      trace = await nativePerf.startTrace(metricName);
    } catch {
      trace = null;
    }
  }

  return async () => {
    const duration = Date.now() - startedAt;
    if (trace) {
      try {
        await trace.stop();
      } catch {
        // Trace failures should not affect UX.
      }
    }
    await recordPerfMetric(metricName, duration, true);
  };
}
