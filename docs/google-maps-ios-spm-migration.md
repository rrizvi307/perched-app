# Google Maps iOS SPM Migration

Date: 2026-03-18
Status: Not an immediate release blocker; revisit before Q2 2026 ends

## Why This Exists

Google Maps Platform notified customers that CocoaPods support for new releases of the following iOS SDKs will end after Q2 2026:

- Maps SDK for iOS
- Places SDK for iOS
- Navigation SDK for iOS
- Fleet Engine

Per the notice, version 11.0 and later of those SDKs will not ship through CocoaPods. Swift Package Manager is the preferred installation method going forward.

## Repo Impact

This repo is affected on iOS because the native Google Maps SDK is currently brought in through CocoaPods via `react-native-maps`.

Evidence in this repo:

- CocoaPods is in use: [`ios/Podfile`](../ios/Podfile)
- Expo prebuild adds the Google Maps pod wrapper: [`ios/Podfile`](../ios/Podfile)
- Current iOS pods include Google Maps: [`ios/Podfile.lock`](../ios/Podfile.lock)
- Native map component uses `PROVIDER_GOOGLE`: [`components/map/index.native.tsx`](../components/map/index.native.tsx)

Current pod state at time of note:

- `react-native-google-maps`
- `GoogleMaps 8.4.0`
- `Google-Maps-iOS-Utils 5.0.0`

## What Is Not Affected

This does not directly affect the app's HTTP calls to Google APIs such as geocoding, Places API, or other REST endpoints in the client and backend.

The issue is specifically the embedded native iOS Google Maps SDK dependency path.

## Risk

Short term:

- Existing builds should continue to work.
- This is not the current App Store rejection cause.

Medium term:

- After Q2 2026, staying on CocoaPods likely means iOS map SDK updates will stall.
- Future Google Maps iOS bug fixes, security updates, performance work, and new features may become unavailable.
- Future Expo / React Native / Xcode upgrades may become harder if upstream package support diverges.

## Recommended Revisit Trigger

Revisit this work when any of the following happens:

1. `react-native-maps` adds a supported Swift Package Manager path for iOS Google Maps.
2. Expo documents an official migration path for `react-native-maps` Google provider on iOS without CocoaPods lock-in.
3. A required Xcode / iOS / Expo / React Native upgrade conflicts with the current Google Maps pod setup.
4. Q2 2026 is approaching and no supported upstream path has landed yet.

## Preferred Plan

Lowest-risk order:

1. Keep the current setup for the current release cycle.
2. Watch upstream `react-native-maps` and Expo support for Swift Package Manager migration.
3. Migrate only when there is a stable supported path.

Avoid a rushed custom native patch unless upstream support does not arrive in time.

## Fallback Options

If no clean upstream path lands in time:

1. Maintain a custom iOS integration for Google Maps via Swift Package Manager.
2. Switch iOS to Apple Maps while keeping Google provider usage where still needed on other platforms.
3. Reduce dependency on embedded Google Maps iOS SDK surfaces if product priorities shift.

Option 1 has the highest maintenance risk.
Option 2 is likely the safest fallback if schedule pressure is high.

## Suggested Owner Checklist

When revisiting:

1. Check the latest `react-native-maps` iOS installation guidance.
2. Check Expo prebuild/autolinking support for Google Maps on iOS.
3. Decide whether the app still needs Google provider maps on iOS or whether Apple Maps is acceptable.
4. Test native iOS map rendering, marker behavior, permissions, and directions flows after any migration.
5. Re-run App Store smoke checks on a real iPhone and iPad release build.

## Notes

- This is a dependency maintenance task, not a user-facing product change.
- Do not mix this work into the current App Store auth rejection fix unless it becomes an actual build blocker.
