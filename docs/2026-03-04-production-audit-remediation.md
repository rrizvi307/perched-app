# Pre-Production Audit Remediation

Date: 2026-03-04
Label: `app-store-preprod-audit`
Status: In progress

## Scope

This document captures the pre-production audit findings, the release blockers, and the remediation sequence so the work is not lost or silently undone.

## Severity Summary

- Critical:
  - Backend functions package does not build.
  - Public user docs expose contact data.
  - Media privacy is weaker than the app privacy model.
  - Raffle and gamification are client-authoritative.
  - B2B API keys are stored in plaintext.
- High:
  - Provider intelligence is split across client and backend.
  - `place_tags` is client-writable.
  - Explore intelligence fan-out is expensive.
  - Recommendation queries do not scale.
  - Sign-in alert flow is broken.
  - Feed report flow still fails App Store preflight.

## Remediation Tracker

1. Privacy hardening for user profiles
   - Status: In progress
   - Goal: stop storing contact fields in public profile docs and stop returning them from public user APIs.
   - Current patch:
     - public user reads are sanitized before they reach the app UI
     - new writes route contact fields away from public profile documents
     - Firestore rules block future public writes to `email`, `phone`, and `phoneNormalized`
     - secure callable lookup is used for email and phone discovery instead of direct Firestore reads
     - Firestore rules now also block `pushToken` writes on public `users` docs
   - Follow-up:
     - run `npm run migrate:sensitive-data:legacy -- --apply --service-account <path>` after reviewing the dry-run output to move legacy public contact fields and push tokens

2. Backend deployability
   - Status: In progress
   - Goal: make `functions/` compile and deploy cleanly.
   - Current patch:
     - Cloud Functions import path is pinned to the v1 API surface used by this codebase
     - removed deprecated `functions.config()` usage that broke builds under the installed package version
   - Follow-up:
     - add CI gating on `npm --prefix functions run build`

3. Tag integrity hardening
   - Status: In progress
   - Goal: stop accepting client-written aggregate place tags.
   - Current patch:
     - `place_tags` aggregate writes are disabled in client code
     - Firestore rules now treat `place_tags` as server-owned
   - Follow-up:
     - add backend aggregation from `place_tag_votes` and check-in evidence

4. Server-authoritative rewards and achievements
   - Status: In progress
   - Goal: move raffle entry and achievement progression off the client.
   - Current patch:
     - weekly raffle entry creation now happens from a backend check-in trigger
     - client reads raffle progress but no longer writes `weeklyRaffleEntries`
     - Firestore rules now block all client writes to `weeklyRaffleEntries`
     - backend triggers now recompute `userStats/{userId}` from real check-in history
     - backend now mints achievement unlock documents from server-side stats and social graph state
     - client achievement/profile reads prefer remote `userStats` and `achievements` docs over AsyncStorage
     - authenticated clients can request a one-time gamification backfill when remote docs are missing
     - Firestore rules now treat `userStats` and `achievements` as server-owned
   - Follow-up:
     - backfill historical users by running the gamification sync across existing users

5. Check-in media privacy hardening
   - Status: In progress
   - Goal: stop leaking private and friends-only check-in photos through document-stored download URLs.
   - Current patch:
     - private check-in photos now sync to Storage with visibility metadata
     - non-public check-ins store `photoPath` (`gs://...`) instead of a bearer-style download URL
     - shared image rendering now resolves `gs://` paths at runtime for authorized viewers
     - Storage rules for `checkins/` now enforce `public` / `friends` / `close` access based on metadata and the social graph
   - Follow-up:
     - migrate legacy private photo URLs to `photoPath`
     - add automated rules coverage for `storage.rules`

6. Trust and safety / social graph consistency
   - Status: In progress
   - Goal: collapse duplicate block/friend/report flows into one backend-authoritative model.
   - Current patch:
     - `trustSafety.ts` blocking APIs now delegate to the canonical `users.blocked` social-graph path instead of writing shadow `blockedUsers`, `safetySettings.blockedUsers`, and `friends.friendIds` state
     - safety settings reads now merge preference data with the canonical blocked list at read time
     - Firestore rules now reject new client writes to legacy `blockedUsers` docs and reject `blockedUsers` fields inside `safetySettings`
     - the legacy `/friends` collection rule has been removed and demo seeding now writes only `users.friends`
     - a dry-run-first admin migration script now exists to move legacy `/friends`, `blockedUsers`, and `safetySettings.blockedUsers` data onto the canonical social graph
   - Follow-up:
     - run `npm run migrate:social-graph:legacy -- --apply --service-account <path>` against production after reviewing the dry-run output

7. Intelligence pipeline unification
   - Status: Pending
   - Goal: serve hours, tags, and provider data from one backend-normalized source.

8. App Store feed/report remediation
   - Status: In progress
   - Goal: clear remaining `appstore:preflight` failures and complete iPad release checks.
   - Current patch:
     - feed report flow now submits a structured report instead of opening email
     - pending-state locking and success feedback now satisfy automated preflight checks
   - Remaining manual work:
     - upload native iPad screenshots in App Store Connect
     - run iPad release-build smoke test and capture evidence

9. B2B API key secret hardening
   - Status: In progress
   - Goal: stop storing partner API secrets in Firestore and remove plaintext validation paths.
   - Current patch:
     - backend API key issuance now stores only `keyHash`, `keyPreview`, and `keyLast4`
     - backend key validation now resolves only by hash, not plaintext Firestore queries
     - legacy key records are self-healed on access to remove the old `key` field and rebuild the hash index
     - the legacy `services/b2bAPI.ts` helper now also validates by hash and never writes plaintext keys into Firestore
     - a dry-run-first admin migration script now exists to remove legacy plaintext `apiKeys.key` data at rest and rebuild hash index entries
   - Follow-up:
     - add backend tests around API key generation, validation, and rate-limit enforcement

10. Posting eligibility hardening
   - Status: In progress
   - Goal: stop unverified email accounts from creating production check-ins.
   - Current patch:
     - Firestore rules now require check-in creators to be admin, phone-authenticated, or email-verified
     - demo seeding scripts now mark seeded auth users as email-verified
     - demo/dev seeders no longer write email into public `users` docs and instead write to `userPrivate`
   - Follow-up:
     - add emulator coverage for the verified-email / phone-auth check-in rule path

11. Notification scheduling reliability
   - Status: In progress
   - Goal: stop local scheduling code from canceling unrelated notifications or duplicating weekly recap reminders.
   - Current patch:
     - local streak reminders and weekly recap notifications now use managed per-type schedule IDs instead of `cancelAllScheduledNotificationsAsync()`
     - weekly recap scheduling now de-duplicates existing jobs and rolls forward if the current week's send time has already passed
     - notification permission/handler setup is now routed through one shared implementation instead of two separate service paths
   - Follow-up:
     - add unit coverage around managed notification scheduling and preference disable flows

12. Explore enrichment fan-out control
   - Status: In progress
   - Goal: reduce provider-call bursts and repeated render churn on explore load.
   - Current patch:
     - explore now skips intelligence builds for spots already present in the in-memory map
     - initial enrichment now runs through a bounded concurrency pool instead of unconstrained per-item async launches
     - completed intelligence results are merged into state in one batched update instead of one `setState` per spot
   - Follow-up:
     - move place-intelligence computation fully server-side for cacheable normalized payloads

13. Sign-in alert delivery hardening
   - Status: In progress
   - Goal: remove client-side email sending and make sign-in alerts backend-owned and auditable.
   - Current patch:
     - sign-in alert delivery now goes through a callable Cloud Function instead of a client-side SendGrid request
     - the backend resolves the recipient email from canonical private profile data and authenticated user context
     - login alert sends are throttle-protected and recorded in `login_notifications` with delivery status
     - the mobile client now uses a thin callable wrapper instead of storing or reading email-provider credentials
   - Follow-up:
     - add backend tests around throttle behavior and SendGrid failure handling

## Audit Notes

- This audit assumes a production mobile app with real users, App Store review exposure, and long-term scalability requirements.
- Fixes should be deployed in severity order, not by implementation convenience.
