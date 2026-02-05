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

## 🎯 HTML Structure (Responsive & Easy to Modify)

**IMPORTANT**: This structure uses CSS variables and clear breakpoints for easy customization on both mobile and desktop.

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Perched - Find Your Spot</title>
  <style>
    /* ========================================
       CSS VARIABLES - Easy to customize!
       ======================================== */
    :root {
      /* Colors */
      --color-bg: #FFFFFF;
      --color-text: #0A0A0A;
      --color-muted: #737373;
      --color-gradient-start: #8B5CF6;
      --color-gradient-end: #EC4899;

      /* Spacing (change these to adjust all spacing at once) */
      --spacing-xs: 8px;
      --spacing-sm: 16px;
      --spacing-md: 24px;
      --spacing-lg: 40px;
      --spacing-xl: 60px;
      --spacing-2xl: 80px;
      --spacing-3xl: 120px;

      /* Typography */
      --font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
      --font-size-base: 16px;
      --font-size-lg: 18px;
      --font-size-xl: 20px;
      --font-size-2xl: 32px;
      --font-size-3xl: 40px;
      --font-size-4xl: 56px;

      /* Container */
      --container-max-width: 1200px;
      --container-padding: var(--spacing-lg);
    }

    /* ========================================
       BASE STYLES
       ======================================== */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: var(--font-family);
      font-size: var(--font-size-base);
      color: var(--color-text);
      background: var(--color-bg);
      line-height: 1.6;
    }

    .container {
      max-width: var(--container-max-width);
      margin: 0 auto;
      padding: 0 var(--container-padding);
    }

    /* ========================================
       HERO SECTION
       ======================================== */
    .hero {
      text-align: center;
      padding: var(--spacing-3xl) 0;
    }

    .hero-logo {
      width: 80px;
      height: 80px;
      margin-bottom: var(--spacing-md);
    }

    .hero h1 {
      font-size: var(--font-size-4xl);
      font-weight: 800;
      margin-bottom: var(--spacing-md);
      line-height: 1.2;
    }

    .hero p {
      font-size: var(--font-size-xl);
      color: var(--color-muted);
      max-width: 600px;
      margin: 0 auto var(--spacing-lg);
    }

    /* ========================================
       CTA BUTTON
       ======================================== */
    .cta {
      background: linear-gradient(135deg, var(--color-gradient-start) 0%, var(--color-gradient-end) 100%);
      color: white;
      padding: var(--spacing-sm) var(--spacing-lg);
      border-radius: 12px;
      font-weight: 600;
      text-decoration: none;
      display: inline-block;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .cta:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(139, 92, 246, 0.3);
    }

    /* ========================================
       FEATURES SECTION
       ======================================== */
    .features {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--spacing-lg);
      padding: var(--spacing-2xl) 0;
    }

    .feature {
      text-align: center;
    }

    .feature-icon {
      font-size: 48px;
      margin-bottom: var(--spacing-sm);
    }

    .feature h3 {
      font-size: var(--font-size-2xl);
      font-weight: 700;
      margin-bottom: 12px;
    }

    .feature p {
      color: var(--color-muted);
      line-height: 1.6;
    }

    /* ========================================
       SCREENSHOTS SECTION
       ======================================== */
    .screenshots {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--spacing-lg);
      padding: var(--spacing-2xl) 0;
    }

    .screenshot {
      text-align: center;
    }

    .screenshot img {
      width: 100%;
      max-width: 300px;
      border-radius: 24px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
    }

    .screenshot-caption {
      margin-top: var(--spacing-sm);
      color: var(--color-muted);
    }

    /* ========================================
       FOOTER
       ======================================== */
    footer {
      text-align: center;
      padding: var(--spacing-xl) 0;
      color: var(--color-muted);
      border-top: 1px solid #E5E5E5;
      margin-top: var(--spacing-2xl);
    }

    footer p {
      margin-bottom: 12px;
    }

    /* ========================================
       RESPONSIVE - TABLET (768px and below)
       ======================================== */
    @media (max-width: 768px) {
      :root {
        --container-padding: 24px;
        --font-size-4xl: 40px;
        --font-size-3xl: 32px;
        --font-size-2xl: 24px;
        --spacing-3xl: 80px;
        --spacing-2xl: 60px;
      }

      .features {
        grid-template-columns: 1fr;
        gap: var(--spacing-xl);
      }

      .screenshots {
        grid-template-columns: 1fr;
        gap: var(--spacing-lg);
      }

      .screenshot img {
        max-width: 250px;
      }
    }

    /* ========================================
       RESPONSIVE - MOBILE (480px and below)
       ======================================== */
    @media (max-width: 480px) {
      :root {
        --container-padding: 20px;
        --font-size-4xl: 32px;
        --font-size-3xl: 28px;
        --font-size-2xl: 20px;
        --font-size-xl: 18px;
        --spacing-3xl: 60px;
        --spacing-2xl: 40px;
      }

      .hero-logo {
        width: 60px;
        height: 60px;
      }

      .cta {
        padding: 14px 32px;
        width: 100%;
        max-width: 280px;
      }

      .screenshot img {
        max-width: 200px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- ==================== HERO SECTION ==================== -->
    <section class="hero">
      <img src="logo.svg" alt="Perched" class="hero-logo">
      <h1>Find Your Spot.<br>Work with Friends.</h1>
      <p>See where your classmates are studying right now. Discover coffee shops that match your vibe. Build daily streaks.</p>
      <a href="#" class="cta">Download on App Store</a>
    </section>

    <!-- ==================== FEATURES SECTION ==================== -->
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

    <!-- ==================== SCREENSHOTS SECTION ==================== -->
    <section class="screenshots">
      <div class="screenshot">
        <img src="feed.png" alt="Feed">
        <p class="screenshot-caption">Your Friends Feed</p>
      </div>
      <div class="screenshot">
        <img src="explore.png" alt="Explore">
        <p class="screenshot-caption">Discover Nearby</p>
      </div>
      <div class="screenshot">
        <img src="profile.png" alt="Profile">
        <p class="screenshot-caption">Your Stats</p>
      </div>
    </section>

    <!-- ==================== FINAL CTA SECTION ==================== -->
    <section class="hero">
      <h2 style="font-size: var(--font-size-3xl); margin-bottom: var(--spacing-md);">Ready to find your spot?</h2>
      <p>Download Perched for iOS and discover where your friends are working today.</p>
      <a href="#" class="cta">Download on App Store</a>
    </section>

    <!-- ==================== FOOTER ==================== -->
    <footer>
      <p>About · Privacy · Contact</p>
      <p>© 2025 Perched</p>
    </footer>
  </div>
</body>
</html>
```

---

## 🎨 How to Customize (Easy Guide)

**This landing page is designed for EASY customization on both mobile and desktop.**

### Quick Customization Guide

#### 1. **Change Colors**
Edit the CSS variables at the top:
```css
:root {
  --color-bg: #FFFFFF;           /* Background color */
  --color-text: #0A0A0A;         /* Main text color */
  --color-muted: #737373;        /* Secondary text */
  --color-gradient-start: #8B5CF6; /* Purple */
  --color-gradient-end: #EC4899;   /* Pink */
}
```

#### 2. **Adjust Spacing**
All spacing uses variables - change once, applies everywhere:
```css
:root {
  --spacing-xs: 8px;    /* Extra small spacing */
  --spacing-sm: 16px;   /* Small spacing */
  --spacing-md: 24px;   /* Medium spacing */
  --spacing-lg: 40px;   /* Large spacing */
  --spacing-xl: 60px;   /* Extra large */
  --spacing-2xl: 80px;  /* 2X large */
  --spacing-3xl: 120px; /* 3X large (hero padding) */
}
```

#### 3. **Change Typography**
Font sizes automatically adjust for mobile:
```css
:root {
  --font-size-base: 16px;   /* Body text */
  --font-size-lg: 18px;     /* Large body */
  --font-size-xl: 20px;     /* Hero subtitle */
  --font-size-2xl: 32px;    /* Feature headings */
  --font-size-3xl: 40px;    /* CTA heading */
  --font-size-4xl: 56px;    /* Main hero heading */
}
```

#### 4. **Responsive Breakpoints**
The page has 3 breakpoints that automatically adjust:
- **Desktop** (default): 3-column layout, large text
- **Tablet** (768px and below): 1-column layout, medium text
- **Mobile** (480px and below): Optimized for phones, smaller text

To adjust a breakpoint:
```css
@media (max-width: 768px) {
  /* Tablet styles here */
}

@media (max-width: 480px) {
  /* Mobile styles here */
}
```

#### 5. **Layout Changes**

**Want 2 columns on tablet instead of 1?**
```css
@media (max-width: 768px) {
  .features {
    grid-template-columns: 1fr 1fr; /* Change from 1fr */
  }
}
```

**Want larger screenshots on mobile?**
```css
@media (max-width: 480px) {
  .screenshot img {
    max-width: 280px; /* Increase from 200px */
  }
}
```

### Common Customizations

**Make the hero more compact:**
```css
.hero {
  padding: 60px 0; /* Reduce from var(--spacing-3xl) */
}
```

**Change the CTA button style:**
```css
.cta {
  background: solid #EC4899; /* Solid color instead of gradient */
  border-radius: 999px;      /* Pill shape */
}
```

**Add a section divider:**
```css
.features {
  border-top: 1px solid #E5E5E5;
  padding-top: var(--spacing-2xl);
}
```

---

## 📱 Mobile vs Desktop: Key Differences

| Element | Desktop | Tablet | Mobile |
|---------|---------|--------|--------|
| Hero H1 | 56px | 40px | 32px |
| Features Layout | 3 columns | 1 column | 1 column |
| Screenshots Layout | 3 columns | 1 column | 1 column |
| Container Padding | 40px | 24px | 20px |
| CTA Button | 16px/48px padding | Same | 14px/32px padding, full width |

**These adjustments happen automatically through CSS variables and media queries.**

---

## ✅ Final Checklist

Before deploying, verify:
- [ ] White background (not purple everywhere)
- [ ] Only 5 sections (Hero, Features, Screenshots, CTA, Footer)
- [ ] Purple/pink only on logo and CTA buttons
- [ ] Clean, actual app screenshots
- [ ] Simple copy (no marketing fluff)
- [ ] Lots of white space
- [ ] **Mobile responsive** - Test on actual phones (iOS/Android)
- [ ] **Tablet responsive** - Test at 768px width
- [ ] **Desktop responsive** - Test at 1200px+ width
- [ ] Text is readable on all screen sizes
- [ ] Images scale properly without distortion
- [ ] CTA buttons are easily tappable on mobile
- [ ] No horizontal scrolling on mobile
- [ ] Fast load time (<2s)
- [ ] Matches the ACTUAL app aesthetic
- [ ] Easy to modify using CSS variables

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
