import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { addBreadcrumb } from './sentry';
import { devLog } from './logger';

// Analytics event types for type safety
export type AnalyticsEvent =
  // User & Auth
  | 'user_signup'
  | 'user_signin'
  | 'user_signout'
  | 'user_verified_email'
  | 'user_profile_updated'
  | 'user_profile_viewed'
  | 'user_deleted_account'

  // Onboarding
  | 'onboarding_started'
  | 'onboarding_step_completed'
  | 'onboarding_completed'
  | 'onboarding_skipped'

  // Check-ins
  | 'checkin_started'
  | 'checkin_photo_captured'
  | 'checkin_place_detected'
  | 'checkin_place_selected'
  | 'checkin_posted'
  | 'checkin_failed'
  | 'checkin_viewed'
  | 'checkin_deleted'
  | 'checkin_shared'

  // Social/Friends
  | 'friend_request_sent'
  | 'friend_request_accepted'
  | 'friend_request_rejected'
  | 'friend_removed'
  | 'user_blocked'
  | 'user_unblocked'
  | 'user_reported'

  // Explore & Discovery
  | 'explore_viewed'
  | 'explore_search'
  | 'explore_filter_applied'
  | 'spot_viewed'
  | 'spot_directions_requested'

  // Feed
  | 'feed_viewed'
  | 'feed_refreshed'
  | 'feed_scrolled'

  // Engagement
  | 'app_opened'
  | 'app_backgrounded'
  | 'app_foregrounded'
  | 'notification_received'
  | 'notification_opened'
  | 'share_opened'
  | 'deeplink_opened'

  // Settings
  | 'settings_opened'
  | 'theme_changed'
  | 'notifications_toggled'

  // Errors & Issues
  | 'error_occurred'
  | 'api_error'
  | 'permission_denied'
  | 'offline_mode_entered';

export interface AnalyticsProperties {
  [key: string]: string | number | boolean | null | undefined;
}

export interface UserProperties {
  userId?: string;
  email?: string;
  name?: string;
  handle?: string;
  campus?: string;
  city?: string;
  createdAt?: string;
  friendsCount?: number;
  checkinsCount?: number;
}

const SEGMENT_WRITE_KEY = Constants.expoConfig?.extra?.SEGMENT_WRITE_KEY || '';
const MIXPANEL_TOKEN = Constants.expoConfig?.extra?.MIXPANEL_TOKEN || '';
const ENV = Constants.expoConfig?.extra?.ENV || 'development';

let initialized = false;
let currentUserId: string | null = null;
let sessionStartTime = Date.now();

// Device context to enrich all events
const deviceContext = {
  platform: Platform.OS,
  version: Platform.Version,
  brand: Device.brand || undefined,
  model: Device.modelName || undefined,
  os: Device.osName || undefined,
  osVersion: Device.osVersion || undefined,
  deviceYear: Device.deviceYearClass || undefined,
};

/**
 * Initialize analytics services
 */
export function initAnalytics() {
  if (initialized) return;

  try {
    // Firebase Analytics is initialized via firebase config
    // Segment/Mixpanel would be initialized here if we add them

    initialized = true;

    // Track app open
    track('app_opened', {
      session_start: sessionStartTime,
      cold_start: true,
    });
  } catch (error) {
    console.error('Failed to initialize analytics:', error);
  }
}

/**
 * Track an event with properties
 */
export function track(
  event: AnalyticsEvent,
  properties?: AnalyticsProperties
) {
  if (!initialized && event !== 'app_opened') {
    initAnalytics();
  }

  const enrichedProperties = {
    ...properties,
    ...deviceContext,
    userId: currentUserId || undefined,
    timestamp: Date.now(),
    env: ENV,
  };

  try {
    // Log to console in development
    if (__DEV__) {
      devLog('[analytics]', event, enrichedProperties);
    }

    // Add to Sentry breadcrumbs for error context
    addBreadcrumb(event, 'analytics', enrichedProperties);

    // Firebase Analytics (built-in)
    if (ENV === 'production' || ENV === 'staging') {
      logFirebaseEvent(event, enrichedProperties);
    }

    // TODO: Add Segment, Mixpanel, etc. when configured
    // if (SEGMENT_WRITE_KEY) {
    //   logSegmentEvent(event, enrichedProperties);
    // }
    // if (MIXPANEL_TOKEN) {
    //   logMixpanelEvent(event, enrichedProperties);
    // }
  } catch (error) {
    console.error('Failed to track event:', event, error);
  }
}

/**
 * Identify a user and set user properties
 */
export function identify(userId: string, properties?: UserProperties) {
  currentUserId = userId;

  try {
    if (__DEV__) {
      devLog('[analytics]', 'Identify user:', userId, properties);
    }

    // Firebase Analytics
    logFirebaseUserProperties(properties);

    // TODO: Segment, Mixpanel
  } catch (error) {
    console.error('Failed to identify user:', error);
  }
}

/**
 * Clear user identity (on logout)
 */
export function resetAnalytics() {
  currentUserId = null;

  try {
    if (__DEV__) {
      devLog('[analytics]', 'Reset user identity');
    }

    // Firebase Analytics doesn't need explicit reset
    // User ID will be null on next event

    // TODO: Reset Segment, Mixpanel
  } catch (error) {
    console.error('Failed to reset analytics:', error);
  }
}

/**
 * Track screen view
 */
export function trackScreen(screenName: string, properties?: AnalyticsProperties) {
  track('app_opened' as AnalyticsEvent, {
    screen: screenName,
    ...properties,
  });
}

/**
 * Track timing (e.g., how long something took)
 */
export function trackTiming(
  category: string,
  variable: string,
  timeMs: number,
  label?: string
) {
  track('app_opened' as AnalyticsEvent, {
    timing_category: category,
    timing_variable: variable,
    timing_ms: timeMs,
    timing_label: label,
  });
}

/**
 * Start a timed event
 */
const timedEvents: Record<string, number> = {};

export function startTimedEvent(eventName: string) {
  timedEvents[eventName] = Date.now();
}

export function endTimedEvent(
  eventName: AnalyticsEvent,
  properties?: AnalyticsProperties
) {
  const startTime = timedEvents[eventName];
  if (startTime) {
    const duration = Date.now() - startTime;
    delete timedEvents[eventName];

    track(eventName, {
      ...properties,
      duration_ms: duration,
    });
  } else {
    track(eventName, properties);
  }
}

// Firebase Analytics integration
function logFirebaseEvent(event: string, properties: AnalyticsProperties) {
  try {
    // Firebase Analytics has character limits on event names (40 chars)
    // and parameter names (40 chars) and values
    const sanitizedEvent = event.substring(0, 40);
    const sanitizedProperties: Record<string, any> = {};

    Object.entries(properties).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        const sanitizedKey = key.substring(0, 40);
        sanitizedProperties[sanitizedKey] = value;
      }
    });

    // Log to Firebase via logEvent service
    const logEvent = require('./logEvent').logEvent;
    void logEvent(sanitizedEvent, currentUserId, sanitizedProperties);
  } catch (error) {
    console.error('Firebase Analytics error:', error);
  }
}

function logFirebaseUserProperties(properties?: UserProperties) {
  try {
    // Firebase user properties
    // In a real implementation, you'd use Firebase's setUserProperties
    if (__DEV__) {
      devLog('[analytics]', 'Set user properties:', properties);
    }
  } catch (error) {
    console.error('Failed to set Firebase user properties:', error);
  }
}

// Helper: Get session duration
export function getSessionDuration(): number {
  return Date.now() - sessionStartTime;
}

// Helper: Track revenue/subscription events (for investor metrics)
export function trackRevenue(
  revenue: number,
  currency: string = 'USD',
  properties?: AnalyticsProperties
) {
  track('app_opened' as AnalyticsEvent, {
    ...properties,
    revenue,
    currency,
    event_type: 'revenue',
  });
}

// Helper: Track onboarding funnel
export function trackOnboardingStep(
  step: number,
  stepName: string,
  completed: boolean
) {
  track(completed ? 'onboarding_step_completed' : 'onboarding_started', {
    step,
    step_name: stepName,
  });
}

// Helper: Track engagement metrics
export function trackEngagement(type: 'daily' | 'weekly' | 'monthly') {
  track('app_opened', {
    engagement_type: type,
    session_duration: getSessionDuration(),
  });
}

// Legacy compatibility
export function trackEvent(name: string, props?: Record<string, unknown>) {
  track(name as AnalyticsEvent, props as AnalyticsProperties);
}

export default {
  initAnalytics,
  track,
  identify,
  resetAnalytics,
  trackScreen,
  trackTiming,
  startTimedEvent,
  endTimedEvent,
  trackRevenue,
  trackOnboardingStep,
  trackEngagement,
  getSessionDuration,
  trackEvent,
};
