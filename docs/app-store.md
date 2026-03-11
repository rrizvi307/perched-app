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
- Support: `perchedappteam@gmail.com`

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

## TestFlight Smoke Checklist

1. Install the release candidate on at least one clean device.
2. Verify onboarding, sign-in, and password reset.
3. Create, view, and delete a check-in.
4. Verify photo upload and spot selection flows.
5. Verify friends, block/report, and profile navigation paths.
6. Verify maps launch correctly on iOS.
7. Verify account deletion is reachable and works.

## Asset Checklist

- App icon
- iPhone screenshots
- iPad screenshots
- Promo art or demo video if needed
- Finalized privacy and terms links

Use [operations.md](./operations.md) for the rejection-specific resubmission checklist and reviewer reply template.
