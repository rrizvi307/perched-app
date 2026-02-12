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

### 7) Outcome quality labeling + quality bucket telemetry
Commit: _(see latest after this doc update)_
Files:
- `services/firebaseClient.ts`
- `app/admin-observability.tsx`

Summary:
- Added deterministic outcome-quality derivation for linked check-ins:
  - `outcomeQualityLabel` (`excellent|good|mixed|poor`)
  - `outcomeQualityScore`
  - `outcomeQualityConfidence`
  - `outcomeQualityReasons`
- Persisted these fields in `intelligenceOutcomes`.
- Added rolling calibration aggregates for quality:
  - `outcomeQualityScoreSum`
  - `outcomeQualityConfidenceSum`
  - `qualityBuckets.<label>.count`
  - `qualityBuckets.<label>.absErrorSum`
  - `qualityBuckets.<label>.qualityScoreSum`
  - `qualityBuckets.<label>.qualityConfidenceSum`
- Extended admin observability calibration card with:
  - Average outcome quality score
  - Average outcome quality confidence
  - Quality mix distribution by label

### 8) External-source consensus + trust scoring (outside intelligence uplift)
Commit: _(see latest after this doc update)_
Files:
- `services/placeIntelligence.ts`
- `services/__tests__/placeIntelligence.test.ts`

Summary:
- Added `externalSignalMeta` to place intelligence payload:
  - `providerCount`
  - `providerDiversity`
  - `totalReviewCount`
  - `ratingConsensus`
  - `trustScore`
- Added external-source consensus logic:
  - Cross-provider agreement now contributes to confidence/reliability.
  - Added highlight: `Cross-source consensus` when Yelp + Foursquare agree.
- Updated confidence/reliability weighting to use external trust score (not just external signal count).
- Extended prediction telemetry writes with:
  - `externalProviderCount`
  - `externalTotalReviewCount`
  - `externalRatingConsensus`
  - `externalTrustScore`
- Bumped model version to `2026-02-11-r3`.

### 9) Feed runtime warning fix (list key stability)
Commit: `1bd04d1`
Files:
- `components/ui/FilterBottomSheet.tsx`

Summary:
- Fixed React warning `Each child in a list should have a unique "key" prop` in filter chip lists.
- Added explicit stable keys for distance, price, and noise chip maps in `FilterBottomSheet`.

### 10) Demo feed photo backfill + future seed safety
Commit: `e8c73b6`
Files:
- `scripts/seedDemoAccount.ts`

Summary:
- Root cause for `Photo unavailable` on demo/friend check-ins: script seeded `photoUrl: null`.
- Added deterministic per-spot photo URL map and now write both:
  - `photoUrl`
  - `image`
- Re-ran seed against Firestore to backfill existing docs.
- Verification snapshot after reseed:
  - `demoTotal: 25`
  - `demoWithPhoto: 25`

### 11) Reaction + story-card Firebase resilience
Commit: `a5def45`
Files:
- `services/firebaseClient.ts`
- `services/social.ts`

Summary:
- Fixed noisy reaction failures in sessions where auth is not fully ready:
  - Reaction writes/deletes now validate current auth user before mutating.
  - Firestore reaction read/write failures now degrade safely instead of surfacing noisy hard errors.
- Fixed story-card generation path to degrade gracefully when remote checkin query fails:
  - `getCheckinsForUserRemote` now returns empty payload for query failures (permissions/index/network/auth timing), allowing story-card fallback paths to continue.
- Replaced direct `console.error` noise in social reaction helpers with `devLog` to reduce user-facing error spam while preserving diagnostics.

### 12) Missing-index fallback for user checkins query
Commit: `4fb5b23`
Files:
- `services/schemaHelpers.ts`
- `services/firebaseClient.ts`

Summary:
- Fixed the `firebase_get_checkins_for_user` failure path when legacy composite index (`userId + timestamp`) is missing.
- `queryCheckinsByUser` now:
  - Tries primary schema query (`userId + createdAt`) first.
  - Falls back to legacy ordered query (`userId + timestamp`) in a guarded `try`.
  - If that throws (missing index), degrades to safe query (`where(userId).limit(...)`) so story-card generation does not hard-fail.
- `getCheckinsForUserRemote` now sorts fallback results in memory by `createdAt || timestamp` to preserve stable newest-first behavior when the no-order fallback path is used.

### 13) Friend graph hardening (mutual unfriend + reciprocal request auto-accept)
Commit: `0041a29`
Files:
- `services/firebaseClient.ts`
- `services/friendsLocalUtils.ts`
- `services/__tests__/friendsLocalUtils.test.ts`

Summary:
- `sendFriendRequest` now handles reciprocal pending requests by auto-accepting:
  - If `B -> A` is already pending and `A -> B` is sent, friendship is established immediately and pair requests are cleaned up.
- `sendFriendRequest` now short-circuits when users are already friends.
- `unfollowUserRemote` is now mutual:
  - Removes friendship on both users.
  - Removes close-friend flags on both users.
  - Cleans up pending requests in both directions.
- `blockUserRemote` now severs social edges:
  - Adds target to `blocked`.
  - Removes friendship and close-friend edges on both users.
  - Removes pending requests in both directions.
- Added pure local graph utility module + tests to keep friend graph logic deterministic and testable.

### 14) Server-authoritative friend mutations via Cloud Functions
Commit: `5546ee9`
Files:
- `functions/src/index.ts`
- `services/firebaseClient.ts`

Summary:
- Added callable function `socialGraphMutation` with authenticated actions:
  - `send_friend_request`
  - `accept_friend_request`
  - `decline_friend_request`
  - `unfriend`
  - `block_user`
  - `unblock_user`
- Client friend operations now call callable mutations first and only use direct Firestore logic as fallback:
  - `sendFriendRequest`
  - `acceptFriendRequest`
  - `declineFriendRequest`
  - `unfollowUserRemote`
  - `blockUserRemote`
  - `unblockUserRemote`
- Added guard in `onFriendRequestAccepted` trigger to only notify when friendship is truly mutual, preventing false “accepted” pushes on non-accept delete paths.
- This removes reliance on client-side cross-user writes in normal operation once callable is deployed.
- Deployment status:
  - `firebase deploy --only functions:socialGraphMutation --project spot-app-ce2d8` succeeded (Feb 12, 2026).
  - Function live: `socialGraphMutation(us-central1)`.

### 15) Firestore checklist hardening pass + handoff sync
Commit: `444d12f`
Files:
- `firestore.indexes.json`
- `firestore.rules`
- `storage.rules`
- `docs/CODEX-HANDOFF-2026-02-11.md`

Summary:
- Added high-confidence composite indexes for active query paths:
  - `reports` (`status`, `priority`, `createdAt`)
  - `partnerEvents` (`status`, `date`)
  - `loyaltyCards` (`userId`, `lastCheckinAt`)
  - `flaggedContent` (`status`, `createdAt`)
  - `campusChallenges` (`campusId`, `endDate`)
  - legacy `checkins` branch (`spotPlaceId`, `timestamp`)
- Tightened `friendRequests` rules:
  - create requires pending status
  - immutable identity fields on update
  - create/update key allowlist
- Updated storage delete policy to owner-or-admin for check-in/profile/story images.

### 16) In-app logo SVG sync with slimmer icon + cleanup
Commit: `409f3df`
Files:
- `components/logo.tsx`
- `components/logo-old-bird.tsx` (deleted)
- `components/logo-new.tsx` (deleted)

Summary:
- Synced `components/logo.tsx` bird geometry to slimmer icon proportions:
  - body `rx/ry` from `22/19` to `17/14`
  - head `r` from `12` to `10`
  - wing `rx/ry` from `16/12` to `13/9`
- Removed unused legacy logo component files.
- Validation: `npx tsc --noEmit` passed.

## Production/API Status (Current)

### Working
- `placeSignalsProxy` deployed and healthy.
- `socialGraphMutation` callable deployed and live in production (`us-central1`).
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
2. Upgrade `firebase-functions` dependency to latest supported major (deploy still warns package is outdated).
3. Open/continue Foursquare support case with failing request IDs and project details.

## Status vs Claude TestFlight Plan (Codex-owned track)
- `X1` Premium graceful-degradation: previously hardened via beta-safe premium gating and no hard dependency path.
- `X2` App Store metadata validation: completed audit with findings noted below.
- `X3` Demo account/data validation: completed (demo reseed with photos and verification snapshot).
- `X4` CI + quality gates: completed repeatedly; currently green (`typecheck`, `lint` warnings-only, app tests, functions build/tests).
- `X5` Firestore/security hardening: targeted fixes complete; full checklist pass now audited with remaining gaps listed below.
- `X6` Node runtime deprecation: completed (`functions/package.json` Node 22 + `firebase.json` runtime `nodejs22` in commit `dd6a918`).

## 2026-02-12 Addendum (Codex X2/X5b/X6)

### X2) App Store metadata validation
Validated:
- `app.json` includes required iOS submission fields:
  - `expo.version`, `expo.ios.bundleIdentifier`, `expo.ios.buildNumber`
  - icon path: `./assets/brand/perched-icon-purple.png`
  - user-facing permission strings in `expo.ios.infoPlist` for camera, photos, location, contacts.
- Icon file checks:
  - `assets/brand/perched-icon-purple.png` is `1024x1024`
  - no alpha channel (`alphaInfo: <nil>`)

Cross-reference findings (docs gap list):
- `docs/app-review-notes.md` still states older demo account snapshot (`15 check-ins`) while current reseed/verification is `25/25` with photos.
- `docs/app-review-notes.md` third-party API list includes OpenStreetMap; current intelligence stack in codepaths is Firebase + Yelp (+ optional Foursquare) and OpenAI.
- `docs/app-store-description.md` and `docs/app-review-notes.md` still reference `perched.app/privacy` and `perched.app/terms`; hosted legal URLs are now:
  - `https://spot-app-ce2d8.web.app/privacy-policy.html`
  - `https://spot-app-ce2d8.web.app/terms-of-service.html`

### X5b) Firestore rules + index checklist pass
Rules audit against `docs/firebase-rules-checklist.md`:
- Firestore writes are auth-gated for core collections; check-in ownership checks are in place.
- Admin-only collections are blocked for client writes.
- Event log collection remains write-only for clients.

Implemented hardening (latest Codex patch):
- Added missing composite indexes in `firestore.indexes.json` for:
  - `reports` (`status`, `priority`, `createdAt`)
  - `partnerEvents` (`status`, `date`)
  - `loyaltyCards` (`userId`, `lastCheckinAt`)
  - `flaggedContent` (`status`, `createdAt`)
  - `campusChallenges` (`campusId`, `endDate`)
  - legacy `checkins` query path (`spotPlaceId`, `timestamp`)
- Tightened `friendRequests` rules in `firestore.rules`:
  - create requires `status == 'pending'`
  - create/update key allowlist enforced
  - immutable identity fields (`fromId`, `toId`, `createdAt`) enforced on update
- Updated `storage.rules` to allow owner-or-admin delete on `checkins`, `profiles`, and `stories` image paths.

Remaining rules/risk gaps:
- `users` reads are broad (`allow read: if isAuthenticated();`) rather than field-scoped public profile reads.
- `withinRateLimit()` currently always returns `true` (placeholder; no effective rate limiting).

### X6) Node runtime deprecation fix
Completed:
- `functions/package.json`: `engines.node` set to `22`
- `firebase.json`: functions runtime set to `nodejs22`

Validation run:
- `npm --prefix functions run build` passed.
- `npm --prefix functions test -- --runInBand` passed.
- `npm run typecheck` passed.
- `npm run lint` passed (warnings only).
- `npm test -- --runInBand` passed.

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
- `a5def45` Harden reaction and story-card Firebase fallbacks
- `e8c73b6` Seed demo checkins with photo URLs
- `1bd04d1` Fix missing keys in FilterBottomSheet chip lists
- `e80158f` Boost place intelligence with external source trust scoring
- `ae79e64` Add outcome quality telemetry and calibration dashboard
- `db97725` Link intelligence outcomes to checkins and add calibration observability
- `754b886` Calibrate place intelligence reliability and momentum signals
- `f88151d` Add Codex backend handoff summary doc
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
- `4fb5b23` Handle missing checkins index with safe query fallback
- `0041a29` Harden friend graph flows for requests, unfriend, and block
- `5546ee9` Add server-authoritative social graph mutation callable
- `e5ed760` Refresh Codex handoff with latest social graph deployment status
- `dd6a918` Upgrade Cloud Functions runtime to Node.js 22
- `444d12f` Harden Firestore rules/indexes and update Codex handoff
- `409f3df` Slim logo mark geometry and remove unused logo components
