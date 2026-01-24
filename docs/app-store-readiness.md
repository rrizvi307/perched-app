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
- Data deletion flow (support flow or settings entry)
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
