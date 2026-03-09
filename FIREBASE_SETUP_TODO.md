# Firebase Setup — Outstanding Tasks

Reference this before launch. Most of these are 1-time config changes in the Firebase Console
or require a transactional email service. None require code changes unless noted.

---

## 1. Phone Authentication (REQUIRED before beta)

**Firebase Console → Authentication → Sign-in method → Phone → Enable → Save**

That's it. No Blaze plan required to enable it, but SMS sending is billed per message on Blaze.

For web reCAPTCHA (already in the code), authorized domains must include your live domain:
- **Authentication → Settings → Authorized domains** → confirm `perched.app` is listed (already added)

For native iOS/Android builds, add your SHA-1 certificate fingerprint:
- **Project Settings → Your apps → Android app → Add fingerprint**

---

## 2. Project Display Name (QUICK — do this now)

The project ID `spot-app-ce2d8` is permanent and cannot be renamed.
But the display name shown in emails and the console can be changed.

**Firebase Console → gear icon → Project Settings → General → Project name**
Change from "spot-app-ce2d8" (or whatever it shows) → **"Perched"**

This fixes the `%APP_NAME%` variable in all email templates automatically.

---

## 3. Email Verification — Action URL (QUICK)

The link inside verification emails currently points to:
  `https://spot-app-ce2d8.firebaseapp.com/__/auth/action?...`

Change it to use your domain:
**Authentication → Templates → Email address verification → customize action URL**
Set to: `https://perched.app/__/auth/action`

Requires Firebase Hosting to be connected to `perched.app` (see section 6).

---

## 4. Email Sender — Custom Domain (MEDIUM — ~1 hr, before wider launch)

Currently sends from: `Perched@spot-app-ce2d8.firebaseapp.com`
Goal: send from `noreply@perched.app`

Firebase cannot natively send from a custom domain. Solution: use **Resend** (resend.com).

### Steps:
1. Sign up at https://resend.com (free tier: 3,000 emails/month)
2. Add `perched.app` domain → add the 3 DNS records they give you (takes ~10 min to verify)
3. Get your Resend API key → store in Firebase Secret Manager as `RESEND_API_KEY`
4. Add the Resend package to Cloud Functions: `npm install resend` (in `functions/`)
5. In `functions/src/index.ts`, add a Cloud Function triggered on new user creation:
   - Use `functions.auth.user().onCreate(user => ...)`
   - Call Resend API to send a branded verification email from `noreply@perched.app`
   - Disable Firebase's built-in email verification in the app code (or just let both send
     and phase out the Firebase one once Resend is confirmed working)

### Email template to use:
- From: `Perched <noreply@perched.app>`
- Reply-to: `perchedappteam@gmail.com`
- Subject: `Verify your Perched account`
- Body: Clean HTML with the Perched logo, a big CTA button, and the verification link

> NOTE: The verification link itself still needs to come from Firebase Auth
> (`user.generateEmailVerificationLink()` in Admin SDK). Resend just handles delivery.

---

## 5. Password Reset Email (same fix as above)

Once Resend is set up, also migrate the password reset email.
Currently sends from the same ugly Firebase domain.

**Authentication → Templates → Password reset** — update subject/body in the meantime.

---

## 6. Firebase Hosting — Connect perched.app (if not done)

For the custom action URL (section 3) and general web hosting:
**Firebase Console → Hosting → Add custom domain → perched.app**
Add the DNS records they provide to your domain registrar.

---

## 7. Firestore Security Rules — Update for new fields

When deploying the app with `wifiSpeed` and `laptopFriendly` checkin fields,
update Firestore rules to allow reading/writing those fields.
(Already noted in MEMORY.md — do this with the Cloud Functions deploy.)

---

## 8. Firebase Blaze Plan — Already active

The Blaze (pay-as-you-go) plan is already detected on the project.
SMS verification messages are billed at ~$0.01/message in the US.
Set a budget alert in **Google Cloud Console → Billing → Budgets & alerts** if not already done.

---

## Summary — Priority Order

| # | Task | Time | Blocker for beta? |
|---|------|------|-------------------|
| 1 | Enable Phone Auth in console | 2 min | YES |
| 2 | Change project display name | 1 min | Cosmetic |
| 3 | Fix action URL in email template | 5 min | Cosmetic |
| 4 | Resend custom domain email | ~1 hr | Before wider launch |
| 5 | Password reset email via Resend | ~15 min | Before wider launch |
| 6 | Connect perched.app to Hosting | ~20 min | Needed for action URL |
| 7 | Firestore rules for new fields | ~10 min | With next deploy |
| 8 | Set billing budget alert | 5 min | Good practice |
