/**
 * Utility Metrics calculation and aggregation
 *
 * Handles temporal tracking (recent vs all-time) and quality scoring
 * for spot metrics (WiFi, noise, busyness, laptop-friendly)
 */

export interface TemporalMetrics {
	recent: MetricsData;
	allTime: MetricsData;
}

export interface MetricsData {
	avgWifiSpeed: number | null;
	avgBusyness: number | null;
	avgNoiseLevel: number | null;
	laptopFriendlyPct: number | null;
	count: number;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Aggregate metrics with temporal separation (recent vs all-time)
 *
 * @param checkins - Array of checkins for a spot
 * @returns Separated recent (7 days) and all-time metrics
 */
export function aggregateTemporalMetrics(checkins: any[]): TemporalMetrics {
	const now = Date.now();

	const recent = checkins.filter((c) => {
		const ts = c.createdAt?.seconds
			? c.createdAt.seconds * 1000
			: typeof c.createdAt === 'number'
			? c.createdAt
			: new Date(c.createdAt).getTime();
		return now - ts <= SEVEN_DAYS_MS;
	});

	return {
		recent: calculateMetrics(recent),
		allTime: calculateMetrics(checkins),
	};
}

/**
 * Calculate aggregated metrics from a set of checkins
 *
 * @param checkins - Array of checkins to aggregate
 * @returns Aggregated metrics data
 */
function calculateMetrics(checkins: any[]): MetricsData {
	const wifiSpeeds: number[] = [];
	const busynessValues: number[] = [];
	const noiseLevels: number[] = [];
	let laptopYes = 0;
	let laptopNo = 0;

	checkins.forEach((c) => {
		if (c.wifiSpeed && typeof c.wifiSpeed === 'number') {
			wifiSpeeds.push(c.wifiSpeed);
		}
		if (c.busyness && typeof c.busyness === 'number') {
			busynessValues.push(c.busyness);
		}

		// Handle both old string format and new numeric format
		if (c.noiseLevel) {
			const convertedNoise =
				typeof c.noiseLevel === 'string'
					? c.noiseLevel === 'quiet'
						? 2
						: c.noiseLevel === 'moderate'
						? 3
						: 4
					: c.noiseLevel;
			if (typeof convertedNoise === 'number') {
				noiseLevels.push(convertedNoise);
			}
		}

		if (c.laptopFriendly === true) laptopYes++;
		else if (c.laptopFriendly === false) laptopNo++;
	});

	const avgWifiSpeed =
		wifiSpeeds.length > 0
			? Math.round((wifiSpeeds.reduce((a, b) => a + b, 0) / wifiSpeeds.length) * 10) / 10
			: null;

	const avgBusyness =
		busynessValues.length > 0
			? Math.round((busynessValues.reduce((a, b) => a + b, 0) / busynessValues.length) * 10) / 10
			: null;

	const avgNoiseLevel =
		noiseLevels.length > 0
			? Math.round((noiseLevels.reduce((a, b) => a + b, 0) / noiseLevels.length) * 10) / 10
			: null;

	const totalLaptop = laptopYes + laptopNo;
	const laptopFriendlyPct =
		totalLaptop > 0 ? Math.round((laptopYes / totalLaptop) * 100) : null;

	return {
		avgWifiSpeed,
		avgBusyness,
		avgNoiseLevel,
		laptopFriendlyPct,
		count: checkins.length,
	};
}

/**
 * Calculate quality score for a spot (0-1 range)
 *
 * Weighted scoring:
 * - WiFi: 1.5x (most important for productivity)
 * - Noise: 1.2x (quieter is better for focus)
 * - Busyness: 1.0x (less busy is better)
 * - Laptop-friendly: 1.3x (important for work)
 *
 * @param spot - Spot object with metrics
 * @returns Quality score from 0-1
 */
export function calculateQualityScore(spot: any): number {
	let score = 0;
	let factorCount = 0;

	// WiFi quality (weight: 1.5x - most important)
	if (spot.avgWifiSpeed) {
		score += (spot.avgWifiSpeed / 5) * 1.5;
		factorCount += 1.5;
	}

	// Noise level (weight: 1.2x - quieter = better for focus)
	// Inverted: 1 = best (silent), 5 = worst (loud)
	if (spot.avgNoiseLevel) {
		score += ((6 - spot.avgNoiseLevel) / 5) * 1.2;
		factorCount += 1.2;
	}

	// Busyness (weight: 1.0x - less busy = better for study)
	// Inverted: 1 = best (empty), 5 = worst (packed)
	if (spot.avgBusyness) {
		score += ((6 - spot.avgBusyness) / 5) * 1.0;
		factorCount += 1.0;
	}

	// Laptop friendly (weight: 1.3x)
	if (spot.laptopFriendlyPct !== null && spot.laptopFriendlyPct !== undefined) {
		score += (spot.laptopFriendlyPct / 100) * 1.3;
		factorCount += 1.3;
	}

	// Normalize to 0-1 range
	return factorCount > 0 ? score / factorCount : 0;
}

/**
 * Calculate composite score for ranking (0-1 range)
 *
 * Combines quality, popularity, and distance:
 * - Quality: 50% (metrics-based)
 * - Popularity: 30% (check-in count)
 * - Distance: 20% penalty
 *
 * @param spot - Spot object with metrics and location
 * @param focus - User's current location
 * @returns Composite score from 0-1
 */
export function calculateCompositeScore(
	spot: any,
	focus: { lat: number; lng: number } | null
): number {
	const qualityScore = calculateQualityScore(spot);
	const popularityScore = Math.min((spot.count || 0) / 50, 1); // Cap at 50 check-ins

	// Distance penalty
	let distancePenalty = 0;
	if (focus && spot.distance !== undefined && spot.distance !== Infinity) {
		const distanceMiles = spot.distance * 0.621371; // km to miles
		distancePenalty = Math.max(0, Math.min(1, distanceMiles / 10)); // 0-10 miles
	}

	// Weighted combination: Quality 50%, Popularity 30%, Distance 20% penalty
	const baseScore = qualityScore * 0.5 + popularityScore * 0.3;
	return baseScore * (1 - distancePenalty * 0.2);
}
