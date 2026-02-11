# App Review Notes for Perched

## Demo Account Credentials

**Email**: demo@perched.app  
**Password**: TestPassword123

This account has:
- 15 check-ins across 5 Houston coffee shops
- 7-day active streak
- 3 friends added
- Multiple badges unlocked (Explorer, Early Adopter, Social Butterfly)

---

## How to Test the App

### 1. Basic Flow (Check-in Creation)
1. Log in with demo account
2. Tap "Explore" tab -> See Houston spots on map
3. Tap a spot -> View spot details with real-time metrics
4. Tap "Check In" button
5. Rate WiFi (1-5), Noise (1-5), Busyness (1-5), Outlets (yes/no)
6. Add optional caption and photo
7. Submit check-in -> See it appear in feed

### 2. Social Features
1. Tap "Feed" tab -> See friend check-ins and your own
2. React to check-ins with emojis (tap 🔥 or ❤️)
3. Tap "Profile" tab -> View your streak, badges, check-in history

### 3. Discovery & Filters
1. Tap "Explore" tab
2. Use search bar to find spots by name
3. Apply filters: WiFi Quality, Noise Level, Busyness
4. Advanced filters (WiFi >=4, etc.) show premium prompt

### 4. Premium Features (Optional Testing)
- Advanced filters require subscription (not enforced for demo account)
- Sandbox testing: Use Apple sandbox account for IAP testing

---

## Features NOT Available for Review

### B2B API
- Requires partner approval and API key generation
- Admin-only feature (not user-facing)
- Documentation: `/docs/b2b-api.md`
- Contact: support@perched.app for B2B access

### Observability Dashboard
- Admin-only feature (requires admin custom claim)
- Real-time performance metrics and SLO tracking
- Not user-facing

### Campus Challenges
- Requires active campus with 50+ users
- Demo account shows empty state with explanatory message

---

## Location Services

**Required**: App requires location permission for core functionality
- Used to discover nearby spots on map
- Check-in location verification
- "Here Now" friend discovery

**Privacy**: Location data stored securely in Firestore, used only for app features. See Privacy Policy for details.

---

## Push Notifications

**Optional**: User can opt-in for notifications
- Streak reminders ("Don't break your 7-day streak!")
- Friend activity ("Sarah checked in at Blacksmith")
- Badge unlocks

**Privacy**: No marketing or promotional notifications sent.

---

## Third-Party APIs

We use the following third-party services:
- **Firebase** (Google): Authentication, database, analytics, crashlytics
- **Foursquare API**: Place data enrichment (coffee shop info, hours)
- **Yelp API**: Place data enrichment (ratings, categories)
- **OpenStreetMap**: Place data enrichment (addresses, amenities)
- **RevenueCat**: Subscription management

All API usage complies with respective terms of service.

---

## Compliance

✅ **Guideline 4.2 (Minimum Functionality)**: Perched provides real utility - crowd-sourced real-time workspace intelligence  
✅ **Guideline 5.1.1 (Privacy Policy)**: Privacy policy available at perched.app/privacy  
✅ **Guideline 3.1.1 (In-App Purchase)**: Premium subscription uses Apple IAP (RevenueCat)  
✅ **Guideline 2.3 (Accurate Metadata)**: All screenshots and descriptions accurately reflect app functionality  

---

## Contact

**Support**: support@perched.app  
**Developer**: Rehan Rizvi  

---

## Notes for Reviewers

- Houston is the primary test market (demo data pre-populated)
- Real-time metrics update as users check in
- Social features require friends (demo account has 3 pre-added friends)
- B2B API and admin features are not user-facing

Thank you for reviewing Perched!
