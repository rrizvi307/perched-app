# Operations and Release

This is the single runbook for Firebase setup, launch operations, and App Store resubmission.

## Firebase Setup

1. Create the Firebase project and add the platform apps you need.
2. Enable Firestore, Storage, and the authentication providers used by the app.
3. Put the environment variables listed in [README.md](../README.md) into local env files and managed build secrets.
4. Use the checked-in `firestore.rules`, `storage.rules`, `firebase.json`, and `functions/` config as the source of truth instead of copying ad hoc console snippets.
5. Verify auth, storage, check-in, and cloud function flows before wider testing.

## Launch Ops Checklist

1. Enable Phone Auth before beta or wider release.
2. Confirm production auth domains and mobile app fingerprints are configured.
3. Set the Firebase project display name to the production product name.
4. Point auth action links at the production domain.
5. Configure the transactional email provider and store its credentials in Firebase or cloud secret storage.
6. Connect the production domain to Firebase Hosting if auth action links or web hosting depend on it.
7. Re-deploy rules and functions whenever schema or security-sensitive fields change.
8. Add billing budget alerts before large-scale testing or launch.

## App Store Resubmission Checklist

This maps to the previously cited App Review guidelines:

- `2.1.0 Performance: App Completeness`
- `4.0.0 Design: Preamble`
- `2.3.3 Performance: Accurate Metadata`

### 2.1.0 App Completeness

Manual release-build checks:

1. Open the feed on an iPad release build with real data.
2. Verify profile, close-friend, report, and block actions respond consistently.
3. Confirm pending states clear, success feedback appears, and the app does not freeze or crash.

### 4.0.0 Design

Manual release-build checks:

1. Open directions from Explore or Spot detail on iOS.
2. Confirm the chooser exposes Apple Maps and Google Maps.
3. Confirm Apple Maps opens natively when selected.

### 2.3.3 Accurate Metadata

App Store Connect checks:

1. Remove stretched or device-mismatched screenshots.
2. Upload real iPad screenshots that show core app functionality.
3. Make sure the screenshot set reflects real in-app flows, not only login or splash states.

### Reviewer Reply Template

```text
Thanks for the detailed review.

We addressed all reported issues in the new build:

1) Guideline 2.1.0
- Fixed the affected interaction paths and verified them on iPad release builds.

2) Guideline 4.0.0
- Added an iOS map chooser with Apple Maps and Google Maps.
- Verified Apple Maps opens natively from the spot navigation flow.

3) Guideline 2.3.3
- Replaced the invalid iPad screenshots with real iPad captures showing core app functionality.

Please re-review this submission. Thank you.
```

## Command Gate

```bash
npm run appstore:preflight
npm run check:all
```

## Public Repo Safety

- Keep only placeholder env var names in repo docs. Do not paste live secrets.
- Keep internal audit findings, migration commands that require service accounts, local machine paths, and personal contact addresses out of public GitHub docs.
- If a document describes current security gaps or internal recovery steps, treat it as private unless it has been deliberately redacted.
