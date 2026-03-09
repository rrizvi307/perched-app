/**
 * Error Budget Tracking and Display
 * Calculates error budget status for SLO-monitored operations
 */

import { ensureFirebase } from './firebaseClient';
import { SLO_DEFINITIONS } from './sloConfig';

export interface ErrorBudgetStatus {
  operation: string;
  displayName: string;
  budgetRemaining: number; // 0.0 to 1.0 (1.0 = 100% remaining)
  budgetConsumed: number; // 0.0 to 1.0 (0.5 = 50% consumed)
  timeWindowDays: number;
  status: 'healthy' | 'warning' | 'critical';
  actualErrorRate: number;
  targetErrorRate: number;
  errorBudget: number;
  totalRequests: number;
  totalErrors: number;
}

/**
 * Calculate error budget for an operation over a time window
 * @param operation Operation name (e.g., 'checkin_query', 'b2b_spot_data')
 * @param timeWindowDays Number of days to look back (default: 30)
 * @returns Error budget status
 */
export async function calculateErrorBudget(
  operation: string,
  timeWindowDays: number = 30
): Promise<ErrorBudgetStatus | null> {
  const slo = SLO_DEFINITIONS[operation];
  if (!slo) {
    console.warn(`No SLO defined for operation: ${operation}`);
    return null;
  }

  const fb = await ensureFirebase();
  if (!fb) {
    console.warn('Firebase not available');
    return null;
  }

  const db = fb.firestore();
  const now = Date.now();
  const windowStart = now - timeWindowDays * 24 * 60 * 60 * 1000;

  try {
    // Query performance metrics for this operation in the time window
    const snapshot = await db.collection('performanceMetrics')
      .where('operation', '==', operation)
      .where('timestamp', '>', windowStart)
      .get();

    if (snapshot.empty) {
      return {
        operation,
        displayName: slo.displayName,
        budgetRemaining: 1.0,
        budgetConsumed: 0.0,
        timeWindowDays,
        status: 'healthy',
        actualErrorRate: 0,
        targetErrorRate: slo.errorRateTarget,
        errorBudget: slo.errorBudget,
        totalRequests: 0,
        totalErrors: 0,
      };
    }

    // Aggregate total requests and errors
    let totalRequests = 0;
    let totalErrors = 0;

    snapshot.docs.forEach((doc: any) => {
      const data = doc.data();
      totalRequests += data.count || 0;
      totalErrors += data.errorCount || 0;
    });

    // Calculate actual error rate
    const actualErrorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;

    // Calculate budget consumption
    // Budget consumed = (actual error rate) / (error budget)
    const budgetConsumed = Math.min(1.0, actualErrorRate / slo.errorBudget);
    const budgetRemaining = Math.max(0.0, 1.0 - budgetConsumed);

    // Determine status
    let status: 'healthy' | 'warning' | 'critical';
    if (budgetRemaining > 0.5) {
      status = 'healthy'; // >50% budget remaining
    } else if (budgetRemaining > 0.1) {
      status = 'warning'; // 10-50% budget remaining
    } else {
      status = 'critical'; // <10% budget remaining
    }

    return {
      operation,
      displayName: slo.displayName,
      budgetRemaining,
      budgetConsumed,
      timeWindowDays,
      status,
      actualErrorRate,
      targetErrorRate: slo.errorRateTarget,
      errorBudget: slo.errorBudget,
      totalRequests,
      totalErrors,
    };
  } catch (error) {
    console.error(`Error calculating error budget for ${operation}:`, error);
    return null;
  }
}

/**
 * Calculate error budgets for all SLO-monitored operations
 * @param timeWindowDays Number of days to look back (default: 30)
 * @returns Array of error budget statuses
 */
export async function calculateAllErrorBudgets(
  timeWindowDays: number = 30
): Promise<ErrorBudgetStatus[]> {
  const operations = Object.keys(SLO_DEFINITIONS);
  const results = await Promise.all(
    operations.map(op => calculateErrorBudget(op, timeWindowDays))
  );

  return results.filter((result): result is ErrorBudgetStatus => result !== null);
}

/**
 * Get error budget status summary (counts by status)
 */
export function summarizeErrorBudgets(budgets: ErrorBudgetStatus[]): {
  healthy: number;
  warning: number;
  critical: number;
  total: number;
} {
  return {
    healthy: budgets.filter(b => b.status === 'healthy').length,
    warning: budgets.filter(b => b.status === 'warning').length,
    critical: budgets.filter(b => b.status === 'critical').length,
    total: budgets.length,
  };
}

/**
 * Format budget remaining as percentage
 */
export function formatBudgetPercentage(budgetRemaining: number): string {
  return `${(budgetRemaining * 100).toFixed(1)}%`;
}

/**
 * Get color indicator for error budget status
 */
export function getBudgetStatusColor(status: 'healthy' | 'warning' | 'critical'): string {
  switch (status) {
    case 'healthy': return '#10b981'; // green
    case 'warning': return '#f59e0b'; // amber
    case 'critical': return '#ef4444'; // red
  }
}
