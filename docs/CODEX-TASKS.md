# Codex Tasks — Pre-TestFlight Sprint

## Task 1: Link EAS Project
Run `npx eas-cli init` to generate and fill `extra.eas.projectId` in `app.json`.
Verify with `npx eas-cli whoami` that the logged-in account is `rrizvi307`.

## Task 2: Verify/Set EAS Secrets
Run `npx eas-cli env:list` and confirm the following secrets exist:
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `GOOGLE_MAPS_API_KEY`
- `OPENAI_API_KEY`
- `YELP_API_KEY`
- `FOURSQUARE_API_KEY`

Cross-reference with `.env.local` and `app.config.js` `pickEnv()` to ensure every required key is covered.
If secrets are missing, list exactly which ones need to be set (do NOT set them — just report).

## Task 3: Audit Intelligence Services End-to-End
Verify these services actually work, not just exist:

### 3a. SpotIntelligence (`services/spotIntelligence.ts`)
- Trace the full flow: API call → data aggregation → where it surfaces in UI
- Confirm Google Places + Yelp API integration paths are functional
- Check if NLP review analysis (GPT-4o-mini) is wired to actual UI output
- Report: what data actually reaches the user vs what's computed but hidden

### 3b. Recommendations Engine (`services/recommendations.ts`)
- Trace: user behavior → recommendation scoring → UI display
- Is this surfaced anywhere in explore or feed?
- Report: functional or dead code?

### 3c. PlaceIntelligence (`services/placeIntelligence.ts`)
- Work score, crowd forecast, best time — where do these show in UI?
- Report: functional or dead code?

### 3d. SmartNotifications (`services/smartNotifications.ts`)
- Are streak reminders, achievement unlocks, nearby spot alerts actually triggered?
- Report: functional or dead code?

## Task 4: Validate Quality Gates
After any changes:
- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm test -- --runInBand` ✅ (237/237)

## Priority
Tasks 1-2 are operational blockers. Task 3 informs what Claude and I build next. Task 4 after any changes.

---

## Codex Update — 2026-02-13 (Security + Check-in Signals)

### A) Drink price/quality implementation verification (`app/checkin.tsx`)
- Verified `drinkPrice` (1-3) and `drinkQuality` (1-5) are wired in state, edit-mode load, draft save/restore, local payload, pending payload, and edit update payload.
- Tightened payload consistency by writing metrics explicitly as nullable fields (`noiseLevel`, `busyness`, `drinkPrice`, `drinkQuality`) so edits can clear prior values.
- Confirmed Spot Intel progress counter now tracks `X/4`.
- Confirmed `TAG_OPTIONS` and `MAX_TAGS=4` are updated.
- Added feed visibility for new signals in `app/(tabs)/feed.tsx` (Noise/Crowd/Price/Quality chips on check-in cards).

### B) Security hardening applied
- Removed client-exposed third-party secret placeholders from `app.json` (`OPENAI_API_KEY`, `YELP_API_KEY`, `FOURSQUARE_API_KEY`).
- Blocked direct client-side provider key usage by default in:
  - `services/externalDataAPI.ts`
  - `services/nlpReviews.ts`
  - `services/spotIntelligence.ts`
  Client provider calls now require explicit dev-only opt-in (`EXPO_PUBLIC_ENABLE_CLIENT_PROVIDER_CALLS=1`).
- Hardened push token privacy path:
  - `services/firebaseClient.ts` now writes tokens to `pushTokens/{userId}` (and removes legacy `users.pushToken`).
  - `functions/src/index.ts` now reads tokens from `pushTokens` with legacy fallback.
  - `firestore.rules` tightened `pushTokens` create/update/delete constraints.
- Hardened API surface:
  - `functions/src/index.ts` `placeSignalsProxy` now uses origin allowlist CORS behavior (not wildcard).
  - `functions/src/index.ts` `placeSignalsProxy` `runWith` now includes both `YELP_API_KEY` and `FOURSQUARE_API_KEY`.
  - `functions/src/index.ts` `b2bGetSpotData` no longer accepts API key via query param (header only).
- Hardened CI security gate:
  - `.github/workflows/ci.yml` now fails job on `npm audit --audit-level=high`.

### C) Validation run after changes
- `npx tsc --noEmit` ✅
- `npm run lint` ✅ (warnings only, no errors)
- `npm test -- --runInBand` ✅ (243/243)
- `npm --prefix functions run build` ✅
- `npm --prefix functions test -- --runInBand` ✅ (40/40)
