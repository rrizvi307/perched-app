# App Store

This is the public-safe App Store reference for metadata, reviewer prep, and TestFlight smoke checks.

## Metadata Draft

### App Name

`Perched: Find Great Spots`

### Subtitle

`Real-time WiFi, Noise & Busyness`

### Keywords

`coffee shop finder,study spots,wifi finder,quiet places,remote work,workspace,cafe,library,coworking`

### Promotional Text

`Never arrive to a bad spot again. See real-time WiFi quality, noise level, and busyness from verified users before you go. Download free today!`

### Description Draft

Perched helps people find work-friendly cafes and third places with live signals from real check-ins.

Core value props:

- real-time WiFi, noise, busyness, and outlet signals
- nearby spot discovery and filters
- social check-ins and friend activity
- streaks, badges, and progress loops

Support links:

- Privacy: `perched.app/privacy`
- Terms: `perched.app/terms`
- Support: `support@perched.app`

## Reviewer Notes Template

Keep any live reviewer credentials outside git. The repo should only store the template and test steps.

Suggested coverage:

1. Basic check-in flow
2. Feed and profile interactions
3. Explore and map flows
4. Account deletion path
5. Optional premium or gated features with clear reviewer notes

Features that may require explicit reviewer explanation:

- admin-only or partner-only surfaces
- empty-state product areas that depend on seeded data
- any feature hidden behind campus density or rollout flags

## Human Tester Checklist

Date: 2026-03-14

Do not submit until every blocker item below is green on a release build.

### Blockers

1. Password reset email opens a working reset flow end to end.
2. Verification email opens a working verification flow end to end.
3. Privacy, Terms, and Support links are live and not placeholder pages.
4. Account deletion is reachable in-app and completes without support intervention.
5. The app is reviewable without internal knowledge, broken flags, or dead-end screens.

### Device Matrix

1. Test on one clean iPhone running the latest public iOS release.
2. Test on one clean iPad running the latest public iPadOS release.
3. Test a fresh install and one reinstall on the iPhone build under review.
4. Test while signed out, signed in but unverified, and signed in + verified.

### Auth And Account

1. Sign up with a brand new email.
2. Confirm the app routes to the verification screen and does not unlock the main experience before verification.
3. Open the verification email and confirm the link resolves correctly.
4. Return to the app and confirm `I verified - continue` succeeds.
5. Sign out and sign back in with the verified account.
6. Use `Forgot password?` and confirm the reset email arrives from `Perched <noreply@mail.perched.app>`.
7. Complete password reset from the email link and sign in with the new password.
8. Trigger a resend verification email and confirm it works again without Firebase-branded fallback mail.
9. Open Settings and confirm Account, Upgrade, and Delete Account screens all load.
10. Delete the account from the in-app deletion flow and confirm the user is returned to sign in.

### Core Product

1. Create a check-in with camera capture.
2. Create a check-in with photo library selection if that path is exposed.
3. Confirm place detection or manual spot selection works.
4. Confirm the new check-in appears in feed and profile.
5. Open a spot detail page from feed or explore.
6. Confirm spot metrics, images, and primary navigation elements render without obvious placeholder content.
7. Confirm a user can delete their own check-in if that path is available.

### Permissions

1. Deny camera access and confirm the app gives a clear recovery path.
2. Deny photo-library access and confirm the app does not dead-end.
3. Deny location access and confirm discovery still works with graceful fallback where expected.
4. If contacts access is requested, deny it and confirm the rest of the app still works.
5. Re-enable permissions from system settings and confirm the app recovers.

### Explore, Feed, And Navigation

1. Browse feed, explore, profile, settings, support, privacy, and terms screens.
2. Confirm no blank screens, dev copy, raw IDs, or debug banners appear.
3. Use map or directions flows on iPhone and verify Apple Maps opens correctly.
4. Confirm external links open to the correct destinations.
5. Confirm back navigation is reliable from every major branch.

### Social, Safety, And Profile

1. Edit profile basics such as handle if available.
2. Open friends/find friends flows and confirm they load without crashing even with no matches.
3. Test block/report paths if seeded data makes them reachable.
4. Confirm public profile surfaces do not show obviously broken counts or empty placeholders.

### Premium And Monetization

1. If premium purchases are enabled in the submission build, test the entire purchase flow on a release build and ensure App Review notes explain where to find it.
2. If premium purchases are disabled in the submission build, confirm the UI clearly says so and remove any metadata or screenshots that imply purchases are available now.
3. Confirm there are no paywall dead ends that trap the reviewer.

### Metadata And Submission Assets

1. App name, subtitle, keywords, and description must match the current shipping feature set.
2. Screenshots must come from the submitted build and show real app flows, not login-only or placeholder states.
3. iPad screenshots must be valid native iPad screenshots.
4. Privacy Policy URL, Terms URL, and Support URL/contact must all be current and functional.
5. Review Notes must describe exactly how to access the app’s main flows, any seeded/demo data assumptions, and any temporarily unavailable features.

### Reviewer Notes Checklist

1. Provide a reviewer test account or a deterministic path to create one.
2. State that email verification and password reset are required parts of the auth flow and must work from the live email links.
3. Explain any premium gating, partner/admin-only surfaces, or features hidden behind density/rollout conditions.
4. Mention any permission-dependent flows and what fallback behavior the reviewer should expect if they deny access.

### Submit Or Hold

Submit today only if all of the following are true:

1. Reset email works from the live production email link.
2. Verification email works from the live production email link.
3. Release-build iPhone smoke test is green.
4. Release-build iPad smoke test is green.
5. Metadata, screenshots, and review notes are updated to match the current build exactly.

## Asset Checklist

- App icon
- iPhone screenshots
- iPad screenshots
- Promo art or demo video if needed
- Finalized privacy and terms links

Use [operations.md](./operations.md) for the rejection-specific resubmission checklist and reviewer reply template.
