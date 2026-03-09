import { recordPerfMetric } from './perfMonitor';
import { devLog } from './logger';

type ActiveMark = {
  name: string;
  startedAt: number;
  metadata?: Record<string, any>;
};

const activeMarks = new Map<string, ActiveMark>();

function normalizeName(name: string): string {
  const next = String(name || 'unknown_perf_mark')
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .slice(0, 80);
  return next || 'unknown_perf_mark';
}

function makeId(name: string): string {
  return `${name}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function resolveMark(idOrName: string): { id: string; mark: ActiveMark } | null {
  const direct = activeMarks.get(idOrName);
  if (direct) return { id: idOrName, mark: direct };

  let resolved: { id: string; mark: ActiveMark } | null = null;
  activeMarks.forEach((mark, id) => {
    if (mark.name !== idOrName) return;
    if (!resolved || mark.startedAt > resolved.mark.startedAt) {
      resolved = { id, mark };
    }
  });
  return resolved;
}

export function startPerfMark(name: string, metadata?: Record<string, any>): string {
  const safeName = normalizeName(name);
  const id = makeId(safeName);
  activeMarks.set(id, {
    name: safeName,
    startedAt: Date.now(),
    metadata,
  });
  return id;
}

export async function endPerfMark(
  idOrName: string,
  ok: boolean = true,
  metadata?: Record<string, any>,
): Promise<number | null> {
  const resolved = resolveMark(idOrName);
  if (!resolved) return null;

  activeMarks.delete(resolved.id);
  const duration = Math.max(0, Date.now() - resolved.mark.startedAt);
  await recordPerfMetric(resolved.mark.name, duration, ok);
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    devLog('[perf]', resolved.mark.name, duration, {
      ...resolved.mark.metadata,
      ...metadata,
    });
  }
  return duration;
}

export async function markPerfEvent(
  name: string,
  metadata?: Record<string, any>,
): Promise<void> {
  const safeName = normalizeName(name);
  await recordPerfMetric(safeName, 1, true);
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    devLog('[perf:event]', safeName, metadata || null);
  }
}

export async function measurePerfAsync<T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, any>,
): Promise<T> {
  const markId = startPerfMark(name, metadata);
  try {
    const result = await fn();
    await endPerfMark(markId, true);
    return result;
  } catch (error) {
    await endPerfMark(markId, false, { error: String(error) });
    throw error;
  }
}

export function clearActivePerfMarks(): void {
  activeMarks.clear();
}

