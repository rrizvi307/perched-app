# Architecture

This is the high-level reference for data, place intelligence, and release-sensitive rules behavior.

## Core Data Surfaces

- `users`: public profile data only
- `checkins`: spot activity, captions, visibility, and work-quality signals
- `spots`: normalized place and recommendation surfaces
- `userStats` and `achievements`: server-owned progression data
- analytics/event logs: operational telemetry and product analytics

## Client and Sync Model

1. The app favors optimistic UI for check-ins and social interactions.
2. Local persistence and pending queues keep the app usable when network conditions are bad.
3. Remote writes and server-owned aggregates should be the long-term source of truth for anything security-sensitive or leaderboard-like.

## Place and Maps Integration

1. Place selection stores human-friendly name, provider place ID, and coordinates when available.
2. Google Maps and place-provider access should prefer backend or proxy-backed flows where possible.
3. Do not hardcode provider secrets in client code or docs.
4. Any temporary client-side provider access should stay dev-only and be clearly gated.

## Rules and Privacy Expectations

Firestore and Storage changes should preserve these invariants:

- authenticated users write only their own user-owned data
- public profile reads expose only intended public fields
- admin-only collections are not client-writable
- user media uploads are owner-scoped and visibility-aware
- reports and safety flows remain backend-authoritative where possible

## Release Checklist for Data Changes

1. Review Firestore and Storage rules for every new field or collection.
2. Confirm indexes exist for new production query shapes.
3. Verify older data remains readable after schema changes.
4. Re-run emulator or rules coverage when privacy or write paths change.
