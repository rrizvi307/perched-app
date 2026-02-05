import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Updates from 'expo-updates';

const SENTRY_DSN = Constants.expoConfig?.extra?.SENTRY_DSN || '';
const ENV = Constants.expoConfig?.extra?.ENV || 'development';

let initialized = false;

export function initSentry() {
	if (initialized || !SENTRY_DSN) {
		return;
	}

	try {
		Sentry.init({
			dsn: SENTRY_DSN,
			environment: ENV,
			enabled: ENV === 'production' || ENV === 'staging',
			enableAutoSessionTracking: true,
			sessionTrackingIntervalMillis: 30000,

			// Performance monitoring
			tracesSampleRate: ENV === 'production' ? 0.2 : 1.0,
			enableAutoPerformanceTracing: true,

			// Add context
			beforeSend(event, hint) {
				// Filter out non-critical errors in dev
				if (ENV === 'development') {
					return null;
				}

				// Add additional context
				if (event.user) {
					delete event.user.email; // Don't send PII
				}

				return event;
			},

			integrations: [
				new Sentry.ReactNativeTracing({
					routingInstrumentation: new Sentry.ReactNavigationInstrumentation(),
					traceFetch: true,
					traceXHR: true,
					enableNativeFramesTracking: true,
					enableStallTracking: true,
				}),
			],
		});

		// Set device context
		Sentry.setContext('device', {
			brand: Device.brand,
			manufacturer: Device.manufacturer,
			modelName: Device.modelName,
			osName: Device.osName,
			osVersion: Device.osVersion,
			platformApiLevel: Device.platformApiLevel,
			deviceYearClass: Device.deviceYearClass,
		});

		// Set update context
		if (Updates.manifest) {
			Sentry.setContext('update', {
				updateId: Updates.updateId,
				channel: Updates.channel,
			});
		}

		initialized = true;
	} catch (error) {
		console.error('Failed to initialize Sentry:', error);
	}
}

export function captureException(error: Error, context?: Record<string, any>) {
	if (!initialized) return;

	try {
		if (context) {
			Sentry.setContext('error_context', context);
		}
		Sentry.captureException(error);
	} catch (e) {
		console.error('Failed to capture exception:', e);
	}
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info', context?: Record<string, any>) {
	if (!initialized) return;

	try {
		if (context) {
			Sentry.setContext('message_context', context);
		}
		Sentry.captureMessage(message, level);
	} catch (e) {
		console.error('Failed to capture message:', e);
	}
}

export function setUser(userId: string, data?: Record<string, any>) {
	if (!initialized) return;

	try {
		Sentry.setUser({
			id: userId,
			...data,
		});
	} catch (e) {
		console.error('Failed to set user:', e);
	}
}

export function clearUser() {
	if (!initialized) return;

	try {
		Sentry.setUser(null);
	} catch (e) {
		console.error('Failed to clear user:', e);
	}
}

export function addBreadcrumb(message: string, category: string, data?: Record<string, any>) {
	if (!initialized) return;

	try {
		Sentry.addBreadcrumb({
			message,
			category,
			data,
			level: 'info',
		});
	} catch (e) {
		console.error('Failed to add breadcrumb:', e);
	}
}

export { Sentry };
