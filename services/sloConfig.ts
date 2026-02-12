/**
 * SLO (Service Level Objective) Configuration
 *
 * Defines performance targets and error budgets for all critical operations
 * Used by perfMonitor, SLO violation detection, and observability dashboard
 */

export interface SLO {
  operation: string;
  displayName: string;
  description: string;
  // Latency targets in milliseconds
  p50Target: number;
  p95Target: number;
  p99Target: number;
  // Error rate target (0.01 = 1%)
  errorRateTarget: number;
  // Error budget (smaller = stricter, 0.005 = 0.5%)
  errorBudget: number;
  // Priority for alerting (critical = immediate, high = within 15min, medium = within 1hr)
  priority: 'critical' | 'high' | 'medium';
}

/**
 * SLO definitions for all monitored operations
 * Targets are based on user experience requirements and production capacity
 */
export const SLO_DEFINITIONS: Record<string, SLO> = {
  // Database query operations
  'checkin_query': {
    operation: 'checkin_query',
    displayName: 'Check-in Query',
    description: 'Firestore queries for check-ins (feed, spot details)',
    p50Target: 200,
    p95Target: 500,
    p99Target: 1000,
    errorRateTarget: 0.01, // 1%
    errorBudget: 0.005, // 0.5%
    priority: 'critical', // Affects core feed experience
  },

  'schema_fallback': {
    operation: 'schema_fallback',
    displayName: 'Schema Migration Fallback',
    description: 'Queries with primary→legacy schema fallback',
    p50Target: 300,
    p95Target: 800,
    p99Target: 1500,
    errorRateTarget: 0.001, // 0.1%
    errorBudget: 0.0005, // 0.05%
    priority: 'high', // Data consistency critical
  },

  'user_query': {
    operation: 'user_query',
    displayName: 'User Profile Query',
    description: 'User data fetching (profiles, friends, stats)',
    p50Target: 150,
    p95Target: 400,
    p99Target: 800,
    errorRateTarget: 0.01, // 1%
    errorBudget: 0.005, // 0.5%
    priority: 'high',
  },

  'spot_query': {
    operation: 'spot_query',
    displayName: 'Spot Query',
    description: 'Spot data fetching and search',
    p50Target: 200,
    p95Target: 600,
    p99Target: 1200,
    errorRateTarget: 0.02, // 2%
    errorBudget: 0.01, // 1%
    priority: 'high',
  },

  // B2B API operations
  'b2b_spot_data': {
    operation: 'b2b_spot_data',
    displayName: 'B2B Spot Data API',
    description: 'B2B API endpoint for spot data retrieval',
    p50Target: 400,
    p95Target: 1000,
    p99Target: 2000,
    errorRateTarget: 0.05, // 5%
    errorBudget: 0.025, // 2.5%
    priority: 'high', // Revenue impact
  },

  'b2b_nearby_spots': {
    operation: 'b2b_nearby_spots',
    displayName: 'B2B Nearby Spots API',
    description: 'B2B API endpoint for geospatial queries',
    p50Target: 500,
    p95Target: 1200,
    p99Target: 2500,
    errorRateTarget: 0.05, // 5%
    errorBudget: 0.025, // 2.5%
    priority: 'high', // Revenue impact
  },

  'b2b_rate_limiting': {
    operation: 'b2b_rate_limiting',
    displayName: 'B2B Rate Limiting',
    description: 'Firestore transaction for rate limit enforcement',
    p50Target: 100,
    p95Target: 300,
    p99Target: 600,
    errorRateTarget: 0.001, // 0.1%
    errorBudget: 0.0005, // 0.05%
    priority: 'critical', // Must be reliable for fair usage
  },

  // External API operations
  'place_intelligence': {
    operation: 'place_intelligence',
    displayName: 'Place Intelligence',
    description: 'Foursquare/Yelp/OSM data aggregation',
    p50Target: 600,
    p95Target: 1500,
    p99Target: 3000,
    errorRateTarget: 0.02, // 2%
    errorBudget: 0.01, // 1%
    priority: 'medium', // Not blocking user actions
  },

  'place_intelligence_outcome_link': {
    operation: 'place_intelligence_outcome_link',
    displayName: 'Intel Outcome Link',
    description: 'Link check-in outcomes to recent intelligence predictions',
    p50Target: 250,
    p95Target: 700,
    p99Target: 1400,
    errorRateTarget: 0.05, // 5%
    errorBudget: 0.025, // 2.5%
    priority: 'medium',
  },

  'place_intelligence_calibration_abs_error': {
    operation: 'place_intelligence_calibration_abs_error',
    displayName: 'Intel Abs Error',
    description: 'Absolute prediction error score recorded per linked outcome',
    p50Target: 10,
    p95Target: 22,
    p99Target: 35,
    errorRateTarget: 0.2, // 20%
    errorBudget: 0.1, // 10%
    priority: 'medium',
  },

  'foursquare_api': {
    operation: 'foursquare_api',
    displayName: 'Foursquare API',
    description: 'Foursquare API calls',
    p50Target: 400,
    p95Target: 1000,
    p99Target: 2000,
    errorRateTarget: 0.05, // 5%
    errorBudget: 0.025, // 2.5%
    priority: 'medium', // External dependency
  },

  'yelp_api': {
    operation: 'yelp_api',
    displayName: 'Yelp API',
    description: 'Yelp API calls',
    p50Target: 400,
    p95Target: 1000,
    p99Target: 2000,
    errorRateTarget: 0.05, // 5%
    errorBudget: 0.025, // 2.5%
    priority: 'medium', // External dependency
  },

  // Cache operations
  'cache_hit': {
    operation: 'cache_hit',
    displayName: 'Cache Hit',
    description: 'Successful cache lookups',
    p50Target: 10,
    p95Target: 50,
    p99Target: 100,
    errorRateTarget: 0.001, // 0.1%
    errorBudget: 0.0005, // 0.05%
    priority: 'medium',
  },

  'cache_miss': {
    operation: 'cache_miss',
    displayName: 'Cache Miss',
    description: 'Cache misses requiring fallback fetch',
    p50Target: 200,
    p95Target: 500,
    p99Target: 1000,
    errorRateTarget: 0.01, // 1%
    errorBudget: 0.005, // 0.5%
    priority: 'medium',
  },

  // Image operations
  'image_upload': {
    operation: 'image_upload',
    displayName: 'Image Upload',
    description: 'Photo uploads to Firebase Storage',
    p50Target: 1000,
    p95Target: 3000,
    p99Target: 5000,
    errorRateTarget: 0.02, // 2%
    errorBudget: 0.01, // 1%
    priority: 'high', // User-facing operation
  },

  'image_optimization': {
    operation: 'image_optimization',
    displayName: 'Image Optimization',
    description: 'Client-side image compression and resizing',
    p50Target: 300,
    p95Target: 800,
    p99Target: 1500,
    errorRateTarget: 0.01, // 1%
    errorBudget: 0.005, // 0.5%
    priority: 'medium',
  },

  // User actions
  'checkin_create': {
    operation: 'checkin_create',
    displayName: 'Check-in Creation',
    description: 'Creating a new check-in with metrics',
    p50Target: 500,
    p95Target: 1200,
    p99Target: 2500,
    errorRateTarget: 0.005, // 0.5%
    errorBudget: 0.0025, // 0.25%
    priority: 'critical', // Core user action
  },

  'metrics_submit': {
    operation: 'metrics_submit',
    displayName: 'Metrics Submission',
    description: 'Submitting utility metrics (WiFi, noise, etc.)',
    p50Target: 400,
    p95Target: 1000,
    p99Target: 2000,
    errorRateTarget: 0.01, // 1%
    errorBudget: 0.005, // 0.5%
    priority: 'high', // Data quality critical
  },
};

/**
 * Get SLO definition for an operation
 * Returns undefined if no SLO is defined
 */
export function getSLO(operation: string): SLO | undefined {
  return SLO_DEFINITIONS[operation];
}

/**
 * Check if a metric violates its SLO
 * Returns true if any target is exceeded
 */
export function isSLOViolation(
  operation: string,
  p50: number,
  p95: number,
  p99: number,
  errorRate: number
): boolean {
  const slo = getSLO(operation);
  if (!slo) return false; // No SLO defined, no violation

  return (
    p50 > slo.p50Target ||
    p95 > slo.p95Target ||
    p99 > slo.p99Target ||
    errorRate > slo.errorRateTarget
  );
}

/**
 * Calculate SLO compliance percentage
 * Returns 1.0 for perfect compliance, 0.0 for complete violation
 */
export function calculateSLOCompliance(
  operation: string,
  p50: number,
  p95: number,
  p99: number,
  errorRate: number
): number {
  const slo = getSLO(operation);
  if (!slo) return 1.0; // No SLO defined, assume compliant

  // Calculate individual compliance scores (0 to 1)
  const p50Score = Math.max(0, Math.min(1, 1 - (p50 - slo.p50Target) / slo.p50Target));
  const p95Score = Math.max(0, Math.min(1, 1 - (p95 - slo.p95Target) / slo.p95Target));
  const p99Score = Math.max(0, Math.min(1, 1 - (p99 - slo.p99Target) / slo.p99Target));
  const errorScore = Math.max(0, Math.min(1, 1 - (errorRate - slo.errorRateTarget) / slo.errorRateTarget));

  // Weighted average (p95 and error rate are most important)
  return (p50Score * 0.1 + p95Score * 0.4 + p99Score * 0.2 + errorScore * 0.3);
}

/**
 * Get all operations with SLOs, grouped by priority
 */
export function getSLOsByPriority(): {
  critical: SLO[];
  high: SLO[];
  medium: SLO[];
} {
  const all = Object.values(SLO_DEFINITIONS);

  return {
    critical: all.filter(slo => slo.priority === 'critical'),
    high: all.filter(slo => slo.priority === 'high'),
    medium: all.filter(slo => slo.priority === 'medium'),
  };
}

/**
 * Get total number of operations being monitored
 */
export function getTotalSLOCount(): number {
  return Object.keys(SLO_DEFINITIONS).length;
}
