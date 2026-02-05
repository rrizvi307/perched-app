# Deployment Guide: Firebase Rules & Sentry Setup

## 1️⃣ Deploy Firebase Rules

### Prerequisites
- Firebase CLI installed: `npm install -g firebase-tools`
- Logged into Firebase: `firebase login`

### Step 1: Initialize Firebase (if not already done)

```bash
# In your project root
firebase init

# Select:
# - Firestore: Configure rules and indexes
# - Storage: Configure rules
# - Use existing project: [select your project]
# - Firestore rules: firestore.rules (already exists)
# - Storage rules: storage.rules (already exists)
```

### Step 2: Deploy Firestore Rules

```bash
# Deploy ONLY Firestore rules
firebase deploy --only firestore:rules
```

**Expected output:**
```
✔ Deploy complete!

Project Console: https://console.firebase.google.com/project/your-project/overview
```

### Step 3: Deploy Storage Rules

```bash
# Deploy ONLY Storage rules
firebase deploy --only storage:rules
```

### Step 4: Verify Deployment

1. Go to Firebase Console: https://console.firebase.google.com
2. Select your project
3. **Firestore Database → Rules:**
   - Should show updated timestamp
   - Should include new rules for `reactions`, `comments`, `userStats`, `achievements`

4. **Storage → Rules:**
   - Should show updated timestamp
   - Should enforce 10MB limit and image types

### Troubleshooting

**Error: "No project active"**
```bash
firebase use --add
# Select your project from list
```

**Error: "Permission denied"**
```bash
firebase login --reauth
```

**Error: "Rules compilation failed"**
```bash
# Check syntax in firestore.rules
# Make sure all braces and parentheses match
firebase deploy --only firestore:rules --debug
```

---

## 2️⃣ Setup Sentry

### Step 1: Create Sentry Account

1. Go to https://sentry.io/signup/
2. Create a free account (50k events/month free)
3. Create a new project:
   - Platform: **React Native**
   - Alert frequency: **On every new issue**
   - Project name: `perched-app` (or your choice)

### Step 2: Get Your DSN

After creating the project:
1. Copy your DSN (looks like: `https://xxxxx@xxxxx.ingest.sentry.io/xxxxx`)
2. This is your **SENTRY_DSN**

### Step 3: Add to Local Environment

```bash
# Edit .env.local
echo "SENTRY_DSN=https://your-dsn-here" >> .env.local
echo "ENV=development" >> .env.local
```

### Step 4: Add to EAS Secrets (for production builds)

```bash
# Set Sentry DSN for EAS builds
eas secret:create --name SENTRY_DSN --value "https://your-dsn-here"
eas secret:create --name ENV --value "production"
```

### Step 5: Install Sentry CLI (optional, for source maps)

```bash
npm install --save-dev @sentry/cli

# Login to Sentry
npx sentry-cli login
```

### Step 6: Configure Sentry Project Settings

**In Sentry Dashboard:**

1. **Settings → Projects → perched-app → Client Keys (DSN):**
   - Your DSN is listed here
   - Can create multiple keys for different environments

2. **Settings → Projects → perched-app → Issue Grouping:**
   - Enable: "Group by stack trace"
   - Enable: "Group by exception type"

3. **Settings → Alerts:**
   - Create alert: "When a new issue is created"
   - Send to: Your email
   - Create alert: "When crash rate exceeds 1%"

4. **Settings → Performance:**
   - Enable Performance Monitoring
   - Sample rate: 100% for development, 10-20% for production

### Step 7: Test Sentry Integration

Add a test error button in your app (remove after testing):

```typescript
import * as Sentry from '@sentry/react-native';

// In some component:
<Button
  title="Test Sentry"
  onPress={() => {
    Sentry.captureException(new Error('Test error from Perched app!'));
  }}
/>
```

Press the button, then check Sentry dashboard for the error.

### Step 8: Configure Sentry for Production

**In Sentry Dashboard → Settings → Projects → perched-app:**

1. **Rate Limiting:**
   - Set max events per minute: 500
   - Set max events per hour: 5000

2. **Data Scrubbing:**
   - Enable: "Scrub data for known PII"
   - Add custom patterns for sensitive data

3. **Releases:**
   - Enable release tracking
   - Configure source maps upload (optional)

### Sentry Environment Variables

Add these to `.env.local`:

```bash
SENTRY_DSN=https://your-dsn@ingest.sentry.io/your-project-id
SENTRY_ORG=your-org-slug
SENTRY_PROJECT=perched-app
ENV=development
```

For production (EAS secrets):
```bash
eas secret:create --name SENTRY_DSN --value "your_dsn"
eas secret:create --name SENTRY_ORG --value "your_org"
eas secret:create --name SENTRY_PROJECT --value "perched-app"
eas secret:create --name ENV --value "production"
```

---

## 3️⃣ Verify Everything Works

### Test Checklist

#### Firebase Rules
- [ ] Create a check-in (should succeed if authenticated)
- [ ] Try to access another user's check-in (should respect visibility)
- [ ] Add a reaction (should succeed)
- [ ] Try to delete someone else's reaction (should fail)
- [ ] View achievements (should succeed)

#### Sentry
- [ ] Trigger a test error
- [ ] Check Sentry dashboard for error
- [ ] Verify user context is attached
- [ ] Verify device info is attached

#### Notifications
- [ ] Grant notification permissions
- [ ] Create a check-in
- [ ] Verify streak reminder is scheduled
- [ ] Check achievements unlock notification

---

## 🔧 Troubleshooting

### Firebase Deployment Issues

**"Deploy complete" but rules not updated:**
- Clear browser cache
- Wait 1-2 minutes for propagation
- Check Firebase Console → Firestore → Rules tab

**"Rules compilation error":**
```bash
# Validate rules syntax
firebase deploy --only firestore:rules --dry-run
```

### Sentry Not Capturing Errors

**Check these:**
1. `ENV` is set correctly (not 'development' in production)
2. DSN is correct in environment variables
3. App has network connection
4. Error was actually thrown (not just logged)

**Force test:**
```typescript
import * as Sentry from '@sentry/react-native';

Sentry.captureMessage('Test message', 'info');
```

### Notifications Not Working

**iOS:**
- Must test on physical device (not simulator)
- Must grant notification permissions
- Check Apple Developer Console for provisioning

**Android:**
- Must test on physical device (not always reliable on emulator)
- Check notification channel settings

---

## 📊 Post-Deployment Monitoring

### Firebase Console - Check Daily
1. **Authentication → Users:** Growth rate, verification rate
2. **Firestore → Usage:** Read/write counts, request errors
3. **Storage → Usage:** Storage used, bandwidth
4. **Analytics:** User engagement, retention

### Sentry - Check Daily
1. **Issues:** New errors, recurring errors
2. **Performance:** Slow transactions, API latency
3. **Releases:** Crash-free rate per version

### Google Cloud Console - Check Weekly
1. **APIs & Services → Dashboard:**
   - Maps API usage
   - Check for quota warnings
2. **Billing:** Current charges, projections

---

## 🚨 Emergency Procedures

### If Firebase Costs Spike
1. Go to Firebase Console → Usage and billing
2. Set spending limits
3. Disable expensive APIs temporarily
4. Check for runaway queries in Firestore

### If Sentry Quota Exceeded
1. Lower sample rate in Sentry settings
2. Add more aggressive rate limiting
3. Filter out noisy errors (e.g., network timeouts)

### If Google Maps Costs Spike
1. Check API restrictions are set correctly
2. Lower refresh rates for map updates
3. Cache geocoding results
4. Consider switching to static maps where possible

---

## Next Steps After Deployment

1. [ ] Deploy Firebase rules
2. [ ] Setup Sentry
3. [ ] Restrict API keys in consoles
4. [ ] Test all critical flows
5. [ ] Set up billing alerts
6. [ ] Monitor for 24 hours
7. [ ] Deploy to TestFlight/Play Store Beta
