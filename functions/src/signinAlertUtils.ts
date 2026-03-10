export function shouldThrottleSigninAlert(
  lastSentAtMs: number,
  nowMs: number,
  throttleMs: number,
): boolean {
  if (!Number.isFinite(lastSentAtMs) || lastSentAtMs <= 0) return false;
  if (!Number.isFinite(nowMs) || !Number.isFinite(throttleMs) || throttleMs <= 0) return false;
  return nowMs - lastSentAtMs < throttleMs;
}

export function resolveSendgridFailure(status: number, responseText?: string | null): string {
  const normalized = typeof responseText === 'string' ? responseText.trim() : '';
  if (normalized) return normalized;
  return `sendgrid_${Math.max(0, Math.floor(status || 0))}`;
}

export function normalizeProviderError(error: unknown): string {
  if (error instanceof Error && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) return error.trim();
  return String(error);
}
