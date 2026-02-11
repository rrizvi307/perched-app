/**
 * Conversational Assistant Service
 *
 * Natural language interface for spot discovery and recommendations
 * Uses pattern matching and rule-based NLP (no external AI APIs)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserPreferences, getPersonalizedRecommendations } from './recommendations';
import { ensureFirebase } from './firebaseClient';

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  data?: {
    spots?: any[];
    actions?: Array<{ label: string; action: string; data?: any }>;
    suggestions?: string[];
  };
}

export interface ConversationContext {
  userId: string;
  sessionId: string;
  location: { lat: number; lng: number } | null;
  lastQuery: string | null;
  preferences: any;
  history: AssistantMessage[];
  startedAt: number;
}

export interface QueryIntent {
  type: 'search' | 'recommend' | 'filter' | 'question' | 'greeting' | 'help' | 'unknown';
  confidence: number; // 0-1
  entities: {
    spotType?: string[]; // ['cafe', 'library']
    attributes?: string[]; // ['quiet', 'wifi', 'outlets']
    location?: string; // 'near me', 'downtown'
    timeContext?: 'morning' | 'afternoon' | 'evening' | 'now';
    comparison?: boolean; // "better than X"
  };
  clarificationNeeded: boolean;
  suggestedQuestions?: string[];
}

const CONVERSATION_HISTORY_KEY = '@perched_conversation_history';
const MAX_HISTORY_LENGTH = 20;

// Pattern definitions for intent recognition
const PATTERNS = {
  greeting: [
    /^(hi|hey|hello|sup|yo|greetings)/i,
    /^good (morning|afternoon|evening)/i,
  ],
  help: [
    /help/i,
    /what can you do/i,
    /how (do|does)/i,
    /show me/i,
  ],
  search: [
    /find (me )?a?/i,
    /looking for/i,
    /search for/i,
    /where (can|should) (i|we)/i,
    /show me/i,
  ],
  recommend: [
    /recommend/i,
    /suggest/i,
    /what('?s| is) (a )?good/i,
    /best (spot|place|cafe)/i,
    /where should i/i,
  ],
  filter: [
    /with (good|fast|free) wifi/i,
    /quiet/i,
    /not (too )?busy/i,
    /has outlets/i,
    /open (now|late)/i,
  ],
  question: [
    /is .+ open/i,
    /how (busy|crowded) is/i,
    /does .+ have/i,
    /what time/i,
  ],
};

// Entity extraction patterns
const ENTITY_PATTERNS = {
  spotTypes: {
    cafe: /\b(cafe|coffee shop|coffeeshop|espresso|latte)\b/i,
    library: /\b(library|libraries)\b/i,
    coworking: /\b(cowork|coworking|workspace|office)\b/i,
    restaurant: /\b(restaurant|food|eat|lunch|dinner)\b/i,
    bar: /\b(bar|pub|drinks|brewery)\b/i,
    park: /\b(park|outdoor|outside)\b/i,
    bookstore: /\b(bookstore|book store|books)\b/i,
  },
  attributes: {
    quiet: /\b(quiet|silent|peaceful|calm)\b/i,
    wifi: /\b(wifi|wi-fi|internet|online)\b/i,
    outlets: /\b(outlet|outlets|power|charging|plug)\b/i,
    busy: /\b(busy|crowded|popular|packed)\b/i,
    empty: /\b(empty|not busy|peaceful|uncrowded)\b/i,
    study: /\b(study|work|focus|productive)\b/i,
    social: /\b(social|meet|friends|hang out|lively)\b/i,
    food: /\b(food|snacks|meals|eat)\b/i,
    drinks: /\b(drinks|coffee|tea|beverages)\b/i,
  },
  location: {
    nearby: /\b(near me|nearby|close|around here)\b/i,
    walking: /\b(walking distance|walk)\b/i,
    downtown: /\b(downtown|city center)\b/i,
  },
  timeContext: {
    morning: /\b(morning|breakfast|am|early)\b/i,
    afternoon: /\b(afternoon|lunch|pm)\b/i,
    evening: /\b(evening|night|late|dinner)\b/i,
    now: /\b(now|right now|currently|today)\b/i,
  },
};

/**
 * Initialize or get conversation context
 */
export async function getOrCreateConversation(
  userId: string,
  location: { lat: number; lng: number } | null
): Promise<ConversationContext> {
  try {
    const cached = await AsyncStorage.getItem(`${CONVERSATION_HISTORY_KEY}_${userId}`);
    if (cached) {
      const context: ConversationContext = JSON.parse(cached);
      // Reset if session is older than 1 hour
      if (Date.now() - context.startedAt < 60 * 60 * 1000) {
        context.location = location;
        return context;
      }
    }

    // Create new conversation
    const preferences = await getUserPreferences(userId);
    const newContext: ConversationContext = {
      userId,
      sessionId: `session_${Date.now()}`,
      location,
      lastQuery: null,
      preferences,
      history: [],
      startedAt: Date.now(),
    };

    await saveConversation(newContext);
    return newContext;
  } catch (error) {
    console.error('Failed to get conversation:', error);
    throw error;
  }
}

/**
 * Save conversation context
 */
async function saveConversation(context: ConversationContext): Promise<void> {
  try {
    // Keep only last N messages
    if (context.history.length > MAX_HISTORY_LENGTH) {
      context.history = context.history.slice(-MAX_HISTORY_LENGTH);
    }

    await AsyncStorage.setItem(
      `${CONVERSATION_HISTORY_KEY}_${context.userId}`,
      JSON.stringify(context)
    );
  } catch (error) {
    console.error('Failed to save conversation:', error);
  }
}

/**
 * Parse user query and extract intent + entities
 */
export function parseQuery(query: string, context: ConversationContext): QueryIntent {
  const normalizedQuery = query.toLowerCase().trim();

  // Detect intent
  let intentType: QueryIntent['type'] = 'unknown';
  let confidence = 0.5;

  for (const [type, patterns] of Object.entries(PATTERNS)) {
    for (const pattern of (patterns as any[])) {
      if (pattern.test(normalizedQuery)) {
        intentType = type as QueryIntent['type'];
        confidence = 0.8;
        break;
      }
    }
    if (intentType !== 'unknown') break;
  }

  // If no pattern matched but has question mark, likely a question
  if (intentType === 'unknown' && normalizedQuery.includes('?')) {
    intentType = 'question';
    confidence = 0.6;
  }

  // Extract entities
  const entities: QueryIntent['entities'] = {};

  // Spot types
  const spotTypes: string[] = [];
  for (const [type, pattern] of Object.entries(ENTITY_PATTERNS.spotTypes)) {
    if ((pattern as any).test(normalizedQuery)) {
      spotTypes.push(type);
    }
  }
  if (spotTypes.length > 0) entities.spotType = spotTypes;

  // Attributes
  const attributes: string[] = [];
  for (const [attr, pattern] of Object.entries(ENTITY_PATTERNS.attributes)) {
    if ((pattern as any).test(normalizedQuery)) {
      attributes.push(attr);
    }
  }
  if (attributes.length > 0) entities.attributes = attributes;

  // Location context
  for (const [locType, pattern] of Object.entries(ENTITY_PATTERNS.location)) {
    if ((pattern as any).test(normalizedQuery)) {
      entities.location = locType;
      break;
    }
  }

  // Time context
  for (const [time, pattern] of Object.entries(ENTITY_PATTERNS.timeContext)) {
    if ((pattern as any).test(normalizedQuery)) {
      entities.timeContext = time as any;
      break;
    }
  }

  // Comparison detection
  entities.comparison = /better than|compare|versus|vs/i.test(normalizedQuery);

  // Determine if clarification needed
  const clarificationNeeded =
    intentType === 'unknown' ||
    (confidence < 0.7 && !entities.spotType && !entities.attributes);

  // Generate suggested questions
  const suggestedQuestions = generateSuggestions(entities, context);

  return {
    type: intentType,
    confidence,
    entities,
    clarificationNeeded,
    suggestedQuestions,
  };
}

/**
 * Generate suggested follow-up questions
 */
function generateSuggestions(
  entities: QueryIntent['entities'],
  context: ConversationContext
): string[] {
  const suggestions: string[] = [];

  if (!entities.spotType || entities.spotType.length === 0) {
    suggestions.push('What type of place? (cafe, library, coworking)');
  }

  if (!entities.attributes || entities.attributes.length === 0) {
    suggestions.push('Any specific requirements? (quiet, wifi, outlets)');
  }

  if (context.preferences.preferredSpotTypes.length > 0) {
    const prefType = context.preferences.preferredSpotTypes[0];
    suggestions.push(`Looking for a ${prefType}?`);
  }

  return suggestions.slice(0, 3); // Max 3 suggestions
}

/**
 * Process user message and generate response
 */
export async function processMessage(
  userId: string,
  userMessage: string,
  location: { lat: number; lng: number } | null
): Promise<{ response: AssistantMessage; context: ConversationContext }> {
  try {
    // Get or create conversation context
    const context = await getOrCreateConversation(userId, location);

    // Add user message to history
    const userMsg: AssistantMessage = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    };
    context.history.push(userMsg);
    context.lastQuery = userMessage;

    // Parse query
    const intent = parseQuery(userMessage, context);

    // Generate response based on intent
    let response: AssistantMessage;

    switch (intent.type) {
      case 'greeting':
        response = await handleGreeting(context);
        break;
      case 'help':
        response = await handleHelp(context);
        break;
      case 'search':
      case 'recommend':
        response = await handleSearchOrRecommend(intent, context);
        break;
      case 'filter':
        response = await handleFilter(intent, context);
        break;
      case 'question':
        response = await handleQuestion(intent, context);
        break;
      default:
        response = await handleUnknown(intent, context);
    }

    // Add response to history
    context.history.push(response);

    // Save updated context
    await saveConversation(context);

    return { response, context };
  } catch (error) {
    console.error('Failed to process message:', error);
    throw error;
  }
}

/**
 * Handle greeting intent
 */
async function handleGreeting(context: ConversationContext): Promise<AssistantMessage> {
  const greetings = [
    "Hi! I'm your Perched assistant. I can help you find great places to work and study.",
    "Hey there! Looking for a spot to work or hang out?",
    "Hello! Ready to discover some amazing places nearby?",
  ];

  const greeting = greetings[Math.floor(Math.random() * greetings.length)];

  return {
    id: `msg_${Date.now()}_assistant`,
    role: 'assistant',
    content: greeting,
    timestamp: Date.now(),
    data: {
      suggestions: [
        'Find me a quiet cafe nearby',
        'Recommend a place to study',
        'Show me cafes with good wifi',
      ],
    },
  };
}

/**
 * Handle help intent
 */
async function handleHelp(context: ConversationContext): Promise<AssistantMessage> {
  return {
    id: `msg_${Date.now()}_assistant`,
    role: 'assistant',
    content: "I can help you:\n\n• Find spots based on your preferences\n• Recommend places to work or study\n• Filter by attributes (wifi, quiet, outlets)\n• Answer questions about specific spots\n\nJust tell me what you're looking for!",
    timestamp: Date.now(),
    data: {
      suggestions: [
        'Find a quiet place with wifi',
        'Best cafes for studying',
        'Places open late',
      ],
    },
  };
}

/**
 * Handle search or recommend intent
 */
async function handleSearchOrRecommend(
  intent: QueryIntent,
  context: ConversationContext
): Promise<AssistantMessage> {
  if (!context.location) {
    return {
      id: `msg_${Date.now()}_assistant`,
      role: 'assistant',
      content: "I need your location to find spots nearby. Please enable location services.",
      timestamp: Date.now(),
    };
  }

  // Get recommendations based on extracted entities
  let timeContext = intent.entities.timeContext || getCurrentTimeContext();
  // Map 'now' to current time context
  if (timeContext === 'now') {
    timeContext = getCurrentTimeContext();
  }
  const recommendations = await getPersonalizedRecommendations(
    context.userId,
    context.location,
    { timeOfDay: timeContext as 'morning' | 'afternoon' | 'evening' }
  );

  // Filter by entities
  let filtered = recommendations;

  if (intent.entities.spotType && intent.entities.spotType.length > 0) {
    const types = intent.entities.spotType;
    filtered = filtered.filter((r: any) =>
      types.some((t: any) => r.name.toLowerCase().includes(t))
    );
  }

  if (intent.entities.attributes && intent.entities.attributes.length > 0) {
    const attrs = intent.entities.attributes;

    if (attrs.includes('wifi')) {
      filtered = filtered.filter((r: any) => r.predictedBusyness !== undefined);
    }
    if (attrs.includes('quiet')) {
      filtered = filtered.filter((r: any) => r.predictedNoise && r.predictedNoise <= 2);
    }
    if (attrs.includes('empty')) {
      filtered = filtered.filter((r: any) => r.predictedBusyness && r.predictedBusyness <= 2);
    }
  }

  const topSpots = filtered.slice(0, 5);

  if (topSpots.length === 0) {
    return {
      id: `msg_${Date.now()}_assistant`,
      role: 'assistant',
      content: "I couldn't find spots matching your criteria. Try broadening your search?",
      timestamp: Date.now(),
      data: {
        suggestions: [
          'Show me any cafes nearby',
          'What about coworking spaces?',
          'Recommend something different',
        ],
      },
    };
  }

  const spotList = topSpots
    .map((s: any, i: number) => `${i + 1}. ${s.name} (${Math.round(s.score)}% match)`)
    .join('\n');

  let responseText = `Here are the best spots I found:\n\n${spotList}`;

  if (intent.entities.attributes && intent.entities.attributes.length > 0) {
    const attrs = intent.entities.attributes.join(', ');
    responseText = `Found ${topSpots.length} spots matching "${attrs}":\n\n${spotList}`;
  }

  return {
    id: `msg_${Date.now()}_assistant`,
    role: 'assistant',
    content: responseText,
    timestamp: Date.now(),
    data: {
      spots: topSpots,
      actions: topSpots.map((s: any) => ({
        label: `Check in at ${s.name}`,
        action: 'checkin',
        data: { placeId: s.placeId, name: s.name },
      })),
      suggestions: [
        'Tell me more about the first one',
        'Any other options?',
        'Show me something different',
      ],
    },
  };
}

/**
 * Handle filter intent
 */
async function handleFilter(
  intent: QueryIntent,
  context: ConversationContext
): Promise<AssistantMessage> {
  // Redirect to search with filters
  return await handleSearchOrRecommend(intent, context);
}

/**
 * Handle question intent
 */
async function handleQuestion(
  intent: QueryIntent,
  context: ConversationContext
): Promise<AssistantMessage> {
  return {
    id: `msg_${Date.now()}_assistant`,
    role: 'assistant',
    content: "I can help with general questions about spots. For specific information about a spot, try checking in or viewing its details.",
    timestamp: Date.now(),
    data: {
      suggestions: [
        'Find me a spot instead',
        'Show me recommendations',
        'What can you help with?',
      ],
    },
  };
}

/**
 * Handle unknown intent
 */
async function handleUnknown(
  intent: QueryIntent,
  context: ConversationContext
): Promise<AssistantMessage> {
  return {
    id: `msg_${Date.now()}_assistant`,
    role: 'assistant',
    content: "I'm not sure I understood that. Can you rephrase? I can help you find spots, get recommendations, or answer questions.",
    timestamp: Date.now(),
    data: {
      suggestions: intent.suggestedQuestions || [
        'Find me a quiet cafe',
        'Recommend a place to study',
        'What can you do?',
      ],
    },
  };
}

/**
 * Get current time context
 */
function getCurrentTimeContext(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/**
 * Clear conversation history
 */
export async function clearConversationHistory(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${CONVERSATION_HISTORY_KEY}_${userId}`);
  } catch (error) {
    console.warn('Failed to clear conversation history:', error);
  }
}

/**
 * Get conversation history
 */
export async function getConversationHistory(
  userId: string
): Promise<AssistantMessage[]> {
  try {
    const cached = await AsyncStorage.getItem(`${CONVERSATION_HISTORY_KEY}_${userId}`);
    if (cached) {
      const context: ConversationContext = JSON.parse(cached);
      return context.history;
    }
    return [];
  } catch (error) {
    console.error('Failed to get conversation history:', error);
    return [];
  }
}
