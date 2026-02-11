/**
 * Metrics Impact Tracking
 *
 * Tracks user contributions to Spot Intel and estimates their community impact
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface MetricsImpact {
	totalMetricsProvided: number;
	spotsWithMetrics: number;
	estimatedPeopleHelped: number;
	lastUpdated: number;
}

const IMPACT_KEY = '@perched_metrics_impact';

/**
 * Get user's metrics impact stats
 *
 * @param userId - User ID
 * @returns Impact stats or default values
 */
export async function getMetricsImpact(userId: string): Promise<MetricsImpact> {
	try {
		const json = await AsyncStorage.getItem(`${IMPACT_KEY}_${userId}`);
		if (json) return JSON.parse(json);
	} catch (e) {
		console.warn('Failed to load metrics impact:', e);
	}

	return {
		totalMetricsProvided: 0,
		spotsWithMetrics: 0,
		estimatedPeopleHelped: 0,
		lastUpdated: Date.now(),
	};
}

/**
 * Update user's metrics impact after posting a check-in
 *
 * @param userId - User ID
 * @param checkinData - Check-in data with metrics
 * @param spotViewCount - Average spot views (default: 10)
 * @returns Updated impact stats
 */
export async function updateMetricsImpact(
	userId: string,
	checkinData: any,
	spotViewCount: number = 10
): Promise<MetricsImpact> {
	const impact = await getMetricsImpact(userId);

	// Count how many metrics were provided
	const metricsCount = [
		checkinData.wifiSpeed,
		checkinData.noiseLevel,
		checkinData.busyness,
		checkinData.outletAvailability,
	].filter(Boolean).length;

	if (metricsCount > 0) {
		impact.totalMetricsProvided += metricsCount;
		impact.spotsWithMetrics = Math.max(impact.spotsWithMetrics, 1); // At least 1 spot
		// Estimate 30% of viewers benefit from metrics
		impact.estimatedPeopleHelped += Math.round(spotViewCount * 0.3);
		impact.lastUpdated = Date.now();

		try {
			await AsyncStorage.setItem(`${IMPACT_KEY}_${userId}`, JSON.stringify(impact));
		} catch (e) {
			console.warn('Failed to save metrics impact:', e);
		}
	}

	return impact;
}

/**
 * Reset user's metrics impact (for testing or user request)
 *
 * @param userId - User ID
 */
export async function resetMetricsImpact(userId: string): Promise<void> {
	try {
		await AsyncStorage.removeItem(`${IMPACT_KEY}_${userId}`);
	} catch (e) {
		console.warn('Failed to reset metrics impact:', e);
	}
}
