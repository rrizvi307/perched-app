# Release Readiness

Date: 2026-03-11
Status: Automated gate green; manual submission steps remain

## Purpose

This is the public-safe release tracker for the current push toward App Store submission. It keeps the remaining work centralized without exposing internal security notes, private migration steps, or local machine details.

## Priority Through App Store Submission

1. Keep `npm run check:all` and `npm run appstore:preflight` green.
2. Complete manual App Store Connect and device-validation steps.
3. Re-run the full gate after any material launch change.
4. Keep all long-term operational instructions in [operations.md](./operations.md).

## Current Status

### Verified

- Functions build and test gate is part of the release workflow.
- App Store preflight checks for feed actions and iOS maps flow are passing.
- `npm run check:all` passes on the current GitHub `main` state.
- In-app account deletion now exists and routes through the full cleanup path.
- Custom verification emails and sign-in alerts are running through the production transactional email provider.
- Posting eligibility rules are enforced for production users.
- Notification scheduling reliability fixes are in place.
- Security-rules emulator coverage exists and is part of the repo workflow.
- Memory-pressure and analytics hygiene follow-up work has landed.
- Launch-facing support contact info is consistent across the app and docs.
- Early-adopter raffle UI has been removed from launch-facing screens.
- Lint is passing with warning-free gating.

### Post-Launch Follow-Up

- Profile and relationship data consistency cleanup.
- Server-owned aggregation for tags, rewards, and achievements.
- Final unification of place intelligence across client and backend paths.
- Explore and recommendation scalability cleanup.
- Media/privacy cleanup for older data that predates current rules.

## Remaining Release Tasks

### Manual App Store Work

1. Upload valid native iPad screenshots in App Store Connect.
2. Run an iPad release-build smoke test and save the evidence outside the repo if needed.
3. Test signup, verification email, resend verification, password reset, sign-in alert, check-in, report/block, and account deletion on a release build.
4. Submit the reviewer response once the new build and screenshots are ready.

## Recommended Working Loop

1. Update docs when release assumptions or launch steps change.
2. Keep machine-specific notes out of tracked docs.
3. Prefer stable docs in `docs/` over dated handoff notes.
4. When cross-machine work diverges, merge back into `operations.md` or this tracker instead of adding new one-off files.
