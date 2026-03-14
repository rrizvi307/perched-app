# Perched

Discover work friendly cafes and third places through community checkins, live signals, and Firebase backed social features.

[Website](https://perched.app)

## Overview

Perched is an Expo + React Native app with Firebase Auth, Firestore, Storage, and Cloud Functions.
Core product areas include:

1. Checkins with work quality metrics (wifi, noise, busyness, outlets, laptop friendliness)
2. Feed, explore, and profile flows with social graph features
3. Spot intelligence and external provider enrichment
4. Offline first queueing for pending checkins and background sync

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

## Tech Stack

1. React Native 0.81 + Expo SDK 54
2. Expo Router
3. TypeScript
4. Firebase (Auth, Firestore, Cloud Functions, Storage)
5. Reanimated 4

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

# Optional client side provider calls in dev only
EXPO_PUBLIC_YELP_API_KEY=
EXPO_PUBLIC_FOURSQUARE_API_KEY=
EXPO_PUBLIC_ENABLE_CLIENT_PROVIDER_CALLS=false

# Continue URL after auth email actions complete.
# Do not set this to /__/auth/action; use a real page like https://perched.app or https://perched.app/signin
FIREBASE_ACTION_URL=

# Optional custom Firebase Hosting auth link domain, e.g. auth.perched.app
FIREBASE_AUTH_LINK_DOMAIN=
```

Notes:

1. `EXPO_PUBLIC_ENABLE_CLIENT_PROVIDER_CALLS` should stay `false` for production builds.
2. Provider keys should be stored in Firebase/Cloud secrets for deployed backends.

## Quality and Testing

```bash
# App quality gate: typecheck + lint + app tests + iOS export smoke
npm run check:app

# Cloud Functions build + tests
cd functions
npm run build
npm test

# Full gate
npm run check:all

# Release preflight (env + checks)
npm run preflight
```

---

## Documentation

- Consolidated setup, launch, and App Store runbook: [docs/operations.md](./docs/operations.md)
- Docs index: [docs/README.md](./docs/README.md)
- Current hosting and backend config is defined in `firebase.json` and `functions/`.
