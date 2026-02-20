# App Store Resubmission Checklist (Rejection Follow-up)

Date: 2026-02-20

This checklist maps directly to the rejected submission issues:
- `2.1.0 Performance: App Completeness`
- `4.0.0 Design: Preamble`
- `2.3.3 Performance: Accurate Metadata`

## 1) 2.1.0 App Completeness (Interaction Reliability)

### Code-level status
- Feed card actions (`Profile`, `Close`, `Report`, `Block`) use action locks and pending-disabled states.
- Report/block actions show success and error toasts.
- Friends screen uses toast error handling (no blocking alert dialogs in these action paths).

### Manual iPad release-build test
1. Open feed with populated posts on iPad release build.
2. Tap profile avatar/name on 5 posts. Expected: profile opens each time.
3. Tap `Close` on 5 posts quickly. Expected: pending state then completion, no freeze.
4. Tap `Report` on 3 posts. Expected: success toast and item removed from feed.
5. Tap `Block` then `Unblock` on at least 2 users. Expected: success toast, feed updates.

Pass criteria:
- No dead taps.
- No stuck pending states.
- No crashes.

## 2) 4.0.0 Design (Apple Maps Option)

### Code-level status
- iOS maps flow provides `Apple Maps` and `Google Maps` options.
- Apple Maps is the native fallback on iOS when chooser is unavailable.

### Manual release-build test
1. Open a spot from Explore or Spot detail.
2. Tap the map/directions action.
3. Verify iOS chooser includes `Apple Maps`, `Google Maps`, and `Cancel`.
4. Verify Apple Maps opens natively to destination.

## 3) 2.3.3 Accurate Metadata (Screenshots)

This must be completed in App Store Connect.

Required actions:
1. Open Previews and Screenshots -> `View All Sizes in Media Manager`.
2. Remove invalid 13-inch iPad screenshots that are stretched/modified iPhone captures.
3. Upload real iPad screenshots showing in-use app functionality.
4. Ensure most screenshots show core app screens (not mostly login/splash).

Suggested iPad screenshot set:
1. Explore map and spot list
2. Spot detail screen
3. Feed with active posts
4. Check-in flow with metrics
5. Profile/streak/badges

## 4) Reviewer Reply Template

```
Thanks for the detailed review.

We addressed all reported issues in the new build:

1) Guideline 2.1.0
- Fixed feed interaction reliability for Profile, Close, Report, and Block actions.
- Added robust pending-state handling and explicit user feedback.
- Verified on iPad release builds.

2) Guideline 4.0.0
- Added an iOS map chooser with Apple Maps and Google Maps options.
- Apple Maps now launches natively from spot navigation flow.

3) Guideline 2.3.3
- Replaced 13-inch iPad screenshots with real iPad captures showing core app functionality.

Please re-review this submission. Thank you.
```

## 5) Command Gate

```bash
npm run appstore:preflight
npm run check:all
```
