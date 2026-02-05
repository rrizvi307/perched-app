# Security Guide - Protecting Your API Keys

## ✅ Current Status: SECURE

Your keys are **protected** and have NOT been exposed:
- ✅ `.env.local` is in `.gitignore`
- ✅ `.env.example` has no real keys (empty placeholders)
- ✅ Git history is clean (no keys committed)
- ✅ Repo is public-safe

---

## 🔒 How Your Keys Are Protected

### 1. `.gitignore` Protection

Line 38 of `.gitignore`:
```
.env*.local
```

This ensures `.env.local` is **never** committed to git.

### 2. File Verification

Check what's tracked:
```bash
git ls-files | grep env
# Should only show: .env.example, .gitignore, .gitattributes
```

---

## 🚨 If Keys Were Exposed (How to Fix)

If you accidentally committed keys, here's how to remove them:

### Option 1: Recent Commit (Last 1-2 commits)

```bash
# Remove file from last commit
git rm --cached .env.local
git commit --amend --no-edit
git push --force
```

### Option 2: Deep in History (Use BFG)

```bash
# Install BFG Repo Cleaner
brew install bfg

# Clone fresh copy
git clone --mirror https://github.com/yourusername/perched-app.git

# Remove all .env.local files from history
bfg --delete-files .env.local perched-app.git

# Clean up
cd perched-app.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push
git push --force
```

### Option 3: Nuclear Option (New Repo)

If keys were exposed for a long time:
1. Rotate ALL keys (see below)
2. Create new GitHub repo
3. Push clean code
4. Archive old repo

---

## 🔄 Key Rotation (If Exposed)

### Google Maps API Key

**Rotate immediately if exposed:**

1. **Restrict Current Key** (until rotated):
   - Go to: [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   - Click your API key
   - Application restrictions:
     - iOS apps: Add bundle ID `com.yourapp.perched`
     - Android apps: Add package name + SHA-1
     - Websites: Add `https://perched.app`
   - API restrictions: Enable ONLY:
     - Maps SDK for iOS
     - Maps SDK for Android
     - Places API
     - Maps Static API
   - Save

2. **Create New Key**:
   - Click "Create Credentials" → "API Key"
   - Add same restrictions as above
   - Copy new key to `.env.local`
   - Update EAS secrets: `eas secret:create --name GOOGLE_MAPS_API_KEY --value "NEW_KEY"`

3. **Delete Old Key** (after verifying new one works):
   - Go back to credentials
   - Delete old compromised key

**Cost if exposed:**
- Free tier: 28,000 map loads/month
- After that: $7 per 1,000 loads
- With restrictions: Low risk
- Without restrictions: Could cost $$$

### Firebase Keys

**Good news:** Firebase keys are **designed to be public**!

Firebase security is handled by:
- ✅ Firestore rules (you already deployed these)
- ✅ Storage rules (you already deployed these)
- ✅ App Check (optional, recommended)

**But still rotate if concerned:**

1. **Go to Firebase Console** → Project Settings
2. **Remove old web app**:
   - Scroll to "Your apps"
   - Click ⚙️ on your web app → Delete app
3. **Add new web app**:
   - Click "Add app" → Web
   - Register new app
   - Copy new config
   - Update `.env.local`
   - Update EAS secrets

4. **Optional: Enable App Check** (prevents abuse):
   ```bash
   npm install @firebase/app-check
   ```

   Then in your app:
   ```typescript
   import { initializeAppCheck, ReCaptchaV3Provider } from '@firebase/app-check';

   initializeAppCheck(firebaseApp, {
     provider: new ReCaptchaV3Provider('YOUR_RECAPTCHA_SITE_KEY'),
     isTokenAutoRefreshEnabled: true,
   });
   ```

---

## 🛡️ Additional Security Measures

### 1. Add Pre-commit Hook

Create `.husky/pre-commit`:

```bash
#!/bin/sh
# Prevent committing sensitive files

if git diff --cached --name-only | grep -E "\.env\.local|\.pem|\.key"; then
  echo "❌ ERROR: Attempting to commit sensitive files!"
  echo "Files:"
  git diff --cached --name-only | grep -E "\.env\.local|\.pem|\.key"
  echo ""
  echo "Run: git reset HEAD <file>"
  exit 1
fi

# Check for exposed secrets in code
if git diff --cached | grep -iE "AIzaSy[A-Za-z0-9_-]{33}|sk_live_[A-Za-z0-9]{24}"; then
  echo "⚠️  WARNING: Possible API key detected in code!"
  echo "Make sure it's from .env, not hardcoded."
  exit 1
fi
```

Install husky:
```bash
npm install --save-dev husky
npx husky install
npx husky add .husky/pre-commit
```

### 2. GitHub Secret Scanning

GitHub automatically scans for secrets in public repos:
- You'll get an email if keys are detected
- Enable in: Settings → Security → Secret scanning

### 3. Use Environment-Specific Keys

**Development:**
- Use test Firebase project
- Use restricted Google Maps key

**Production:**
- Use production Firebase project
- Use different restricted Google Maps key
- Enable App Check
- Enable reCAPTCHA

Split your `.env`:
- `.env.development` - Development keys
- `.env.production` - Production keys (never commit!)
- `.env.example` - Empty template (safe to commit)

---

## ✅ Security Checklist

Before every git push:

- [ ] `.env.local` is in `.gitignore`
- [ ] No keys in code (always use `process.env` or `Constants.expoConfig.extra`)
- [ ] `.env.example` has no real values
- [ ] Google Maps key has restrictions
- [ ] Firebase rules are deployed
- [ ] Secrets are set in EAS (for builds)
- [ ] Run: `git status` (should NOT show `.env.local`)
- [ ] Run: `git diff` (should NOT show any keys)

---

## 🎯 Best Practices

### DO ✅
- Store keys in `.env.local` (gitignored)
- Use EAS secrets for builds
- Restrict API keys to specific apps/domains
- Deploy Firebase security rules
- Enable App Check in production
- Use environment variables
- Rotate keys if exposed
- Monitor usage in Google Cloud Console

### DON'T ❌
- Never hardcode keys in source code
- Never commit `.env.local`
- Never share keys in Slack/Discord
- Never use production keys in development
- Never skip API key restrictions
- Never ignore security warnings from GitHub

---

## 📊 Monitoring

### Google Maps API

Check usage:
- [Google Cloud Console](https://console.cloud.google.com/apis/dashboard)
- Set billing alerts
- Monitor unusual traffic

### Firebase

Check usage:
- [Firebase Console](https://console.firebase.google.com) → Usage
- Set up budget alerts
- Monitor authentication attempts

### GitHub

Enable notifications:
- Settings → Notifications → Security alerts
- Get emails if secrets detected

---

## 🚨 Emergency Response

If you discover keys were exposed:

**Immediate (< 5 minutes):**
1. Restrict the keys (see above)
2. Monitor usage dashboards
3. Check for unauthorized access

**Short-term (< 1 hour):**
1. Rotate all exposed keys
2. Remove from git history (BFG)
3. Force push cleaned history

**Long-term (< 24 hours):**
1. Review all Firebase/Google Cloud logs
2. Set up App Check
3. Enable 2FA on Google/Firebase accounts
4. Consider new Firebase project if heavily abused

---

## 📞 Support

**If keys were abused:**
- Google Cloud Support: https://cloud.google.com/support
- Firebase Support: https://firebase.google.com/support

**File abuse report:**
- Google: https://support.google.com/cloud/contact/cloud_platform_billing
- Dispute charges if fraud detected

---

## Summary

Your app is **currently secure** ✅:
- Keys are properly gitignored
- No exposure in git history
- Ready to push to GitHub safely

Just remember:
1. **Never** remove `.env*.local` from `.gitignore`
2. **Always** use environment variables
3. **Restrict** API keys
4. **Deploy** Firebase rules

You're good to commit and push! 🚀
