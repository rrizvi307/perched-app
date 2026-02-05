# Clean Landing Page Prompt - Matches Actual App

**IMPORTANT**: The app is minimal, clean, and focused. The landing page should match this aesthetic - **NOT busy or overwhelming**.

---

## 🎨 Design Philosophy

**The app is:**
- Clean, spacious layouts
- Purple/pink accents (not everywhere - just key elements)
- Lots of white space
- Simple, clear typography
- Focused on 3 core screens: Feed, Explore, Profile

**The landing page should be:**
- ✅ Minimal sections (Hero + 3 features + CTA)
- ✅ Clean screenshots of actual app
- ✅ Simple copy that matches app's tone
- ❌ NO busy gradients everywhere
- ❌ NO overwhelming feature lists
- ❌ NO excessive animations

---

## 📄 Landing Page Structure (SIMPLE)

### 1. Hero Section
```
[Clean white background]

[Logo - purple/pink gradient location pin]

Find Your Spot.
Work with Friends.

[One line]: See where your classmates are studying,
discover coffee shops that match your vibe, build daily streaks.

[Single iPhone screenshot - Feed screen]

[Download on App Store button - purple gradient]
[Watch Demo - Ghost button]
```

### 2. Three Feature Cards (Side-by-side)

```
📍 Discover                 👥 Connect                  🔥 Stay Motivated
Find coffee shops          See where friends          Build daily streaks
libraries, and spots       are working right now      and unlock achievements
with the vibe you need
```

### 3. App Screenshots Section
```
Simple 3-column layout:

[Feed Screenshot]          [Explore Screenshot]       [Profile Screenshot]
"Your Friends Feed"        "Discover Nearby"          "Your Stats"
```

### 4. Simple CTA
```
Ready to find your spot?

[Download on App Store]

iOS · Free to use
```

### 5. Footer
```
About | Privacy | Contact
© 2025 Perched
```

---

## 🎨 Visual Style Guide

### Colors (USE SPARINGLY)
- **Background**: White (`#FFFFFF`)
- **Text**: Dark (`#0A0A0A`)
- **Accent**: Purple/Pink gradient - ONLY on CTA buttons and logo
- **Muted**: Gray (`#737373`)

**Key Rule**: The purple/pink should be an **accent**, not the whole page.

### Typography
```css
/* Headings */
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
font-weight: 800;
font-size: 56px; /* Hero only */

/* Body */
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
font-weight: 400;
font-size: 18px;
line-height: 1.6;
```

### Spacing
- **Between sections**: 120px
- **Inside sections**: 60px
- **Card padding**: 40px
- **Max width**: 1200px

---

## 📝 Copy (ACTUAL APP TONE)

### Hero
```
Find Your Spot. Work with Friends.

See where your classmates are studying right now.
Discover coffee shops and libraries that match your vibe.
Build daily streaks and stay motivated.
```

### Feature 1: Discover
```
Find Your Perfect Vibe

Search coffee shops, libraries, and coworking spaces.
Filter by WiFi, outlets, noise level, and more.
See real check-ins from students like you.
```

### Feature 2: Connect
```
Your Campus, Your Crew

Connect with classmates at your university.
See where friends are working in real-time.
Accept friend requests and build your network.
```

### Feature 3: Stay Motivated
```
Build Streaks, Unlock Achievements

Check in daily to build your streak.
Unlock achievements as you explore new spots.
React to friends' check-ins and stay engaged.
```

### Final CTA
```
Ready to find your spot?

Download Perched for iOS and discover where
your friends are working today.

[Download on App Store]
```

---

## 📱 Screenshots to Use

**USE ACTUAL APP SCREENSHOTS** - not mockups, not busy compositions:

1. **Feed Screen** - Clean, showing 2-3 check-ins with reactions
2. **Explore Screen** - Map view with pins, simple
3. **Profile Screen** - Stats and achievements

**Screenshot Style:**
- iPhone 15 Pro mockup (subtle shadow)
- Light mode (white background matches page)
- NOT floating at angles - straight on
- NOT multiple screens stacked - one at a time

---

## 🚫 What NOT to Include

### DON'T:
- ❌ Busy gradient backgrounds everywhere
- ❌ Too many features listed
- ❌ Excessive animations
- ❌ Social proof / testimonials (app is new)
- ❌ Pricing section (it's free)
- ❌ "For Universities" section
- ❌ Multiple CTAs competing for attention
- ❌ Feature comparison tables
- ❌ "Silicon Valley grade" marketing speak

### DO:
- ✅ Keep it simple and clean
- ✅ Show actual app screenshots
- ✅ Use purple/pink only as accent
- ✅ Focus on core value: find spots + friends
- ✅ Match the minimal feel of the app

---

## 🎯 HTML Structure (Minimal)

```html
<!DOCTYPE html>
<html>
<head>
  <title>Perched - Find Your Spot</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, sans-serif; color: #0A0A0A; }
    .container { max-width: 1200px; margin: 0 auto; padding: 0 40px; }
    .hero { text-align: center; padding: 120px 0; }
    .hero h1 { font-size: 56px; font-weight: 800; margin-bottom: 24px; }
    .hero p { font-size: 20px; color: #737373; max-width: 600px; margin: 0 auto 48px; }
    .cta {
      background: linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%);
      color: white;
      padding: 16px 48px;
      border-radius: 12px;
      font-weight: 600;
      text-decoration: none;
      display: inline-block;
    }
    .features { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 40px; padding: 80px 0; }
    .feature { text-align: center; }
    .feature-icon { font-size: 48px; margin-bottom: 16px; }
    .feature h3 { font-size: 24px; font-weight: 700; margin-bottom: 12px; }
    .feature p { color: #737373; line-height: 1.6; }
    .screenshots { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 40px; padding: 80px 0; }
    .screenshot img { width: 100%; border-radius: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
    footer { text-align: center; padding: 60px 0; color: #737373; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Hero -->
    <section class="hero">
      <img src="logo.svg" alt="Perched" width="80" height="80">
      <h1>Find Your Spot.<br>Work with Friends.</h1>
      <p>See where your classmates are studying right now. Discover coffee shops that match your vibe. Build daily streaks.</p>
      <a href="#" class="cta">Download on App Store</a>
    </section>

    <!-- Features -->
    <section class="features">
      <div class="feature">
        <div class="feature-icon">📍</div>
        <h3>Discover</h3>
        <p>Find coffee shops, libraries, and spots with the vibe you need</p>
      </div>
      <div class="feature">
        <div class="feature-icon">👥</div>
        <h3>Connect</h3>
        <p>See where friends are working right now</p>
      </div>
      <div class="feature">
        <div class="feature-icon">🔥</div>
        <h3>Stay Motivated</h3>
        <p>Build daily streaks and unlock achievements</p>
      </div>
    </section>

    <!-- Screenshots -->
    <section class="screenshots">
      <div class="screenshot">
        <img src="feed.png" alt="Feed">
        <p style="text-align:center; margin-top:16px; color:#737373;">Your Friends Feed</p>
      </div>
      <div class="screenshot">
        <img src="explore.png" alt="Explore">
        <p style="text-align:center; margin-top:16px; color:#737373;">Discover Nearby</p>
      </div>
      <div class="screenshot">
        <img src="profile.png" alt="Profile">
        <p style="text-align:center; margin-top:16px; color:#737373;">Your Stats</p>
      </div>
    </section>

    <!-- Final CTA -->
    <section class="hero">
      <h2 style="font-size:40px; margin-bottom:24px;">Ready to find your spot?</h2>
      <p>Download Perched for iOS and discover where your friends are working today.</p>
      <a href="#" class="cta">Download on App Store</a>
    </section>

    <footer>
      <p>About · Privacy · Contact</p>
      <p style="margin-top:12px;">© 2025 Perched</p>
    </footer>
  </div>
</body>
</html>
```

---

## ✅ Final Checklist

Before deploying, verify:
- [ ] White background (not purple everywhere)
- [ ] Only 5 sections (Hero, Features, Screenshots, CTA, Footer)
- [ ] Purple/pink only on logo and CTA buttons
- [ ] Clean, actual app screenshots
- [ ] Simple copy (no marketing fluff)
- [ ] Lots of white space
- [ ] Mobile responsive
- [ ] Fast load time (<2s)
- [ ] Matches the ACTUAL app aesthetic

---

## 🎯 The Goal

The landing page should feel like the app:
- **Clean**: Lots of white space, easy to scan
- **Focused**: Find spots + connect with friends
- **Minimal**: Not overwhelming or busy
- **Modern**: But not trying too hard

**Remember**: The app itself is simple and focused. The landing page should reflect that, not add complexity that doesn't exist in the product.

---

**This is the prompt. Keep it simple. Match the app. Don't add noise.** ✨
