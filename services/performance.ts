import { InteractionManager, Platform } from 'react-native';
import { trackTiming } from './analytics';
import { captureMessage } from './sentry';

interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
}

const metrics: Record<string, PerformanceMetric> = {};
const SLOW_THRESHOLD_MS = 1000; // Report operations slower than 1s

/**
 * Start measuring a performance metric
 */
export function startMeasure(name: string) {
  metrics[name] = {
    name,
    startTime: Date.now(),
  };
}

/**
 * End measuring and report the metric
 */
export function endMeasure(name: string, metadata?: Record<string, any>) {
  const metric = metrics[name];
  if (!metric) {
    console.warn(`Performance metric "${name}" was not started`);
    return;
  }

  metric.endTime = Date.now();
  metric.duration = metric.endTime - metric.startTime;

  // Track to analytics
  trackTiming('performance', name, metric.duration);

  // Log if slow
  if (metric.duration > SLOW_THRESHOLD_MS) {
    console.warn(`[Performance] Slow operation: ${name} took ${metric.duration}ms`);

    // Report to Sentry for very slow operations (> 3s)
    if (metric.duration > 3000) {
      captureMessage(`Slow operation: ${name}`, 'warning', {
        duration: metric.duration,
        ...metadata,
      });
    }
  }

  // Clean up
  delete metrics[name];

  return metric.duration;
}

/**
 * Measure a function execution time
 */
export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  startMeasure(name);
  try {
    const result = await fn();
    endMeasure(name, metadata);
    return result;
  } catch (error) {
    endMeasure(name, { ...metadata, error: true });
    throw error;
  }
}

/**
 * Measure a synchronous function execution time
 */
export function measureSync<T>(
  name: string,
  fn: () => T,
  metadata?: Record<string, any>
): T {
  startMeasure(name);
  try {
    const result = fn();
    endMeasure(name, metadata);
    return result;
  } catch (error) {
    endMeasure(name, { ...metadata, error: true });
    throw error;
  }
}

/**
 * Run a function after interactions complete (better performance)
 */
export function runAfterInteractions<T>(
  fn: () => T | Promise<T>
): Promise<T> {
  if (Platform.OS === 'web') {
    // On web, use requestIdleCallback or setTimeout
    return new Promise((resolve) => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => {
          resolve(fn() as T | Promise<T>);
        });
      } else {
        setTimeout(() => {
          resolve(fn() as T | Promise<T>);
        }, 0);
      }
    });
  }

  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      resolve(fn() as T | Promise<T>);
    });
  });
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      fn(...args);
    }, delayMs);
  };
}

/**
 * Throttle a function
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limitMs: number
): (...args: Parameters<T>) => void {
  let lastRun = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastRun >= limitMs) {
      fn(...args);
      lastRun = now;
    }
  };
}

/**
 * Report app startup time
 */
export function reportStartupTime() {
  if (Platform.OS === 'web') {
    if (typeof performance !== 'undefined' && performance.timing) {
      const loadTime =
        performance.timing.loadEventEnd - performance.timing.navigationStart;
      trackTiming('startup', 'web_load', loadTime);
    }
  } else {
    // Native startup time is tracked via Sentry's native frames tracking
    // or can be calculated from app launch to first screen render
  }
}

/**
 * Get memory usage (native only, returns approximate MB)
 */
export function getMemoryUsage(): number | null {
  if (Platform.OS === 'web') {
    // Web doesn't have reliable memory API
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      return (performance as any).memory.usedJSHeapSize / 1024 / 1024;
    }
  }
  // Native memory tracking would require native module
  return null;
}

/**
 * Log memory usage
 */
export function logMemoryUsage(label: string) {
  const memory = getMemoryUsage();
  if (memory !== null) {
    console.log(`[Memory] ${label}: ${memory.toFixed(2)} MB`);

    if (memory > 200) {
      // Warn if memory usage is high
      captureMessage(`High memory usage: ${label}`, 'warning', {
        memory_mb: memory,
      });
    }
  }
}

/**
 * Batch multiple operations to reduce re-renders
 */
export function batchUpdates<T>(
  operations: Array<() => T>
): T[] {
  // On React Native, state updates are automatically batched
  // This is mainly for documentation purposes
  return operations.map(op => op());
}

export default {
  startMeasure,
  endMeasure,
  measureAsync,
  measureSync,
  runAfterInteractions,
  debounce,
  throttle,
  reportStartupTime,
  getMemoryUsage,
  logMemoryUsage,
  batchUpdates,
};
