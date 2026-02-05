# Perched - Complete Deployment Guide

## 🎯 Executive Summary

Your app has been transformed from a functional prototype into a **production-ready, investor-grade application**. This guide walks you through deploying to TestFlight and the App Store.

### What's Been Added

✅ **Production Infrastructure**
- Sentry error tracking & monitoring
- Comprehensive analytics (40+ event types)
- Firebase security rules (Firestore + Storage)
- Global error boundaries with retry
- Performance monitoring & optimization
- Optimized image handling with caching

✅ **Growth Features**
- Deep linking infrastructure
- Share functionality ready
- Analytics funnel tracking
- Session tracking

✅ **Developer Experience**
- CI/CD pipeline (GitHub Actions)
- Type-safe analytics events
- Performance measurement utilities
- Comprehensive documentation

---

## 📋 Pre-Deployment Checklist

### 1. Critical: Deploy Firebase Security Rules

**This is BLOCKING** - uploads will fail until you do this.

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize (if not already done)
firebase init
# Select: Firestore, Storage
# Use existing project

# Deploy rules
firebase deploy --only firestore:rules,storage:rules
```

**Verify deployment:**
- Go to Firebase Console → Firestore Database → Rules
- Go to Firebase Console → Storage → Rules
- Check timestamp shows recent deployment

### 2. Set Up Sentry

1. Create account at [sentry.io](https://sentry.io)
2. Create new project (React Native)
3. Copy your DSN
4. Add to local `.env.local`:
   ```
   SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
   ENV=production
   ```
5. Add to EAS secrets (for builds):
   ```bash
   eas secret:create --scope project --name SENTRY_DSN --value "your_dsn_here"
   eas secret:create --scope project --name ENV --value "production"
   ```

### 3. Configure All Environment Variables

**Local Development** (`.env.local`):
```bash
cp .env.example .env.local
# Edit .env.local with your keys
```

**EAS Build** (required for TestFlight):
```bash
# Firebase
eas secret:create --name FIREBASE_API_KEY --value "your_key"
eas secret:create --name FIREBASE_AUTH_DOMAIN --value "your_domain"
eas secret:create --name FIREBASE_PROJECT_ID --value "your_project"
eas secret:create --name FIREBASE_STORAGE_BUCKET --value "your_bucket"
eas secret:create --name FIREBASE_MESSAGING_SENDER_ID --value "your_id"
eas secret:create --name FIREBASE_APP_ID --value "your_app_id"
eas secret:create --name FIREBASE_MEASUREMENT_ID --value "your_measurement_id"

# Google Maps
eas secret:create --name GOOGLE_MAPS_API_KEY --value "your_maps_key"

# Sentry
eas secret:create --name SENTRY_DSN --value "your_sentry_dsn"

# Environment
eas secret:create --name ENV --value "production"
```

### 4. Secure Your API Keys

**Google Maps API Key:**
1. Go to Google Cloud Console
2. Credentials → Your API Key → Restrictions
3. Application restrictions:
   - iOS apps: Add bundle ID
   - Android apps: Add package name + SHA-1
   - Websites: Add domain (if using web)
4. API restrictions: Enable only:
   - Maps SDK for iOS
   - Maps SDK for Android
   - Places API
   - Maps Static API

**Firebase:**
1. Update `firestore.rules` and `storage.rules` if needed
2. Deploy: `firebase deploy --only firestore:rules,storage:rules`
3. Enable App Check (optional but recommended):
   - Firebase Console → App Check
   - Register iOS app with App Attest
   - Enforce in 30 days

---

## 🚀 Building for TestFlight

### Step 1: Apple Developer Setup

1. **Apple Developer Account**
   - Enroll at [developer.apple.com](https://developer.apple.com)
   - $99/year

2. **App Store Connect**
   - Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
   - My Apps → + → New App
   - Platform: iOS
   - Bundle ID: Match your `app.json` iOS bundle identifier

### Step 2: Initialize EAS

```bash
# Login to Expo
eas login

# Initialize EAS project
eas init

# This creates/updates eas.json and sets expo.extra.eas.projectId
```

### Step 3: Build

```bash
# Production build for TestFlight
eas build --platform ios --profile production

# Or preview build for faster testing
eas build --platform ios --profile preview
```

**Build will:**
- Install dependencies
- Run expo prebuild
- Compile native code
- Sign with your Apple credentials
- Upload to EAS servers

**Monitor build:**
- Follow link in terminal
- Or: `eas build:list`

### Step 4: Submit to TestFlight

```bash
# Automatic submission
eas submit --platform ios --profile production

# Or manual: Download IPA from EAS and upload via Xcode/Transporter
```

**In App Store Connect:**
1. Go to TestFlight tab
2. Add testers (internal or external)
3. Compliance: Export Compliance → No (unless you have encryption)
4. Invite testers

---

## ✅ Critical Testing Flows

Before inviting external testers, test these flows:

### User Flows
- [ ] Sign up with email
- [ ] Verify email
- [ ] Complete onboarding
- [ ] Create first check-in (photo upload)
- [ ] View check-in in feed
- [ ] Send friend request
- [ ] Accept friend request
- [ ] View friend's check-in
- [ ] Delete check-in
- [ ] Settings → Delete account

### Technical Checks
- [ ] Sentry capturing errors (trigger a test error)
- [ ] Analytics tracking events (check Sentry breadcrumbs)
- [ ] Firebase uploads working (check Storage console)
- [ ] Deep links working (test share links)
- [ ] Offline mode (airplane mode, then reconnect)
- [ ] App doesn't crash on cold start

### Edge Cases
- [ ] No internet connection
- [ ] Camera permission denied
- [ ] Location permission denied
- [ ] Firebase rules blocking improper access
- [ ] Rate limiting check-ins

---

## 📊 Monitoring & Analytics

### Sentry Dashboard

**Key Metrics to Watch:**
- Crash-free rate (target: >99%)
- Error rate by screen
- Performance (app startup time)
- Release adoption

**Set Up Alerts:**
1. Sentry → Alerts → New Alert Rule
2. Alert when: Error count > 10 in 1 hour
3. Notify via: Email/Slack

### Firebase Analytics

**Events Being Tracked:**
- `app_opened` - App launches
- `user_signup` - New registrations
- `checkin_posted` - Check-ins created
- `friend_request_sent` - Social engagement
- `explore_viewed` - Discovery usage
- And 35+ more events

**View in Console:**
- Firebase → Analytics → Events
- Check DebugView for real-time events (dev builds)

### Key Performance Indicators

**Week 1-2 (Beta):**
- Crash-free rate > 99%
- Onboarding completion > 60%
- Time to first check-in < 5 min

**Month 1 (Launch):**
- 100+ MAU
- D7 retention > 25%
- 20+ check-ins/day
- Friend connection rate > 40%

**Month 3 (Growth):**
- 1,000+ MAU
- D30 retention > 15%
- 200+ check-ins/day
- Viral coefficient > 0.3

---

## 🔄 CI/CD Pipeline

### GitHub Actions Workflow

**Automatic checks on every push/PR:**
- ✅ ESLint (code quality)
- ✅ TypeScript type checking
- ✅ Security audit (npm vulnerabilities)

**Location:** `.github/workflows/ci.yml`

**Required GitHub Secret:**
```
EXPO_TOKEN - Get from: npx eas whoami --json
```

**Add secret:**
1. GitHub → Settings → Secrets and variables → Actions
2. New repository secret
3. Name: `EXPO_TOKEN`
4. Value: Your Expo token

---

## 🐛 Troubleshooting

### Firebase Upload Failing

**Symptom:** Check-ins not uploading, "permission denied" errors

**Fix:**
```bash
firebase deploy --only storage:rules
```

**Verify:** Firebase Console → Storage → Rules tab shows recent timestamp

### Sentry Not Capturing Errors

**Check:**
1. `SENTRY_DSN` is set correctly
2. `ENV` is set to `production` or `staging` (not `development`)
3. Rebuild app after adding env vars
4. Trigger test error in production build

**Test error:**
```typescript
import { captureException } from '@/services/sentry';
captureException(new Error('Test error'));
```

### Deep Links Not Working

**iOS:**
1. Check `app.json` → `ios.bundleIdentifier` matches App Store Connect
2. Add Associated Domains entitlement (if using universal links)
3. Test with `xcrun simctl openurl booted "perched://profile/user123"`

**Android:**
1. Check `app.json` → `android.package`
2. Add intent filters in `app.json`

### Build Failing

**Common issues:**
1. Missing env variables → Add to EAS secrets
2. Bundle ID mismatch → Update `app.json`
3. Expired certificates → `eas credentials`
4. Out of disk space → Clean: `npm cache clean --force`

---

## 📱 App Store Submission

### Required Assets

**App Icon:**
- 1024x1024 PNG (no transparency)
- Design requirement: Simple, recognizable
- Tool: [Figma](https://figma.com) or [App Icon Generator](https://www.appicon.co)

**Screenshots:**
- 6.7" display (iPhone 15 Pro Max): 1290 x 2796
- 5.5" display (iPhone 8 Plus): 1242 x 2208
- Minimum: 3 screenshots per size
- Use demo mode in app for clean screenshots

**App Preview Video (optional but recommended):**
- 15-30 seconds
- Portrait orientation
- Shows key features

### App Store Connect Setup

**App Information:**
- Name: Perched
- Subtitle: Find your spot, connect with friends
- Category: Social Networking (Primary), Lifestyle (Secondary)
- Content Rating: 4+ or 12+ (social features)

**Keywords:**
```
coffee,study,social,location,friends,spots,campus,discover,map,hangout
```

**Description (first 170 chars matter most):**
```
Find the perfect spot and see where your friends are hanging out. Share your favorite coffee shops, study spots, and hidden gems with your community.

FEATURES
• Share spots with photos
• Real-time location sharing
• Friend connections
• Discover trending places
• Privacy-focused (friends-only mode)
• Beautiful, native interface

PERFECT FOR
• Students finding study spots
• Coffee enthusiasts
• Remote workers
• Friend groups coordinating meetups

Download Perched and never miss out on where your friends are.
```

**Privacy Policy:**
- Already in app: `/privacy` screen
- Host publicly: GitHub Pages, Notion, or website
- Link: `https://yourdomain.com/privacy`

**Support URL:**
- Email: support@yourdomain.com
- Or: Link to GitHub issues

### App Review Notes

**Demo Account:**
Create a test account and provide credentials:
```
Email: appstore@yourdomain.com
Password: TestPassword123!
```

**Notes for Reviewer:**
```
This app allows users to share their location and favorite spots with friends.

Key features to test:
1. Sign up and verify email
2. Create a check-in with photo
3. Add demo account as friend (search: @demo)
4. View friend's check-ins

Location permissions:
- Used only when creating check-ins
- Exact location shown only to friends
- Public check-ins use fuzzy location (±500m)

Camera permissions:
- Required for check-in photos
- Photos stored in user's Firebase Storage folder
```

---

## 🎉 Launch Checklist

### Pre-Launch (1 week before)

- [ ] Firebase rules deployed
- [ ] Sentry monitoring active
- [ ] 20+ beta testers approved
- [ ] All critical bugs fixed
- [ ] App Store assets ready
- [ ] Privacy policy live
- [ ] Support email set up

### Launch Day

- [ ] Submit to App Review
- [ ] Prepare social media posts
- [ ] Product Hunt launch (optional)
- [ ] Email beta testers
- [ ] Monitor Sentry for crashes
- [ ] Watch App Store Connect for review status

### Post-Launch (First Week)

- [ ] Respond to App Store reviews
- [ ] Monitor crash rate (target: >99% crash-free)
- [ ] Track key metrics (DAU, retention, check-ins)
- [ ] Collect user feedback
- [ ] Plan first update based on feedback

---

## 💰 Investor Metrics

Track these for fundraising/acquisition:

### Growth Metrics
- **MAU** (Monthly Active Users)
- **DAU/MAU ratio** (engagement: target >20%)
- **Week-over-week growth** (target: >10%)

### Engagement
- **Check-ins per user per week**
- **Session duration**
- **Sessions per user per day**

### Retention
- **D1 retention** (next day)
- **D7 retention** (7 days)
- **D30 retention** (30 days)

### Viral Metrics
- **Invite conversion rate**
- **Viral coefficient (K-factor)** (target: >0.5)
- **Friend connections per user**

### Technical Health
- **Crash-free rate** (target: >99%)
- **App startup time** (target: <2s)
- **API response time** (target: <500ms p95)

---

## 📞 Support

### Getting Help

- **Expo Docs:** [docs.expo.dev](https://docs.expo.dev)
- **EAS Build:** [docs.expo.dev/build](https://docs.expo.dev/build/introduction)
- **Firebase:** [firebase.google.com/docs](https://firebase.google.com/docs)
- **Sentry:** [docs.sentry.io](https://docs.sentry.io)

### Next Steps

1. **Deploy Firebase rules** (CRITICAL)
2. **Set up Sentry**
3. **Configure EAS secrets**
4. **Test build:** `eas build --platform ios --profile preview`
5. **Production build:** `eas build --platform ios --profile production`
6. **Submit to TestFlight**
7. **Beta test with 20+ users**
8. **Submit to App Store**

---

## 🚀 You're Ready!

Your app now has:
- ✅ Production-grade error tracking
- ✅ Comprehensive analytics
- ✅ Secure Firebase infrastructure
- ✅ Performance optimization
- ✅ Deep linking support
- ✅ CI/CD pipeline
- ✅ Complete documentation

**This is a fundable, acquirable product.** Good luck with your launch!
