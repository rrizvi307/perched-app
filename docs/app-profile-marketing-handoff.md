# Perched App Profile

This document is a marketing and go-to-market handoff for Perched, written for a separate AI or strategist with no access to the codebase. It is based on the current repository state, its route tree, configs, Firebase rules, services, assets, and internal docs as of March 17, 2026.

Important status note:

- The repo's release tracker dated March 11, 2026 said manual App Store submission steps still remained.
- The latest operating assumption for this handoff is newer than that repo note: the current build has now been submitted to App Store Connect and is awaiting review.

Status labels used in the feature inventory:

- Shipping consumer: visible or clearly intended for the launch consumer app.
- Gated or beta: present in the product, but controlled by config, rollout flags, account state, density, or environment.
- Internal or admin: real product surface, but not part of the normal consumer experience.
- In progress: implemented enough to exist in-app, but the screen itself says it is still being finalized.

## 1. App Overview

Perched is a mobile app for finding better places to work, study, and spend time in coffee shops and other "third places" by combining live user check-ins, crowd-sourced utility signals, social activity, and place intelligence. In plain language, it helps users avoid arriving at a bad spot by showing what a place is like right now, not just what a generic review said months ago.

Core value proposition:

- Perched answers practical questions that generic map apps usually do not answer well in real time: Is the Wi-Fi usable? Is it too loud? Is it packed? Are there outlets? Is it actually good for laptop work or group study?
- It layers social proof on top of that utility: users can see where friends or classmates are checking in, who is "here now," and what spots are trending in their network or campus community.
- It turns location discovery into a repeatable habit loop instead of a one-off search by using streaks, achievements, saved spots, profile stats, referrals, and shareable recap cards.

What problem it solves:

- Generic discovery tools like Google Maps and Yelp are strong at static listings, ratings, and addresses, but weak at live work/study conditions.
- Students and remote workers often waste time traveling to a place that is too crowded, too loud, has no outlets, poor Wi-Fi, or does not fit the use case they actually need.
- Social products may show where friends are, but they usually do not turn that into structured "is this place good for deep work / group study / late-night work / coffee quality" intelligence.

Target user profile:

- College students looking for study spots, group study locations, late-night options, and social coffee shops.
- Remote workers, freelancers, founders, and creators who need productive cafes or third places with reliable setup conditions.
- Socially driven users who want to see where friends are checking in, find places through their network, and share their own location + vibe back into the community.
- Early launch assumptions point to a Houston/Texas-first audience, with a codebase that is already structured for broader U.S. campus expansion.

What Perched does best:

- Real-time check-in-based place intelligence instead of generic static reviews alone.
- Work-and-study-specific signals such as Wi-Fi quality, noise, busyness, outlet availability, laptop friendliness, and parking.
- Hybrid utility + social discovery: map/search/filter for places, then social feed/profile/friends/campus loops to keep people returning.
- Campus-native network effects through leaderboards, challenges, suggestions, and ambassador concepts.

## 2. Feature Inventory

### Product Shell and Navigation

#### Root navigation and entry structure

Status: Shipping consumer shell.

What it does:

- The app uses an Expo Router stack with a root redirect from `/` to `/signin`.
- The registered root stack includes auth, onboarding, check-in creation, spot detail, story card, settings, verify, upgrade/account, delete account, premium upgrade, achievements, admin screens, and modal presentation.
- The main signed-in experience lives inside four tabs: Feed, Explore, Friends, and Profile.

Why it matters:

- The route structure makes it clear Perched is not a single-purpose map app. It is a full consumer product with account, content creation, discovery, social graph, gamification, support, and premium layers.
- The tab shell creates a consistent "home / discovery / network / identity" habit loop.

How it differs from competitors:

- Many local discovery apps stop at search + map. Perched adds a structured social product and a creator-style check-in workflow on top.
- The app-level navigation keeps check-in creation one tap away with a global plus CTA in the tab headers.

Notable navigation mechanics:

- Header plus button routes to `/checkin`.
- Profile tab header also exposes Settings directly.
- Universal links and app links support `https://perched.app` plus the custom URL scheme `perched://`.
- Deep links are implemented for profiles, check-ins, spots, invites, explore, feed, settings, support, and friend-request flows.

### Authentication, Account, and Entry Screens

#### Sign In

Route: `/signin`  
Status: Shipping consumer.

What it does:

- Standard email/password sign-in.
- Routes verified users into the main tab experience.
- Routes unverified users to the mandatory verification gate.
- Exposes reset-password, signup, Terms, and Privacy links.
- Shows a demo-mode shortcut if Firebase auth is not configured in the current environment.

Why it matters:

- This is the current initial route for the app.
- It establishes that Perched is an account-based network, not an anonymous browse-first tool.

How it differs from competitors:

- The value proposition is explained immediately in work/study language rather than generic "share your location" copy.
- The product is strict about verification before unlocking the main experience.

#### Sign Up

Route: `/signup`  
Status: Shipping consumer.

What it does:

- Collects email, password, password confirmation, handle, name, optional phone number, city, optional campus, and onboarding-derived taste preferences.
- Checks handle availability.
- Accepts referral codes carried through deep links.
- Stores coffee intents and ambiance preference.
- Routes to verification if required, otherwise into the main app.

Why it matters:

- Signup captures enough structured identity to power social search, campus relevance, and personalized ranking from day one.
- The handle requirement shows Perched expects social discovery and profile sharing, not just passive map use.

How it differs from competitors:

- Signup is not only about identity; it also seeds recommendation quality through city, campus, coffee intents, and ambiance preference.
- Referral signup tracking is built into the account creation flow rather than added later as a bolt-on.

#### Onboarding

Route: `/onboarding`  
Status: Shipping consumer, but appears to be a dedicated pre-signup surface rather than the unconditional initial route.

What it does:

- Walks users through three steps: Welcome, Permissions, and Personalize.
- Explains the product in plain language: discover nearby spots, check in with a photo + quick metrics, help the community.
- Requests location access and reverse-geocodes a default city.
- Captures up to three discovery intents and an optional ambiance preference.
- Saves an onboarding profile and hands off to signup.

Why it matters:

- This is Perched's fastest path to explaining why the app exists before asking for a full account.
- It improves downstream personalization and makes the check-in/value loop legible before the user posts anything.

How it differs from competitors:

- The onboarding is not just permissions theater; it explicitly trains the user on the community contribution model and configures ranking preferences.

#### Verify Email

Route: `/verify`  
Status: Shipping consumer.

What it does:

- Forces an email verification checkpoint before the main app unlocks.
- Supports resend verification.
- Rechecks verification when the app returns to foreground.
- Offers a clean way to sign out and restart signup/sign-in if the user needs to change email.

Why it matters:

- The app's posting and trust model depends on verified accounts.
- This reduces fake or low-trust check-ins and improves moderation, social trust, and App Review clarity.

How it differs from competitors:

- Perched treats verification as a core trust layer, not an optional afterthought.

#### Reset Password

Route: `/reset`  
Status: Shipping consumer.

What it does:

- Sends password reset emails.
- Uses account-safe messaging that does not expose whether the email exists.

Why it matters:

- Password reset is a required App Store quality and trust feature for a real account-based product.

How it differs from competitors:

- Nothing category-defining, but it supports Perched's stricter, real-account identity model.

#### Account / Upgrade

Route: `/upgrade`  
Status: Shipping consumer.

What it does:

- Lets a user create an email/password account if they currently do not have one.
- Lets an email user sign in with email or change password if already registered.
- Includes a visible password strength meter.

Why it matters:

- This supports migration from lightweight/local or incomplete account states into a durable identity.
- It makes the account system more flexible for growth experiments or demo-to-real-user transitions.

How it differs from competitors:

- It acknowledges that not every early user enters the product through the same trust state and gives the product room for staged account creation.

#### Settings

Route: `/settings`  
Status: Shipping consumer.

What it does:

- Shows account status.
- Cycles appearance between System, Light, and Dark.
- Toggles notifications and location.
- Links to Privacy Policy, Terms of Service, and Support.
- Exposes Delete Account and Sign Out.

Why it matters:

- This is the user's control center for privacy, permissions, and lifecycle management.
- It is also part of launch readiness because App Review expects working support, privacy, and deletion paths.

How it differs from competitors:

- The settings surface is clean, practical, and tied closely to real permission-dependent product behavior like push and location-based discovery.

#### Support

Route: `/support`  
Status: Shipping consumer.

What it does:

- Exposes direct support email.
- Includes mailto shortcuts for general support and account deletion requests.
- Links to Instagram and TikTok.

Why it matters:

- Gives the user a visible support path and connects owned media channels to the product.

How it differs from competitors:

- Support is embedded as a lightweight but real in-app surface rather than hidden in external web flows.

#### Privacy Policy and Terms of Service

Routes: `/privacy`, `/terms`  
Status: Shipping consumer.

What they do:

- Render launch-safe privacy and terms content inside the app.
- Privacy policy covers location, profile, check-ins, usage telemetry, subscriptions, and anonymized B2B aggregation.
- Terms define user conduct and premium pricing.

Why they matter:

- They support App Review, user trust, and compliance.

How they differ from competitors:

- The documents are tightly aligned with the actual product surface: check-ins, social graph, subscriptions, and business data.

#### Delete Account

Route: `/delete-account`  
Status: Shipping consumer.

What it does:

- Allows permanent in-app account deletion.
- Requires stronger confirmation for email accounts, including typed confirmation and password validation.
- Explains that public profile and uploaded content will be removed.

Why it matters:

- This is a major App Store and privacy requirement.
- It reduces friction compared with "email support to delete."

How it differs from competitors:

- Full in-app deletion is often missing in early social apps; Perched implements it directly.

### Main Tab Screens

#### Feed

Route: `/(tabs)/feed`  
Status: Shipping consumer.

What it does:

- Shows the main live check-in feed with local + remote merge and optimistic updates.
- Supports three feed scopes: Everyone, Campus, and Friends.
- Highlights "Live hotspots in your network."
- Shows check-in cards with photo, caption, tags, visibility context, reactions, and place navigation.
- Supports sharing, reporting, blocking/unblocking, and friendship actions from feed items.
- Lets users mark someone as a close friend.
- Includes empty states for no friends and no check-ins.

Why it matters:

- This is the app's social heartbeat and the fastest way to prove freshness.
- It turns check-ins into recurring social proof, not just private note-taking.

How it differs from competitors:

- Compared with generic social feeds, Perched posts are structured around place utility and live location context.
- Compared with map apps, the feed gives a network-native reason to open the app even when the user is not actively searching.

Social, gamification, and discovery mechanics:

- Friend requests can resolve directly from feed context and deep links.
- Close-friend status changes the intimacy model around exact location sharing.
- The campus scope ties the feed into leaderboard and campus growth loops.
- Reactions create lightweight engagement without demanding full reviews.

#### Explore

Route: `/(tabs)/explore`  
Status: Shipping consumer.

What it does:

- Combines list and map discovery around nearby spots.
- Supports free-text search and intent-aware ranking.
- Supports discovery intent chips such as Hangout, Date, Coffee, Pastries, Aesthetic, Quick, Work, Quiet, Group, and Late.
- Supports a filter sheet with Open now, noise level, not crowded, high rated, good for studying, good for meetings, and price-level filters.
- Uses place intelligence, live check-ins, and normalized spot data to rank and tag places.
- Shows "here now" and check-in counts where available.
- Opens selected spots into a richer intelligence summary and then into full spot detail or check-in creation.

Why it matters:

- This is the primary "solve my immediate need" surface.
- It takes Perched beyond social posting into utility-grade discovery.

How it differs from competitors:

- Unlike generic map search, Explore is optimized around work/study intent and real-time signals instead of broad restaurant discovery.
- Unlike static coffee guides, it combines live user activity, inferred intelligence, and provider data.

Social, gamification, and discovery mechanics:

- Filters and intent chips make the app behave more like a smart recommendation engine than a raw map.
- "Here now" and live crowd signals create urgency and relevance.
- Check-in CTAs are embedded directly in the discovery flow to keep data generation and consumption tightly linked.

#### Friends

Route: `/(tabs)/friends`  
Status: Shipping consumer.

What it does:

- Shows existing friends, incoming friend requests, outgoing requests, search results, contact matches, and invite opportunities.
- Supports searching by name, handle, or email.
- Syncs device contacts through Expo Contacts and attempts to match by email or phone.
- Surfaces campus-based user suggestions.
- Supports accept, decline, pending, and already-friends states.
- Supports invite flows when contacts are not yet on Perched.

Why it matters:

- This is the primary network-building engine for the app.
- It is essential to feed quality because friends-only and campus-social flows get stronger as the graph grows.

How it differs from competitors:

- Perched uses real location and campus context to make the network graph more relevant than a generic social directory.
- Contact sync is positioned as discovery for useful local companionship, not just generic follower acquisition.

Social, gamification, and discovery mechanics:

- Campus suggestions help seed local density.
- Contact matching and invite flows support organic acquisition.
- Relationship states are reflected throughout feed and profile surfaces.

#### Profile

Route: `/(tabs)/profile`  
Status: Shipping consumer.

What it does:

- Serves as the user's identity, stats, and control hub.
- Supports editing name, handle, city, campus, and phone.
- Supports city and campus search with geo-biased suggestions and current-city detection.
- Shows profile completion and verification prompts.
- Shows stats such as streak days, total check-ins, unique spots, and top spots.
- Links to Achievements, Subscription, saved spots, Story Card creation, Explore, Spot detail, My Posts, and Upgrade Account.
- Includes contacts enablement for finding friends.

Why it matters:

- This is where user identity, progress, and retention mechanics come together.
- It gives users a visible reason to invest in the app beyond one-off search.

How it differs from competitors:

- The profile is not just a bio page. It is part social resume, part productivity memory, part gamification dashboard.

Social, gamification, and discovery mechanics:

- Streak celebration and achievements are integrated here.
- Saved spots and top spots make the user's taste legible.
- Story card generation turns profile stats into shareable growth content.

### Secondary Social, Creation, and Detail Screens

#### Check-In Composer

Route: `/checkin`  
Status: Shipping consumer.

What it does:

- Provides the core post-creation flow in three steps: 1 Photo, 2 Spot, 3 Share.
- Requires verified account state.
- Supports camera capture and library selection.
- Supports place detection from nearby location and photo GPS, plus manual spot lookup.
- Collects caption, vibe tags, optional visit intents, ambiance, and photo tags.
- Collects optional "Spot Intel" metrics: noise, busyness, drink price, drink quality, Wi-Fi speed, outlet availability, laptop friendliness, parking availability, and parking type.
- Supports visibility modes: Public, Friends, Close.
- Supports editing an existing check-in.
- Queues pending remote posts and syncs in the background.

Why it matters:

- This is the single most important content-generation workflow in the app.
- It is the mechanism that creates the live data Perched depends on.

How it differs from competitors:

- It is much more structured than a normal social post and much more human than a static review.
- The photo serves as lightweight proof, while the metrics make the post operationally useful.

Social, gamification, and discovery mechanics:

- Anti-spam rules require either a short caption or at least one tag.
- Posting cadence is rate-limited: 10 minutes between public posts and 5 minutes for more private posts.
- Successful posting triggers stats updates, milestone checks, streak reminders, possible app-rating prompts, and celebration overlays.

User-facing check-in vocabulary:

- Vibe tags: Quiet, Study, Social, Good Coffee, Cozy, Spacious, Late-night, Outdoor Seating.
- Photo tags: Cozy interior, Aesthetic latte, Outdoor patio, Group seating, Cool decor, Food shot.
- Discovery intents: Hangout with friends, Date night, Great coffee, Pastry or snack, Aesthetic photos, Quick pickup, Deep work, Quiet reading, Group study, Late-night open.
- Ambiance options: Cozy, Modern, Rustic, Bright, Intimate, Energetic.

#### Check-In Detail

Route: `/checkin-detail`  
Status: Shipping consumer.

What it does:

- Shows a full post with image, time, visibility, caption, tags, location context, reactions, share, and link-through to the spot.
- Lets the owner delete the post.

Why it matters:

- It turns the feed card into a more complete content view.
- It also acts as the canonical destination for deep links into a specific post.

How it differs from competitors:

- The detail view stays tightly linked to place and utility context rather than treating the post as generic media.

#### Spot Detail

Route: `/spot`  
Status: Shipping consumer.

What it does:

- Aggregates Perched's place intelligence into a single spot page.
- Shows work score, crowd level, best time, highlights, use cases, crowd forecast, confidence, rating/review count, price level, hours, and open-now state.
- Displays community activity and check-ins tied to the place.
- Supports place-tag voting on attributes such as Quiet, Wi-Fi, Outlets, Seating, Bright, Spacious, and Late-night, with an A/B-like core5/full7 variant in code.
- Includes CTAs to Tap in here, open in maps, save spot, and share spot.
- Shows people or friends here now and allows add-friend actions from the spot context.

Why it matters:

- This is where Perched's data model becomes legible to a new user.
- It turns raw check-ins into a recommendation product.

How it differs from competitors:

- Generic place pages usually prioritize business info and old reviews. Perched prioritizes "Can I actually work here right now?"
- The crowd forecast and confidence layer push the experience toward predictive utility, not just descriptive listing data.

Social, gamification, and discovery mechanics:

- Tag voting requires user credibility through actual check-in history.
- Spot pages connect discovery to the next check-in, strengthening the product's data flywheel.

#### Public Profile View

Route: `/profile-view`  
Status: Shipping consumer.

What it does:

- Shows another user's profile, stats, badges, top spots, member-since date, last check-in, and recent posts.
- Supports add friend, pending, incoming, or already-friends relationship states.
- Routes into check-in detail and spot detail.

Why it matters:

- This makes the social graph explorable and turns people into discovery surfaces.

How it differs from competitors:

- Profiles are directly tied to physical-world taste and routines, not just generic posts.

#### My Posts

Route: `/my-posts`  
Status: Shipping consumer.

What it does:

- Shows the user's full check-in history in newest-first order.
- Supports focus-linking to a specific post.
- Explicitly states that posts do not expire.

Why it matters:

- Reinforces that Perched is building long-term personal and community memory, even if "live now" signals are emphasized elsewhere.

How it differs from competitors:

- It combines social history with structured place metadata rather than generic timeline posts.

#### Story Card

Route: `/story-card`  
Status: Shipping consumer.

What it does:

- Generates a branded recap/share card from a user's stats.
- Renders SVG-based story art, exports to JPEG, saves to Photos, and shares externally.
- Includes a web-specific implementation for browser environments.

Why it matters:

- This is a built-in social distribution mechanic for organic growth.
- It lets users show their Perched identity off-platform.

How it differs from competitors:

- Many utility apps rely on screenshots; Perched generates intentional, branded, social-native content.

#### Achievements

Route: `/achievements`  
Status: Shipping consumer.

What it does:

- Shows unlocked and locked achievements, progress counts, and top-line stats.
- Categories include Explorer, Social, Streaks, Time-Based, Regular, Discovery, plus Special achievements.
- Uses empty states to push users back toward posting.

Why it matters:

- Achievements create repeat behavior and identity reinforcement.

How it differs from competitors:

- Instead of generic badges, Perched ties achievement logic to real-world discovery, frequency, and social participation.

### Campus-Focused Screens

#### Campus Sync

Route: `/campus-sync`  
Status: Shipping consumer, optional but strategic.

What it does:

- Lets the user associate with a university.
- Offers email-based verification or "skip for now."
- Explains campus benefits such as discovering study spots, classmate activity, and campus-exclusive groups.

Why it matters:

- This is the formal bridge into Perched's campus-native growth loop.

How it differs from competitors:

- It turns college affiliation into a place-discovery advantage rather than just a profile badge.

#### Campus Discovery

Route: `/campus-discovery`  
Status: Shipping consumer.

What it does:

- Shows campus card details, top campus spots, and activity stats.
- Links out to leaderboard, explore, feed, and check-in flows.

Why it matters:

- Makes local density visible and gives students a community-specific discovery surface.

How it differs from competitors:

- Generic local apps do not create a campus-specific "best places around my school" product layer with live community context.

#### Campus Leaderboard

Route: `/campus-leaderboard`  
Status: Shipping consumer.

What it does:

- Ranks users by check-in activity.
- Supports period filters such as week, month, and all time.
- Shows user rank, active campus challenges, top contributors, and ambassador badge state.

Why it matters:

- This is the strongest explicit gamification surface in the campus product loop.

How it differs from competitors:

- It makes local participation measurable and socially legible in a campus-specific context.

#### Campus Analytics

Route: `/campus-analytics`  
Status: Shipping consumer-facing, but partially in-progress.

What it does:

- Shows campus metrics such as active users, check-ins, weekly activity, peak hours, top categories, and return rate.
- Uses generated mock analytics for at least part of the current screen logic.

Why it matters:

- Gives the product a sense of campus momentum and helps sell the idea that Perched is building a real local network.

How it differs from competitors:

- It treats campus usage as a living ecosystem rather than a flat directory.

Current caution:

- Parts of this screen are produced from mock/generated analytics in code rather than clearly server-backed production analytics.

#### Campus Settings

Route: `/campus-settings`  
Status: Shipping consumer.

What it does:

- Manages current campus selection, auto-detect campus, show campus in profile, and campus notification preferences.
- Supports campus removal and manual campus switching.

Why it matters:

- Gives users control over how much campus identity drives their experience.

How it differs from competitors:

- It makes campus relevance adjustable rather than hardcoded.

### Premium and Monetization Surfaces

#### Subscription

Route: `/subscription`  
Status: Shipping consumer, but only relevant if the user is premium or purchases are enabled.

What it does:

- Shows premium status, expiration, auto-renew state, referral premium versus purchased premium, and feature list.
- Supports upgrade and subscription cancellation where applicable.

Why it matters:

- This is the account-management surface for premium value and retention.

How it differs from competitors:

- It explicitly distinguishes earned premium from paid premium, which supports referral-led growth mechanics.

#### Premium Upgrade

Route: `/premium-upgrade`  
Status: Gated or beta.

What it does:

- Presents the premium paywall and plan choices.
- Shows monthly and annual pricing.
- Includes 7-day free trial copy and cancel-anytime language.
- If purchases are disabled, it clearly states that premium purchases are unavailable in the current beta build.

Why it matters:

- This is the primary conversion surface for consumer monetization.

How it differs from competitors:

- Premium is pitched around better discovery power, history management, and status features rather than generic removal of paywalls alone.

Premium feature promises visible in code:

- Advanced filters
- Custom lists
- Export history
- Ad-free experience
- Exclusive leaderboards
- Priority support

Important reality check:

- The product only enables consumer purchases when a valid RevenueCat public key is configured.
- If that key is missing or placeholder, the app intentionally disables premium purchasing UI.

### Business, Partner, and Internal Revenue Screens

#### Loyalty Cards

Route: `/loyalty`  
Status: Gated or secondary consumer surface tied to partner programs.

What it does:

- Shows partner loyalty cards earned by checking in at partner spots.
- Tracks progress toward rewards.
- Supports reward redemption.

Why it matters:

- This extends Perched beyond discovery into retention and local commerce.

How it differs from competitors:

- The reward system is based on actual in-app place visits and check-ins, not just passive coupon browsing.

#### Business Dashboard

Route: `/business`  
Status: Internal, partner, or roadmap-facing rather than launch-core consumer.

What it does:

- Shows business spot analytics, trend cards, repeat visitor rate, period filters, and business management entry points.
- Supports claimed coffee shops and coworking spaces.

Why it matters:

- Demonstrates Perched's B2B ambition and the possibility of monetizing aggregated place activity.

How it differs from competitors:

- Unlike a pure consumer discovery app, Perched is already modeling a local business intelligence layer.

#### Business Claim

Route: `/business/claim`  
Status: In progress / partner-facing.

What it does:

- Lets an owner submit a spot claim with business email, phone, website, and spot ID.
- Promises analytics, promotions, competitive insights, and customer engagement.
- Shows a pricing preview and free-trial language.

Why it matters:

- Establishes a business-side monetization path tied to claimed locations.

How it differs from competitors:

- The business story is built around real check-in data and on-the-ground behavior, not just page management.

Important caution:

- Public pricing shown here does not fully match other B2B tier definitions elsewhere in the repo, which suggests the business offering is still evolving.

#### Business Analytics

Route: `/business/analytics`  
Status: In progress.

What it does:

- Placeholder screen stating detailed analytics breakdown is still being finalized.

Why it matters:

- Confirms analytics depth is planned beyond the dashboard overview.

#### Competitive Intelligence

Route: `/business/competitive`  
Status: In progress but functionally substantial.

What it does:

- Compares a business's spot with nearby competitors on check-ins, Wi-Fi, noise, and visitors.
- Supports radius filters and multi-location selection.

Why it matters:

- Extends Perched's place intelligence into a local business benchmarking tool.

How it differs from competitors:

- Few consumer-led check-in apps also model business-side competitive intelligence in the same codebase.

#### Check-In Responses

Route: `/business/responses`  
Status: In progress.

What it does:

- Placeholder screen stating response management is being finalized.

Why it matters:

- Indicates intent to let businesses participate in the social loop around check-ins.

#### Business Settings

Route: `/business/settings`  
Status: In progress.

What it does:

- Placeholder screen stating settings are coming next.

Why it matters:

- Shows the business toolkit is real but unfinished.

### Additional and Legacy Social Screens

#### Find Friends

Route: `/find-friends`  
Status: Shipping consumer secondary screen.

What it does:

- Dedicated friend discovery search by name, handle, or email.
- Also shows campus suggestions.

Why it matters:

- Gives the product a focused acquisition and graph-building surface outside the main Friends tab.

#### Legacy Friends Screen

Route: `/friends`  
Status: Secondary or legacy.

What it does:

- Alternate friend-management UI with request-handling behavior.

Why it matters:

- Suggests the friends product has undergone iteration and there may be legacy routing still present.

### Admin and Moderation Screens

#### Admin Observability

Route: `/admin-observability`  
Status: Internal/admin.

What it does:

- Shows performance metrics, cache stats, SLO compliance, Firebase diagnostics, and operational charts.

Why it matters:

- This is internal launch-ops tooling, not end-user value.

#### Admin Reports

Route: `/admin-reports`  
Status: Internal/admin.

What it does:

- Shows moderation reports, auto-detection health, detection logs, and CSV export tools.
- Supports report-status updates.

Why it matters:

- Demonstrates that Perched has internal moderation and operational review surfaces, not just client-side reporting.

### Non-Core Utility Route

#### Modal

Route: `/modal`  
Status: Non-core utility route.

What it does:

- A generic modal route exists in the navigation stack.

Why it matters:

- It is not a meaningful marketing feature and should not be highlighted in launch GTM.

## 3. Tech Stack and Platform Details

### Core app stack

- Framework: Expo SDK 54
- App framework: React Native 0.81.5
- React version: 19.1.0
- Language: TypeScript 5.9.x
- Navigation: Expo Router
- Animation and native UI support: React Native Reanimated, Gesture Handler, Safe Area, Screens
- Charting: Victory Native
- SVG and WebView support for story cards and branded rendering

### Platform footprint

- Codebase support exists for iOS, Android, and web.
- Current launch reality is iOS-first, with App Store-specific docs, App Review notes, and App Store Connect submission config.
- iOS tablet support is enabled.
- Minimum iOS version is 15.1.
- Current marketing version is 1.1 and current iOS build number is 3.
- Bundle identifier is `app.perched`.
- The app uses the custom URL scheme `perched`.

### Expo and native capabilities in use

- Camera for check-in photo capture
- Image picker and media library for photo selection and story-card saving
- Location for nearby discovery, campus detection, and place verification
- Contacts for friend discovery and invite flows
- Notifications for push and local reminder flows
- Sharing for share cards and invite links
- Store Review prompt hooks
- Splash screen configuration with branded splash asset

### Firebase specifics

Perched uses Firebase heavily across the full stack:

- Firebase Auth for account creation, sign-in, verification, and password reset
- Cloud Firestore for user profiles, check-ins, social graph, spots, achievements, referrals, notifications, business objects, and telemetry
- Firebase Storage for check-in photos, profile photos, and story-card exports
- Cloud Functions for secure writes, provider proxies, gamification sync, notification triggers, weekly recap, business flows, and B2B APIs
- Firebase App Check custom token flow for securing backend access patterns

Cloud Functions runtime:

- Node.js 22

Default functions region:

- `us-central1`

### Firestore data surfaces visible in rules and services

Consumer and social data:

- `publicProfiles`
- `socialGraph`
- `users`
- `userPrivate`
- `checkins`
- `friendRequests`
- `reactions`
- `comments`
- `notifications`
- `pushTokens`
- `userStats`
- `achievements`
- `referrals`

Place and intelligence data:

- `spots`
- `placeEvents`
- `placeTags`
- `place_tags`
- `place_tag_votes`

Safety, admin, and telemetry data:

- `reports`
- `admins`
- `eventLogs`
- `checkinWriteGuards`

Business and partner data:

- `businessSpots`
- Additional business/partner collections used by services and functions, including promotions, loyalty cards, challenge progress, referral rewards, ambassador applications, and B2B API key data.

### Storage behavior

- Check-in photos are stored under owner-scoped paths and enforce visibility metadata.
- Profile photos are owner-uploaded.
- Story/share images are separately stored for export workflows.
- Image uploads are restricted to image MIME types and sub-10MB size limits.

### Security and rules posture

- Clients cannot directly create check-ins in Firestore; secure creation is routed through Cloud Functions.
- Verified email status is part of posting eligibility.
- Check-in reads respect visibility modes: public, friends, and close friends.
- Media access in Storage mirrors visibility-aware check-in access.
- Admin collections are not client-writable.
- User-owned data is scoped tightly by authenticated UID.

### Backend callable and HTTP surfaces

Important backend functions exported in the repo include:

- Secure check-in creation
- Business claim creation
- Promotion creation
- Check-in response creation
- Partner creation
- Social graph mutation
- Secure user lookup, profile fetch, search, and campus lookup
- App Check token issuance
- Gamification sync
- Collaborative recommendations
- Custom verification email and password reset email flows
- Friend-request and check-in triggers
- Weekly raffle entry trigger
- Place-tag aggregate sync
- Google Places proxy
- Place signals proxy
- Review analysis callable
- B2B APIs for spot data, nearby spots, and usage stats
- Weekly recap scheduler
- SLO violation checks

### Third-party APIs and services

Place and map data:

- Google Maps / Google Places
- Yelp Fusion API
- Foursquare Places API
- OpenStreetMap / Overpass data

Commerce / subscriptions:

- RevenueCat, gated by configured public key

Observability and telemetry:

- Sentry
- Optional Segment and Mixpanel keys are supported in config

Review analysis and intelligence:

- OpenAI-backed review analysis is implied by environment docs and review-analysis services/functions
- Place intelligence also combines provider review signals, user check-ins, and optional weather/context signals

### Intelligence and ranking layer

The repo contains a substantial "place intelligence" system that calculates:

- Work score
- Vibe scores and primary vibe
- Aggregate rating and review count
- Open-now confidence and source attribution
- Crowd level
- Best time
- Reliability and confidence scoring
- Momentum trend
- Study and meeting recommendations
- Highlights and use cases
- Crowd forecast
- Context signals such as weather

Model version observed in code:

- `2026-03-04-r7`

### Deep linking and external destinations

- Primary web domain: `https://perched.app`
- Support email: `perchedappteam@gmail.com`
- Instagram: `https://instagram.com/perchedapp`
- TikTok: `https://tiktok.com/@perchedapp`
- Invite/share system includes App Store, Play Store, and web destinations in share utilities, even though the product is currently iOS-first in launch practice.

## 4. Onboarding Flow

The codebase supports a dedicated onboarding screen, but the actual root entry route currently redirects to Sign In. The practical new-user journey therefore has two layers: the technical app entry and the intended pre-signup primer.

### Actual entry behavior in the repo

1. The app launches and routes `/` to `/signin`.
2. A new user can create an account from Sign In.
3. The codebase also contains a standalone `/onboarding` flow that preloads signup defaults and is clearly intended to prepare the user before full registration.

### Effective new-user journey from first launch to first value

1. First launch lands on Sign In.
2. User chooses to create an account.
3. If the onboarding flow is surfaced in the launch experience, the user sees:
   - Welcome screen explaining nearby discovery, check-ins, and community contribution
   - Permissions step for location access
   - Personalization step choosing up to three intents and an optional ambiance preference
4. User proceeds to Signup and enters:
   - email
   - password
   - handle
   - name
   - city
   - optional campus
   - optional phone
5. If arriving through referral, referral code is captured during or before signup.
6. User submits account creation.
7. If the account requires verification, the app routes to Verify Email and blocks the main experience until verification succeeds.
8. User opens the verification email and returns to the app.
9. User enters the main signed-in experience, which defaults to the Feed tab.

### First-session activation loop

Once inside the main app, the intended first-value loop is:

1. Browse Feed to understand the social proof and live hotspot concept.
2. Open Explore to search for nearby places or a specific use case.
3. Open a Spot page to inspect work score, crowd, utility signals, and check-in activity.
4. Create a first check-in:
   - add a photo
   - confirm the spot
   - write a short caption or choose vibe tags
   - optionally add Spot Intel metrics
   - choose visibility
5. See the new check-in appear in Feed and Profile.
6. Receive immediate reinforcement through stats changes, streak logic, celebration overlays, achievements, and possible notification scheduling.

### Ongoing engagement loop

The product is structured to keep users returning through:

- live "where are people right now?" curiosity
- utility-driven need states such as deep work, quiet reading, or late-night open
- friends-only and campus-only feeds
- streaks and achievements
- saved spots and personal posting history
- referrals and invite loops
- weekly recap and smart notification systems
- shareable story cards for off-platform distribution

## 5. Monetization Model

### Consumer model

Perched is designed as a freemium consumer app with a premium subscription layer.

Observed premium pricing in code and terms:

- `$4.99/month`
- `$49.99/year`
- Annual plan messaging emphasizes 17% savings
- Paywall copy includes a 7-day free trial

Observed premium feature promises:

- Advanced filters
- Custom lists
- Export history
- Ad-free experience
- Exclusive leaderboards
- Priority support

### Current live-state nuance

- Premium purchasing is environment-gated.
- If a valid RevenueCat public key is not configured, premium purchases are intentionally disabled and the UI tells the user purchases are unavailable in the current beta build.
- This means the premium business model is architected and visible, but may not be fully active in the current review or beta configuration.

### Referral monetization and growth incentives

Perched also uses premium time as a growth reward:

- Referee reward: instant 3-day premium trial on signup
- Referrer reward: 1 week of premium after the referred user completes 3 check-ins

This makes premium both a revenue product and a viral incentive currency.

### Ads

- No ad SDK is visible in the current repo.
- "Ad-free experience" exists in premium feature flags, but there is no evidence that live consumer ads are already integrated.
- Marketing should therefore treat ads as not currently active, even though premium copy references ad-free value.

### Business and partner monetization

The repo also contains a second monetization axis focused on venues and partners:

- business spot claims
- business analytics
- promotions
- competitive intelligence
- loyalty/reward programs
- partner tiers
- B2B API usage and aggregated data products

Important caveat:

- The business monetization model is not fully harmonized across the repo.
- Different parts of the code describe different price/tier models:
  - partner tier definitions show `basic`, `premium`, and `elite`
  - business claim UI shows `Basic $99/month` and `Pro $299/month` with a 14-day free trial
  - business analytics schema references `basic`, `pro`, and `enterprise`
- This strongly suggests that B2B monetization is real but still in flux and should be positioned as an emerging roadmap/business capability rather than finalized public pricing.

### Practical monetization summary

- Consumer monetization: freemium with a premium subscription scaffold already present
- Growth monetization support: referral rewards that grant premium time
- Business monetization: in progress, with real infrastructure but not fully stabilized messaging or pricing
- Ads: not visibly live today

## 6. Content and Data

### What content exists in the app

User-generated content:

- Check-ins
- Check-in photos
- Captions
- Vibe tags
- Visit intents
- Ambiance selections
- Structured spot metrics
- Reactions
- Social graph actions such as friend requests and close-friend relationships

User identity and profile data:

- Name
- Handle
- Email
- Optional phone
- City
- Optional campus
- Profile photo
- Saved spots
- Streaks, achievements, and stats

Place and listing content:

- Spot records normalized around provider IDs and location data
- Place names, coordinates, address data, category hints, ratings, hours, and images where available
- Place intelligence outputs such as work score, open status, crowd forecast, and recommendations

Campus and community content:

- Pilot campus metadata
- Campus stats
- Campus top spots
- Leaderboards
- Challenge progress
- Ambassador status and application data

Named pilot campuses in code:

- Rice University
- University of Texas at Austin
- Stanford University
- Massachusetts Institute of Technology
- University of California, Los Angeles

Business and partner content:

- Claimed business spots
- Promotions
- Loyalty cards and redemptions
- Partner benefits and tiering
- Business analytics and competitive-intelligence outputs

Operational and safety content:

- Reports and moderation state
- Notifications and push tokens
- Event logs
- Detection logs
- Performance metrics and SLO telemetry

### What a check-in contains

Perched check-ins are richer than generic social posts. A check-in can include:

- spot name
- place/provider ID
- coordinates
- timestamp
- visibility mode
- caption
- image
- vibe tags
- visit intent(s)
- ambiance
- photo tags
- noise rating
- busyness rating
- drink price
- drink quality
- Wi-Fi speed
- outlet availability
- laptop friendliness
- parking availability
- parking type
- city and campus context

### Where the data comes from

Perched is a hybrid data product. Data comes from four major sources:

1. User-generated content

- Check-ins, captions, photos, tags, and structured metrics
- Profile fields and social actions
- Reactions and relationship graph updates

2. External provider and map APIs

- Google Maps / Places
- Yelp
- Foursquare
- OpenStreetMap

These provide listing scaffolding, reviews, ratings, hours, categories, address details, and some venue attributes.

3. Derived and inferred intelligence

- Place intelligence built from recent check-ins, tags, provider reviews, and context signals
- Review NLP / sentiment extraction
- Work score, vibe scoring, use-case recommendations, and confidence estimation
- Trend and crowd forecasting logic

4. Curated app-side constants and location scaffolding

- Pilot campus definitions
- City/campus option lists
- Brand assets and metadata
- Runtime feature flags and rollout behavior

### Data origin mix by category

Spot listings:

- Mix of provider/API sourced and app-normalized data

Work-quality intelligence:

- Mix of user-generated, inferred, provider-enriched, and aggregated data

Social graph:

- User generated

Campus surfaces:

- Mix of curated campus metadata plus user activity

Business intelligence:

- Aggregated from user behavior, check-ins, and spot-level data

### Privacy and ownership model

- Users retain ownership of their check-ins, captions, and uploaded photos under the Terms.
- Visibility controls exist at the check-in level.
- Account deletion removes profile and associated user data.
- Aggregated, anonymized insights may be shared through B2B surfaces according to the Privacy Policy.

### Notable data-model implications for marketing

- Perched is not just a "coffee shop database."
- It is a live intelligence layer on top of places, powered by a mix of listings infrastructure and community contributions.
- Its value scales with density: more check-ins create better recommendations, stronger campus loops, better here-now signals, and more useful partner analytics.

## 7. Brand Identity

### Core visual direction

Perched's current visual identity is bold, high-contrast, and social-first, with a strong purple-to-pink gradient system and clean iOS-native typography.

Primary branded gradient:

- `#8B5CF6` to `#EC4899`

This gradient is used as the flagship social/brand gradient and is explicitly described in code as Instagram-inspired.

### Core color palette observed in code

Light theme:

- Background: `#FFFFFF`
- Surface: `#FAFAFA`
- Text: `#0A0A0A`
- Muted text: `#737373`
- Border: `#E5E5E5`
- Primary violet: `#6D28D9`
- Accent pink: `#EC4899`
- Success green: `#10B981`
- Danger red: `#EF4444`
- Streak orange: `#F59E0B`
- Premium gold: `#FBBF24`
- Social blue: `#3B82F6`

Dark theme equivalents are also defined, with brighter violet/pink values and true-black backgrounds for OLED-heavy presentation.

### Typography

iOS font stack:

- `SF Pro Display`
- `New York`
- `SF Pro Rounded`
- `SF Mono`

Fallback/web stack:

- `Avenir Next` plus system/web fallbacks

Brand feel:

- Rounded, modern, polished, and App Store-native rather than editorial or retro
- High legibility, especially in cards, chips, and metric-heavy surfaces

### Logo and mark

The logo system includes:

- a wordmark
- a standalone mark
- a lockup combining both

Logo mark description:

- A stylized bird perched on the rim of a coffee cup
- Coffee cup, saucer, and steam rendered with purple/pink gradients
- Gold beak and feet accents
- Rounded, friendly, confident shape language

This is a strong metaphor for the product name and purpose: a social presence anchored to a coffee-and-third-place ritual.

### Tone of voice

Observed product and App Store copy suggest a tone that is:

- practical
- direct
- social
- utility-led
- lightly aspirational, but not precious

Representative positioning themes visible in copy:

- "Find better spots, faster."
- "Never arrive to a bad spot again."
- "Real-time WiFi, noise, and busyness."
- "Share where you work or study."
- "Help the community find better places."

Overall voice:

- More useful than lifestyle-bloggy
- More community-driven than corporate
- More operational than purely aesthetic cafe culture

### Existing brand and App Store assets in the repo

Brand assets present:

- `perched-logo-v3.svg`
- `perched-favicon.png`
- `perched-mark.png`
- `perched-mark.svg`
- `perched-app-icon.png`
- `perched-app-icon.svg`
- `perched-splash.png`
- demo title card and end card assets

App metadata drafts exist for:

- App name: `Perched: Find Great Spots`
- Subtitle: `Real-time WiFi, Noise & Busyness`
- Keywords and promotional text focused on work-friendly, real-time spot selection

### Known asset and guideline gaps

- A placeholder `hero.jpg` asset exists, which suggests at least some marketing imagery is not finalized.
- Repo docs still call out the need for current iPhone screenshots, valid native iPad screenshots, and possibly promo art/video.
- No formal standalone brand book or fully written visual-guideline document was found in the repo.

Practical conclusion:

- The brand system is visually coherent and recognizable, but App Store creative execution still appears partially in-progress.

## 8. Competitive Landscape

### Direct and adjacent competition categories

Perched overlaps with several product categories at once:

1. Generic local discovery and review apps

- Google Maps
- Yelp
- Foursquare-like places products

2. Social check-in and activity products

- Foursquare / Swarm-style check-in behavior
- Social feed products where friends share where they are or what they are doing

3. Study-spot and work-friendly cafe discovery tools

- Campus study spot lists
- Remote-work coffee shop directories
- Community spreadsheets, blogs, or local guides for laptop-friendly spaces

4. Campus community and local student network products

- Apps or communities built around campus social life and hyperlocal relevance

5. Business intelligence / local venue tooling

- Venue analytics, loyalty, promotion, and competitive-insight products

### What makes Perched distinct

Perched's clearest differentiators visible in the product are:

- Real-time utility signals from verified users, not just static historical reviews
- Structured check-ins that capture Wi-Fi, noise, busyness, outlets, laptop friendliness, and more
- Hybrid utility + social experience: you can search for a place because you need quiet, then validate it through live social proof
- Campus-native loops: campus feed, leaderboard, challenges, ambassador potential, campus discovery
- "Here now" and hotspot framing, which pushes the product closer to live situational intelligence
- Stronger content proof than text-only reviews because the check-in flow is photo-based
- Offline-first and optimistic sync design, which improves reliability for real-world posting
- An emerging B2B side for partners and venues, which most consumer cafe-finder apps do not expose in the same product stack

### Practical positioning versus specific competitors

Versus Google Maps / Yelp:

- Perched is narrower, more opinionated, and more real-time.
- It does not try to be the universal local-search tool; it tries to be the best tool for "Is this a good spot for what I need right now?"

Versus a pure social app:

- Perched turns location sharing into structured, high-signal discovery rather than generic lifestyle posting.

Versus a campus app:

- Perched makes campus relevance useful through places and routines, not just anonymous social chatter.

Versus a coffee-lover app:

- Perched is as much about work conditions, utility, and ambient fit as it is about coffee quality itself.

## 9. Current State

### Release state

Latest working assumption for this handoff:

- The current build has been submitted to App Store Connect and is awaiting review.

Historically documented repo state:

- On March 11, 2026, the repo's release tracker said automated checks were green but manual App Store submission steps still remained.
- On March 14, 2026, the App Store checklist still listed items such as iPad screenshot validation, release-build smoke checks, and reviewer-note prep.

The safest GTM interpretation:

- The product is in late launch state, with core flows implemented and prepared for review, but some review-ops and creative assets were still being tightened in repo docs shortly before the current submission assumption.

### Current launch build details

- App name in config: Perched
- App Store metadata draft name: `Perched: Find Great Spots`
- Version: `1.1`
- iOS build number: `3`
- iOS bundle ID: `app.perched`
- App Store Connect app ID is configured in EAS submit settings

### Features that look launch-ready

- email/password auth
- verification flow
- password reset
- full settings/support/privacy/terms surfaces
- in-app account deletion
- check-in creation
- feed
- explore
- friends graph
- profile
- spot detail
- reactions
- achievements
- campus discovery basics

### Features that are real but gated, dependent, or not guaranteed to be active

- premium purchasing, because RevenueCat key/config must be valid
- some premium UI entry points, because they depend on purchase availability or current premium state
- some place-provider client calls, because direct client provider access is intentionally dev-only and production should prefer proxy-backed flows
- campus density-dependent experiences, because they work better with local user volume
- contact matching, because it depends on permission grants and local data quality

### Features that exist but should not be marketed as fully finished launch consumer features

- business analytics detail screen
- business responses screen
- business settings screen
- parts of the B2B pricing/tier system, because repo definitions are inconsistent
- campus analytics as a precision analytics product, because part of the screen uses generated mock analytics

### Known limitations and risks visible in the repo

- Premium purchasing may be disabled in the current beta/review configuration.
- Business monetization messaging is not yet fully unified.
- Some internal or partner-only surfaces may need to stay out of launch screenshots and public messaging.
- Android and web support exist in code, but the launch motion is clearly iOS/App Store-centered.
- App Store asset readiness looked partially incomplete in docs shortly before the current assumed submission.
- There is a placeholder hero image asset, indicating some marketing creative is likely unfinished.

### Launch-adjacent cleanup or v2 follow-ups already called out in docs

Post-launch follow-up items explicitly mentioned in repo docs include:

- profile and relationship data consistency cleanup
- server-owned aggregation for tags, rewards, and achievements
- final unification of place intelligence across client and backend
- explore and recommendation scalability cleanup
- media/privacy cleanup for older data predating current rules

Additional likely v2 work implied by code:

- finishing business/admin/productization around partner tools
- stabilizing business pricing and tier language
- making premium fully active if disabled in the current build
- expanding beyond pilot-campus density into broader geographic rollouts

### Launch-facing feature removals or adjustments already noted

- Early-adopter raffle UI was removed from launch-facing screens, even though related backend logic still exists.

## 10. User Acquisition Constraints

### Budget

Working assumption for this handoff:

- Small budget

That means GTM should assume:

- selective paid testing, not broad paid acquisition
- organic loops matter a lot
- referral mechanics, campus density, and owned social distribution are strategically important

### Geographic focus

Working assumption for this handoff:

- Houston/Texas first

Why that fits the product:

- Houston is the default detected city in onboarding code when no better city is known.
- The pilot campus list includes Rice University in Houston and UT Austin in Austin.
- The broader pilot list also includes Stanford, MIT, and UCLA, which shows a clear path beyond Texas once local density is proven.
- The overall product can expand nationally, but the most coherent early-density wedge is Texas, especially student and work-friendly third places around core campuses and urban areas.

### Existing audience

Working assumption for this handoff:

- Minimal existing audience

Observed owned channels:

- Instagram account configured
- TikTok account configured
- Support email configured

What was not discoverable in the repo:

- no evidence of a meaningful existing email list
- no evidence of a large preexisting creator/community audience
- no evidence of a funded brand ecosystem already waiting to activate

### Growth mechanics already built into the product

These matter because the product does not appear to have a large preexisting audience:

- invite flows from feed and friends surfaces
- contact sync and match
- referral code and referral premium rewards
- story-card sharing
- profile and achievement identity loops
- campus leaderboard and challenge mechanics
- social proof through live hotspots and "where are you working today?"

### Strategic implication for GTM

Perched appears best suited for a density-first rollout, not a broad unfocused national launch. The product gets stronger when a local cluster of users creates enough check-ins to make:

- Explore rankings more useful
- feed activity more interesting
- friends and classmate discovery more relevant
- campus leaderboards more competitive
- partner and business insights more credible

In practical terms, the product is built for:

- campus-by-campus or neighborhood-by-neighborhood seeding
- strong local creator/student ambassador activation
- heavy use of organic sharing and referrals
- selective paid support, not brute-force performance marketing
