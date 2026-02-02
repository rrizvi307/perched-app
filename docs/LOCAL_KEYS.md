Local keys and setup

Copy `.env.example` to `.env.local` and add your keys (this file is gitignored):

```bash
cp .env.example .env.local
# edit .env.local and add your keys
```

For quick local testing you can add your Google Maps API key to `.env.local`:

```
GOOGLE_MAPS_API_KEY=YOUR_KEY_HERE
```

We attempt to load `.env.local` in Node dev so `services/googleMaps.ts` will pick up the key automatically.

Do NOT commit `.env.local` to source control.

## EAS Build (TestFlight / App Store)

This repo uses `app.config.js` to inject Maps + Firebase config from environment variables at build time.

Before you run `eas build`, set the env vars from `.env.example` in EAS:

- Expo dashboard → your project → **Secrets**
- Or via CLI (example):

```bash
eas secret:create --scope project --name GOOGLE_MAPS_API_KEY --value "YOUR_KEY"
eas secret:create --scope project --name FIREBASE_API_KEY --value "YOUR_KEY"
# ...repeat for the rest of FIREBASE_* vars
```

After building, verify the app can:

- load Explore + Feed
- create a check-in (photo upload works)
- delete a check-in
- delete an account (Settings → Delete account)
