/**
 * Smart Data Service
 *
 * This service enriches spot data from external sources beyond user check-ins.
 * It aggregates data from multiple APIs and uses algorithms to derive insights.
 */

// Types for enriched spot data
export type PriceLevel = '$' | '$$' | '$$$' | '$$$$';

export type BestForCategory =
  | 'dates'
  | 'groups'
  | 'solo'
  | 'laptop_work'
  | 'meetings'
  | 'reading'
  | 'studying'
  | 'casual_hangout'
  | 'quick_coffee'
  | 'brunch';

export type VibeTag =
  | 'cozy'
  | 'modern'
  | 'industrial'
  | 'vintage'
  | 'minimalist'
  | 'artsy'
  | 'rustic'
  | 'trendy'
  | 'quiet'
  | 'lively';

export type HoursStatus = {
  isOpen: boolean;
  closesAt?: string;
  opensAt?: string;
  closingSoon?: boolean; // within 1 hour
  openLate?: boolean; // past 10pm
  openEarly?: boolean; // before 7am
};

export type WeatherContext = {
  condition: 'sunny' | 'cloudy' | 'rainy' | 'cold' | 'hot';
  recommendation?: string;
};

export type SmartSpotData = {
  // External API data
  googleRating?: number;
  googleReviewCount?: number;
  yelpRating?: number;
  yelpReviewCount?: number;
  priceLevel?: PriceLevel;

  // Derived/enriched data
  combinedRating?: number; // Weighted average of all sources
  coffeeQuality?: number; // 1-5 scale
  bestFor: BestForCategory[];
  vibes: VibeTag[];

  // Hours intelligence
  hours?: HoursStatus;
  weekdayHours?: string;
  weekendHours?: string;

  // Predictive data
  predictedBusyness?: number; // 0-100 for current time
  busyPrediction?: string; // "Usually busy at this time"

  // Features from external data
  hasOutdoorSeating?: boolean;
  hasDriveThru?: boolean;
  servesFood?: boolean;
  servesAlcohol?: boolean;
  petFriendly?: boolean;

  // Data freshness
  lastEnriched?: number;
};

// Simulated external data for demo (in production, these would be real API calls)
const EXTERNAL_SPOT_DATA: Record<string, Partial<SmartSpotData>> = {
  // Boomtown Coffee
  'ChIJQaJNnMq_QIYRgGPBBisuZ4I': {
    googleRating: 4.6,
    googleReviewCount: 847,
    yelpRating: 4.5,
    yelpReviewCount: 312,
    priceLevel: '$$',
    coffeeQuality: 4.5,
    bestFor: ['laptop_work', 'solo', 'studying', 'casual_hangout'],
    vibes: ['industrial', 'trendy', 'lively'],
    hasOutdoorSeating: true,
    servesFood: true,
    petFriendly: true,
    weekdayHours: '6:30 AM - 7:00 PM',
    weekendHours: '7:00 AM - 7:00 PM',
  },
  // Retrospect Coffee Bar
  'ChIJN1t_tDezQoYR0M9BeNrKQHc': {
    googleRating: 4.7,
    googleReviewCount: 523,
    yelpRating: 4.5,
    yelpReviewCount: 198,
    priceLevel: '$$',
    coffeeQuality: 4.7,
    bestFor: ['dates', 'solo', 'reading', 'quick_coffee'],
    vibes: ['cozy', 'vintage', 'quiet'],
    hasOutdoorSeating: false,
    servesFood: true,
    petFriendly: false,
    weekdayHours: '7:00 AM - 6:00 PM',
    weekendHours: '8:00 AM - 5:00 PM',
  },
  // Tout Suite
  'ChIJk6u9pLm_QIYRxHGzT2J4S3E': {
    googleRating: 4.4,
    googleReviewCount: 2341,
    yelpRating: 4.0,
    yelpReviewCount: 876,
    priceLevel: '$$$',
    coffeeQuality: 4.2,
    bestFor: ['brunch', 'dates', 'groups', 'meetings'],
    vibes: ['modern', 'trendy', 'lively', 'artsy'],
    hasOutdoorSeating: true,
    servesFood: true,
    servesAlcohol: true,
    petFriendly: true,
    weekdayHours: '7:00 AM - 10:00 PM',
    weekendHours: '7:00 AM - 11:00 PM',
  },
  // Blacksmith
  'ChIJCxq7zb2_QIYRmHbWvBG9Kjs': {
    googleRating: 4.5,
    googleReviewCount: 1892,
    yelpRating: 4.5,
    yelpReviewCount: 723,
    priceLevel: '$$',
    coffeeQuality: 4.6,
    bestFor: ['dates', 'brunch', 'casual_hangout', 'quick_coffee'],
    vibes: ['industrial', 'modern', 'lively'],
    hasOutdoorSeating: true,
    servesFood: true,
    servesAlcohol: true,
    petFriendly: true,
    weekdayHours: '7:00 AM - 6:00 PM',
    weekendHours: '8:00 AM - 6:00 PM',
  },
  // Fellini Caffè
  'ChIJhZvBuJa_QIYRkQ9wE3gF9Kw': {
    googleRating: 4.3,
    googleReviewCount: 456,
    yelpRating: 4.0,
    yelpReviewCount: 187,
    priceLevel: '$$',
    coffeeQuality: 4.0,
    bestFor: ['studying', 'laptop_work', 'solo', 'reading'],
    vibes: ['cozy', 'vintage', 'quiet', 'artsy'],
    hasOutdoorSeating: true,
    servesFood: true,
    petFriendly: true,
    weekdayHours: '7:00 AM - 10:00 PM',
    weekendHours: '8:00 AM - 11:00 PM',
  },
  // Morningstar
  'ChIJP3Sa8sK_QIYRDHUr9xF7M2c': {
    googleRating: 4.6,
    googleReviewCount: 312,
    yelpRating: 4.5,
    yelpReviewCount: 145,
    priceLevel: '$$',
    coffeeQuality: 4.4,
    bestFor: ['solo', 'quick_coffee', 'casual_hangout'],
    vibes: ['minimalist', 'modern', 'trendy'],
    hasOutdoorSeating: false,
    servesFood: true,
    petFriendly: false,
    weekdayHours: '7:00 AM - 5:00 PM',
    weekendHours: '8:00 AM - 4:00 PM',
  },
  // Giant Leap Coffee
  'ChIJW7dFocC_QIYRxFl4pD8K9Aw': {
    googleRating: 4.7,
    googleReviewCount: 234,
    yelpRating: 4.5,
    yelpReviewCount: 98,
    priceLevel: '$$',
    coffeeQuality: 4.8,
    bestFor: ['solo', 'quick_coffee', 'laptop_work'],
    vibes: ['minimalist', 'modern', 'quiet'],
    hasOutdoorSeating: false,
    servesFood: false,
    petFriendly: false,
    weekdayHours: '7:00 AM - 4:00 PM',
    weekendHours: '8:00 AM - 3:00 PM',
  },
  // Catalina Coffee
  'ChIJF5uCw76_QIYRzLqJNxB8Skc': {
    googleRating: 4.5,
    googleReviewCount: 678,
    yelpRating: 4.0,
    yelpReviewCount: 289,
    priceLevel: '$$',
    coffeeQuality: 4.3,
    bestFor: ['laptop_work', 'studying', 'solo', 'casual_hangout'],
    vibes: ['cozy', 'quiet', 'vintage'],
    hasOutdoorSeating: true,
    servesFood: true,
    petFriendly: true,
    weekdayHours: '6:30 AM - 6:00 PM',
    weekendHours: '7:00 AM - 5:00 PM',
  },
  // Fondren Library
  'ChIJN7Rlr8G_QIYRmFZBbC0NxHE': {
    googleRating: 4.6,
    googleReviewCount: 189,
    priceLevel: '$',
    bestFor: ['studying', 'reading', 'solo', 'laptop_work'],
    vibes: ['quiet', 'modern'],
    hasOutdoorSeating: false,
    servesFood: false,
    petFriendly: false,
    weekdayHours: '7:00 AM - 12:00 AM',
    weekendHours: '9:00 AM - 10:00 PM',
  },
  // MD Anderson Library
  'ChIJC9L2hNO_QIYRzK3pM8NjH4A': {
    googleRating: 4.4,
    googleReviewCount: 267,
    priceLevel: '$',
    bestFor: ['studying', 'reading', 'solo', 'laptop_work'],
    vibes: ['quiet', 'modern'],
    hasOutdoorSeating: false,
    servesFood: true, // Has cafe
    petFriendly: false,
    weekdayHours: '7:00 AM - 11:00 PM',
    weekendHours: '10:00 AM - 8:00 PM',
  },
  // Paper Co. Cafe
  'ChIJk8mFt7C_QIYRpQNy7zXoJ7c': {
    googleRating: 4.4,
    googleReviewCount: 412,
    yelpRating: 4.0,
    yelpReviewCount: 156,
    priceLevel: '$$',
    coffeeQuality: 4.1,
    bestFor: ['brunch', 'casual_hangout', 'dates', 'groups'],
    vibes: ['trendy', 'modern', 'lively'],
    hasOutdoorSeating: true,
    servesFood: true,
    servesAlcohol: true,
    petFriendly: true,
    weekdayHours: '7:00 AM - 9:00 PM',
    weekendHours: '8:00 AM - 10:00 PM',
  },
  // Antidote Coffee
  'ChIJn6d9yb6_QIYRxP4dW0cS8Kw': {
    googleRating: 4.6,
    googleReviewCount: 534,
    yelpRating: 4.5,
    yelpReviewCount: 223,
    priceLevel: '$$',
    coffeeQuality: 4.5,
    bestFor: ['laptop_work', 'studying', 'solo', 'reading'],
    vibes: ['cozy', 'quiet', 'artsy'],
    hasOutdoorSeating: true,
    servesFood: true,
    petFriendly: true,
    weekdayHours: '7:00 AM - 7:00 PM',
    weekendHours: '8:00 AM - 6:00 PM',
  },
};

// Fallback data generator for spots without external data
function generateFallbackData(spotName: string, category?: string): Partial<SmartSpotData> {
  const isLibrary = category === 'library' || spotName.toLowerCase().includes('library');
  const isCafe = category === 'cafe' || spotName.toLowerCase().includes('coffee') || spotName.toLowerCase().includes('café');

  const baseBestFor: BestForCategory[] = isLibrary
    ? ['studying', 'reading', 'solo', 'laptop_work']
    : isCafe
      ? ['casual_hangout', 'quick_coffee', 'solo']
      : ['casual_hangout'];

  const baseVibes: VibeTag[] = isLibrary
    ? ['quiet']
    : ['modern'];

  return {
    priceLevel: isLibrary ? '$' : '$$',
    bestFor: baseBestFor,
    vibes: baseVibes,
    servesFood: !isLibrary,
  };
}

import { fetchExternalSpotData, type ExternalSpotData } from './externalDataAPI';

/**
 * Get enriched data for a spot from external sources
 * Priority: 1) External APIs (Yelp/Foursquare) 2) Demo data 3) Generated fallback
 */
export async function getSmartSpotData(
  placeId?: string,
  spotName?: string,
  category?: string,
  location?: { lat: number; lng: number }
): Promise<SmartSpotData> {
  let data: Partial<SmartSpotData> = {};

  // 1. Try to fetch from external APIs (with caching)
  if (placeId && spotName && location) {
    try {
      const externalData = await fetchExternalSpotData(placeId, spotName, location);
      if (externalData) {
        data = mapExternalToSmartData(externalData);
      }
    } catch (error) {
      console.log('[SmartData] External API fetch failed, using fallback');
    }
  }

  // 2. Fall back to demo data if no external data
  if (!data.yelpRating && placeId && EXTERNAL_SPOT_DATA[placeId]) {
    data = { ...EXTERNAL_SPOT_DATA[placeId], ...data };
  }

  // 3. Generate fallback data if still empty
  if (!data.bestFor?.length) {
    const fallback = generateFallbackData(spotName || '', category);
    data = { ...fallback, ...data };
  }

  // Calculate combined rating (weighted average)
  const ratings: { value: number; weight: number }[] = [];
  if (data.googleRating) ratings.push({ value: data.googleRating, weight: data.googleReviewCount || 100 });
  if (data.yelpRating) ratings.push({ value: data.yelpRating, weight: data.yelpReviewCount || 50 });

  let combinedRating: number | undefined;
  if (ratings.length > 0) {
    const totalWeight = ratings.reduce((sum, r) => sum + r.weight, 0);
    combinedRating = ratings.reduce((sum, r) => sum + (r.value * r.weight), 0) / totalWeight;
  }

  // Calculate hours status
  const hours = calculateHoursStatus(data.weekdayHours, data.weekendHours);

  // Get predictive busyness
  const { predictedBusyness, busyPrediction } = getPredictedBusyness(placeId, data.bestFor || []);

  return {
    ...data,
    combinedRating,
    hours,
    predictedBusyness,
    busyPrediction,
    bestFor: data.bestFor || [],
    vibes: data.vibes || [],
    lastEnriched: Date.now(),
  } as SmartSpotData;
}

/**
 * Map external API data to SmartSpotData format
 */
function mapExternalToSmartData(external: ExternalSpotData): Partial<SmartSpotData> {
  // Map price level
  const priceMap: Record<number, PriceLevel> = { 1: '$', 2: '$$', 3: '$$$', 4: '$$$$' };
  const priceLevel = external.priceLevel ? priceMap[external.priceLevel] : undefined;

  // Derive bestFor from attributes
  const bestFor: BestForCategory[] = [];
  if (external.attributes?.goodForDates) bestFor.push('dates');
  if (external.attributes?.goodForGroups) bestFor.push('groups', 'casual_hangout');
  if (external.attributes?.goodForWorking) bestFor.push('laptop_work', 'studying');
  if (external.attributes?.noiseLevel === 'quiet') bestFor.push('reading', 'solo');
  if (external.categories?.some(c => c.toLowerCase().includes('brunch'))) bestFor.push('brunch');
  if (bestFor.length === 0) bestFor.push('casual_hangout', 'quick_coffee');

  // Derive vibes from attributes and categories
  const vibes: VibeTag[] = [];
  if (external.attributes?.noiseLevel === 'quiet') vibes.push('quiet');
  if (external.attributes?.noiseLevel === 'loud') vibes.push('lively');
  if (external.attributes?.ambience?.includes('trendy')) vibes.push('trendy');
  if (external.attributes?.ambience?.includes('cozy') || external.attributes?.ambience?.includes('intimate')) vibes.push('cozy');
  if (external.attributes?.ambience?.includes('hipster')) vibes.push('artsy');
  if (vibes.length === 0) vibes.push('modern');

  return {
    yelpRating: external.source === 'yelp' ? external.rating : undefined,
    yelpReviewCount: external.source === 'yelp' ? external.reviewCount : undefined,
    priceLevel,
    bestFor,
    vibes,
    hasOutdoorSeating: external.attributes?.hasOutdoorSeating,
    servesFood: external.attributes?.servesFood,
    servesAlcohol: external.attributes?.servesAlcohol,
    petFriendly: external.attributes?.dogFriendly,
  };
}

/**
 * Calculate current hours status
 */
function calculateHoursStatus(weekdayHours?: string, weekendHours?: string): HoursStatus {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const hoursString = isWeekend ? weekendHours : weekdayHours;

  if (!hoursString) {
    return { isOpen: true }; // Assume open if no data
  }

  // Parse hours string like "7:00 AM - 6:00 PM"
  const match = hoursString.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) {
    return { isOpen: true };
  }

  let openHour = parseInt(match[1]);
  const openMin = parseInt(match[2]);
  const openAmPm = match[3].toUpperCase();
  let closeHour = parseInt(match[4]);
  const closeMin = parseInt(match[5]);
  const closeAmPm = match[6].toUpperCase();

  // Convert to 24-hour
  if (openAmPm === 'PM' && openHour !== 12) openHour += 12;
  if (openAmPm === 'AM' && openHour === 12) openHour = 0;
  if (closeAmPm === 'PM' && closeHour !== 12) closeHour += 12;
  if (closeAmPm === 'AM' && closeHour === 12) closeHour = 0;

  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const currentTimeMin = currentHour * 60 + currentMin;
  const openTimeMin = openHour * 60 + openMin;
  const closeTimeMin = closeHour * 60 + closeMin;

  const isOpen = currentTimeMin >= openTimeMin && currentTimeMin < closeTimeMin;
  const closingSoon = isOpen && (closeTimeMin - currentTimeMin) <= 60;
  const openLate = closeHour >= 22;
  const openEarly = openHour < 7;

  // Format times for display
  const formatTime = (h: number, m: number) => {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return m === 0 ? `${hour12} ${ampm}` : `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  return {
    isOpen,
    closesAt: formatTime(closeHour, closeMin),
    opensAt: formatTime(openHour, openMin),
    closingSoon,
    openLate,
    openEarly,
  };
}

/**
 * Predict busyness based on day/time patterns
 */
function getPredictedBusyness(placeId?: string, bestFor?: BestForCategory[]): { predictedBusyness: number; busyPrediction: string } {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // Base busyness curve (typical coffee shop pattern)
  const hourlyPattern = [
    5, 5, 5, 5, 5, 10,      // 12am-5am: very quiet
    20, 40, 70, 80, 75, 65, // 6am-11am: morning rush
    55, 50, 45, 50, 55, 60, // 12pm-5pm: afternoon lull then pickup
    65, 55, 40, 25, 15, 10, // 6pm-11pm: evening decline
  ];

  let baseBusyness = hourlyPattern[hour];

  // Adjust for weekend (generally busier midday, quieter early morning)
  if (isWeekend) {
    if (hour < 9) baseBusyness *= 0.6;
    else if (hour >= 10 && hour <= 14) baseBusyness *= 1.2;
  }

  // Adjust based on "best for" categories
  if (bestFor?.includes('studying')) {
    // Study spots busier in evenings and weekends
    if (hour >= 18 || isWeekend) baseBusyness *= 1.15;
  }

  if (bestFor?.includes('brunch')) {
    // Brunch spots very busy weekend mornings
    if (isWeekend && hour >= 9 && hour <= 13) baseBusyness *= 1.4;
  }

  const predictedBusyness = Math.min(100, Math.max(0, Math.round(baseBusyness)));

  // Generate text prediction
  let busyPrediction: string;
  if (predictedBusyness < 25) {
    busyPrediction = 'Usually not busy at this time';
  } else if (predictedBusyness < 50) {
    busyPrediction = 'Usually a little busy at this time';
  } else if (predictedBusyness < 75) {
    busyPrediction = 'Usually busy at this time';
  } else {
    busyPrediction = 'Usually very busy at this time';
  }

  return { predictedBusyness, busyPrediction };
}

/**
 * Get time-aware recommendations
 */
export function getTimeAwareRecommendations(): {
  timeContext: string;
  recommendedCategories: BestForCategory[];
  vibePreference: VibeTag[];
} {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  let timeContext: string;
  let recommendedCategories: BestForCategory[];
  let vibePreference: VibeTag[];

  if (hour >= 6 && hour < 9) {
    timeContext = 'Early morning - grab a quick coffee before the rush';
    recommendedCategories = ['quick_coffee', 'solo'];
    vibePreference = ['quiet', 'minimalist'];
  } else if (hour >= 9 && hour < 12) {
    timeContext = isWeekend ? 'Weekend brunch time!' : 'Mid-morning work session';
    recommendedCategories = isWeekend ? ['brunch', 'casual_hangout'] : ['laptop_work', 'meetings'];
    vibePreference = isWeekend ? ['trendy', 'lively'] : ['quiet', 'modern'];
  } else if (hour >= 12 && hour < 14) {
    timeContext = 'Lunch hour - find a spot with good food';
    recommendedCategories = ['brunch', 'casual_hangout', 'groups'];
    vibePreference = ['lively', 'modern'];
  } else if (hour >= 14 && hour < 17) {
    timeContext = 'Afternoon productivity - find a quiet work spot';
    recommendedCategories = ['laptop_work', 'studying', 'solo'];
    vibePreference = ['quiet', 'cozy'];
  } else if (hour >= 17 && hour < 20) {
    timeContext = 'Evening hangout time';
    recommendedCategories = ['casual_hangout', 'dates', 'groups'];
    vibePreference = ['cozy', 'trendy', 'artsy'];
  } else if (hour >= 20 && hour < 23) {
    timeContext = 'Late night study session';
    recommendedCategories = ['studying', 'laptop_work', 'reading'];
    vibePreference = ['quiet', 'cozy'];
  } else {
    timeContext = 'Late night owl - find somewhere still open';
    recommendedCategories = ['studying', 'solo'];
    vibePreference = ['quiet'];
  }

  return { timeContext, recommendedCategories, vibePreference };
}

/**
 * Get weather-aware recommendations (simplified - would use real weather API)
 */
export function getWeatherContext(): WeatherContext {
  // In production, this would call a weather API
  // For demo, simulate based on time/season
  const now = new Date();
  const month = now.getMonth();
  const hour = now.getHours();

  // Houston weather patterns (simplified)
  if (month >= 5 && month <= 9) {
    // Summer - hot and humid
    if (hour >= 14 && hour <= 18) {
      return {
        condition: 'hot',
        recommendation: 'Beat the heat - find a spot with good AC',
      };
    }
    return {
      condition: 'hot',
      recommendation: 'It\'s warm out - indoor seating recommended',
    };
  } else if (month >= 10 || month <= 2) {
    // Winter - mild but can be cold
    return {
      condition: 'cold',
      recommendation: 'Cozy weather - perfect for a warm drink',
    };
  }

  return {
    condition: 'sunny',
    recommendation: 'Nice weather - try a spot with outdoor seating',
  };
}

/**
 * Calculate a smart score for a spot based on all data sources
 */
export function calculateSmartScore(
  smartData: SmartSpotData,
  userMetrics?: { avgWifiSpeed?: number; avgNoiseLevel?: number; avgBusyness?: number },
  preferences?: { needsWifi?: boolean; needsQuiet?: boolean; needsOutlets?: boolean }
): number {
  let score = 50; // Base score

  // External ratings (max +20)
  if (smartData.combinedRating) {
    score += (smartData.combinedRating - 3) * 10; // 4.5 rating = +15
  }

  // Coffee quality (max +10)
  if (smartData.coffeeQuality) {
    score += (smartData.coffeeQuality - 3) * 5; // 4.5 quality = +7.5
  }

  // User-reported metrics (max +15)
  if (userMetrics?.avgWifiSpeed && preferences?.needsWifi) {
    score += Math.min(10, userMetrics.avgWifiSpeed / 10);
  }
  if (userMetrics?.avgNoiseLevel && preferences?.needsQuiet) {
    score += (5 - userMetrics.avgNoiseLevel) * 2; // Lower noise = higher score
  }

  // Currently open bonus (+5)
  if (smartData.hours?.isOpen) {
    score += 5;
    if (smartData.hours.closingSoon) {
      score -= 3; // Penalty for closing soon
    }
  } else {
    score -= 10; // Big penalty for closed
  }

  // Not busy bonus (+5)
  if (smartData.predictedBusyness && smartData.predictedBusyness < 40) {
    score += 5;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

// Export types for use in other files
export type { SmartSpotData, BestForCategory, VibeTag, PriceLevel, HoursStatus, WeatherContext };
