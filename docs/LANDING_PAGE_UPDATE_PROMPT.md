# Landing Page Update Prompt for perched-landing Repo

**Context:** This is a comprehensive update to align the Perched landing page (perched.app) with the current mobile app features, branding, and Silicon Valley-grade polish.

---

## 🎨 Brand & Design Updates

### Color Scheme (Critical Update)
Replace the current neutral/minimal design with a **dopamine-inducing, vibrant color palette**:

**Primary Colors:**
- **Hot Pink/Magenta**: `#EC4899` - Primary CTA buttons, highlights, active states
- **Vibrant Purple**: `#8B5CF6` - Secondary accents, gradients
- **Deep Purple**: `#7C3AED` - Gradient overlays

**Supporting Colors:**
- Background: `#FFFFFF` (light mode), `#0A0A0A` (dark mode)
- Text: `#0A0A0A` (light mode), `#FFFFFF` (dark mode)
- Muted text: `#737373`
- Border: `#E5E5E5`

**Gradients:**
Use vibrant gradients for hero sections and CTAs:
```css
/* Primary Gradient */
background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%);

/* Achievement Gradient */
background: linear-gradient(135deg, #F59E0B 0%, #EF4444 100%);

/* Success Gradient */
background: linear-gradient(135deg, #10B981 0%, #059669 100%);
```

### Typography
- **Headlines**: Bold, modern sans-serif (Inter, SF Pro Display, or similar)
- **Body**: Clean, readable (Inter, SF Pro Text)
- **Weights**: Use 600-800 for headings, 400-500 for body

### Visual Style
- **Smooth animations**: Entrance animations, hover effects, micro-interactions
- **Glassmorphism**: Subtle blur effects on cards
- **Elevated shadows**: Soft, layered shadows for depth
- **Rounded corners**: 12-16px border radius for cards, 8-12px for buttons

---

## 📱 Hero Section

### New Hero Message
```
Stop Working Alone.
Find Your Perfect Spot & Squad.

Discover coffee shops, libraries, and coworking spaces—
then see who from your campus is there right now.
```

### Hero Features (3 columns)
1. **🎓 Campus Connect**
   - Verify your university
   - Find classmates working nearby
   - Build your study network

2. **📍 Smart Check-ins**
   - Photo-based location detection
   - Tag vibes: Quiet, WiFi, Outlets
   - Share your favorite spots

3. **🔥 Gamification**
   - Daily streaks & achievements
   - React to friends' check-ins
   - Unlock campus leaderboards

### CTA Buttons
```
Primary: "Download for iOS" (Hot Pink gradient)
Secondary: "Watch Demo" (Outline with purple gradient border)
```

---

## ✨ Feature Sections

### Section 1: Social Discovery
**Headline:** "Your Campus, Your Crew, Your Spots"

**Content:**
Never work alone again. Perched helps you discover where your friends and classmates are studying right now. Get friend requests, see mutual connections, and build your study network—all with Silicon Valley-grade social features.

**Features:**
- ✅ **Friend Requests** - Accept/decline with mutual friends preview
- ✅ **Smart Suggestions** - Discover classmates at your university
- ✅ **Campus Verification** - Verify with .edu email or manually
- ✅ **Real-time Feed** - See live check-ins from your network

**Visual:** Screenshot of friends screen with friend requests showing mutual friends count

---

### Section 2: Gamification & Engagement
**Headline:** "Turn Productivity into a Game"

**Content:**
Build streaks, unlock achievements, and compete with friends. Perched makes finding the perfect workspace addictive with dopamine-driven rewards.

**Features:**
- 🔥 **Daily Streaks** - 3, 7, 30, 100+ day milestones
- 🏆 **Achievements** - Unlock badges for exploring new spots
- 💜 **Reactions** - React to friends' check-ins with emoji
- 📊 **Stats Tracking** - See your most-visited spots

**Visual:** Screenshot of achievements screen with unlocked badges and streak counter

---

### Section 3: Campus Integration
**Headline:** "Built for Students, By Students"

**Content:**
Perched understands campus life. Find study spots near your classes, discover where your classmates hang out, and build connections that last beyond graduation.

**Features:**
- 🏫 **University Sync** - Connect with students at your campus
- 📧 **Email Verification** - Verify with your .edu email
- 🎓 **Campus Badges** - Show your verified university
- 👥 **Same Campus Connections** - Auto-suggest friends at your school

**Visual:** Screenshot of campus selector with verified badges and student counts

---

### Section 4: Vibe Tagging & Discovery
**Headline:** "Find Your Perfect Vibe"

**Content:**
Not all work spots are created equal. Tag your check-ins with vibes—Quiet, WiFi, Outlets, Bright, Cozy—and discover spots that match your mood.

**Features:**
- 🏷️ **Smart Tags** - WiFi, Quiet, Outlets, Coworking, Late-night
- 📸 **Photo Check-ins** - Auto-detect location from photos
- ⭐ **Spot Ratings** - See activity levels and recommendations
- 🗺️ **Map View** - Explore nearby spots with filters

**Visual:** Screenshot of check-in screen with vibe tags

---

### Section 5: Premium Experience
**Headline:** "Silicon Valley Polish, Student-Friendly Price"

**Content:**
Every interaction is smooth, every animation is perfect, every feature is thoughtfully designed. Perched delivers a $50M app experience—without the $50M price tag.

**Features:**
- ⚡ **Lightning Fast** - Optimized images, smart caching
- 🎨 **Beautiful Design** - Polished cards, smooth animations
- 📱 **Native Feel** - Haptic feedback, gesture controls
- 🌙 **Dark Mode** - Easy on the eyes, day or night

**Visual:** Side-by-side comparison of polished UI components

---

## 🎬 Demo Mode Section (NEW!)

**Headline:** "See It in Action"

**Content:**
Try Perched with realistic demo data—no signup required. Experience the full app with 25+ check-ins, friend requests, and campus connections.

**CTA:** "Launch Interactive Demo" → Opens demo.perched.app or in-app demo

---

## 🚀 How It Works

### 3-Step Process (Updated)
1. **Join Your Campus**
   - Sign up with your .edu email
   - Verify your university
   - Find your friends

2. **Check In Anywhere**
   - Snap a photo of your workspace
   - Auto-detect the location
   - Tag the vibe (WiFi, Quiet, etc.)

3. **Build Your Network**
   - Accept friend requests
   - React to check-ins
   - Build daily streaks

---

## 📊 Stats Section (Add This)

**Headline:** "Join the Movement"

Display real-time stats:
- **X,XXX+** Active Students
- **XX+** Universities
- **XXX,XXX+** Check-ins Shared
- **X.X Million** Streaks Maintained

---

## 💎 Pricing (Clarify)

### Free Forever
- ✅ Unlimited check-ins
- ✅ Campus verification
- ✅ Friend requests & suggestions
- ✅ Daily streaks
- ✅ Basic achievements

### Premium (Coming Soon)
- 🌟 Advanced analytics
- 🌟 Custom achievement badges
- 🌟 Priority support
- 🌟 Early access to features

---

## 📱 App Download Section

**Headline:** "Available Now on iOS"

**Subtext:** "Android coming Q2 2025"

**Download Options:**
- App Store badge (primary)
- QR code for mobile users
- TestFlight link for early access

---

## 🎓 For Universities Section (NEW!)

**Headline:** "Partner with Perched"

**Content:**
Help your students connect, collaborate, and succeed. Perched provides universities with insights into campus culture and student engagement.

**CTA:** "Schedule a Demo" (for university administrators)

---

## 🔒 Privacy & Safety

**Headline:** "Your Data, Your Control"

**Content:**
- ✅ Choose who sees your check-ins (Private, Friends, Public)
- ✅ Campus verification keeps your network trusted
- ✅ No location tracking when app is closed
- ✅ Delete your account anytime

---

## 📰 Social Proof

### Testimonials (Add User Quotes)
```
"Finally found my study squad! Perched helped me connect with classmates
I never knew existed at my university."
— Sarah C., Stanford '26

"The streaks keep me motivated to find new spots. Hit 100 days last week!"
— Alex K., UC Berkeley '25

"Best app for remote students. Way better than working alone at Starbucks."
— Maya P., Stanford '27
```

### Press Mentions (If Available)
- Product Hunt
- TechCrunch
- Campus blogs/publications

---

## 🎨 Design Implementation Notes

### Animations
- **Hero section**: Fade up on load with stagger
- **Feature cards**: Slide in from left/right on scroll
- **CTA buttons**: Smooth hover scale (1.05x), gradient shift
- **Screenshots**: Parallax scroll effect, device mockups

### Responsive Design
- **Mobile**: Single column, full-width CTAs
- **Tablet**: 2-column grid for features
- **Desktop**: 3-column grid, side-by-side screenshots

### Micro-interactions
- ✨ Sparkle effect on hover for achievement icons
- 🔥 Flame animation for streak counter
- 💜 Heart bounce on friend request hover
- 📱 Phone mockup rotation on scroll

---

## 🔗 Footer Updates

### Navigation
- **Product**: Features, Pricing, Demo, Download
- **Company**: About, Blog, Careers, Press Kit
- **Support**: Help Center, Contact, Privacy, Terms
- **Social**: Instagram, TikTok, Twitter, Discord

### Legal
- Privacy Policy (updated for campus data)
- Terms of Service
- GDPR/CCPA compliance notices
- © 2025 Perched, Inc.

---

## 🎯 SEO & Meta Tags

### Page Title
```
Perched - Find Your Perfect Study Spot & Squad
```

### Meta Description
```
Discover coffee shops, libraries, and coworking spaces where your friends
and classmates are working. Build streaks, unlock achievements, and
connect with your campus community.
```

### Keywords
```
study spots, coworking spaces, campus friends, college productivity,
student networking, cafe finder, library finder, study groups,
daily streaks, gamified productivity
```

### Open Graph Image
Create a vibrant OG image with:
- App screenshot showing friends feed
- Perched logo
- Tagline: "Your Campus, Your Crew, Your Spots"
- Purple/pink gradient background

---

## 📸 Screenshot Requirements

### Must-Have Screenshots:
1. **Friends Screen** - Showing friend requests with mutual friends
2. **Campus Selector** - Verification flow with university badges
3. **Feed Screen** - Check-ins with reactions and streaks
4. **Achievements Screen** - Unlocked badges and progress
5. **Check-in Flow** - Photo capture with vibe tags
6. **Profile Screen** - Stats, streaks, and achievements

### Screenshot Style:
- iPhone 15 Pro mockups
- Light mode (primary), dark mode (secondary)
- Vibrant purple/pink UI visible
- Real demo data (Sarah Chen, Maya Patel, etc.)

---

## 🎬 Video Assets (Optional but Recommended)

### Hero Video (15-30 seconds)
1. Open app → Campus verification
2. Browse feed → See friend check-ins
3. Create check-in → Tag vibe
4. Accept friend request → Mutual friends shown
5. Unlock achievement → Streak milestone

### Feature Demos (5-10 seconds each)
- Smooth animations showcase
- Friend request flow
- Campus sync process
- Achievement unlock animation

---

## 🚀 Launch Checklist

Before deploying:
- [ ] All screenshots updated with current UI
- [ ] Color scheme matches app (purple/pink)
- [ ] All new features mentioned (demo, friends, campus)
- [ ] CTAs point to correct App Store link
- [ ] Social proof added (testimonials, stats)
- [ ] Mobile responsive tested
- [ ] SEO optimized
- [ ] Analytics tracking added
- [ ] Privacy policy updated
- [ ] Load performance optimized (<3s)

---

## 💬 Copy Tone Guidelines

- **Conversational but professional** - "Find your squad" not "Optimize networking efficiency"
- **Student-friendly** - Relate to campus life, finals week, all-nighters
- **Energetic** - Use exclamation points sparingly but strategically!
- **Inclusive** - "Students and remote workers" not just "college kids"
- **Benefit-focused** - What users gain, not just features
- **Social proof** - Reference real user behavior and stats

---

## 🎨 Brand Voice Examples

❌ **Old/Generic:**
"Perched is a location-based social networking platform for productivity optimization."

✅ **New/Vibrant:**
"Stop working alone. Perched helps you find the perfect coffee shop—and the perfect study squad to go with it."

❌ **Old/Boring:**
"Build accountability through daily check-in tracking."

✅ **New/Exciting:**
"Turn productivity into a game! Build streaks, unlock achievements, and compete with friends."

---

## 🔄 Migration Path

If you're using the existing Next.js landing page:

1. **Update `tailwind.config.js`** with new colors
2. **Replace hero section** with new messaging
3. **Add new feature sections** (friends, campus, gamification)
4. **Update screenshots** in `/public/images/`
5. **Refresh copy** throughout all sections
6. **Add demo mode section**
7. **Update footer** with new links
8. **Optimize images** for performance
9. **Deploy to Vercel/production**
10. **Test on mobile devices**

---

## 📝 Notes

- The current landing page is minimal and doesn't reflect the app's Silicon Valley polish
- Focus on **social features** (friends, campus) as key differentiators
- Emphasize **gamification** (streaks, achievements) for engagement
- Showcase **premium design** to stand out from competitors
- Make **campus verification** a hero feature for trust/safety
- Use **vibrant colors** throughout—no more neutral/bland design!

---

**Ready to make perched.app as polished as the app itself! 🚀💜**
