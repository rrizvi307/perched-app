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
