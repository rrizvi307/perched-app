# Explore Intel, Profile Sync, and Achievements

## Goal

Keep explore, spot, profile, and achievements on the same source of truth so the app does not drift into stale ratings, stale friend state, or zeroed progress.

## Explore and Spot Intel

- Explore cards and the spot sheet should show aggregate rating across providers when available.
- Explore cards and the spot sheet should show provider-specific chips for Google, Yelp, and Foursquare when those signals exist.
- Live hours and Open now or Closed now should only render when backed by Google hours data or fresh intel.
- Foursquare ratings arrive on a 10-point scale and must be normalized to the app's 5-star scale before rendering or blending.
- The intel pipeline is expected to use all available signals: Google Places details, Yelp business search, Foursquare place search, OpenAI review summarization, and first-party check-ins.
- If a provider signal is missing, the UI should degrade to unknown rather than invent tags or hours.

## Achievements

- Achievement progress must reconcile from merged remote and local check-ins for the active user.
- Explorer progress is based on unique checked-in spots, so two distinct spots should render 2/5 with a visible progress bar.
- The achievements screen should refresh on focus so stale zero-state progress does not persist after new check-ins sync.

## Profile and Relationship State

- Cross-profile views should use real friendship state instead of assuming Add friend.
- Remote check-in history should feed profile stats so friend profiles do not show 0 check-ins, 0 spots, or 0 streak when data exists.

## Early Adopter Raffle

- Posting three check-ins in one week should create a raffle entry.
- Feed surfaces the user's current weekly progress toward that threshold.

## Files Touched

- app/(tabs)/explore.tsx
- app/spot.tsx
- components/ui/spot-list-item.tsx
- components/ui/SpotIntelligence.tsx
- services/googleMaps.ts
- services/placeIntelligence.ts
- services/spotNormalizer.ts
- services/gamification.ts
- app/achievements.tsx
- app/(tabs)/profile.tsx
- app/profile-view.tsx
- services/firebaseClient.ts
- app/checkin.tsx
- app/(tabs)/feed.tsx
- services/earlyAdopterRaffle.ts
- functions/src/index.ts
- firestore.rules

## Verification

- npm.cmd run typecheck
- npm.cmd test -- --runInBand services/__tests__/placeIntelligence.test.ts services/__tests__/spotNormalizer.test.ts

## Deployment Notes

- Firestore rules must be deployed for weeklyRaffleEntries.
- functions still has pre-existing Firebase typing issues outside this change set; clean those up separately before treating the functions build as a release gate.
