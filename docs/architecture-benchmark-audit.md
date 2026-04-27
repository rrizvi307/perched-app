# Architecture Benchmark Audit

Date: 2026-04-22

This document compares Perched's current architecture against mature open-source mobile apps that support large surface areas, many screens, remote APIs, and long-lived product complexity.

The goal is not to copy another app's stack. The goal is to identify the engineering patterns that make those apps feel more stable and predictable, then apply the same discipline here.

## Reference Apps

### Mattermost Mobile

Repo: <https://github.com/mattermost/mattermost-mobile>

Why it is useful as a reference:

1. Large React Native app with many routes, realtime state, authentication, syncing, and offline behavior.
2. Repo structure includes dedicated `docs/` and `detox/` directories, which is a signal that runtime validation is treated as part of the product, not as an afterthought.
3. Release cadence is regular, which usually only works when core flows are repeatable under automation.

### Rocket.Chat React Native

Repo: <https://github.com/RocketChat/Rocket.Chat.ReactNative>
Releases: <https://github.com/RocketChat/Rocket.Chat.ReactNative/releases>

Why it is useful as a reference:

1. Mature React Native app with many pages, forms, auth surfaces, attachments, navigation branches, and websocket-backed behavior.
2. Recent release notes show repeated investment in inline form validation, hook migration, new-architecture work, and Maestro coverage.
3. The release notes are notable because the product team is spending effort on reliability plumbing, not only features.

### Joplin

Repo: <https://github.com/laurent22/joplin>

Why it is useful as a reference:

1. Large cross-platform app with sync, offline behavior, search, attachments, and long-lived user data.
2. The repo explicitly describes the app as "offline first", which is the right mental model when data and queue behavior must stay coherent under unreliable network conditions.
3. Joplin keeps sync as a product capability, not a screen concern.

### Element X

iOS repo: <https://github.com/element-hq/element-x-ios>
Android repo: <https://github.com/element-hq/element-x-android>

Why it is useful as a reference:

1. Element rewrote its next-generation clients instead of letting earlier structural debt continue to grow.
2. Both clients use the same Matrix Rust SDK underneath, which is the important pattern: complex sync and protocol behavior lives in a shared engine instead of being reimplemented in UI layers.
3. The takeaway is not "rewrite Perched in Rust". The takeaway is that mature apps isolate the hard state machine and synchronization work away from screens.

## What Mature Apps Consistently Do

Across those repos, the common patterns are clear:

1. Core state transitions are owned by a small number of modules, not scattered across screens.
2. Forms and flows use inline validation and predictable state transitions instead of ad hoc screen effects.
3. Sync, storage, and API orchestration are not mixed directly into UI render files.
4. Runtime E2E coverage is treated as part of the shipping bar.
5. Platform-specific polish and accessibility are handled as first-class work, not deferred indefinitely.
6. Large rewrites or subsystem extractions happen when the old surface cannot be stabilized incrementally.

This is the real reason apps like Instagram, X, Facebook, Signal, and Google Maps feel smoother.
It is not because they have fewer bugs in principle.
It is because they have stricter ownership boundaries, stronger runtime verification, more disciplined state machines, and less screen-level improvisation.

## Where Perched Was Before

The earlier diagnosis in [reliability-refactor-plan.md](./reliability-refactor-plan.md) was correct:

1. Startup orchestration was overloaded.
2. Auth and route gating were duplicated.
3. Too many storage and runtime paths interacted with each other.
4. Screens owned too much business logic.
5. `services/firebaseClient.ts` had become a broad monolith.
6. The repo had strong unit coverage but weak system-level runtime coverage.

That is the structural profile of an app that can feel buggy even when individual fixes keep landing.

## Where Perched Is Now

Meaningful progress has landed:

1. Auth route ownership was centralized behind route-guard logic.
2. Startup orchestration was extracted into `bootstrap/`.
3. Repository boundaries were introduced for auth, profile, social, notifications, and check-ins.
4. A large part of the check-in pipeline was extracted into `domains/checkin/`.
5. Signup bootstrap no longer fires profile creation in the background and leaves partial accounts behind.
6. Production split-user data now has verification and repair tooling.
7. Automated release gates are green, including `check:all`, `audit:testflight`, `appstore:preflight`, and `preflight`.
8. Launch-market signup gating is now in place for Houston, Austin, and supported nearby universities.
9. The check-in flow now has a dedicated controller and flow-state helper layer, so draft bootstrap, place detection, submit and retry behavior, and submit-state branching no longer live directly in `app/checkin.tsx`.
10. The signup flow now has a dedicated auth-domain controller and submission helpers, so launch-market detection, onboarding hydration, handle-availability checks, and account-creation submission no longer live directly in `app/signup.tsx`.
11. Local and demo auth-session persistence plus register-time launch-market enforcement now live in `domains/auth/authLocal.ts` and `domains/auth/authRegistration.ts` instead of being duplicated inside `contexts/AuthContext.tsx`.
12. The signup screen is now a thin shell over `components/auth/signup-form-sections.tsx`, which means the form render surface no longer shares a file with signup workflow orchestration.
13. The check-in screen is now a thin shell over `components/checkin/` presentational sections, which means the photo entry UI, composer details, Spot Intel metrics UI, and location or visibility or status surfaces no longer share one 1200-line render file.

Those are real architectural improvements, not cosmetic cleanup.

## Why The App Can Still Feel Rough

The app still does not meet the smoothness bar of mature products because the refactor is incomplete.

The biggest remaining issues are structural:

1. `contexts/AuthContext.tsx` is still 591 lines and remains a large owner of auth-side orchestration.

2. `services/firebaseClient.ts` is still 3728 lines.
   The repository split reduced direct imports from screens, which is good, but the underlying service layer is still carrying too much cross-domain behavior.

3. `app/(tabs)/explore.tsx` is still 2236 lines and `app/(tabs)/feed.tsx` is still 1830 lines.
   Those surfaces are now larger structural risks than `app/signup.tsx`, especially for list performance, subscription churn, and user-visible smoothness.

4. `components/checkin/checkin-spot-intel-section.tsx` is still 245 lines.
   That is acceptable as a temporary presentational boundary, but it is still large enough that the next round of check-in polish should split that section further instead of letting a new sub-monolith accumulate.

5. Runtime coverage is still thin.
   There are only three Maestro flows today:
   `auth-signin`
   `unverified-checkin-gate`
   `password-reset-request`

6. Some critical rules are still enforced only on the client path.
   The new launch-market gate is a necessary product control, but it should ultimately be backed by server-side admission logic if the launch restriction truly matters.

7. The release process is strong on automation and docs, but not yet strong enough on core-flow E2E depth.

## Signup Flow Assessment

The signup flow specifically has improved, but it is not yet "mature-app smooth".

### Fixed

1. Partial account creation caused by asynchronous profile bootstrap has been fixed.
2. Split user documents are now created synchronously as part of signup completion.
3. Out-of-market signup is now blocked in the normal app flow.
4. The screen is now a controller-backed shell instead of a 496-line mixed workflow and render file.

### Still Weak

1. The surrounding auth path still depends on a large `AuthContext` plus a large underlying Firebase service layer.
2. The launch-market decision is product-correct, but it still depends on client-side admission logic during signup.
3. The flow still needs explicit runtime coverage for:
   allowed signup in market
   blocked signup outside market
   denied location during signup
   verification transition
   resend verification
   password reset

## What Needs To Be Refactored Next

If the target is to get materially closer to the feel of a mature app, the next work should not be broad polish.
It should be targeted restructuring.

### 1. Finish The Remaining Auth Extraction

Create:

1. An auth observer/bootstrap boundary outside `contexts/AuthContext.tsx`
2. A smaller mutation surface for sign-in, sign-out, register, reset, and profile updates
3. Runtime flow coverage for signup admission and verification transitions

Target outcome:

1. `AuthContext` stops being the catch-all owner for auth listeners, local persistence, and mutation APIs.
2. Signup and auth transitions stay explicit behind domain helpers.
3. Auth behavior becomes easier to reason about under cold start, verify, and local/demo paths.

### 2. Move Launch-Market Admission Behind A Server Boundary

Current client gating is necessary for the user experience.
It is not sufficient as the long-term enforcement layer.

Target outcome:

1. Server or callable function validates whether signup is allowed for the current launch.
2. Client displays the result cleanly.
3. Market restrictions no longer depend on trusting UI-only logic.

### 3. Keep The Check-In UI Split Honest

`app/checkin.tsx` is now in a much better place. The next risk is letting the new presentational files grow without discipline.

Target outcome:

1. Spot Intel and any future check-in UI additions stay inside `components/checkin/` and are split further when a section starts carrying too much surface area.
2. Edit mode, draft mode, media mode, and post mode stay explicit in the controller instead of leaking back into presentational files.
3. Queue and sync ownership remain outside the render tree.

### 4. Expand Runtime E2E Coverage Aggressively

Minimum additions:

1. Signup in allowed market
2. Signup blocked outside market
3. Verification gate
4. Password reset
5. Online check-in post
6. Offline check-in then reconnect and queue drain
7. Edit check-in
8. Signed-in cold start

Until these exist, Perched will keep relying too much on local reasoning plus manual testing.

### 5. Reduce The Remaining Monoliths

Continue shrinking:

1. `AuthContext`
2. `firebaseClient`
3. `app/(tabs)/feed.tsx`
4. `app/(tabs)/explore.tsx`
5. `components/checkin/checkin-spot-intel-section.tsx`

Smooth apps are not built from thousand-line controllers and thousand-line service files.

## Bottom Line

The app is in a materially better state than it was before the refactor started.
The green release gates are real progress.
The signup data-integrity bug is fixed.
The launch-market gate is now enforced in the normal app flow.

But the app is not yet at the maturity level of the reference apps above.
The remaining roughness is still coming from incomplete ownership boundaries and insufficient runtime flow coverage.

If the target is "Instagram smooth", the next bar is not more scattered bug fixes.
The next bar is:

1. thinner screens
2. smaller auth and data owners
3. backend-enforced invariants
4. much deeper E2E coverage
5. two or more clean release cycles in a row without core-flow regressions
