# Perched

Discover work-friendly cafes and third places through community check-ins, live signals, and Firebase-backed social features.

[Website](https://perched.app)

---

## Overview

Perched is an Expo + React Native app with Firebase Auth, Firestore, Storage, and Cloud Functions.
Core product areas include:

- Check-ins with work-quality metrics (wifi, noise, busyness, outlets, laptop friendliness)
- Feed, explore, and profile flows with social graph features
- Spot intelligence and external provider enrichment
- Offline-first queueing for pending check-ins and background sync

---

## Project Structure

```text
app/            Expo Router screens and navigation
components/     Reusable UI primitives and composed components
constants/      Theme, tokens, and static config
contexts/       React context providers (auth, theme, etc.)
services/       Firebase client, intelligence logic, integrations, utilities
storage/        Local persistence and pending queue management
functions/      Firebase Cloud Functions (TypeScript)
```

---

## Tech Stack

- React Native 0.81 + Expo SDK 54
- Expo Router
- TypeScript
- Firebase (Auth, Firestore, Cloud Functions, Storage)
- Reanimated 4

---

## Getting Started

```bash
# Install dependencies
npm install

# Start Metro / Expo dev server
npm run start

# iOS native run
npm run ios

# Android native run
npm run android

# Web run
npm run web
```

---

## Environment Setup

1. Copy `.env.example` to `.env.local`.
2. Fill values needed for your workflow.

```bash
# Core app config
GOOGLE_MAPS_API_KEY=
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_STORAGE_BUCKET=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
FIREBASE_MEASUREMENT_ID=
ENV=development

# Optional app telemetry and integrations
SENTRY_DSN=
SEGMENT_WRITE_KEY=
MIXPANEL_TOKEN=
REVENUECAT_PUBLIC_KEY=

# External provider keys (functions/server paths)
OPENAI_API_KEY=
YELP_API_KEY=
FOURSQUARE_API_KEY=

# Optional client-side provider calls in dev only
EXPO_PUBLIC_YELP_API_KEY=
EXPO_PUBLIC_FOURSQUARE_API_KEY=
EXPO_PUBLIC_ENABLE_CLIENT_PROVIDER_CALLS=false

# Email action URL used by verification helper
FIREBASE_ACTION_URL=
```

Notes:

- `EXPO_PUBLIC_ENABLE_CLIENT_PROVIDER_CALLS` should stay `false` for production builds.
- Provider keys should be stored in Firebase/Cloud secrets for deployed backends.

---

## Quality and Testing

```bash
# App quality gate: typecheck + lint + app tests + iOS export smoke
npm run check:app

# Cloud Functions build + tests
npm --prefix functions run build
npm --prefix functions test -- --runInBand

# Full gate
npm run check:all

# Release preflight (env + checks)
npm run preflight
```

---

## Firebase Ops Notes

- Firebase setup and launch TODOs are tracked in [FIREBASE_SETUP_TODO.md](./FIREBASE_SETUP_TODO.md).
- Current hosting and backend config is defined in `firebase.json` and `functions/`.

