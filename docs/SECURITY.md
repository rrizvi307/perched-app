# Security Configuration Guide

## ⚠️ CRITICAL: API Keys Management

All sensitive API keys have been removed from `app.json` to prevent exposure in version control.

---

## Local Development Setup

### 1. Copy Environment Template

```bash
cp .env.local.example .env.local
```

### 2. Fill in Your API Keys

Edit `.env.local` with your actual credentials (file is gitignored and won't be committed):

```bash
# Google Maps
GOOGLE_MAPS_API_KEY=your_google_maps_key_here

# Firebase Configuration
FIREBASE_API_KEY=your_firebase_api_key_here
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
FIREBASE_APP_ID=your_app_id
FIREBASE_MEASUREMENT_ID=your_measurement_id

# External APIs
OPENAI_API_KEY=your_openai_key_here
YELP_API_KEY=your_yelp_key_here
FOURSQUARE_API_KEY=your_foursquare_key_here

# Feature Flags
INTEL_V1_ENABLED=true
```

### 3. Build with Environment Variables

For local development, temporarily copy keys into `app.json` (DO NOT COMMIT):

```bash
# Before running npm run ios/android:
# 1. Copy keys from .env.local into app.json
# 2. Run build
# 3. Git checkout app.json (discard local changes)
```

---

## Production Builds (EAS)

### 1. Set EAS Secrets

```bash
# Initialize EAS (if not done)
eas init

# Set secrets for production builds
eas secret:create --scope project --name GOOGLE_MAPS_API_KEY --value "your_key_here"
eas secret:create --scope project --name FIREBASE_API_KEY --value "your_key_here"
eas secret:create --scope project --name FIREBASE_AUTH_DOMAIN --value "your_domain_here"
eas secret:create --scope project --name FIREBASE_PROJECT_ID --value "your_project_id"
eas secret:create --scope project --name FIREBASE_STORAGE_BUCKET --value "your_bucket"
eas secret:create --scope project --name FIREBASE_MESSAGING_SENDER_ID --value "your_sender_id"
eas secret:create --scope project --name FIREBASE_APP_ID --value "your_app_id"
eas secret:create --scope project --name FIREBASE_MEASUREMENT_ID --value "your_measurement_id"
eas secret:create --scope project --name OPENAI_API_KEY --value "your_openai_key"
eas secret:create --scope project --name YELP_API_KEY --value "your_yelp_key"
eas secret:create --scope project --name FOURSQUARE_API_KEY --value "your_foursquare_key"
eas secret:create --scope project --name REVENUECAT_PUBLIC_KEY --value "your_revenuecat_key"
```

### 2. Create EAS Build Configuration

Create `eas.json`:

```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "production": {
      "env": {
        "GOOGLE_MAPS_API_KEY": "",
        "FIREBASE_API_KEY": "",
        "OPENAI_API_KEY": "",
        "YELP_API_KEY": "",
        "FOURSQUARE_API_KEY": "",
        "REVENUECAT_PUBLIC_KEY": ""
      },
      "ios": {
        "buildConfiguration": "Release"
      },
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

### 3. Build for Production

```bash
eas build --platform ios --profile production
eas build --platform android --profile production
```

EAS will automatically inject secrets from `eas secret` into the build.

---

## Key Rotation (If Exposed)

If keys were committed to git history or exposed publicly:

### 1. Rotate Google Maps API Key
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create new API key
3. Restrict by bundle ID: `app.perched`
4. Enable Maps SDK for iOS/Android
5. Delete old key
6. Update `.env.local` and EAS secrets

### 2. Rotate Firebase Config
**Firebase config keys are less critical** (they're designed to be public, secured by Firestore rules), but if concerned:
1. Create new Firebase project
2. Migrate data (export/import)
3. Update all config values
4. Deprecate old project

### 3. Rotate OpenAI API Key
1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Revoke old key
3. Create new key
4. Update `.env.local` and EAS secrets

### 4. Rotate Yelp API Key
1. Go to [Yelp Fusion](https://www.yelp.com/developers/v3/manage_app)
2. Regenerate API key
3. Update `.env.local` and EAS secrets

### 5. Rotate Foursquare API Key
1. Go to [Foursquare Developers](https://foursquare.com/developers/apps)
2. Create new API key
3. Delete old key
4. Update `.env.local` and EAS secrets

---

## Firebase Functions Configuration

For Cloud Functions, keys are managed via Firebase Functions config:

```bash
# Set environment variables for Cloud Functions
firebase functions:config:set \
  openai.key="your_openai_key" \
  yelp.key="your_yelp_key" \
  foursquare.key="your_foursquare_key"

# Deploy with new config
firebase deploy --only functions
```

---

## Service Account Security

**Never commit service account JSON files:**

✅ Protected by `.gitignore`:
- `perched-service-account.json`
- `spot-app-*-firebase-adminsdk-*.json`
- `serviceAccountKey.json`

**If service account file is exposed:**
1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Manage service account permissions" (opens GCP Console)
3. Find the exposed service account
4. Delete the compromised key
5. Generate new key
6. Download and save securely (not in repo)

---

## Pre-Commit Checklist

Before committing:

```bash
# 1. Verify no secrets in staged files
git diff --staged | grep -i "api.*key\|secret\|password"

# 2. Verify app.json has empty keys
git diff app.json

# 3. Verify service account files not tracked
git ls-files | grep -i "service.*account\|firebase.*admin"
```

If any keys found → DO NOT COMMIT.

---

## Git History Cleanup (If Keys Were Committed)

If sensitive keys were committed to git history:

### Option 1: BFG Repo-Cleaner (Recommended)

```bash
# Install BFG
brew install bfg

# Backup your repo first
cp -r /path/to/perched-app /path/to/perched-app-backup

# Remove secrets from history
bfg --replace-text secrets.txt perched-app/.git

# Where secrets.txt contains patterns/placeholders for compromised keys:
# GOOGLE_MAPS_API_KEY=REVOKED_VALUE
# OPENAI_API_KEY=REVOKED_VALUE
# (include every leaked key you are rotating)

# Clean up
cd perched-app
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push (⚠️ DESTRUCTIVE)
git push --force --all
```

### Option 2: Filter-Branch

```bash
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch app.json" \
  --prune-empty --tag-name-filter cat -- --all

git push --force --all
```

**After cleanup:** Rotate all exposed keys immediately.

---

## Monitoring & Alerts

### 1. GitHub Secret Scanning
Enable secret scanning in GitHub repo settings to detect leaked secrets.

### 2. Google Cloud Monitoring
Set up billing alerts for unexpected API usage (indicates key compromise).

### 3. Firebase Console
Monitor auth usage, database reads/writes for anomalies.

---

## Questions?

- Security incident: Rotate keys immediately, then investigate
- Uncertain if exposed: Assume yes, rotate as precaution
- Best practice: Use EAS secrets for all production builds

**Remember:** Local `.env.local` is for development only. Never commit it.
