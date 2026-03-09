/**
 * NLP Review Analysis Service (Phase A)
 *
 * Analyzes Google/Yelp reviews using GPT-4o-mini to extract:
 * - Noise level (quiet/moderate/loud)
 * - WiFi availability
 * - "Good for work/studying" mentions
 *
 * LEGAL COMPLIANCE:
 * - Stores ONLY inference results, NOT raw review text
 * - Adheres to Google Places API Terms (Section 3.2.3b)
 * - Adheres to Yelp Fusion API Terms (Section 4)
 */

import Constants from 'expo-constants';

export interface ReviewNLPResult {
  inferredNoise: 'quiet' | 'moderate' | 'loud' | null;
  inferredNoiseConfidence: number;  // 0-1
  hasWifi: boolean;
  wifiConfidence: number;
  goodForStudying: boolean;
  goodForMeetings: boolean;
  dateFriendly: number; // 0-1 confidence
  aestheticVibe: 'cozy' | 'modern' | 'rustic' | 'industrial' | 'classic' | null;
  foodQualitySignal: number; // 0-1 confidence
  musicAtmosphere: 'none' | 'chill' | 'upbeat' | 'live' | 'unknown';
  instagramWorthy: number; // 0-1 confidence
  seatingComfort: 'comfortable' | 'basic' | 'mixed' | 'unknown';
  goodForDates: number; // 0-1 confidence
  goodForGroups: number; // 0-1 confidence
  reviewCount: number;  // Number of reviews analyzed
  lastAnalyzed: number;  // Timestamp
}

interface ReviewSample {
  text: string;
  rating: number;
  time: number;
}

/**
 * Analyze reviews using GPT-4o-mini to extract spot intelligence
 *
 * @param reviews - Array of review texts (5-10 samples)
 * @param spotName - Spot name for context
 * @returns NLP inference results (NO raw text stored)
 */
export async function analyzeReviews(
  reviews: ReviewSample[],
  spotName: string
): Promise<ReviewNLPResult> {
  if (reviews.length === 0) {
    return {
      inferredNoise: null,
      inferredNoiseConfidence: 0,
      hasWifi: false,
      wifiConfidence: 0,
      goodForStudying: false,
      goodForMeetings: false,
      dateFriendly: 0,
      aestheticVibe: null,
      foodQualitySignal: 0,
      musicAtmosphere: 'unknown',
      instagramWorthy: 0,
      seatingComfort: 'unknown',
      goodForDates: 0,
      goodForGroups: 0,
      reviewCount: 0,
      lastAnalyzed: Date.now(),
    };
  }

  try {
    const openaiKey = getOpenAIKey();
    if (!openaiKey) {
      console.warn('OpenAI API key not configured, skipping NLP analysis');
      return getEmptyResult();
    }

    // Build prompt with strict JSON schema
    const prompt = buildAnalysisPrompt(reviews, spotName);

    // Call GPT-4o-mini
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at analyzing coffee shop and workspace reviews to extract structured data about noise levels, WiFi, and work suitability. Respond ONLY with valid JSON matching the schema provided.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,  // Low temperature for consistent output
        max_tokens: 200,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      return getEmptyResult();
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('No content in OpenAI response');
      return getEmptyResult();
    }

    // Parse JSON response
    const parsed = JSON.parse(content);

    const aestheticVibe = normalizeAestheticVibe(parsed.aestheticVibe);
    const musicAtmosphere = normalizeMusicAtmosphere(parsed.musicAtmosphere);
    const seatingComfort = normalizeSeatingComfort(parsed.seatingComfort);

    // Validate and normalize
    return {
      inferredNoise: normalizeNoiseLevel(parsed.noise),
      inferredNoiseConfidence: clamp(parsed.noiseConfidence || 0, 0, 1),
      hasWifi: Boolean(parsed.hasWifi),
      wifiConfidence: clamp(parsed.wifiConfidence || 0, 0, 1),
      goodForStudying: Boolean(parsed.goodForStudying),
      goodForMeetings: Boolean(parsed.goodForMeetings),
      dateFriendly: clamp(parsed.dateFriendly || 0, 0, 1),
      aestheticVibe,
      foodQualitySignal: clamp(parsed.foodQualitySignal || 0, 0, 1),
      musicAtmosphere,
      instagramWorthy: clamp(parsed.instagramWorthy || 0, 0, 1),
      seatingComfort,
      goodForDates: clamp(parsed.goodForDates || 0, 0, 1),
      goodForGroups: clamp(parsed.goodForGroups || 0, 0, 1),
      reviewCount: reviews.length,
      lastAnalyzed: Date.now(),
    };
  } catch (error) {
    console.error('NLP analysis error:', error);
    return getEmptyResult();
  }
}

/**
 * Build analysis prompt with strict JSON schema
 */
function buildAnalysisPrompt(reviews: ReviewSample[], spotName: string): string {
  // Sample reviews (limit context)
  const reviewTexts = reviews
    .slice(0, 10)  // Max 10 reviews
    .map((r, i) => `Review ${i + 1} (${r.rating}⭐): "${r.text.slice(0, 200)}"`)
    .join('\n\n');

  return `Analyze these reviews for "${spotName}" and extract the following information:

${reviewTexts}

Respond with JSON matching this exact schema:
{
  "noise": "quiet" | "moderate" | "loud" | null,
  "noiseConfidence": 0.0 to 1.0,
  "hasWifi": true | false,
  "wifiConfidence": 0.0 to 1.0,
  "goodForStudying": true | false,
  "goodForMeetings": true | false,
  "dateFriendly": 0.0 to 1.0,
  "aestheticVibe": "cozy" | "modern" | "rustic" | "industrial" | "classic" | null,
  "foodQualitySignal": 0.0 to 1.0,
  "musicAtmosphere": "none" | "chill" | "upbeat" | "live" | "unknown",
  "instagramWorthy": 0.0 to 1.0,
  "seatingComfort": "comfortable" | "basic" | "mixed" | "unknown",
  "goodForDates": 0.0 to 1.0,
  "goodForGroups": 0.0 to 1.0
}

Guidelines:
- "noise": Infer from mentions of "quiet", "loud", "noisy", "peaceful", "busy atmosphere"
  - "quiet" = peaceful, calm, good for focus
  - "moderate" = some background noise but manageable
  - "loud" = noisy, busy, hard to concentrate
  - null = no mentions found
- "noiseConfidence": How certain you are (0-1)
- "hasWifi": True if WiFi is mentioned positively ("good WiFi", "fast internet")
- "wifiConfidence": How certain you are based on mentions
- "goodForStudying": True if reviews mention "study", "work", "laptop", "quiet for work"
- "goodForMeetings": True if reviews mention "meet", "meetings", "group work", "good for conversation"
- "dateFriendly": Confidence this place is date-friendly
- "aestheticVibe": Dominant aesthetic style if implied
- "foodQualitySignal": Confidence food/pastry quality is strong
- "musicAtmosphere": Dominant music style mentioned
- "instagramWorthy": Confidence this place is photogenic
- "seatingComfort": Comfort level implied by seating mentions
- "goodForDates": Explicit confidence for date suitability
- "goodForGroups": Explicit confidence for group suitability

If no information is found, use null for noise and false for booleans with 0 confidence.`;
}

/**
 * Normalize noise level to valid enum
 */
function normalizeNoiseLevel(value: any): 'quiet' | 'moderate' | 'loud' | null {
  if (typeof value !== 'string') return null;
  const lower = value.toLowerCase();
  if (lower === 'quiet') return 'quiet';
  if (lower === 'moderate') return 'moderate';
  if (lower === 'loud') return 'loud';
  return null;
}

function normalizeAestheticVibe(value: any): ReviewNLPResult['aestheticVibe'] {
  if (typeof value !== 'string') return null;
  const lower = value.toLowerCase();
  if (lower === 'cozy' || lower === 'modern' || lower === 'rustic' || lower === 'industrial' || lower === 'classic') return lower;
  return null;
}

function normalizeMusicAtmosphere(value: any): ReviewNLPResult['musicAtmosphere'] {
  if (typeof value !== 'string') return 'unknown';
  const lower = value.toLowerCase();
  if (lower === 'none' || lower === 'chill' || lower === 'upbeat' || lower === 'live') return lower;
  return 'unknown';
}

function normalizeSeatingComfort(value: any): ReviewNLPResult['seatingComfort'] {
  if (typeof value !== 'string') return 'unknown';
  const lower = value.toLowerCase();
  if (lower === 'comfortable' || lower === 'basic' || lower === 'mixed') return lower;
  return 'unknown';
}

/**
 * Clamp value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Get OpenAI API key from config
 */
function getOpenAIKey(): string | null {
  const raw =
    (process.env.EXPO_PUBLIC_ENABLE_CLIENT_PROVIDER_CALLS as string) ||
    (process.env.ENABLE_CLIENT_PROVIDER_CALLS as string) ||
    '';
  const allowClientProviderCalls = !!__DEV__ && ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
  if (!allowClientProviderCalls) return null;

  const expoKey = (Constants.expoConfig as any)?.extra?.OPENAI_API_KEY;
  const globalKey = (global as any)?.OPENAI_API_KEY;
  return expoKey || globalKey || null;
}

/**
 * Empty result when NLP unavailable
 */
function getEmptyResult(): ReviewNLPResult {
  return {
    inferredNoise: null,
    inferredNoiseConfidence: 0,
    hasWifi: false,
    wifiConfidence: 0,
    goodForStudying: false,
    goodForMeetings: false,
    dateFriendly: 0,
    aestheticVibe: null,
    foodQualitySignal: 0,
    musicAtmosphere: 'unknown',
    instagramWorthy: 0,
    seatingComfort: 'unknown',
    goodForDates: 0,
    goodForGroups: 0,
    reviewCount: 0,
    lastAnalyzed: Date.now(),
  };
}

/**
 * Estimate cost for analyzing N reviews
 * GPT-4o-mini pricing: ~$0.15/1M input tokens, ~$0.60/1M output tokens
 * Average: ~500 input tokens + 100 output tokens per spot
 */
export function estimateNLPCost(spotCount: number): number {
  const avgInputTokens = 500;
  const avgOutputTokens = 100;
  const inputCostPer1M = 0.15;
  const outputCostPer1M = 0.60;

  const totalInputCost = (spotCount * avgInputTokens / 1_000_000) * inputCostPer1M;
  const totalOutputCost = (spotCount * avgOutputTokens / 1_000_000) * outputCostPer1M;

  return totalInputCost + totalOutputCost;
}
