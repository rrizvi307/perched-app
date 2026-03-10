# Development

This is the stable setup guide for local work, release builds, and secret handling.

## Local Prerequisites

1. Use the Node version pinned in `.nvmrc`.
2. Keep npm current enough to install the repo cleanly.
3. On macOS, install Xcode and the iOS Simulator for native iOS work.
4. Install Firebase CLI and EAS CLI only if your task requires deploys or store builds.

## Local Environment

1. Copy `.env.example` to `.env.local`.
2. Fill only the values needed for your workflow.
3. Keep `.env.local` gitignored and local to the machine.

Important env groups:

- Core app config: `GOOGLE_MAPS_API_KEY`, `FIREBASE_*`, `ENV`
- Optional telemetry: `SENTRY_DSN`, `SEGMENT_WRITE_KEY`, `MIXPANEL_TOKEN`
- Subscription config: `REVENUECAT_PUBLIC_KEY`
- Server-side provider keys: `OPENAI_API_KEY`, `YELP_API_KEY`, `FOURSQUARE_API_KEY`
- Optional client-side dev-only provider calls: `EXPO_PUBLIC_*`

## Secret Handling Rules

1. Do not commit `.env.local`.
2. Do not commit service account JSON files.
3. Keep provider and backend credentials in managed secret storage for deployed environments.
4. If a key is exposed, rotate it instead of only deleting the note that exposed it.

## Local Workflow

```bash
npm install
npm run start
npm run check:app
npm run check:all
```

For Cloud Functions only:

```bash
npm --prefix functions run build
npm --prefix functions test -- --runInBand
```

## EAS and TestFlight

1. Store the same env values from `.env.example` as EAS project secrets.
2. Keep build config free of live secret values.
3. Run a preview build for device testing before a production/App Store build.
4. After each release candidate build, verify:
   - Explore and Feed load
   - check-in creation works
   - photo upload works
   - check-in deletion works
   - account deletion still works

## Cross-Machine Rule

When one machine accumulates useful setup or release knowledge, merge it into `docs/` here instead of leaving it in ad hoc local notes.
