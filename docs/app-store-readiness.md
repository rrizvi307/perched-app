# App Store Readiness Checklist

## TODO (Current)
- [ ] Harden Firestore rules + verify required composite indexes.
- [ ] Add server push pipeline (Cloud Function / provider) and wire to notification events.
- [ ] Deep link routing for shared profiles/spots + Share CTA test.
- [ ] Production error reporting (Sentry DSN + env gating).
- [ ] Performance audit: startup, feed load, check-in post, photo upload.
- [ ] Store metadata: name, description, support email, privacy/terms links.
- [ ] App assets: icon, screenshots, promo art.
- [ ] Abuse controls: rate limits for check-ins, report flow audit.

## Product & Core UX
- Onboarding flow complete and skippable
- Clear empty states and skeleton loading
- Check-in flow: photo + place + visibility
- Friends: request/accept/remove
- Usernames (@handles)
- Explore: map + trending spots + live now
- Verify check-in spam protection and rate limits
- Ensure push notification copy is polished
- Password reset flow

## Privacy & Safety
- Privacy policy screen
- Terms of service screen
- Block/report user flow
- Location fuzzing for non-friends
- In-app account deletion (Settings → Delete account)
- Support contact surface (support email)

## Growth & Retention
- Friend suggestions (campus)
- Notifications (opt-in)
- Share cards
- Invite flow (referrals)

## Technical & Reliability
- Error logging (Sentry)
- Crash-free cold start
- Offline-friendly feed/explore
- Performance on mid-range devices
- Verify Google Maps/Places key restrictions for iOS/Android/web
- Firebase rules hardening checklist

## App Store Assets
- App icon
- Screenshots (3–5)
- Promo video (optional)
- App description + keywords
- Privacy labels filled

## Store Submission Config
- iOS Info.plist permission strings (camera, photos, location, contacts)
- Android runtime permissions (camera, location, contacts)
- Bundle identifiers set (iOS `bundleIdentifier`, Android `package`)
- Build profiles configured (`eas.json`)

## TestFlight / App Store Steps (Expo + EAS)

1) **Create / configure Apple Developer + App Store Connect**
- Create an app record matching the iOS bundle identifier in `app.json`.

2) **Configure secrets (required for maps + Firebase)**
- Locally: `.env.local` (gitignored)
- EAS: project secrets (see `docs/LOCAL_KEYS.md`)

3) **Initialize EAS**
```bash
npx eas login
npx eas init
```

4) **Build**
- Internal device build (quick sharing):
```bash
npx eas build -p ios --profile preview
```
- TestFlight/App Store build:
```bash
npx eas build -p ios --profile production
```

5) **Submit**
```bash
npx eas submit -p ios --profile production
```

6) **Before you invite testers**
- Create new account on a second device
- Add friends both ways
- Post a check-in, then delete it
- Settings → Delete account (required for App Store review if you support account creation)
