# Change Summary (2026-02-14)

## git log --oneline --decorate -10

```text
dd893af (HEAD -> main) Finalize QA rerun and harden runtime fallback paths
06d3706 Harden checkin fallbacks and add QA guardrails
dd31f41 (origin/main, origin/HEAD) Fix demo cleanup ordering and resilient checkin query fallbacks
3bb6b02 Harden feed/explore fallback when Firestore indexes are missing
ad74b07 Apply demo isolation, cleanup hooks, and Firestore index/rules updates
97af799 Add TestFlight smoke matrix with pass/fail status
3be827c Disable client perf metrics Firestore writes by default
2b13203 Burn down lint debt and stabilize runtime auth/query paths
75db1e2 Align admin analytics collection name with Firestore rules
b1b4021 Fix auth/rules alignment for analytics, feed, and demo seeding
```

## git diff --stat origin/main..HEAD

```text
 README.md                                 |  26 +++++
 app/_layout.tsx                           |  14 ++-
 docs/CI-VERIFY-2026-02-14.txt             | 140 +++++++++++++++++++++++
 docs/QA-BUG-LEDGER-2026-02-14.md          | 183 ++++++++++++++++++++++++++++++
 package.json                              |   3 +
 services/__tests__/deepLinkGuards.test.ts |  17 +++
 services/__tests__/perfMonitor.test.ts    |  18 +++
 services/deepLinkGuards.ts                |   8 ++
 services/deepLinking.ts                   |   5 +
 services/firebaseClient.ts                | 171 +++++++++++++++-------------
 services/perfMonitor.ts                   |   6 +-
 services/permissionErrors.ts              |   7 ++
 12 files changed, 509 insertions(+), 89 deletions(-)
```

## git diff origin/main..HEAD --name-only

```text
README.md
app/_layout.tsx
docs/CI-VERIFY-2026-02-14.txt
docs/QA-BUG-LEDGER-2026-02-14.md
package.json
services/__tests__/deepLinkGuards.test.ts
services/__tests__/perfMonitor.test.ts
services/deepLinkGuards.ts
services/deepLinking.ts
services/firebaseClient.ts
services/perfMonitor.ts
services/permissionErrors.ts
```

## File -> Why It Changed

- `app/_layout.tsx`: Added per-user idempotence guard for notification initialization and narrowed effect dependency to `user?.id` to prevent duplicate setup side effects.
- `services/deepLinkGuards.ts`: Added dev-client URL guard utility to classify Expo bootstrap links.
- `services/deepLinking.ts`: Short-circuits deep-link handling for Expo dev-client bootstrap URLs to stop invalid-link warnings.
- `services/firebaseClient.ts`: Hardened remote fetch/subscription fallbacks for missing Firestore indexes and improved cursor derivation (`createdAt ?? timestamp`).
- `services/perfMonitor.ts`: Removed top-level cycle-causing import by switching to lazy dynamic import and improved permission-denied handling.
- `services/__tests__/deepLinkGuards.test.ts`: Added regression coverage for dev-link guard behavior.
- `services/__tests__/perfMonitor.test.ts`: Added tests for permission-denied classification and one-time warning behavior in perf persistence.
- `services/permissionErrors.ts`: Added shared permission-denied matcher used across telemetry and Firebase fallbacks.
- `docs/QA-BUG-LEDGER-2026-02-14.md`: Recorded baseline, QA walkthrough, all 7 issues, emulator rerun results, and final verification status.
- `docs/CI-VERIFY-2026-02-14.txt`: Captured exact outputs for all requested verification commands.
- `docs/EVIDENCE-EXCERPTS-2026-02-14.md`: Added verbatim line-numbered excerpts and code-location proof blocks tied to claimed fixes.
- `README.md`: Added/updated "How To Verify" section pointing to `npm run check:all` and the CI verification transcript.
- `package.json`: Added consolidated `check:all`/verification script wiring used by CI-style local validation.
