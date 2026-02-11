# EAS Setup Guide

## Quick Start

Your [eas.json](../eas.json) is configured for secure builds that reference EAS secrets instead of hardcoded keys.

### 1. Initialize EAS (if not done)

```bash
eas login
eas init
```

This will update `app.json` with your EAS project ID.

### 2. Add EAS Secrets

Copy these commands and run them to populate secrets from your `.env.local`:

```bash
# Google Maps
eas secret:create --scope project --name GOOGLE_MAPS_API_KEY --value "$(grep GOOGLE_MAPS_API_KEY .env.local | cut -d '=' -f2-)"

# Firebase Configuration
eas secret:create --scope project --name FIREBASE_API_KEY --value "$(grep FIREBASE_API_KEY .env.local | cut -d '=' -f2-)"
eas secret:create --scope project --name FIREBASE_AUTH_DOMAIN --value "$(grep FIREBASE_AUTH_DOMAIN .env.local | cut -d '=' -f2-)"
eas secret:create --scope project --name FIREBASE_PROJECT_ID --value "$(grep FIREBASE_PROJECT_ID .env.local | cut -d '=' -f2-)"
eas secret:create --scope project --name FIREBASE_STORAGE_BUCKET --value "$(grep FIREBASE_STORAGE_BUCKET .env.local | cut -d '=' -f2-)"
eas secret:create --scope project --name FIREBASE_MESSAGING_SENDER_ID --value "$(grep FIREBASE_MESSAGING_SENDER_ID .env.local | cut -d '=' -f2-)"
eas secret:create --scope project --name FIREBASE_APP_ID --value "$(grep FIREBASE_APP_ID .env.local | cut -d '=' -f2-)"
eas secret:create --scope project --name FIREBASE_MEASUREMENT_ID --value "$(grep FIREBASE_MEASUREMENT_ID .env.local | cut -d '=' -f2-)"

# External APIs
eas secret:create --scope project --name OPENAI_API_KEY --value "$(grep OPENAI_API_KEY .env.local | cut -d '=' -f2-)"
eas secret:create --scope project --name YELP_API_KEY --value "$(grep YELP_API_KEY .env.local | cut -d '=' -f2-)"
eas secret:create --scope project --name FOURSQUARE_API_KEY --value "$(grep FOURSQUARE_API_KEY .env.local | cut -d '=' -f2-)"

# RevenueCat (add after account created)
eas secret:create --scope project --name REVENUECAT_PUBLIC_KEY --value "YOUR_REVENUECAT_KEY_HERE"
```

**Note:** EAS automatically injects secrets you've created with `eas secret:create`. Don't add them to `eas.json` - they're pulled from your Expo account at build time.

### 3. Verify Secrets

```bash
eas secret:list
```

### 4. Build for TestFlight

```bash
# Production build
eas build --platform ios --profile production

# Auto-submit to TestFlight (after build completes)
eas submit --platform ios --latest
```

### 5. Update Submit Configuration

After getting your App Store Connect details, update [eas.json](../eas.json):

```json
"submit": {
  "production": {
    "ios": {
      "appleId": "rehan.rizvi307@gmail.com",
      "ascAppId": "YOUR_ASC_APP_ID",      // From App Store Connect
      "appleTeamId": "YOUR_TEAM_ID"        // From App Store Connect
    }
  }
}
```

---

## Build Profiles

### Development
- Local builds with Expo Go
- Simulator-only
- Fast iteration

```bash
eas build --platform ios --profile development
```

### Preview
- Internal distribution
- Real device testing
- Uses production environment

```bash
eas build --platform ios --profile preview
```

### Production
- App Store distribution
- Release configuration
- All environment secrets injected

```bash
eas build --platform ios --profile production
```

---

## Security Notes

✅ **Safe:**
- Empty strings in `eas.json` (secrets injected at build time)
- `.env.local` on your machine (gitignored)
- EAS secrets stored in your Expo account

❌ **Never commit:**
- Actual API keys in `eas.json`
- `.env.local` file
- Service account JSON files

---

## Troubleshooting

### "Missing environment variable X"

Run `eas secret:list` to verify the secret exists. If missing, add it:

```bash
eas secret:create --scope project --name VARIABLE_NAME --value "value"
```

### "Invalid Firebase configuration"

Verify all 8 Firebase config secrets are set:
- FIREBASE_API_KEY
- FIREBASE_AUTH_DOMAIN
- FIREBASE_PROJECT_ID
- FIREBASE_STORAGE_BUCKET
- FIREBASE_MESSAGING_SENDER_ID
- FIREBASE_APP_ID
- FIREBASE_MEASUREMENT_ID

### "Google Maps not working"

1. Check API key is set: `eas secret:list | grep GOOGLE_MAPS`
2. Verify API key has Maps SDK for iOS enabled in Google Cloud Console
3. Check bundle ID restriction matches `app.perched`

---

## Next Steps

1. **Now:** Run `eas init` and populate secrets (Step 1-2 above)
2. **Tomorrow:** Set up RevenueCat account, add REVENUECAT_PUBLIC_KEY secret
3. **This Week:** Create screenshots, build for TestFlight (Step 4)
4. **Next Week:** Beta testing with 5-10 testers
5. **Week 3:** Final build and App Store submission

See [PRE-LAUNCH-CHECKLIST.md](PRE-LAUNCH-CHECKLIST.md) for complete launch timeline.
