# QA Bug Ledger (2026-02-14)

## Baseline report

### Stack detected
- Expo SDK 54 + React Native 0.81 + Expo Router 6
- Firebase client (`firebase`) + Firebase Functions (Node 22)
- TypeScript + ESLint + Jest (app + functions)

### How to run
- Dev: `CI=1 npm run start -- --clear`
- Typecheck: `npx tsc --noEmit`
- Lint: `npm run lint`
- Unit tests: `npm test -- --runInBand`
- App build check: `npx expo export --platform ios --clear --output-dir .expo-export`
- Functions build: `npm --prefix functions run build`
- Functions tests: `npm --prefix functions test -- --runInBand`

### Baseline failing commands
- None. All baseline commands passed.

## QA walkthrough script

1. Launch app (`CI=1 npm run start -- --clear`).
2. Validate auth-gated feed behavior (no crash with empty/unauth state).
3. Validate public feed subscription fallback behavior when Firestore indexes are missing.
4. Validate explore spot loading fallback path when remote returns empty.
5. Validate telemetry path does not spam hard errors on permission-denied environments.
6. Re-run full checks (`npm run check:all`).

## Issues found and fixed

### 1) Duplicate legacy subscriptions in feed listeners
- Steps to reproduce:
  1. Trigger `subscribeCheckins` / `subscribeCheckinsForUsers` with empty primary snapshots.
  2. Keep stream active while primary callback fires again.
- Expected:
  - One legacy listener per stream/batch.
- Actual:
  - Legacy listener could be attached repeatedly, causing duplicate updates and churn.
- Root cause:
  - Legacy `onSnapshot` attachment happened inside callbacks without a guard.
- Fix implemented:
  - Added guarded `startLegacySubscription()` + shared unordered fallback in both subscription paths.
  - File: `services/firebaseClient.ts`
- Regression test:
  - Not added for this exact listener lifecycle (requires heavier Firestore listener harness); fallback logic remains covered by existing integration/query tests.

### 2) Telemetry permission-denied noise treated as hard error
- Steps to reproduce:
  1. Run app in environment where writes to `performanceMetrics` are denied.
  2. Observe repeated `Error persisting metrics to Firestore` logging.
- Expected:
  - Permission-denied should be recognized and downgraded to one-time warning.
- Actual:
  - Some error variants were not matched by strict code check and logged as hard errors.
- Root cause:
  - Error matching only checked exact `code === 'permission-denied'`.
- Fix implemented:
  - Added shared permission matcher handling `permission-denied`, `firestore/permission-denied`, code variants, and message fallback.
  - File: `services/permissionErrors.ts`
  - Wired into `services/perfMonitor.ts`
- Regression test:
  - Added: `services/__tests__/perfMonitor.test.ts`

### 3) Legacy cursor pagination fragility in checkin fetches
- Steps to reproduce:
  1. Query data where legacy `timestamp` exists but `createdAt` is missing.
  2. Use returned cursor for pagination.
- Expected:
  - Cursor should advance using available sort field.
- Actual:
  - Cursor could be `null` if only `timestamp` existed.
- Root cause:
  - Cursor derivation used `createdAt` only.
- Fix implemented:
  - Cursor now resolves from `createdAt ?? timestamp`.
  - Also sorted unordered fallback payloads by newest timestamp.
  - File: `services/firebaseClient.ts`
- Regression test:
  - Covered indirectly by existing schema fallback tests; no new dedicated cursor test added.

## Guardrails added

- New scripts for repeatable quality gates:
  - `npm run build:ios:export`
  - `npm run check:app`
  - `npm run check:all`
- Added contributing guidance to run pre-commit checks.
  - File: `README.md`

## Verification (post-fix)

Passed:
- `npx tsc --noEmit`
- `npm run lint`
- `npm test -- --runInBand` (246/246)
- `npx expo export --platform ios --clear --output-dir .expo-export`
- `npm --prefix functions run build`
- `npm --prefix functions test -- --runInBand` (40/40)
