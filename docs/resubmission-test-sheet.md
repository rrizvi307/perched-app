# Resubmission Test Sheet

Use this as the one-page manual blocker sheet for the exact App Store/TestFlight candidate build.
If any blocker fails, do not submit. Record the failure details before continuing.

Source docs for the full checklist and rationale:

- [testflight-readiness-audit.md](./testflight-readiness-audit.md)
- [app-store.md](./app-store.md)
- [operations.md](./operations.md)

## Candidate Info

- Date:
- Build number:
- Tester:
- iPhone device + iOS:
- iPad device + iPadOS:
- Smoke account:
- Brand-new signup email:
- Campus-enabled account, if available:

## Pass / Fail Rule

- Every blocker below must be `PASS` or explicit `N/A`.
- Any crash, dead end, frozen loading state, broken email link, or reviewer-visible placeholder is a `FAIL`.
- Do not submit until proxy-only parity, iPhone release smoke, iPad release smoke, and App Store Connect assets are all green.

## 1. Proxy-Only Parity

Set before the parity run:

```bash
export FORCE_PROXY_ONLY=true
export EXPO_PUBLIC_FORCE_PROXY_ONLY=true
export REQUIRE_PROXY_ONLY_PARITY=true
```

Mark each line `PASS` or `FAIL`:

- [ ] Sign in succeeds.
- [ ] Nearby search returns spots.
- [ ] Manual search returns spots.
- [ ] Selecting a place yields a canonical verified place.
- [ ] Posting a check-in works.
- [ ] Explore opens a populated spot without a sticky `warming up` state.
- [ ] Smart Snapshot shows live data or an explicit degraded state.
- [ ] Transient retries or aborts do not leave the UI stuck.

## 2. iPhone Release-Build Smoke

Run on one clean iPhone install, then one reinstall on the same candidate build.

- [ ] Signed-out state can reach sign in, sign up, reset, privacy, and terms without dead ends.
- [ ] Signup requests location to confirm the launch market before account creation completes.
- [ ] Sign up with a brand-new email works.
- [ ] Signup outside Houston or Austin or the supported nearby-campus footprint is blocked with clear launch-market messaging.
- [ ] Signup inside Houston or Austin, or on an allowed nearby campus, still completes successfully.
- [ ] Denying signup-time location keeps account creation blocked with clear launch-market messaging.
- [ ] Unverified user is held in verification and cannot access the full app early.
- [ ] Verification email link resolves correctly.
- [ ] `I verified - continue` succeeds.
- [ ] Sign out and sign back in with the verified account.
- [ ] Forgot-password email arrives and reset completes end to end.
- [ ] Resend verification works again without broken fallback mail.
- [ ] Settings opens Account, Upgrade, and Delete Account screens.
- [ ] Check-in with camera capture works.
- [ ] Check-in with photo library selection works, if exposed.
- [ ] Nearby place detection or manual place search works.
- [ ] The check-in flow feels lightweight: note, quick tags, and five numeric 1-to-5 pulse inputs only.
- [ ] Quick pulse labels are numeric only and there are no emoji scales or questionnaire-like dead ends.
- [ ] A check-in can be submitted without filling every pulse field, and the UI does not stall or loop on validation.
- [ ] New check-in appears in feed and profile.
- [ ] Spot detail opens from feed or explore and renders without obvious placeholder content.
- [ ] Explore recommendations feel consistent with the selected intent, including distance or live-signal explanation copy where available.
- [ ] Profile and public-profile screens render reputation badges and trust signals cleanly without layout breakage.
- [ ] Camera denial shows a clear recovery path.
- [ ] Photo-library denial does not dead-end the user.
- [ ] Location denial degrades discovery gracefully.
- [ ] Re-enabling permissions from system settings restores expected behavior.
- [ ] Feed, explore, profile, settings, support, privacy, and terms all load cleanly.
- [ ] Campus-gated feed or leaderboard behavior is correct when a campus-enabled account is used.
- [ ] No blank screens, debug banners, raw IDs, or dev-only copy appear.
- [ ] Directions opens Apple Maps correctly on iPhone.
- [ ] Friends and find-friends flows load without crashing.
- [ ] Report and block flows work if seeded data makes them reachable.
- [ ] Premium either works or degrades clearly without a paywall dead end.
- [ ] In-app account deletion completes and returns the app to sign in.
- [ ] Reinstall sanity pass is clean: sign in, feed, explore, spot detail, profile, settings.

## 3. iPad Release-Build Smoke

Run on one clean iPad install using the exact candidate build.

- [ ] Feed opens with real data.
- [ ] Profile, close-friend, report, and block actions respond consistently on iPad.
- [ ] Pending states clear, success feedback appears, and the app does not freeze or crash.
- [ ] Explore and spot detail load without tablet-specific layout breakage.
- [ ] Recommendation explanation chips and profile reputation or trust-signal UI render cleanly on iPad.
- [ ] Directions chooser shows Apple Maps and Google Maps.
- [ ] Apple Maps opens natively when selected.
- [ ] Profile, friends/find friends, settings, support, privacy, and terms all load cleanly.
- [ ] No stretched UI, blank screens, or obvious tablet-only defects appear.
- [ ] Campus-gated path behaves correctly if a campus-enabled account is available.
- [ ] Premium either works or degrades clearly without trapping the reviewer.

## 4. App Store Connect And Reviewer Prep

- [ ] New iPad screenshots are native iPad screenshots from the exact submitted build.
- [ ] Screenshot set shows real app flows, not only splash, login, or placeholder states.
- [ ] App name, subtitle, keywords, and description match the current build.
- [ ] Privacy Policy URL, Terms URL, and Support contact are current and functional.
- [ ] Reviewer notes explain the main flow, auth requirements, premium gating, and any gated surfaces.

## 5. Failure Record

Capture this for every `FAIL`:

- Build number:
- Device + OS:
- Account state: signed out / unverified / verified
- Route and entry path:
- Exact repro steps:
- Expected result:
- Actual result:
- Launch-blocking: yes / no

## Submit / Hold

- [ ] Proxy-only parity is green.
- [ ] iPhone release-build smoke is green.
- [ ] iPad release-build smoke is green.
- [ ] Reset email works from the live production link.
- [ ] Verification email works from the live production link.
- [ ] Metadata, screenshots, and reviewer notes match the tested build exactly.

If any line above is not green, hold the submission.
