# Fixing "Firebase Not Configured" Error

## The Problem

You're seeing "Firebase not configured" because the app can't find your Firebase credentials. This happens when environment variables aren't properly loaded.

## Quick Fix (Local Development)

### Step 1: Create `.env.local`

```bash
cd /Users/rehanrizvi/perched-app
cp .env.example .env.local
```

### Step 2: Fill in Firebase Config

Edit `.env.local` with your Firebase project credentials:

```bash
# Get these from Firebase Console → Project Settings → General

FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789012
FIREBASE_APP_ID=1:123456789012:ios:abc123def456
FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

GOOGLE_MAPS_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Step 3: Restart Metro

```bash
# Stop current Metro bundler (Ctrl+C)
# Clear cache and restart
npx expo start --clear
```

## Where to Get Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project (or create one)
3. Click ⚙️ Settings → Project Settings
4. Scroll to "Your apps" section
5. If no app exists:
   - Click "Add app" → iOS
   - Register with bundle ID from `app.json`
   - Copy the config values
6. If app exists:
   - Click on your iOS app
   - Scroll to "SDK setup and configuration"
   - Copy the `firebaseConfig` values

## Verification

After setting up `.env.local` and restarting:

1. Open app
2. Try to sign in/sign up
3. Check terminal - should NOT see "Firebase not configured"
4. Try creating a check-in (will still fail until you deploy Firebase rules)

## For EAS Builds (TestFlight/App Store)

When building with EAS, set secrets:

```bash
eas secret:create --scope project --name FIREBASE_API_KEY --value "your_key"
eas secret:create --scope project --name FIREBASE_AUTH_DOMAIN --value "your-project.firebaseapp.com"
eas secret:create --scope project --name FIREBASE_PROJECT_ID --value "your-project-id"
eas secret:create --scope project --name FIREBASE_STORAGE_BUCKET --value "your-project.appspot.com"
eas secret:create --scope project --name FIREBASE_MESSAGING_SENDER_ID --value "123456789012"
eas secret:create --scope project --name FIREBASE_APP_ID --value "1:123456789012:ios:abc123"
eas secret:create --scope project --name FIREBASE_MEASUREMENT_ID --value "G-XXXXXXXXXX"
eas secret:create --scope project --name GOOGLE_MAPS_API_KEY --value "your_maps_key"
```

## What I Fixed

Updated `services/firebaseClient.ts` to properly read config from:
1. Expo Constants (injected via `app.config.js`)
2. Global config (set in `_layout.tsx`)
3. Environment variables (`.env.local`)

The app now checks all three sources in order, ensuring Firebase config is always found.

## Testing Firebase Connection

Add this to any screen temporarily:

```typescript
import { isFirebaseConfigured } from '@/services/firebaseClient';

console.log('Firebase configured:', isFirebaseConfigured());
```

Should log `true` when working correctly.

## Common Issues

**Issue:** Still seeing "not configured" after setting `.env.local`
**Fix:** Make sure you restarted Metro with `--clear` flag

**Issue:** Works locally but not in EAS build
**Fix:** Add all Firebase env vars as EAS secrets (see above)

**Issue:** Firebase initialized but uploads fail
**Fix:** Deploy Firebase rules: `firebase deploy --only firestore:rules,storage:rules`

## Next Steps

1. ✅ Fix env setup (this document)
2. 🔥 Deploy Firebase rules (CRITICAL - see `docs/firebase-deployment.md`)
3. 🎯 Set up Sentry (see `docs/DEPLOYMENT_GUIDE.md`)
4. 🚀 Build for TestFlight

You're almost there!
