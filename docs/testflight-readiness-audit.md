# TestFlight Readiness Audit

This is the launch-facing audit for the next TestFlight/App Store candidate. It is intentionally narrower than a full product roadmap review. The goal is to prevent another reviewer-visible regression by forcing one consumer-launch checklist, one set of release gates, and one go/no-go rule.

## Scope

Release-blocking scope for this audit:

- consumer auth and account flows
- consumer check-in creation and photo replacement flows
- feed, explore, spot detail, and directions flows
- profile, friends, and discoverability flows that normal users and reviewers can reach
- legal, support, and account-deletion flows

Not release-blocking by default unless they are exposed in the normal consumer path:

- Premium
  Premium is reachable from Profile today, so it must degrade cleanly and must not trap the reviewer in a broken paywall or dead end.
- campus
  Campus surfaces are not the primary launch promise, but at least one campus path is reachable from Feed when a user has a campus value. It must be treated as a gated manual-check surface, not ignored.
- business
  Business routes are non-consumer unless a normal launch surface links to them.
- admin
  Admin routes are non-consumer unless a normal launch surface links to them.

## Automated Gate

The release gate is not green until all of the following are green on the current `main` state:

```bash
npm run check:all
npm run audit:testflight
npm run appstore:preflight
npm run preflight
```

Hard release gate requirements for production-like verification:

- set `SMOKE_TEST_EMAIL` and `SMOKE_TEST_PASSWORD`
- set `REQUIRE_AUTH_SMOKE_CHECK=true`
- set `REQUIRE_PLACE_PROVIDER_SMOKE_CHECK=true`
- set `REQUIRE_PROXY_ONLY_PARITY=true`
- set `FORCE_PROXY_ONLY=true` or `EXPO_PUBLIC_FORCE_PROXY_ONLY=true`

When backend changes are part of the release candidate, also run:

```bash
npm run post-deploy:smoke-check
```

## Consumer Launch Matrix

### Auth And Account

- Routes: `/signin`, `/signup`, `/verify`, `/reset`, `/settings`, `/delete-account`
- Required data: one brand-new email and one stable smoke/reviewer account
- Launch-blocking: yes
- Expected behavior:
  sign up, verify, resend verification, sign in, forgot password, password reset, sign out, and delete account all work on the release candidate without internal knowledge.

### Check-In Composer

- Routes: `/checkin`
- Required data: verified user, camera/photo-library permissions at least once, one real place query
- Launch-blocking: yes
- Expected behavior:
  camera capture works, library selection works, photo replacement works repeatedly, canceling replacement preserves the current draft, nearby spot suggestions resolve, manual search resolves, and the selected spot binds to a canonical Google `placeId`.

### Feed, Explore, Spot Detail

- Routes: `/(tabs)/feed`, `/(tabs)/explore`, `/spot`, `/checkin-detail`, `/my-posts`
- Required data: one seeded/populated account and at least one spot with history
- Launch-blocking: yes
- Expected behavior:
  feed loads, explore loads, tapping a spot opens the same spot identity, Smart Snapshot/intelligence loads or degrades explicitly, thumbnails resolve through the shared visual precedence, and directions/open-in-maps behaves correctly on iOS.

### Social And Profile

- Routes: `/(tabs)/friends`, `/(tabs)/profile`, `/find-friends`, `/profile-view`
- Required data: one account with no friends and one account with at least one visible social edge if possible
- Launch-blocking: yes for crash/dead-end behavior
- Expected behavior:
  profile loads, friend discovery loads, empty states are understandable, and public-profile navigation does not crash or show broken placeholder content.

### Legal, Support, And Recovery

- Routes: `/privacy`, `/terms`, `/support`, `/delete-account`
- Required data: none
- Launch-blocking: yes
- Expected behavior:
  legal screens load in-app, support flow is reachable, and account deletion is reachable in-app without support intervention.

### Gated Surfaces

- Premium
  Reachable from Profile. Must either work end to end or clearly degrade without promising unavailable purchases.
- campus
  Reachable from Feed only when the user has a campus value. Must not crash and must behave as a clearly gated secondary surface.
- business
  Must not leak into the normal consumer launch path.
- admin
  Must not leak into the normal consumer launch path.

## Manual Device Matrix

Run the manual matrix on the exact build candidate:

1. clean iPhone install on the latest public iOS release
2. clean iPad install on the latest public iPadOS release
3. reinstall once on the iPhone candidate build

For each device, capture pass/fail for:

1. auth/account
2. check-in camera/library/photo replacement
3. nearby spot suggestions
4. manual spot search
5. feed/explore/spot detail
6. directions/open-in-maps
7. profile/friends/find friends
8. privacy/terms/support/delete account
9. premium degradation
10. campus gated behavior if a campus-enabled account is available

## Auth State Matrix

Run the core surfaces in these three states:

1. signed out
2. signed in but unverified
3. signed in and verified

Minimum expectations:

- signed out can reach sign in, sign up, reset, privacy, and terms without dead ends
- unverified users are held in the verification path until verification succeeds
- verified users can reach the full consumer experience

## Proxy-Only Parity Run

Before starting a new build, run the local/manual parity pass with the same provider path TestFlight will use:

```bash
export FORCE_PROXY_ONLY=true
export EXPO_PUBLIC_FORCE_PROXY_ONLY=true
export REQUIRE_PROXY_ONLY_PARITY=true
```

Then run the app in a production-like local/dev build and verify:

1. sign in succeeds
2. nearby search returns spots
3. manual search returns spots
4. selecting a place yields a verified canonical place
5. posting works
6. Explore opens a populated spot without a sticky `warming up` state
7. Smart Snapshot shows live or degraded intelligence instead of disappearing
8. transient aborts or retries do not leave the UI stuck

## Execution Record

Record every failure against this template outside git if needed:

- build number
- device and OS
- account state
- route and entry path
- exact repro steps
- expected result
- actual result
- launch-blocking: yes/no

## Go / No-Go Rule

Do not start or submit a new TestFlight/App Store build unless all of the following are true:

1. `npm run check:all` is green.
2. `npm run audit:testflight` is green.
3. `npm run appstore:preflight` is green.
4. `npm run preflight` is green with smoke credentials.
5. proxy-only parity run is green before the build is cut.
6. the exact TestFlight candidate passes the iPhone and iPad manual matrix.
7. reviewer notes, screenshots, and metadata match the tested build exactly.
