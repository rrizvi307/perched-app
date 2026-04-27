# Release Readiness

Date: 2026-04-22
Status: Automated gates are green after the launch-flow, recommendation, and profile reliability work; manual proxy-only, device-smoke, and App Store Connect steps still block submission

## Purpose

This is the public-safe release tracker for the current push toward App Store submission. It keeps the remaining work centralized without exposing internal security notes, private migration steps, or local machine details.

## Priority Through App Store Submission

1. Keep `npm run check:all` and `npm run appstore:preflight` green.
2. Keep `npm run audit:testflight` green and run the proxy-only parity pass before cutting a new build.
3. Complete manual App Store Connect and device-validation steps on the exact candidate build.
4. Re-run the full gate after any material launch change.
5. Keep all long-term operational instructions in [operations.md](./operations.md).

## Current Status

### Verified

- Functions build and test gate is part of the release workflow.
- App Store preflight checks for feed actions and iOS maps flow are passing.
- `npm run check:all` passes on the current local release-candidate worktree.
- `npm run audit:testflight`, `npm run appstore:preflight`, and `npm run preflight` all passed on 2026-04-22.
- Auth-session hydration now has a single merge/backfill owner instead of duplicating remote profile work across sign-in and bootstrap paths.
- Non-critical analytics/provider warmups are deferred until after first interaction, and the app now shows a branded launch screen instead of a blank pre-auth frame.
- The check-in flow now has a dedicated controller and flow-state helper layer, so draft bootstrap, place-detection lifecycle, submit/retry orchestration, and submit-state branching no longer live directly in `app/checkin.tsx`.
- The check-in screen is now a thin shell over `components/checkin/` presentational sections, so the photo entry UI, composer details, Spot Intel metrics, and location or visibility or status UI no longer share one giant render file.
- The signup flow now has a dedicated auth-domain controller and submission helpers, so launch-market detection, handle-availability orchestration, onboarding-profile hydration, and account-creation submission no longer live directly in `app/signup.tsx`.
- Local/demo auth persistence, demo-session creation, and register-time launch-market enforcement now route through dedicated auth-domain helpers instead of staying duplicated inside `contexts/AuthContext.tsx`.
- The signup screen is now a thin view shell over `components/auth/signup-form-sections.tsx`, so the render-heavy form surface no longer shares a file with signup workflow orchestration.
- In-app account deletion now exists and routes through the full cleanup path.
- Custom verification emails and sign-in alerts are running through the production transactional email provider.
- Posting eligibility rules are enforced for production users.
- Notification scheduling reliability fixes are in place.
- Security-rules emulator coverage exists and is part of the repo workflow.
- Memory-pressure and analytics hygiene follow-up work has landed.
- Launch-facing support contact info is consistent across the app and docs.
- Early-adopter raffle UI has been removed from launch-facing screens.
- Lint is passing with warning-free gating.
- A tracked TestFlight consumer launch audit now exists in [testflight-readiness-audit.md](./testflight-readiness-audit.md).
- Signup is now limited to the Houston/Austin launch footprint and supported nearby universities, with device-location confirmation before account creation completes.
- A one-page operator checklist exists in [resubmission-test-sheet.md](./resubmission-test-sheet.md) for the remaining manual submission blockers.
- Fresh post-refactor validation is green: `npm run lint`, `npm run check:all`, and `npm run preflight` all passed again on 2026-04-22 after the check-in presentational extraction.
- The launch check-in flow is now materially simpler: quick tags plus five numeric 1-to-5 signals, with the emoji-heavy questionnaire removed from the primary flow.
- Explore ranking and recommendation cards now use a shared utility snapshot and recommendation vocabulary, so distance, live utility, and explanation copy are more consistent across discovery surfaces.
- Profile and public-profile screens now render typed credibility badges and trust signals instead of loose string badges.
- Focused validation for the launch-market gate, simplified check-in, recommendations, and profile reputation passed on 2026-04-22 via `npm run typecheck`, `npm run lint`, and the targeted Jest suite.
- A fresh full release rerun also passed on 2026-04-22: `npm run check:all`, `npm run audit:testflight`, `npm run appstore:preflight`, and `npm run preflight` all cleared, with only manual submission warnings remaining.
- The one-page blocker sheet now explicitly covers launch-market allow vs block signup behavior, the simplified numeric quick-pulse check-in, recommendation explanation consistency, and profile reputation rendering on iPhone and iPad.

### Post-Launch Follow-Up

- Profile and relationship data consistency cleanup.
- Server-owned aggregation for tags, rewards, and achievements.
- Final unification of place intelligence across client and backend paths.
- Explore and recommendation scalability cleanup.
- Media/privacy cleanup for older data that predates current rules.
- Revisit the iOS Google Maps dependency migration before Q2 2026 ends. See [google-maps-ios-spm-migration.md](./google-maps-ios-spm-migration.md).

## Remaining Release Tasks

### Manual App Store Work

1. Upload valid native iPad screenshots in App Store Connect.
2. Run the proxy-only parity pass before cutting the next build.
3. Run iPhone and iPad release-build smoke tests and save the evidence outside the repo if needed.
4. Test signup, launch-market gating, verification email, resend verification, password reset, sign-in alert, check-in, report/block, spot search/intelligence, and account deletion on the exact candidate build.
5. Submit the reviewer response once the new build and screenshots are ready.

## Recommended Working Loop

1. Run `npm run audit:testflight`, `npm run appstore:preflight`, `npm run check:all`, and `npm run preflight` before any new build.
2. Treat `npm run preflight` as a hard stop: it must include smoke credentials, proxy-only parity enforcement, and post-deploy smoke for the exact submission candidate.
3. Update docs when release assumptions or launch steps change.
4. Keep machine-specific notes out of tracked docs.
5. Prefer stable docs in `docs/` over dated handoff notes.
6. When cross-machine work diverges, merge back into `operations.md` or this tracker instead of adding new one-off files.
