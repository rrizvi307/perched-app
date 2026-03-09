import { recordPerfMetric } from './perfMonitor';

type ErrorDetails = {
  name: string;
  message: string;
  stack?: string;
};

function normalizeError(error: unknown): ErrorDetails {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || 'Unknown error',
      stack: error.stack,
    };
  }
  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: error,
    };
  }
  return {
    name: 'Error',
    message: 'Unknown error',
  };
}

export async function withErrorBoundary<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T>;
export async function withErrorBoundary<T>(
  operation: string,
  fn: () => Promise<T>,
  fallback: T
): Promise<T>;
export async function withErrorBoundary<T>(
  operation: string,
  fn: () => Promise<T>,
  fallback?: T
): Promise<T> {
  const startedAt = Date.now();
  const hasFallback = arguments.length >= 3;

  try {
    const result = await fn();
    void recordPerfMetric(operation, Date.now() - startedAt, true);
    return result;
  } catch (error) {
    const details = normalizeError(error);
    console.error('[service-error]', {
      operation,
      durationMs: Date.now() - startedAt,
      hasFallback,
      errorName: details.name,
      errorMessage: details.message,
      errorStack: details.stack,
    });
    void recordPerfMetric(operation, Date.now() - startedAt, false);

    if (hasFallback) {
      return fallback as T;
    }
    throw error;
  }
}
