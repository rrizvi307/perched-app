/**
 * Lifestyle Data Service
 *
 * Provides discovery and lifestyle features that appeal to ALL users,
 * not just students/remote workers. This transforms the app from a
 * "study spot finder" to a "coffee shop discovery" lifestyle app.
 */

// ============ DRINK & FOOD SPECIALTIES ============

export type DrinkSpecialty =
  | 'espresso'
  | 'pour_over'
  | 'cold_brew'
  | 'nitro'
  | 'matcha'
  | 'chai'
  | 'specialty_latte'
  | 'single_origin'
  | 'house_roast'
  | 'tea_selection'
  | 'smoothies'
  | 'fresh_juice';

export type FoodSpecialty =
  | 'pastries'
  | 'breakfast'
  | 'brunch'
  | 'sandwiches'
  | 'salads'
  | 'avocado_toast'
  | 'acai_bowls'
  | 'vegan_options'
  | 'gluten_free'
  | 'dairy_free'
  | 'full_kitchen';

export type SignatureDrink = {
  name: string;
  description: string;
  price?: string;
  isPopular?: boolean;
  dietary?: ('vegan' | 'dairy-free' | 'sugar-free')[];
};

// ============ LIFESTYLE & ACCESSIBILITY ============

export type LifestyleTag =
  | 'kid_friendly'
  | 'dog_friendly'
  | 'date_spot'
  | 'instagram_worthy'
  | 'hidden_gem'
  | 'local_favorite'
  | 'tourist_spot'
  | 'first_date'
  | 'group_hangout'
  | 'solo_friendly'
  | 'romantic'
  | 'lively_atmosphere'
  | 'chill_vibes'
  | 'artsy'
  | 'hipster'
  | 'classic'
  | 'trendy';

export type AccessibilityFeature =
  | 'wheelchair_accessible'
  | 'parking_lot'
  | 'street_parking'
  | 'bike_parking'
  | 'public_transit'
  | 'patio_seating'
  | 'rooftop'
  | 'reservations_accepted'
  | 'walk_ins_only'
  | 'drive_thru';

// ============ DISCOVERY CATEGORIES ============

export type DiscoveryCategory =
  | 'hidden_gems'      // Lesser-known but highly rated
  | 'trending_now'     // Gaining popularity
  | 'new_openings'     // Opened in last 6 months
  | 'local_favorites'  // Beloved by regulars
  | 'best_coffee'      // Top coffee quality
  | 'best_vibes'       // Best atmosphere
  | 'best_for_dates'   // Romantic spots
  | 'best_patios'      // Outdoor seating
  | 'instagram_spots'  // Most photogenic
  | 'late_night'       // Open late
  | 'early_bird'       // Opens early
  | 'weekend_brunch';  // Great brunch spots

// ============ CURATED LISTS ============

export type CuratedList = {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  spotIds: string[];
  category: DiscoveryCategory;
};

// ============ FULL LIFESTYLE SPOT DATA ============

export type LifestyleSpotData = {
  // Drink specialties
  drinkSpecialties: DrinkSpecialty[];
  signatureDrinks: SignatureDrink[];
  ropiast?: string; // Coffee roaster they use

  // Food options
  foodSpecialties: FoodSpecialty[];
  dietaryOptions: ('vegan' | 'vegetarian' | 'gluten-free' | 'dairy-free' | 'keto')[];

  // Lifestyle tags
  lifestyleTags: LifestyleTag[];

  // Accessibility & practical
  accessibility: AccessibilityFeature[];

  // Discovery flags
  isHiddenGem?: boolean;
  isTrending?: boolean;
  isNewOpening?: boolean;
  isLocalFavorite?: boolean;
  isInstagramWorthy?: boolean;

  // Photo aesthetic
  aestheticScore?: number; // 1-5 how photogenic
  photoHighlights?: string[]; // URLs of best aesthetic shots

  // Social proof
  instagramMentions?: number;
  googlePhotoCount?: number;

  // Events & specials
  hasLiveMusic?: boolean;
  hasEvents?: boolean;
  hasHappyHour?: boolean;
  happyHourTimes?: string;

  // Wait times (derived from busyness patterns)
  typicalWaitMinutes?: number;
  reservationRecommended?: boolean;
};

// ============ DEMO DATA ============

const LIFESTYLE_SPOT_DATA: Record<string, Partial<LifestyleSpotData>> = {
  // Boomtown Coffee - Industrial, trendy
  'ChIJQaJNnMq_QIYRgGPBBisuZ4I': {
    drinkSpecialties: ['espresso', 'pour_over', 'cold_brew', 'single_origin'],
    signatureDrinks: [
      { name: 'Honey Lavender Latte', description: 'Local honey + dried lavender', price: '$6.50', isPopular: true },
      { name: 'Vietnamese Cold Brew', description: 'Sweetened condensed milk + cold brew', price: '$5.50' },
    ],
    foodSpecialties: ['pastries', 'breakfast', 'avocado_toast'],
    dietaryOptions: ['vegan', 'vegetarian', 'dairy-free'],
    lifestyleTags: ['dog_friendly', 'instagram_worthy', 'local_favorite', 'trendy', 'artsy'],
    accessibility: ['patio_seating', 'street_parking', 'bike_parking'],
    isLocalFavorite: true,
    isInstagramWorthy: true,
    aestheticScore: 4.5,
    instagramMentions: 2340,
    hasEvents: true,
  },

  // Retrospect Coffee Bar - Cozy, vintage
  'ChIJN1t_tDezQoYR0M9BeNrKQHc': {
    drinkSpecialties: ['espresso', 'pour_over', 'chai', 'tea_selection'],
    signatureDrinks: [
      { name: 'Cardamom Rose Latte', description: 'House-made cardamom syrup + rose water', price: '$7', isPopular: true },
      { name: 'Oat Milk Cortado', description: 'Double shot with silky oat milk', price: '$5' },
    ],
    foodSpecialties: ['pastries', 'vegan_options'],
    dietaryOptions: ['vegan', 'dairy-free'],
    lifestyleTags: ['date_spot', 'hidden_gem', 'romantic', 'chill_vibes', 'solo_friendly'],
    accessibility: ['street_parking'],
    isHiddenGem: true,
    aestheticScore: 4.8,
    instagramMentions: 890,
  },

  // Tout Suite - Modern, brunch spot
  'ChIJk6u9pLm_QIYRxHGzT2J4S3E': {
    drinkSpecialties: ['espresso', 'specialty_latte', 'fresh_juice', 'smoothies'],
    signatureDrinks: [
      { name: 'Matcha Latte', description: 'Ceremonial grade matcha', price: '$6', isPopular: true },
      { name: 'Fresh Orange Juice', description: 'Squeezed to order', price: '$5' },
    ],
    foodSpecialties: ['brunch', 'breakfast', 'avocado_toast', 'acai_bowls', 'full_kitchen'],
    dietaryOptions: ['vegan', 'vegetarian', 'gluten-free'],
    lifestyleTags: ['instagram_worthy', 'group_hangout', 'trendy', 'date_spot', 'kid_friendly'],
    accessibility: ['parking_lot', 'wheelchair_accessible', 'patio_seating'],
    isTrending: true,
    isInstagramWorthy: true,
    aestheticScore: 4.7,
    instagramMentions: 5670,
    hasHappyHour: true,
    happyHourTimes: '3-6pm weekdays',
  },

  // Blacksmith - Hip, social
  'ChIJCxq7zb2_QIYRmHbWvBG9Kjs': {
    drinkSpecialties: ['espresso', 'cold_brew', 'nitro', 'house_roast'],
    signatureDrinks: [
      { name: 'Nitro Cold Brew', description: 'Creamy nitrogen-infused cold brew', price: '$5.50', isPopular: true },
      { name: 'Horchata Latte', description: 'House-made horchata + espresso', price: '$6' },
    ],
    foodSpecialties: ['brunch', 'sandwiches', 'pastries'],
    dietaryOptions: ['vegetarian'],
    lifestyleTags: ['local_favorite', 'lively_atmosphere', 'group_hangout', 'hipster', 'date_spot'],
    accessibility: ['patio_seating', 'street_parking', 'bike_parking'],
    isLocalFavorite: true,
    aestheticScore: 4.3,
    instagramMentions: 3210,
    hasLiveMusic: true,
  },

  // Fellini Caffè - Artsy, eclectic
  'ChIJhZvBuJa_QIYRkQ9wE3gF9Kw': {
    drinkSpecialties: ['espresso', 'chai', 'tea_selection', 'specialty_latte'],
    signatureDrinks: [
      { name: 'Turkish Coffee', description: 'Traditional preparation', price: '$4.50' },
      { name: 'Chai Flight', description: 'Sample 3 house chai blends', price: '$8', isPopular: true },
    ],
    foodSpecialties: ['pastries', 'sandwiches', 'vegan_options'],
    dietaryOptions: ['vegan', 'vegetarian'],
    lifestyleTags: ['hidden_gem', 'artsy', 'solo_friendly', 'chill_vibes', 'dog_friendly'],
    accessibility: ['patio_seating', 'street_parking'],
    isHiddenGem: true,
    aestheticScore: 4.2,
    instagramMentions: 670,
    hasEvents: true,
  },

  // Giant Leap Coffee - Minimalist, specialty
  'ChIJW7dFocC_QIYRxFl4pD8K9Aw': {
    drinkSpecialties: ['pour_over', 'single_origin', 'espresso', 'cold_brew'],
    signatureDrinks: [
      { name: 'Single Origin Pour Over', description: 'Rotating selection, brewed to order', price: '$6', isPopular: true },
      { name: 'Espresso Flight', description: '3 different single origins', price: '$9' },
    ],
    foodSpecialties: [],
    dietaryOptions: ['dairy-free'],
    lifestyleTags: ['hidden_gem', 'solo_friendly', 'hipster', 'chill_vibes'],
    accessibility: ['street_parking'],
    isHiddenGem: true,
    aestheticScore: 4.0,
    instagramMentions: 450,
  },

  // Catalina Coffee - Neighborhood gem
  'ChIJF5uCw76_QIYRzLqJNxB8Skc': {
    drinkSpecialties: ['espresso', 'cold_brew', 'house_roast', 'tea_selection'],
    signatureDrinks: [
      { name: 'Brown Sugar Oat Latte', description: 'House-made brown sugar syrup', price: '$6', isPopular: true },
      { name: 'Iced Mocha', description: 'Rich chocolate + espresso', price: '$5.50' },
    ],
    foodSpecialties: ['pastries', 'breakfast', 'sandwiches'],
    dietaryOptions: ['vegetarian', 'vegan'],
    lifestyleTags: ['local_favorite', 'dog_friendly', 'kid_friendly', 'chill_vibes', 'classic'],
    accessibility: ['patio_seating', 'parking_lot', 'wheelchair_accessible'],
    isLocalFavorite: true,
    aestheticScore: 3.8,
    instagramMentions: 1230,
  },

  // Paper Co. Cafe - Trendy brunch
  'ChIJk8mFt7C_QIYRpQNy7zXoJ7c': {
    drinkSpecialties: ['espresso', 'matcha', 'fresh_juice', 'smoothies'],
    signatureDrinks: [
      { name: 'Ube Latte', description: 'Purple yam + espresso', price: '$7', isPopular: true },
      { name: 'Butterfly Pea Lemonade', description: 'Color-changing magic', price: '$6' },
    ],
    foodSpecialties: ['brunch', 'avocado_toast', 'acai_bowls', 'full_kitchen'],
    dietaryOptions: ['vegan', 'vegetarian', 'gluten-free'],
    lifestyleTags: ['instagram_worthy', 'trendy', 'date_spot', 'group_hangout', 'first_date'],
    accessibility: ['patio_seating', 'street_parking', 'reservations_accepted'],
    isTrending: true,
    isInstagramWorthy: true,
    aestheticScore: 4.9,
    instagramMentions: 4560,
    reservationRecommended: true,
    typicalWaitMinutes: 15,
  },

  // Antidote Coffee - Neighborhood cozy
  'ChIJn6d9yb6_QIYRxP4dW0cS8Kw': {
    drinkSpecialties: ['espresso', 'pour_over', 'chai', 'tea_selection'],
    signatureDrinks: [
      { name: 'Lavender Honey Latte', description: 'Calming lavender + local honey', price: '$6', isPopular: true },
      { name: 'Golden Milk', description: 'Turmeric + ginger + oat milk', price: '$5.50', dietary: ['vegan', 'dairy-free'] },
    ],
    foodSpecialties: ['pastries', 'vegan_options', 'gluten_free'],
    dietaryOptions: ['vegan', 'vegetarian', 'gluten-free', 'dairy-free'],
    lifestyleTags: ['hidden_gem', 'solo_friendly', 'chill_vibes', 'dog_friendly', 'romantic'],
    accessibility: ['patio_seating', 'street_parking', 'bike_parking'],
    isHiddenGem: true,
    aestheticScore: 4.4,
    instagramMentions: 780,
  },
};

// ============ SERVICE FUNCTIONS ============

/**
 * Get lifestyle data for a spot
 */
export async function getLifestyleSpotData(placeId?: string): Promise<LifestyleSpotData | null> {
  if (!placeId) return null;

  const data = LIFESTYLE_SPOT_DATA[placeId];
  if (!data) return null;

  return {
    drinkSpecialties: data.drinkSpecialties || [],
    signatureDrinks: data.signatureDrinks || [],
    foodSpecialties: data.foodSpecialties || [],
    dietaryOptions: data.dietaryOptions || [],
    lifestyleTags: data.lifestyleTags || [],
    accessibility: data.accessibility || [],
    ...data,
  } as LifestyleSpotData;
}

/**
 * Get curated discovery lists
 */
export function getCuratedLists(): CuratedList[] {
  return [
    {
      id: 'hidden-gems',
      title: 'Hidden Gems',
      subtitle: 'Lesser-known spots locals love',
      emoji: '💎',
      category: 'hidden_gems',
      spotIds: ['ChIJN1t_tDezQoYR0M9BeNrKQHc', 'ChIJhZvBuJa_QIYRkQ9wE3gF9Kw', 'ChIJW7dFocC_QIYRxFl4pD8K9Aw', 'ChIJn6d9yb6_QIYRxP4dW0cS8Kw'],
    },
    {
      id: 'date-night',
      title: 'Perfect for Dates',
      subtitle: 'Romantic spots with great vibes',
      emoji: '💕',
      category: 'best_for_dates',
      spotIds: ['ChIJN1t_tDezQoYR0M9BeNrKQHc', 'ChIJk6u9pLm_QIYRxHGzT2J4S3E', 'ChIJk8mFt7C_QIYRpQNy7zXoJ7c', 'ChIJn6d9yb6_QIYRxP4dW0cS8Kw'],
    },
    {
      id: 'instagram-worthy',
      title: 'Instagram Worthy',
      subtitle: 'Most photogenic spots',
      emoji: '📸',
      category: 'instagram_spots',
      spotIds: ['ChIJQaJNnMq_QIYRgGPBBisuZ4I', 'ChIJk6u9pLm_QIYRxHGzT2J4S3E', 'ChIJk8mFt7C_QIYRpQNy7zXoJ7c'],
    },
    {
      id: 'best-patios',
      title: 'Best Patios',
      subtitle: 'Soak up the sun',
      emoji: '☀️',
      category: 'best_patios',
      spotIds: ['ChIJQaJNnMq_QIYRgGPBBisuZ4I', 'ChIJCxq7zb2_QIYRmHbWvBG9Kjs', 'ChIJhZvBuJa_QIYRkQ9wE3gF9Kw', 'ChIJF5uCw76_QIYRzLqJNxB8Skc'],
    },
    {
      id: 'dog-friendly',
      title: 'Dog Friendly',
      subtitle: 'Bring your pup',
      emoji: '🐕',
      category: 'local_favorites',
      spotIds: ['ChIJQaJNnMq_QIYRgGPBBisuZ4I', 'ChIJhZvBuJa_QIYRkQ9wE3gF9Kw', 'ChIJF5uCw76_QIYRzLqJNxB8Skc', 'ChIJn6d9yb6_QIYRxP4dW0cS8Kw'],
    },
    {
      id: 'best-coffee',
      title: 'Best Coffee',
      subtitle: 'For the coffee snobs',
      emoji: '☕',
      category: 'best_coffee',
      spotIds: ['ChIJN1t_tDezQoYR0M9BeNrKQHc', 'ChIJW7dFocC_QIYRxFl4pD8K9Aw', 'ChIJQaJNnMq_QIYRgGPBBisuZ4I'],
    },
    {
      id: 'weekend-brunch',
      title: 'Weekend Brunch',
      subtitle: 'Start your weekend right',
      emoji: '🥞',
      category: 'weekend_brunch',
      spotIds: ['ChIJk6u9pLm_QIYRxHGzT2J4S3E', 'ChIJCxq7zb2_QIYRmHbWvBG9Kjs', 'ChIJk8mFt7C_QIYRpQNy7zXoJ7c'],
    },
    {
      id: 'trending',
      title: 'Trending Now',
      subtitle: 'What\'s hot right now',
      emoji: '🔥',
      category: 'trending_now',
      spotIds: ['ChIJk6u9pLm_QIYRxHGzT2J4S3E', 'ChIJk8mFt7C_QIYRpQNy7zXoJ7c'],
    },
  ];
}

/**
 * Get discovery badge for a spot
 */
export function getDiscoveryBadge(lifestyleData: LifestyleSpotData): { emoji: string; label: string; color: string } | null {
  if (lifestyleData.isTrending) {
    return { emoji: '🔥', label: 'Trending', color: '#EF4444' };
  }
  if (lifestyleData.isHiddenGem) {
    return { emoji: '💎', label: 'Hidden Gem', color: '#8B5CF6' };
  }
  if (lifestyleData.isInstagramWorthy) {
    return { emoji: '📸', label: 'Insta-worthy', color: '#EC4899' };
  }
  if (lifestyleData.isLocalFavorite) {
    return { emoji: '❤️', label: 'Local Favorite', color: '#F59E0B' };
  }
  if (lifestyleData.isNewOpening) {
    return { emoji: '✨', label: 'New', color: '#10B981' };
  }
  return null;
}

/**
 * Format dietary options for display
 */
export function formatDietaryOptions(options: string[]): string[] {
  const labels: Record<string, string> = {
    'vegan': '🌱 Vegan',
    'vegetarian': '🥬 Vegetarian',
    'gluten-free': '🌾 GF',
    'dairy-free': '🥛 DF',
    'keto': '🥑 Keto',
  };
  return options.map(opt => labels[opt] || opt);
}

/**
 * Format drink specialty for display
 */
export function formatDrinkSpecialty(specialty: DrinkSpecialty): string {
  const labels: Record<DrinkSpecialty, string> = {
    'espresso': 'Espresso',
    'pour_over': 'Pour Over',
    'cold_brew': 'Cold Brew',
    'nitro': 'Nitro',
    'matcha': 'Matcha',
    'chai': 'Chai',
    'specialty_latte': 'Specialty Lattes',
    'single_origin': 'Single Origin',
    'house_roast': 'House Roast',
    'tea_selection': 'Tea Selection',
    'smoothies': 'Smoothies',
    'fresh_juice': 'Fresh Juice',
  };
  return labels[specialty] || specialty;
}

/**
 * Format lifestyle tag for display
 */
export function formatLifestyleTag(tag: LifestyleTag): { label: string; emoji: string } {
  const config: Record<LifestyleTag, { label: string; emoji: string }> = {
    'kid_friendly': { label: 'Kid Friendly', emoji: '👶' },
    'dog_friendly': { label: 'Dog Friendly', emoji: '🐕' },
    'date_spot': { label: 'Date Spot', emoji: '💕' },
    'instagram_worthy': { label: 'Instagrammable', emoji: '📸' },
    'hidden_gem': { label: 'Hidden Gem', emoji: '💎' },
    'local_favorite': { label: 'Local Favorite', emoji: '❤️' },
    'tourist_spot': { label: 'Tourist Spot', emoji: '🗺️' },
    'first_date': { label: 'First Date', emoji: '🌹' },
    'group_hangout': { label: 'Group Hangout', emoji: '👥' },
    'solo_friendly': { label: 'Solo Friendly', emoji: '🧘' },
    'romantic': { label: 'Romantic', emoji: '💝' },
    'lively_atmosphere': { label: 'Lively', emoji: '🎉' },
    'chill_vibes': { label: 'Chill Vibes', emoji: '😌' },
    'artsy': { label: 'Artsy', emoji: '🎨' },
    'hipster': { label: 'Hipster', emoji: '🧔' },
    'classic': { label: 'Classic', emoji: '☕' },
    'trendy': { label: 'Trendy', emoji: '✨' },
  };
  return config[tag] || { label: tag, emoji: '📍' };
}

/**
 * Format accessibility feature for display
 */
export function formatAccessibility(feature: AccessibilityFeature): string {
  const labels: Record<AccessibilityFeature, string> = {
    'wheelchair_accessible': '♿ Wheelchair OK',
    'parking_lot': '🅿️ Parking Lot',
    'street_parking': '🚗 Street Parking',
    'bike_parking': '🚲 Bike Parking',
    'public_transit': '🚇 Transit Nearby',
    'patio_seating': '☀️ Patio',
    'rooftop': '🏙️ Rooftop',
    'reservations_accepted': '📅 Reservations',
    'walk_ins_only': '🚶 Walk-ins Only',
    'drive_thru': '🚗 Drive-thru',
  };
  return labels[feature] || feature;
}

/**
 * Get mood-based recommendations
 */
export function getMoodRecommendations(mood: 'chill' | 'social' | 'romantic' | 'productive' | 'adventurous'): {
  title: string;
  description: string;
  lifestyleTags: LifestyleTag[];
  vibes: string[];
} {
  const moods = {
    'chill': {
      title: 'Chill Mode',
      description: 'Relaxed spots to unwind',
      lifestyleTags: ['chill_vibes', 'solo_friendly', 'hidden_gem'] as LifestyleTag[],
      vibes: ['cozy', 'quiet'],
    },
    'social': {
      title: 'Social Mode',
      description: 'Great spots to hang with friends',
      lifestyleTags: ['group_hangout', 'lively_atmosphere', 'local_favorite'] as LifestyleTag[],
      vibes: ['lively', 'trendy'],
    },
    'romantic': {
      title: 'Date Mode',
      description: 'Perfect spots for romance',
      lifestyleTags: ['date_spot', 'romantic', 'first_date'] as LifestyleTag[],
      vibes: ['cozy', 'intimate'],
    },
    'productive': {
      title: 'Focus Mode',
      description: 'Get stuff done',
      lifestyleTags: ['solo_friendly', 'chill_vibes'] as LifestyleTag[],
      vibes: ['quiet', 'minimalist'],
    },
    'adventurous': {
      title: 'Adventure Mode',
      description: 'Discover something new',
      lifestyleTags: ['hidden_gem', 'trendy', 'artsy'] as LifestyleTag[],
      vibes: ['artsy', 'unique'],
    },
  };
  return moods[mood];
}

/**
 * Get "surprise me" random recommendation
 */
export function getSurpriseRecommendation(): { placeId: string; reason: string } {
  const surprises = [
    { placeId: 'ChIJN1t_tDezQoYR0M9BeNrKQHc', reason: 'A cozy hidden gem with amazing coffee' },
    { placeId: 'ChIJhZvBuJa_QIYRkQ9wE3gF9Kw', reason: 'Artsy vibes and unique chai selection' },
    { placeId: 'ChIJW7dFocC_QIYRxFl4pD8K9Aw', reason: 'Minimalist spot for coffee purists' },
    { placeId: 'ChIJk8mFt7C_QIYRpQNy7zXoJ7c', reason: 'Trending spot with incredible aesthetics' },
    { placeId: 'ChIJn6d9yb6_QIYRxP4dW0cS8Kw', reason: 'Neighborhood gem with calming vibes' },
  ];
  return surprises[Math.floor(Math.random() * surprises.length)];
}
