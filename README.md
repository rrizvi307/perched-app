# Perched

**Discover the best cafes and work spots near you — powered by real check-ins, NLP intelligence, and community data.**

Perched is a full-stack mobile app that helps students, remote workers, and freelancers find the perfect place to work. Every cafe, library, and coworking space gets a smart **Work Score** computed from real visitor check-ins, NLP-inferred review signals, and external data sources.

[App Store](https://perched.app) · [Website](https://perched.app)

---

## Features

### Smart Work Score Engine
Every spot gets a 0–100 score computed from 9 weighted factors: WiFi speed, noise level, crowd density, laptop friendliness, community tags, external ratings (Yelp/Foursquare), venue type, open status, and weekly momentum trends. Users can tap any score to see a full **score breakdown** with per-factor contributions and data source attribution.

### NLP-Inferred Intelligence
For spots with zero check-ins, the system falls back to NLP-inferred signals extracted from review text — inferring WiFi availability, noise levels, and study-friendliness with confidence scoring. Inferred data is dampened (0.6×) so it never outweighs real check-in data.

### Real-Time Crowd Forecasting
A 6-hour crowd forecast built from historical check-in patterns, weighted by hourly busyness averages and weather context signals (via Open-Meteo API). Weather impact adjusts crowd predictions — rain increases expected indoor traffic.

### Check-In System with Gamification
Quick check-ins capture WiFi speed, noise, busyness, drink quality, and price via emoji-based scales. Daily streaks, achievements (exploration, social, streak, time-based, discovery, loyalty categories), and campus leaderboards drive engagement. Confetti celebrations trigger on milestones.

### External Signal Aggregation
A Firebase Cloud Function proxies requests to Yelp and Foursquare APIs, normalizing ratings, review counts, price levels, and categories into a unified trust score with provider diversity and rating consensus metrics.

### Social Layer
Friend system with add-by-handle/email/contacts, activity feed with animated reaction bar (spring bounce + haptic feedback), "here now" live presence, and campus-scoped discovery.

---

## Architecture

```
React Native (Expo SDK 52) + TypeScript
├── app/                    # Expo Router file-based navigation (38 screens)
│   ├── (tabs)/             # Bottom tab navigation (Feed, Explore, Profile)
│   ├── checkin.tsx          # Multi-step check-in flow with EXIF GPS extraction
│   ├── spot.tsx             # Spot detail with scroll-aware header + animated score
│   └── ...
├── components/ui/          # 37 reusable components (design system)
├── services/
│   ├── placeIntelligence.ts # Work Score computation engine (950+ lines)
│   ├── spotIntelligence.ts  # NLP review analysis pipeline
│   ├── firebaseClient.ts    # Firestore operations + caching layer
│   ├── gamification.ts      # Streaks, achievements, stats tracking
│   └── ...
├── constants/
│   ├── theme.ts             # Color system (light/dark) + platform-aware fonts
│   └── tokens.ts            # Spacing + radius design tokens
└── functions/               # Firebase Cloud Functions (signal proxy, admin)
```

### Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **react-native-reanimated** for all animation | Worklet-driven animations run on UI thread — zero JS thread blocking for confetti, spring bounces, scroll-aware headers |
| **File-based routing (Expo Router)** | Type-safe navigation, deep linking support, modal presentation for check-ins |
| **Firestore + local AsyncStorage** | Offline draft queue syncs up to 5 pending check-ins on app resume |
| **External signal proxy via Cloud Functions** | Keeps API keys server-side, normalizes multi-provider data, adds auth + App Check validation |
| **Confidence-weighted scoring** | Reliability model accounts for sample size, data coverage, variance penalty, and external trust scores |

### Intelligence Pipeline

```
Check-in data (WiFi, noise, busyness, laptop)
    ↓
NLP review fallbacks (when no check-ins exist)
    ↓ dampened at 0.6× confidence
9-factor weighted score computation
    ↓
Reliability scoring (sample size × coverage × variance × external trust)
    ↓
Momentum detection (7-day rolling window, recent vs. previous period)
    ↓
Weather context adjustment (Open-Meteo API → crowd level delta)
    ↓
Work Score (0-100) + Crowd Forecast (6hr) + Score Breakdown
```

---

## Design System

- **Colors:** Purple primary (#8B5CF6) / Pink accent (#EC4899) with full light/dark mode
- **Typography:** SF Pro Display (iOS) / Avenir Next (Android) with 7-level type scale
- **Spacing:** 12-token system (6px–32px)
- **Components:** PolishedCard (spring entrance), SkeletonLoader (shimmer), EmptyState (staggered animation), CelebrationOverlay (confetti burst)

---

## Micro-Interactions

- **Confetti celebration** on check-in publish and streak milestones (7/14/30/50/100 days)
- **Spring bounce + haptic** on reaction emoji press
- **Tag vote squish** animation with medium haptic
- **Save button pop** with scale spring
- **Score count-up** from 0 → actual via `useAnimatedReaction`
- **Scroll-aware compact header** fades in on spot detail scroll
- **Skeleton shimmer** cards during explore loading
- **Daily nudge card** on feed when no check-in today

---

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npx expo start

# Run on iOS simulator
npx expo run:ios

# Run full verification gate
npm run check:all
```

### Environment Variables

Create `.env.local` with:
```
GOOGLE_MAPS_API_KEY=
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_STORAGE_BUCKET=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
YELP_API_KEY=
FOURSQUARE_API_KEY=
INTEL_V1_ENABLED=true
```

---

## Testing

```bash
# App tests (255 tests across 13 suites)
npm run check:app

# Cloud Functions tests (40 tests)
npm run check:functions

# Full gate (app + functions + iOS export)
npm run check:all
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | React Native, Expo SDK 52, TypeScript |
| Navigation | Expo Router (file-based) |
| Animation | react-native-reanimated 4.1 |
| Maps | react-native-maps + Google Maps API |
| Backend | Firebase (Auth, Firestore, Cloud Functions, Storage) |
| External Data | Yelp Fusion API, Foursquare Places API, Open-Meteo Weather API |
| Charts | victory-native |
| Haptics | expo-haptics |
| Images | expo-image |
