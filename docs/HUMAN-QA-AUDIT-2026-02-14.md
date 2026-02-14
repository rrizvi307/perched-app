# HUMAN QA AUDIT - 2026-02-14

## QA script (executed)

1. Environment sanity:
   - `xcode-select -p`
   - `xcrun simctl list devices | sed -n '1,200p'`
   - `npx expo --version`
   - `node -v`
2. Launch app with repo-standard command:
   - `npm run ios`
   - Verified Metro and app install/open on iPhone 16e simulator.
3. First run / empty-state path:
   - Open `app.perched://feed`.
   - Observe hero card empty state and primary CTA layout.
   - Evidence: `logs/qa/2026-02-14/01-feed-deeplink.png` and `logs/qa/2026-02-14/07-feed-after-fix.png`.
4. Navigation coherence / deep links:
   - Open `app.perched://feed`, `app.perched://explore`, `app.perched://profile`, `app.perched://settings`, `app.perched://not-a-real-route`.
   - Confirm valid routes render and unknown route goes to unmatched route screen.
   - Evidence:
     - `logs/qa/2026-02-14/01-feed-deeplink.png`
     - `logs/qa/2026-02-14/02-explore-deeplink.png`
     - `logs/qa/2026-02-14/03-profile-deeplink.png`
     - `logs/qa/2026-02-14/04-settings-deeplink.png`
     - `logs/qa/2026-02-14/05-unknown-route.png`
5. Create flow / permissions:
   - Tap `+` from header and open check-in composer.
   - Trigger camera permission prompt.
   - Evidence: `logs/qa/2026-02-14/11-checkin-screen.png`.
6. Check-in deep-link detail:
   - Open `app.perched://checkin/abc123`.
   - Validate route handling and end-state rendering.
   - Evidence:
     - Pre-fix stuck state: `logs/qa/2026-02-14/15-checkin-detail-post-fix-waited.png`
     - Post-fix resolved fallback: `logs/qa/2026-02-14/17-checkin-detail-final.png`
7. Data degradation / slow-failure behavior:
   - Observe runtime fallback logs during simulator run.
   - Evidence log: `LOG getCheckinsForUserRemote index fallback to unordered query ...` (no crash, app remains interactive).
8. Settings flow:
   - Open `app.perched://settings`.
   - Verify account rows, toggles, and destructive actions are reachable.
   - Evidence: `logs/qa/2026-02-14/04-settings-deeplink.png` and `logs/qa/2026-02-14/10-settings-after-fix.png`.

## Executed evidence inventory

- Screenshots:
  - `logs/qa/2026-02-14/01-feed-deeplink.png`
  - `logs/qa/2026-02-14/02-explore-deeplink.png`
  - `logs/qa/2026-02-14/03-profile-deeplink.png`
  - `logs/qa/2026-02-14/04-settings-deeplink.png`
  - `logs/qa/2026-02-14/05-unknown-route.png`
  - `logs/qa/2026-02-14/07-feed-after-fix.png`
  - `logs/qa/2026-02-14/08-explore-after-fix.png`
  - `logs/qa/2026-02-14/09-profile-after-fix.png`
  - `logs/qa/2026-02-14/10-settings-after-fix.png`
  - `logs/qa/2026-02-14/11-checkin-screen.png`
  - `logs/qa/2026-02-14/12-checkin-detail-deeplink.png`
  - `logs/qa/2026-02-14/15-checkin-detail-post-fix-waited.png`
  - `logs/qa/2026-02-14/17-checkin-detail-final.png`
- Runtime logs:
  - Pre-fix warning: `WARN Invalid deep link: app.perched://settings`
  - Post-fix open events:
    - `LOG [analytics] deeplink_opened ... app.perched://settings`
    - `LOG [analytics] deeplink_opened ... app.perched://checkin/abc123`
  - Failure fallback:
    - `LOG getCheckinsForUserRemote index fallback to unordered query ...`

## Issues (bugs + UX inconsistencies)

### 1) Duplicate create-action affordances in feed/explore
- severity: major
- type: confusing UX
- steps to reproduce:
  1. Open `app.perched://feed` and `app.perched://explore`.
  2. Observe top-right `+` and floating `+` FAB at the same time.
- expected vs actual:
  - expected: one primary create action per screen.
  - actual: duplicated create affordances with identical outcome.
- fix choice: delete/simplify
- evidence:
  - pre-fix: `logs/qa/2026-02-14/01-feed-deeplink.png`, `logs/qa/2026-02-14/02-explore-deeplink.png`
  - post-fix: `logs/qa/2026-02-14/07-feed-after-fix.png`, `logs/qa/2026-02-14/08-explore-after-fix.png`
- resolution: fixed

### 2) Duplicate settings affordance on profile
- severity: major
- type: inconsistent UI
- steps to reproduce:
  1. Open `app.perched://profile`.
  2. Observe top-right settings icon plus in-page gear icon.
- expected vs actual:
  - expected: one settings affordance in one consistent location.
  - actual: two settings affordances with different visual hierarchy.
- fix choice: delete/simplify
- evidence:
  - pre-fix: `logs/qa/2026-02-14/03-profile-deeplink.png`
  - post-fix: `logs/qa/2026-02-14/09-profile-after-fix.png`
- resolution: fixed

### 3) Valid settings deep link flagged as invalid
- severity: major
- type: incorrect behavior
- steps to reproduce:
  1. Open `app.perched://settings`.
  2. Inspect runtime logs.
- expected vs actual:
  - expected: valid route recognized without invalid-link warning.
  - actual: `WARN Invalid deep link: app.perched://settings`.
- fix choice: fix
- evidence:
  - pre-fix warning log above.
  - post-fix: only `deeplink_opened` event with no invalid-link warning.
- resolution: fixed

### 4) Hostname-form check-in deep link failed routing
- severity: major
- type: dead-end
- steps to reproduce:
  1. Open `app.perched://checkin/abc123`.
  2. Observe resulting screen.
- expected vs actual:
  - expected: route resolves to check-in detail screen.
  - actual (pre-fix): unmatched route page.
- fix choice: fix
- evidence:
  - pre-fix route failure reproduced before parsing fix.
  - regression test: `services/__tests__/deepLinking.test.ts`.
- resolution: fixed

### 5) Check-in detail param mismatch caused stuck loading
- severity: major
- type: incorrect behavior
- steps to reproduce:
  1. Open `app.perched://checkin/abc123` after hostname parsing fix.
  2. Wait on detail screen.
- expected vs actual:
  - expected: resolve to data or explicit fallback.
  - actual (pre-fix): perpetual `Loading...`.
- fix choice: fix
- evidence:
  - pre-fix: `logs/qa/2026-02-14/15-checkin-detail-post-fix-waited.png`
  - post-fix: `logs/qa/2026-02-14/17-checkin-detail-final.png` (`Not found.` rendered)
- resolution: fixed

### 6) Location recency confusion after explicit "current location" action
- severity: major
- type: incorrect behavior
- steps to reproduce:
  1. Use location-based sort/filter path.
  2. Trigger "current location" and compare to stale cached result.
- expected vs actual:
  - expected: explicit "current location" uses fresh GPS reading.
  - actual (pre-fix): stale last-known coordinate could be reused.
- fix choice: fix
- evidence:
  - code-path guardrail test: `services/__tests__/location.test.ts` (`preferFresh` path).
- resolution: fixed

## Phase 3 fix loop (implemented)

1. Removed floating FAB create buttons from feed and explore; kept header-level `+` action.
2. Removed duplicate in-page settings icon from profile header content.
3. Added `settings` route support in deep-link parser/handler.
4. Added hostname+path deep-link parsing for `checkin`, `spot`, `profile`, and `friend-request`.
5. Fixed check-in deep-link query contract to `cid` and added legacy `id` fallback in detail screen.
6. Added fresh-location guardrail:
   - `requestForegroundLocation(..., preferFresh: true)` bypasses `lastKnown` fallback when user explicitly requests current location.
7. Added regression protection:
   - `services/__tests__/deepLinking.test.ts`
   - `services/__tests__/location.test.ts`

## Required human-tester checks (executed result)

- First run experience: executed
  - Observed initial render, empty-state card, and permission warning behavior.
- Auth transitions (signed out -> signed in -> signed out, stale session): partial
  - Signed-in session and sign-out controls were verified visually on settings screen.
  - Full credential-entry cycle was not automated in this run.
- Navigation coherence (back/forward, refresh, deep links, 404): executed
  - Valid route deep links plus unknown route behavior verified.
- Forms (validation, errors, disabled/saving): partial
  - Camera permission modal and check-in entry step observed.
  - Full edit/save validation matrix not exhaustively automated.
- Data failure degradation (indexes/permissions/network): executed
  - Firestore index-missing fallback path observed in logs; no crash.
- Consistency (terminology, labels, placement, spacing, headers): executed
  - Duplicate action and duplicate settings inconsistencies fixed and rechecked.
- Friction review (2-step vs 1-step, misleading affordances): executed
  - Duplicate CTA friction removed.
- "Stupid stuff" hunt (dead buttons, placeholder copy, toggles, defaults): executed
  - Invalid-link false warning and dead-end deep-link route fixed.
