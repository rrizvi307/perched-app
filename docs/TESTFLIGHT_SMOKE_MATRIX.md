# TestFlight Smoke Matrix (2026-02-13)

Scope: targeted pre-beta verification for iOS TestFlight readiness.

## Summary
- Automated checks: **mostly pass**
- Critical blocker: **App icon has alpha channel** (`hasAlpha: yes`)
- Manual/device checks: still required before external tester rollout

## Automated Matrix

| ID | Area | Check | Result | Evidence | Action |
|---|---|---|---|---|---|
| A1 | Build config | iOS bundle + submit IDs configured | PASS | `app.json` bundle `app.perched`; `eas.json` has `ascAppId=6759113835`, `appleTeamId=ZGYMN58SN5` | None |
| A2 | Secrets | Production EAS env contains required keys | PASS | `npx eas-cli env:list --environment production` shows Firebase, Maps, OpenAI, Yelp, Foursquare keys | None |
| A3 | Dynamic config | Build-time env injection wired | PASS | `app.config.js` maps env -> iOS/Android Maps + Firebase extras | None |
| A4 | Quality gate | TypeScript | PASS | `npm run typecheck` / `npx tsc --noEmit` pass | None |
| A5 | Quality gate | Lint | PASS | `npm run lint` pass, 0 warnings/0 errors | None |
| A6 | Quality gate | Tests | PASS | `npm test -- --runInBand` pass (`243/243`) | None |
| A7 | Runtime stability | Feed/auth/rules alignment fixes merged | PASS | commits `b1b4021`, `75db1e2`, `2b13203` | None |
| A8 | Runtime stability | Perf telemetry permission spam fixed | PASS | commit `3be827c` disables client Firestore perf persistence by default | None |
| A9 | App icon | 1024x1024 and no alpha (App Store requirement) | **FAIL** | `sips` reports `pixelWidth=1024`, `pixelHeight=1024`, `hasAlpha: yes` | Export flattened PNG with opaque background, replace `assets/brand/perched-icon-purple.png` |
| A10 | Legal URLs | Privacy/Terms hosted and reachable | UNVERIFIED (sandbox DNS) | Local sandbox cannot resolve `spot-app-ce2d8.web.app` | Verify from local machine/browser and in App Store Connect metadata |

## Manual Device Smoke (Required)

| ID | Flow | Expected | Status |
|---|---|---|---|
| M1 | Sign up / sign in / sign out | No crashes; auth state stable | PENDING |
| M2 | Explore map + recommendations | Spots load; no permission-denied spam | PENDING |
| M3 | Check-in creation with photo | Upload completes; item appears in feed | PENDING |
| M4 | Feed interactions | Reactions work; no duplicate/replay issues | PENDING |
| M5 | Spot intelligence surface | Bottom sheet + scores render without errors | PENDING |
| M6 | Friends flow | Request/accept/remove/block works | PENDING |
| M7 | Notifications | Local reminders schedule; no fatal warnings | PENDING |
| M8 | Premium fallback | Missing RevenueCat key does not crash | PENDING |

## Known Beta-Scope TODOs (Not TestFlight blockers)
- `firestore.rules`: rate limiting helper is a no-op TODO for GA hardening.
- `firestore.rules` + `storage.rules`: verification gate relaxed for beta flow; TODO to tighten before public launch.

## Immediate Next Actions
1. Replace icon with an opaque 1024x1024 PNG (no alpha).
2. Re-run iOS build (`production`) after icon replacement.
3. Execute M1-M8 on TestFlight build and update this matrix to PASS/FAIL per item.
