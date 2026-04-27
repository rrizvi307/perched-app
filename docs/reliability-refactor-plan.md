# Reliability Refactor Plan

This document captures the current plan to reduce repeated regressions in Perched's core product flows and move the app toward a more reliable, smoother baseline.

It is intentionally focused on architecture, ownership, and validation. The immediate target is not feature expansion. The immediate target is to stop shipping the same classes of bugs repeatedly.

## Core Goal

Reach a state where the core product flows are predictable, testable, and resilient:

1. Cold start
2. Sign up / sign in / verify / sign out
3. Feed load / refresh
4. Check-in create / edit / offline-to-online sync
5. Profile update
6. Place search

Everything outside these flows is secondary until they are stable.

## Current Diagnosis

The app's recurring issues are mostly architectural, not isolated bugs.

Primary causes:

1. Startup orchestration is overloaded.
   `app/_layout.tsx` currently owns provider setup, analytics boot, demo handling, proxy priming, pending sync, notification setup, app state listeners, and web-specific DOM mutation.

2. Auth and route gating are duplicated.
   Auth hydration and verification behavior currently span `contexts/AuthContext.tsx`, `app/signin.tsx`, `app/signup.tsx`, `app/(tabs)/_layout.tsx`, `app/checkin.tsx`, and `app/verify.tsx`.

3. There are too many sources of truth.
   Local storage, AsyncStorage, FileSystem fallback storage, demo-seeded data, cached auth state, and remote Firebase data all interact with each other.

4. Screens own too much business logic.
   In key screens such as `app/checkin.tsx`, UI, validation, local writes, queueing, remote sync, toasts, gamification, and notification side effects are interleaved.

5. The service layer is too broad.
   `services/firebaseClient.ts` combines auth, profiles, check-ins, friends, moderation, reactions, comments, caching, and migration logic in one large file.

6. The repo has strong unit coverage but weak system-level validation.
   The app has Jest-based unit and rules coverage, but no UI/system E2E layer covering lifecycle, routing, permissions, background/foreground transitions, or queue sync behavior.

## Guiding Principles

1. One source of truth per domain.
2. One owner for startup flow.
3. One owner for auth state and route gating.
4. Screens render state; domain modules perform work.
5. Demo behavior must not share production runtime paths.
6. Release confidence must come from automated system tests, not manual hope.

## Phase 0: Freeze And Measure

Duration: 1 to 2 weeks

Feature policy:

1. Freeze non-core feature development.
2. Allow only reliability work on auth, feed, explore, check-in, profile, and place search.

Add visible metrics:

1. Crash-free sessions
2. Cold start p50 / p95
3. Auth success rate
4. Verify-email completion rate
5. Feed first-contentful-load p95
6. Check-in success rate
7. Pending queue drain success rate

Release gate additions:

1. `npm run typecheck`
2. `npm run lint`
3. Unit tests
4. Core-flow E2E smoke tests
5. One TestFlight smoke checklist run before release

## Phase 1: Unify Auth And Startup

This is the highest-priority refactor.

### Target structure

1. `domains/auth/authMachine.ts`
2. `domains/auth/authSession.ts`
3. `navigation/routeGuard.ts`
4. `bootstrap/appBootstrap.ts`

### Target auth states

1. `signed_out`
2. `loading`
3. `unverified`
4. `verified`
5. `error`

### Rules

1. Only one module decides current auth state.
2. Only one module decides whether the user goes to `/signin`, `/verify`, or `/(tabs)`.
3. `app/_layout.tsx` should stop owning business workflows.
4. Verification refresh and cached hydration should become explicit state transitions, not scattered `useEffect` behavior.

### Current files to simplify

1. `app/_layout.tsx`
2. `contexts/AuthContext.tsx`
3. `app/signin.tsx`
4. `app/signup.tsx`
5. `app/(tabs)/_layout.tsx`
6. `app/checkin.tsx`
7. `app/verify.tsx`

## Phase 2: Split Data Boundaries

### Refactor `services/firebaseClient.ts` into focused repositories

1. `repositories/authRepository.ts`
2. `repositories/profileRepository.ts`
3. `repositories/checkinRepository.ts`
4. `repositories/socialRepository.ts`
5. `repositories/notificationRepository.ts`

### Refactor `storage/local.ts` into focused stores

1. `storage/keyValueStore.ts`
2. `storage/checkinQueueStore.ts`
3. `storage/profileCacheStore.ts`
4. `storage/demoStore.ts`

### Rules

1. Screens should not talk directly to both local persistence and Firebase.
2. Repository modules own remote reads and writes.
3. Store modules own persistence mechanics.
4. Demo logic must be isolated from real-user runtime paths.

## Phase 3: Rebuild Check-In As A Pipeline

Current behavior in `app/checkin.tsx` is too entangled.

### Target structure

1. `domains/checkin/validateCheckin.ts`
2. `domains/checkin/createLocalCheckin.ts`
3. `domains/checkin/enqueueRemoteCheckin.ts`
4. `domains/checkin/syncCheckinQueue.ts`
5. `domains/checkin/checkinEffects.ts`

### Rules

1. UI should gather input and render state only.
2. Domain pipeline should validate, persist, queue, and sync.
3. Side effects such as gamification, rating prompts, recap scheduling, and toasts should not be interwoven with the write path.

## Phase 4: Simplify Feed And Explore

### Target structure

1. `domains/feed/useFeedController.ts`
2. `domains/feed/feedQueries.ts`
3. `domains/explore/useExploreController.ts`
4. `domains/explore/exploreQueries.ts`

### Rules

1. Screens render.
2. Controllers own subscriptions, refresh, pagination, and filtering.
3. One normalized check-in shape should be used across feed and explore.

## Phase 5: Add Runtime Test Coverage

The app needs a system-level test layer. Add Detox or Maestro.

### Blocking E2E flows

1. Sign up leads to verify screen
2. Verified user enters tabs
3. Unverified user cannot access check-in
4. Enabling notifications prompts only on explicit toggle, not startup
5. Post check-in while online
6. Post check-in while offline, reconnect, and queue drains
7. Feed refresh after posting
8. Edit check-in
9. Profile update survives app restart
10. Signed-in cold start lands in the correct route

### Additional UI validation

Add screenshot or visual regression coverage for:

1. Sign in
2. Sign up
3. Verify
4. Feed
5. Explore
6. Check-in
7. Profile

## Phase 6: UI Polish After Stability

Only start this phase after the core flows stop regressing.

### UI polish priorities

1. Standardize spacing, typography, empty states, loading states, and error states
2. Remove one-off interaction logic from screens
3. Add predictable skeleton/loading transitions
4. Audit list performance and animation timing
5. Add visual review snapshots before every release

## First 5 PRs

1. Auth routing centralization
   Remove duplicated `/verify` redirects from screens and move them into one route guard.

2. Startup extraction
   Move sync, notifications, proxy priming, and analytics side effects out of `app/_layout.tsx` into `bootstrap/`.

3. Repository split
   Break `services/firebaseClient.ts` into focused repositories without changing behavior first.

4. Check-in pipeline
   Extract the create/edit/write/sync path from `app/checkin.tsx`.

5. E2E harness
   Add Detox or Maestro with the six highest-risk flows as blocking release checks.

## Reconciliation Snapshot

Last audited against the repo on 2026-04-27.

This checklist is stricter than the progress log below. Items stay open here until the repo matches the plan target, not just until related work has started.

### Reconciled In Repo

- [x] Auth routing centralization landed through `navigation/auth-routing.ts` and `navigation/route-guard.ts`, and the old duplicated auth redirects were removed from the main screens.
- [x] Startup extraction landed through `bootstrap/app-bootstrap.ts`, so `app/_layout.tsx` is no longer the catch-all owner for startup side effects.
- [x] The repository-wrapper half of Phase 2 landed through `services/repositories/authRepository.ts`, `profileRepository.ts`, `checkinRepository.ts`, `socialRepository.ts`, and `notificationRepository.ts`.
- [x] App code no longer imports `services/firebaseClient.ts` directly outside the repository boundary.
- [x] The check-in refactor materially landed: `app/checkin.tsx` is now a thin shell over `domains/checkin/*` helpers, `useCheckinController.ts`, and `components/checkin/*` presentational sections.
- [x] The signup refactor materially landed: `app/signup.tsx` is now a thin shell over `domains/auth/*` helpers, `useSignupController.ts`, and `components/auth/signup-form-sections.tsx`.
- [x] A runtime E2E scaffold exists with Maestro flows for verified sign-in, unverified check-in gating, and password reset request.
- [x] The automated validation commands and manual release docs from the launch push exist: `typecheck`, `lint`, `test:unit`, `check:all`, `audit:testflight`, `appstore:preflight`, `preflight`, `testflight-readiness-audit.md`, and `resubmission-test-sheet.md`.

### Still Open Or Only Partially Reconciled

- [ ] Phase 1 is not fully closed. `contexts/AuthContext.tsx` is still a large auth-side owner and still mixes observer or bootstrap responsibilities with mutation APIs.
- [ ] Phase 2 storage splitting has not landed. `storage/keyValueStore.ts`, `storage/checkinQueueStore.ts`, `storage/profileCacheStore.ts`, and `storage/demoStore.ts` do not exist yet.
- [ ] The storage-boundary rule is still only partial. `storage/local.ts` remains a shared persistence boundary, and screens or controllers still import it directly in feed, explore, profile, onboarding, settings, and check-in-related flows.
- [ ] `services/firebaseClient.ts` is still a large cross-domain monolith even after the wrapper split.
- [ ] Phase 4 has not landed in the planned shape. `domains/feed/useFeedController.ts`, `domains/feed/feedQueries.ts`, `domains/explore/useExploreController.ts`, and `domains/explore/exploreQueries.ts` do not exist yet.
- [ ] Feed and explore are still major structural risk surfaces. `app/(tabs)/feed.tsx` and `app/(tabs)/explore.tsx` remain large screen owners rather than thin controller-backed shells.
- [ ] Phase 5 blocking runtime coverage is incomplete. The repo currently has only three Maestro flows, not the full list of blocking sign-up, notification, check-in, queue-drain, profile-restart, and signed-in cold-start scenarios from this plan.
- [ ] Runtime E2E is not yet part of the automated release gate. `scripts/release-preflight.js` runs typecheck, lint, unit tests, audits, and smoke checks, but it does not execute Maestro.
- [ ] Launch-market admission is still enforced on the client path and is not yet backed by a server-owned admission boundary.
- [ ] Phase 6 is intentionally not started as a broad effort. UI polish remains downstream from the structural and runtime coverage work above.
- [ ] The Definition Of Done section below is not met yet, especially the requirements that E2E pass on every PR and that two consecutive TestFlight builds ship without new core-flow regressions.

## Progress Updates

### 2026-04-14

Completed:

1. PR 1: auth routing centralization
   Added `navigation/auth-routing.ts` and `navigation/route-guard.ts`, introduced `authReady` in `contexts/AuthContext.tsx`, and removed duplicated auth redirect effects from sign-in, sign-up, verify, check-in, and tab layout screens.

2. PR 2: startup extraction
   Extracted root startup orchestration from `app/_layout.tsx` into `bootstrap/app-bootstrap.ts`, including root service bootstrap, user bootstrap, notification bootstrap, pending sync bootstrap, and web document setup.

3. PR 3: repository split expanded across core flows
   Added `services/repositories/authRepository.ts`, `services/repositories/profileRepository.ts`, `services/repositories/notificationRepository.ts`, `services/repositories/checkinRepository.ts`, and `services/repositories/socialRepository.ts` as focused boundaries over `services/firebaseClient.ts`.

4. PR 3: boundary migration completed for the current app surface
   Migrated auth, startup, settings, feed, explore, profile, spot, friends, profile view, check-in detail, check-in sync, spot repository, profile image upload, Firebase-backed image resolution, diagnostics, and demo-control imports so app code no longer imports `services/firebaseClient.ts` directly outside the repository boundary.

5. PR 4: check-in pipeline extraction started
   Added `domains/checkin/checkinValidation.ts` and `domains/checkin/checkinSubmission.ts`, moved submission validation, edit loading, edit updates, image persistence, queueing, sync retry, and post-save business effects out of `app/checkin.tsx`, and added unit coverage for the new validation boundary in `domains/checkin/__tests__/checkinValidation.test.ts`.

6. PR 4: remaining dynamic monolith imports removed
   Removed the last dynamic `services/firebaseClient.ts` imports from auth resend-verification and check-in edit flows, so app code now reaches Firebase through repository boundaries only.

### 2026-04-15

Completed:

1. PR 4: composer-state hydration and draft persistence extracted
   Added `domains/checkin/checkinComposerState.ts`, moved route prefill parsing, edit/draft hydration normalization, and draft payload shaping out of `app/checkin.tsx`, and rewired the screen through a single composer hydration helper instead of repeating field-by-field mapping inline.

2. PR 4: composer-state tests added
   Added `domains/checkin/__tests__/checkinComposerState.test.ts` to cover draft payload building, draft-content detection, route param parsing, and composer hydration normalization.

3. PR 4: post-submit UI branching tightened
   Simplified `app/checkin.tsx` toast behavior so immediate sync shows a direct success path instead of routing through contradictory queued and posted messages.

### 2026-04-16

Completed:

1. PR 4: media permission and photo capture flow extracted
   Added `domains/checkin/checkinMedia.ts`, moved camera bootstrap, primer confirmation, camera capture, and library picking logic out of `app/checkin.tsx`, and rewired the screen through structured media results instead of direct Expo picker calls.

2. PR 4: place verification and auto-detection flow extracted
   Added `domains/checkin/checkinPlaces.ts`, moved manual place verification, EXIF location parsing, nearby place ranking, and auto-detection orchestration out of `app/checkin.tsx`, and rewired the screen through structured detection outcomes instead of inline maps/provider logic.

3. PR 4: place/media tests added
   Added `domains/checkin/__tests__/checkinPlaces.test.ts` to cover EXIF parsing, distance ranking, manual place resolution, and auto-detection outcomes.

4. PR 4: composer UI helpers extracted
   Added `domains/checkin/checkinComposerUi.ts`, moved bounded selection toggles plus reset and photo-clear patch generation out of `app/checkin.tsx`, and rewired the screen through a single screen-patch applier instead of carrying those state transitions inline.

5. PR 4: composer UI tests added
   Added `domains/checkin/__tests__/checkinComposerUi.test.ts` to cover bounded selection behavior, full reset patch generation, and photo clear vs. photo replacement patch behavior.

6. PR 5: initial Maestro E2E harness scaffolded
   Added stable `testID` selectors across sign-in, sign-up, verify, feed, and check-in entry surfaces, widened `components/button.tsx` so shared buttons can expose selectors, and added `.maestro/flows/auth-signin.yaml` plus `.maestro/flows/unverified-checkin-gate.yaml` as the first runtime auth-routing checks.

7. PR 5: Maestro docs and package scripts added
   Added `docs/maestro-e2e.md`, documented the new runtime test layer in `docs/README.md`, and added `test:e2e:maestro*` scripts in `package.json` so the harness has a stable local entry point.

8. Release gate aligned with the runtime place-intelligence contract
   Updated `scripts/place-provider-smoke-check.js` to try a deterministic set of seeded Houston queries and to treat missing third-party provider photos as a warning by default instead of a release blocker, because the app contract already degrades correctly on Google snapshot and external signal data. Added unit coverage in `scripts/__tests__/placeProviderSmokeCheck.test.ts`.

9. Auth bootstrap hardened against partial signup success
   Updated `services/firebaseClient.ts` so email signup now awaits split-doc creation instead of firing it in the background, and cleanup now removes any partially created profile docs if bootstrap fails. This closes the class of failures where Firebase Auth succeeds but `publicProfiles` and `socialGraph` never appear for the new user.

10. Production split-user repair path added and applied
   Added `scripts/repair-user-document-split.js` plus unit coverage in `scripts/__tests__/repairUserDocumentSplit.test.ts`, documented the recovery path in `docs/operations.md`, and used the script to repair the one structurally broken production account that was failing migration integrity checks.

11. Release gates rerun clean after the signup hardening and data repair
   Re-ran `verify:user-documents:split`, `post-deploy:smoke-check`, and the full `preflight` wrapper against production. All automated release gates now pass, with provider-photo degradation treated as a warning-only path and App Store preflight still flagging only manual review tasks.

12. One-page resubmission blocker sheet added
   Added `docs/resubmission-test-sheet.md` as the compact manual execution sheet for proxy-only parity, exact candidate iPhone/iPad smoke coverage, and App Store Connect submission prep, and linked it from `docs/README.md` so release testing now has a single operator-facing checklist.

13. Launch-market signup gating added for the Houston/Austin rollout
   Added `services/launchMarkets.ts`, filtered signup city and campus suggestions down to the current launch footprint, required device-location confirmation during signup so out-of-market devices cannot complete account creation through the normal flow, and added unit coverage in `services/__tests__/launchMarkets.test.ts`.

14. Architecture benchmark audit added against mature open-source mobile apps
   Added `docs/architecture-benchmark-audit.md` to compare Perched against Mattermost Mobile, Rocket.Chat React Native, Joplin, and Element X, and to document the remaining structural gaps that still explain roughness in signup, check-in, and runtime smoothness despite the release-gate progress.

15. Auth-session ownership tightened and duplicate sign-in work removed
   Added `domains/auth/authSession.ts` and unit coverage in `domains/auth/__tests__/authSession.test.ts`, moved cached-vs-remote profile merge and backfill rules behind one auth-session helper, stopped `signInWithEmail` from duplicating profile hydration that the auth listener already owns, and removed the redundant post-signup profile write that was replaying work already done by `createAccountWithEmail`.

16. Startup smoothness improved for first paint and first auth transitions
   Deferred non-critical analytics and provider-warmup work in `bootstrap/app-bootstrap.ts` until after first interaction, and added `components/ui/app-launch-screen.tsx` so the app no longer drops to a blank frame while auth/bootstrap settle.

17. Check-in runtime ownership moved behind a dedicated controller
   Added `domains/checkin/useCheckinController.ts` and `domains/checkin/checkinFlowState.ts`, moved draft bootstrap and persistence, place-detection lifecycle, submit and retry orchestration, celebration timing, and derived submit-state and metrics-state branching out of `app/checkin.tsx`, added unit coverage in `domains/checkin/__tests__/checkinFlowState.test.ts`, and reduced `app/checkin.tsx` from 1857 lines to 1241 lines.

18. Signup runtime ownership moved behind auth-domain boundaries
   Added `domains/auth/useSignupController.ts`, `domains/auth/signupValidation.ts`, `domains/auth/signupEligibility.ts`, and `domains/auth/signupSubmission.ts`, moved signup validation, launch-market detection and location search shaping, onboarding-profile hydration, handle-availability orchestration, and account-creation submission logic out of `app/signup.tsx`, added unit coverage in `domains/auth/__tests__/signupValidation.test.ts`, `domains/auth/__tests__/signupEligibility.test.ts`, and `domains/auth/__tests__/signupSubmission.test.ts`, and reduced `app/signup.tsx` from 861 lines to 496 lines.

19. Maestro auth-recovery coverage expanded
   Added `.maestro/flows/password-reset-request.yaml`, added `testID` selectors in `app/reset.tsx`, exposed `npm run test:e2e:maestro:password-reset`, and updated `docs/maestro-e2e.md` so password reset is now part of the tracked runtime auth harness instead of remaining manual-only.

20. AuthContext local and registration ownership tightened further
   Added `domains/auth/authLocal.ts` and `domains/auth/authRegistration.ts` plus unit coverage in `domains/auth/__tests__/authLocal.test.ts` and `domains/auth/__tests__/authRegistration.test.ts`, moved local/demo auth-session persistence, local session lookup, demo-session creation, and register-time launch-market enforcement out of `contexts/AuthContext.tsx`, and reduced `contexts/AuthContext.tsx` from 770 lines to 591 lines.

21. Signup screen reduced to a thin shell over a presentational boundary
   Added `components/auth/signup-form-sections.tsx`, moved the full signup form render surface, validation hints, location suggestion lists, and submission/legal footer out of `app/signup.tsx`, and reduced `app/signup.tsx` from 496 lines to 117 lines so the screen now reads as a controller-backed view shell instead of a workflow owner.

22. Check-in screen reduced to a thin shell over presentational sections
   Added `components/checkin/checkin-photo-section.tsx`, `components/checkin/checkin-composer-details-section.tsx`, `components/checkin/checkin-spot-intel-section.tsx`, and `components/checkin/checkin-location-status-section.tsx`, moved the photo entry UI, composer details, Spot Intel metrics UI, and location or visibility or status surfaces out of `app/checkin.tsx`, and reduced `app/checkin.tsx` from 1241 lines to 292 lines so the screen now acts as layout plus controller composition instead of a giant render owner.

### 2026-04-22

Completed:

1. Check-in UX simplified for launch reliability and speed
   Reworked the active check-in flow so the utility prompt is now a short numeric pulse instead of an emoji-heavy questionnaire, reduced the visible prompts to spot selection, optional note, quick tags, and five 1-to-5 signals, and preserved legacy fields only as compatibility inputs for older records.

2. Check-in signal compatibility tightened without a risky schema cutover
   Added numeric outlet-availability normalization in `services/checkinUtils.ts`, updated draft hydration and save payloads in `domains/checkin/checkinComposerState.ts`, updated validation and flow-state summaries in `domains/checkin/checkinValidation.ts` and `domains/checkin/checkinFlowState.ts`, and updated submission plus telemetry shaping so new check-ins can use the simplified launch flow without breaking older downstream readers.

3. Explore ranking moved closer to a shared recommendation contract
   Added `services/recommendationEngine.ts`, introduced a normalized utility snapshot and recommendation candidate shape, used that scoring path to rank Explore results, and reused the same utility vocabulary in `services/recommendations.ts` and `components/ui/recommendations-card.tsx` so recommendation explanations and utility chips no longer drift between screens.

4. Profile credibility now comes from a typed summary instead of ad hoc strings
   Added `services/profileReputation.ts`, generated stable profile badges and trust signals from check-in history and stats, and wired that summary into both `app/(tabs)/profile.tsx` and `app/profile-view.tsx` so profiles now foreground contribution quality, regularity, and local credibility.

5. Coverage updated for the new launch-facing behavior
   Added `services/__tests__/profileReputation.test.ts`, updated check-in domain tests for the simplified pulse flow, updated recommendation tests for the shared contract additions, and reran the targeted unit suite plus typecheck and lint after the changes.

6. Manual blocker sheet now matches the launch-facing UI and gating changes
   Updated `docs/resubmission-test-sheet.md` so the exact-build smoke pass now explicitly covers allowed vs blocked launch-market signup, the lighter five-signal numeric check-in flow, recommendation explanation consistency, and profile badge or trust-signal rendering on both iPhone and iPad.

Validation completed after these milestones and rerun clean on 2026-04-22:

1. `npm run typecheck`
2. `npm run lint`
3. `npm run test:unit -- --runInBand`
4. `npm run check:all`
5. `npm run audit:testflight`
6. `npm run appstore:preflight`
7. `npm run preflight`

Release status as of 2026-04-22:

1. Automated release validation is green, including fresh `check:all`, `audit:testflight`, `appstore:preflight`, and `preflight` passes after the simplified check-in, recommendation, and profile-reputation updates.
2. The code side is ready for device testing and resubmission prep, but it is not yet ready to press submit until the manual checklist is finished.
3. Manual proxy-only parity pass is still required because `FORCE_PROXY_ONLY` is enabled for this release gate.
4. iPhone and iPad release-build smoke coverage with captured evidence is still required.
5. Fresh iPad screenshots still need to be uploaded in App Store Connect.
6. Manual release-build signup testing now needs to confirm the Houston/Austin launch-market gate behaves clearly for both allowed and blocked states.

### 2026-04-27

Completed:

1. Repo-backed reconciliation snapshot added
   Added the `Reconciliation Snapshot` section above so the plan now explicitly distinguishes what is already reconciled in the repo from what is still open or only partial as of 2026-04-27, instead of leaving that status implied across scattered progress notes and follow-up docs.

## Definition Of Done

Do not resume broad feature expansion until all of the following are true:

1. No duplicated auth gating remains
2. No screen directly mixes local persistence, remote writes, and routing
3. Cold start path is deterministic
4. Queue sync has one clear owner
5. E2E passes on every PR
6. Two consecutive TestFlight builds ship with no new core-flow regressions

## Resume Here Next

When work resumes, start with:

1. Continue shrinking `contexts/AuthContext.tsx` by splitting auth observers and profile-sync ownership away from mutation methods and provider wiring
2. Start Phase 4 on `app/(tabs)/feed.tsx` and `app/(tabs)/explore.tsx`, because they are now larger risk surfaces than `app/checkin.tsx` and `app/signup.tsx`
3. Expand PR 5 from auth-routing smoke coverage into launch-market signup gating, verification resend, post-check-in, offline queue drain, edit-check-in, and signed-in cold-start flows
4. If more check-in polish is needed, keep it inside `components/checkin/` and split `checkin-spot-intel-section.tsx` further instead of rebuilding the screen monolith
5. Keep any future check-in or signup state transitions inside `domains/checkin/` and `domains/auth/`, and keep any new signup UI inside `components/auth/`, instead of reintroducing ad hoc screen logic
6. Treat the `testID` selectors as a stable runtime contract and extend them deliberately instead of changing them ad hoc
7. Keep provider-photo enrichment monitored, but do not let it reintroduce a release-blocking false negative when Google snapshot and external signal degradation still work
8. Keep `docs/reliability-refactor-plan.md` current after each milestone

Do not begin with broad code cleanup or visual polish. Those are downstream tasks and will not solve the current regression pattern by themselves.
