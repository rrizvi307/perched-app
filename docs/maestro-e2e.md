# Maestro E2E

Perched now has a minimal Maestro scaffold for the three highest-risk auth flows:

1. Verified sign-in reaches feed
2. Unverified sign-in is held at verify, including after a deep link to `/checkin`
3. Password reset request reaches the reset screen and submits successfully

This is a scaffold, not a full release gate yet. The flows are intentionally narrow so the selector surface and runtime contract can stabilize before broader E2E coverage is added.

## Files

1. `.maestro/flows/auth-signin.yaml`
2. `.maestro/flows/unverified-checkin-gate.yaml`
3. `.maestro/flows/password-reset-request.yaml`

## Required Environment

Provide seeded test accounts before running the flows:

1. `E2E_VERIFIED_EMAIL`
2. `E2E_VERIFIED_PASSWORD`
3. `E2E_UNVERIFIED_EMAIL`
4. `E2E_UNVERIFIED_PASSWORD`
5. `E2E_RESET_EMAIL`

The app deep link scheme is `perched` and the app id/package is `app.perched`.

## Commands

```bash
npm run test:e2e:maestro
npm run test:e2e:maestro:auth-signin
npm run test:e2e:maestro:verify-gate
npm run test:e2e:maestro:password-reset
```

These commands assume the Maestro CLI is installed separately and that a simulator or device is already booted with the app available.

## Current Selector Contract

The initial flows rely on explicit `testID` selectors added to:

1. `app/signin.tsx`
2. `app/signup.tsx`
3. `app/verify.tsx`
4. `app/reset.tsx`
5. `app/(tabs)/feed.tsx`
6. `app/checkin.tsx`
7. `components/button.tsx`

Do not rename these selectors casually. Treat them as part of the runtime contract for release validation.

## Next Flows To Add

After the current scaffold is stable, add:

1. Verified user opens check-in and posts online
2. Offline check-in queues and drains after reconnect
3. Feed refresh reflects a new post
4. Edit check-in
5. Signed-in cold start route restoration
