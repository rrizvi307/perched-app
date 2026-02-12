# Codex Handoff (2026-02-11)

## Purpose
This document summarizes Codex-side work completed while Claude was focused on the Explore/Feed sprint. It is intended as a clean handoff reference for follow-up work.

## Scope Boundary (Claude vs Codex)
Claude sprint target files:
- `app/_layout.tsx`
- `app/(tabs)/explore.tsx`
- `app/(tabs)/feed.tsx`
- `components/ui/spot-list-item.tsx`

Codex work focused on backend, CI, deploy reliability, and API/runtime hardening.

## Completed Changes (Chronological)

### 1) Sprint + EAS integration checkpoint
Commit: `73797a0`
Files include:
- `app/_layout.tsx`
- `app/(tabs)/explore.tsx`
- `app/(tabs)/feed.tsx`
- `components/ui/spot-list-item.tsx`
- `components/ui/reaction-bar.tsx`
- `app.json`, `eas.json`, `services/premium.ts`, subscription/profile premium files
- `docs/CODEX-TASKS.md`

Summary:
- Completed/merged the intended “surface intelligence” UX flow and EAS beta prep adjustments.

### 2) Release preflight + CI hardening
Commits:
- `25a06c8` Add release preflight script and CI test job
- `8610a3b` Harden CI install step (`npm ci --legacy-peer-deps`)
- `6d7208d` Install `functions/` deps for CI typecheck/test jobs
- `2a7096f` Add `functions-typecheck`, `functions-test`, and secret-presence gate
- `74d4369` Restrict secret-presence gate to `release/*` pushes

Files:
- `.github/workflows/ci.yml`
- `package.json`
- `scripts/release-preflight.js`

Summary:
- CI now isolates and validates Cloud Functions better.
- Release preflight script validates required env keys and runs typecheck/lint/test.

### 3) Backend data integrity hardening (reactions)
Commit: `bce8dee`
Files:
- `services/firebaseClient.ts`
- `services/social.ts`
- `firestore.rules`

Summary:
- Deterministic reaction IDs reduce duplicate reaction inflation risk.
- Legacy cleanup path preserved.
- Firestore rules updated for safe owner updates with immutable `userId`/`checkinId`.

### 4) `placeSignalsProxy` backend fixes (functions)
Commits:
- `52a6a59` Yelp endpoint fix (`businesses/search` vs failing `businesses/matches` pattern)
- `1903bbb` Runtime config fallback hardening
- `3c73d8d` Fix functions deploy entrypoint/build consistency
- `944ea58` Temporarily disable Foursquare provider (Yelp-only fallback)

Files:
- `functions/src/index.ts`
- `functions/package.json`
- `firebase.json`

Summary:
- Production function now reliably returns external signals from Yelp.
- Foursquare provider path is intentionally disabled by default due repeated provider token rejection.
- Re-enable control added via `PLACE_INTEL_ENABLE_FOURSQUARE` (truthy values enable it).

### 5) Place intelligence model calibration phase 1 (backend service)
Commit: _(see latest after this doc update; `services/placeIntelligence.ts` + tests)_
Files:
- `services/placeIntelligence.ts`
- `services/__tests__/placeIntelligence.test.ts`

Summary:
- Added calibrated reliability output:
  - `reliability.sampleSize`
  - `reliability.dataCoverage`
  - `reliability.variancePenalty`
  - `reliability.score`
- Added momentum output from recent-vs-previous 7-day windows:
  - `momentum.trend` (`improving|declining|stable|insufficient_data`)
  - `momentum.deltaWorkScore` and component deltas.
- Updated confidence formula to use reliability + external review support (instead of simple count-only confidence).
- Added model metadata fields:
  - `modelVersion`
  - `generatedAt`
- Added opt-in telemetry hook for prediction records (`intelligencePredictions` collection), gated by:
  - `EXPO_PUBLIC_PLACE_INTEL_TELEMETRY` or equivalent runtime flag.
- Added/updated tests for reliability/momentum/model metadata behavior.

### 6) Prediction→Outcome linkage + calibration observability + external context scaffold
Commit: _(see latest after this doc update)_
Files:
- `services/firebaseClient.ts`
- `app/admin-observability.tsx`
- `services/sloConfig.ts`
- `services/placeIntelligence.ts`

Summary:
- Added check-in outcome linkage to recent model predictions:
  - On check-in create/update with enough metrics, app now attempts to match a recent `intelligencePredictions` record.
  - Writes linked outcomes to `intelligenceOutcomes`.
- Added rolling calibration aggregates:
  - Maintained in `intelligenceCalibrationMetrics/current` (sample count, abs/squared error sums, confidence/model buckets).
- Added observability UI integration:
  - Admin dashboard now subscribes to calibration metrics and displays MAE/RMSE + confidence-bucket MAE.
- Added SLO definitions for calibration pipeline operations:
  - `place_intelligence_outcome_link`
  - `place_intelligence_calibration_abs_error`
- Added outside-source intelligence scaffold (flag-gated):
  - Optional weather context ingestion from Open-Meteo in `placeIntelligence` via `PLACE_INTEL_ENABLE_WEATHER`.
  - Weather is disabled by default; no runtime behavior change unless enabled.

## Production/API Status (Current)

### Working
- `placeSignalsProxy` deployed and healthy.
- Authenticated live probes return:
  - `status=200`
  - `externalSignals` source includes `yelp`
- Firestore/Storage smoke checks were successful during verification pass.
- Functions build/tests pass.

### Degraded by design (temporary)
- Foursquare enrichment is disabled by default in production runtime.
- Reason: multiple newly-generated Foursquare “Service API Key” values returned `401 Invalid request token` on direct API probes.

## Evidence Snapshots
- Direct Foursquare probe with provided keys repeatedly returned `401` and body `{"message":"Invalid request token."}`.
- Recent `placeSignalsProxy` logs after final patch/deploy showed no new secret/provider runtime errors in newest windows.

## Re-enable Foursquare Later
1. Obtain a Foursquare key that passes direct curl:
   - `GET https://api.foursquare.com/v3/places/search?...`
   - header `Authorization: <key>`
   - must return HTTP `200`
2. Set secret:
   - `firebase functions:secrets:set FOURSQUARE_API_KEY --project spot-app-ce2d8 --force`
3. Enable provider flag (runtime config/params/env):
   - `PLACE_INTEL_ENABLE_FOURSQUARE=true`
4. Redeploy:
   - `firebase deploy --only functions:placeSignalsProxy --project spot-app-ce2d8`
5. Re-run authenticated probe and verify `externalSignals` includes `foursquare`.

## Known Follow-ups (Important)
1. Migrate off `functions.config()`/Cloud Runtime Config before March 2026 deprecation.
2. Upgrade Functions runtime/dependencies path (Node 20 deprecation warning in deploy output).
3. Open/continue Foursquare support case with failing request IDs and project details.

## ML/Intelligence Optimization Plan (Not Yet Implemented)
These are recommended next backend-only steps that do not require UI churn:

1. Add prediction-outcome telemetry
- Prediction telemetry + outcome linkage are now implemented.
- Next: define richer user/session outcome labels (e.g., task completion/focus score) and retraining cadence.

2. Add reliability calibration
- Confidence calibration by sample size and variance.
- Penalize small-N and unstable spots.

3. Add momentum features
- 7-day trend deltas for busyness/noise/wifi.
- “getting better/worse” signal in intelligence payload.

4. Train lightweight model behind heuristic fallback
- Start with logistic/GBM on historical check-ins.
- Keep current heuristic as fallback for cold start.

5. Monitoring
- Track p50/p95 latency, error rate, and calibration drift per segment.

## Quick Commands (Reference)
- Functions build/test:
  - `npm --prefix functions run build`
  - `npm --prefix functions test -- --runInBand`
- App quality gates:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test -- --runInBand`
- Release preflight:
  - `npm run preflight`

## Commit Chain for This Handoff Window
- `944ea58` Temporarily disable Foursquare provider in placeSignalsProxy
- `3c73d8d` Fix functions deploy entrypoint and secret-backed placeSignalsProxy
- `1903bbb` Harden placeSignalsProxy runtime config fallback
- `52a6a59` Fix placeSignalsProxy Yelp lookup endpoint
- `bce8dee` Harden reaction persistence and Firestore rules integrity
- `74d4369` Run secrets presence gate only on release branches
- `2a7096f` Expand CI with functions checks and release secret presence gate
- `6d7208d` Install functions deps in CI typecheck and test jobs
- `8610a3b` Harden CI install step for npm peer resolution
- `25a06c8` Add release preflight script and CI test job
- `73797a0` Surface intelligence in feed/explore and finalize EAS beta prep
