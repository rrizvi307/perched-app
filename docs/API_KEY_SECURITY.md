# API Key Security Checklist

## ✅ Already Secure (Code Level)
- `.env*.local` files are in `.gitignore` ✓
- Only `.env.example` is committed to git ✓
- Keys are loaded at build time via `app.config.js` ✓
- No hardcoded secrets in code ✓

## 🔒 CRITICAL: Restrict Keys in Cloud Consoles

### Firebase API Key Restrictions

**Important:** Firebase API keys are designed to be public, but MUST be restricted to prevent abuse.

1. **Go to Firebase Console** → Your Project → Project Settings → General
2. **Under "Your apps"** → Click on your Web/iOS/Android app
3. **Application restrictions:**
   - For Web: Add your domains (e.g., `yourdomain.com`, `*.yourdomain.com`)
   - For iOS: Add your bundle ID
   - For Android: Add your package name + SHA-1 fingerprint

4. **Enable Firebase Security Rules** (already done in `firestore.rules`)
   - ✅ Firestore rules enforce authentication
   - ✅ Storage rules enforce file limits and auth
   - These rules protect your data even if API key is exposed

5. **Firebase Console → Authentication → Settings:**
   - Add authorized domains only (remove `localhost` in production)
   - Enable email verification requirement

### Google Maps API Key Restrictions

**CRITICAL:** Without restrictions, anyone can use your Maps API key and rack up charges.

1. **Go to Google Cloud Console** → APIs & Services → Credentials
2. **Click your API key** → Edit
3. **Application restrictions:**
   - **iOS:** Select "iOS apps" → Add bundle IDs
   - **Android:** Select "Android apps" → Add package name + SHA-1
   - **Web:** Select "HTTP referrers" → Add your domains

4. **API restrictions:**
   - Select "Restrict key"
   - Enable ONLY these APIs:
     - ✅ Maps SDK for Android
     - ✅ Maps SDK for iOS
     - ✅ Places API
     - ✅ Geocoding API
     - ❌ Disable everything else

5. **Set up billing alerts:**
   - Set budget alerts at $10, $50, $100
   - Enable budget notifications

### Sentry DSN

- Sentry DSN is safe to expose (it's write-only)
- No restrictions needed, but enable rate limiting in Sentry dashboard

### SendGrid API Key

**CRITICAL:** This should NEVER be in client code!

- ❌ Remove from `.env.example` if not used
- ✅ Should only be used in backend/Cloud Functions
- If you need email sending, use:
  - Firebase Cloud Functions with SendGrid
  - Firebase Extensions for email

## 📋 Pre-Public Release Checklist

Before making repo public or deploying to production:

- [ ] Verify `.env.local` is not in git: `git ls-files | grep .env.local` (should return nothing)
- [ ] Verify no secrets in git history: `git log --all --full-history --source -- **/.env*`
- [ ] Set Firebase application restrictions (domain/bundle ID)
- [ ] Set Google Maps API restrictions (referrer/bundle ID)
- [ ] Enable Firebase billing alerts
- [ ] Enable Google Cloud billing alerts
- [ ] Deploy Firestore security rules: `firebase deploy --only firestore:rules`
- [ ] Deploy Storage security rules: `firebase deploy --only storage:rules`
- [ ] Test with restricted keys in production

## 🔄 For EAS Builds

Set secrets using EAS CLI (these are never exposed):

```bash
# Required secrets
eas secret:create --name FIREBASE_API_KEY --value "your_key"
eas secret:create --name FIREBASE_AUTH_DOMAIN --value "your_domain"
eas secret:create --name FIREBASE_PROJECT_ID --value "your_id"
eas secret:create --name FIREBASE_STORAGE_BUCKET --value "your_bucket"
eas secret:create --name FIREBASE_MESSAGING_SENDER_ID --value "your_id"
eas secret:create --name FIREBASE_APP_ID --value "your_id"
eas secret:create --name FIREBASE_MEASUREMENT_ID --value "your_id"
eas secret:create --name GOOGLE_MAPS_API_KEY --value "your_key"
eas secret:create --name SENTRY_DSN --value "your_dsn"
eas secret:create --name ENV --value "production"
```

## 📊 Monitoring

Set up monitoring to detect unusual usage:

1. **Firebase Console:**
   - Monitor authentication attempts
   - Monitor Firestore read/write counts
   - Set up usage alerts

2. **Google Cloud Console:**
   - Monitor Maps API usage daily
   - Enable quota limits per day/minute

3. **Sentry:**
   - Monitor error rates
   - Set up alerts for spike in errors

## ⚠️ If Keys Are Compromised

1. **Immediately rotate:**
   - Regenerate Firebase config (can't rotate API key directly, but can add new app)
   - Regenerate Google Maps API key
   - Update EAS secrets
   - Deploy new build

2. **Review:**
   - Check Firebase Analytics for unusual activity
   - Check Google Cloud billing for unexpected charges
   - Review Firestore audit logs

## 📚 Additional Resources

- [Firebase API Key Best Practices](https://firebase.google.com/docs/projects/api-keys)
- [Google Maps API Key Best Practices](https://developers.google.com/maps/api-security-best-practices)
- [Securing Expo Apps](https://docs.expo.dev/guides/security/)
