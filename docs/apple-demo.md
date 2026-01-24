# Apple-style Demo Prep (Perched)

## One-time Setup (Story Card Export)
If you want the story card to save as a real image in Photos:
- Run `npx expo install expo-media-library expo-sharing react-native-webview`

## Turn On “Film-Ready Demo Mode”

Film-ready mode makes the app deterministic for recording:
- Seeds a full feed (demo posts + “Live now”)
- Keeps demo timestamps fresh (so posts don’t expire)
- Suppresses toasts + background sync noise
- Makes “Detected: …” appear instantly on the check-in flow

## Simulator Setup (for clean recording)

### Run on iOS Simulator
- `npx expo start --ios --localhost`
  - If you see `exp://192.168...` and “could not connect to server”, `--localhost` usually fixes it for Simulator.

### Add photos to the Simulator (so you can pick from library)
- Easiest: drag images from Finder onto the Simulator window (they’ll import into Photos)
- Or via CLI: `xcrun simctl addmedia booted /path/to/photo.jpg`

### Option A: In-app toggle (recommended)
1. Open `Settings`
2. Tap `Version …` 7 times to reveal demo tools
3. Toggle `Film-ready demo mode` → On
4. Tap `Refresh demo content`

### Option B: Environment / URL (web)
- Set `EXPO_PUBLIC_PERCHED_DEMO=1`
- Or open the web app with `?demo=1`

## Recording Route (15–20s “product film”)
Record each beat as a separate clip (2–4s). One action per shot, end each shot with a short hold (0.2–0.4s).

## Your Current Beats (Recommended)
Don’t show login in the “Apple-style” cut. Use a clean title card + already-signed-in state.

At 60fps, a good pacing is:
- **Title card**: `0:00–0:01:12` (1s 12f)
- **Explore**: `0:01:12–0:04:12` (3s)
- **Feed**: `0:04:12–0:09:12` (5s; short scroll + stop)
- **Tap in → Detect → Post**: `0:09:12–0:20:12` (11s; the “hero” moment)
- **Profile → Story card**: `0:20:12–0:25:12` (5s; generate + hold)
- **End card (waitlist)**: `0:25:12–0:27:00` (1.8s hold)

If you *must* show login (not recommended), keep it < `0:01:00` and make it look intentional (no typing, no errors, no waiting).

### Shot list (20–25s total)
0) Title card (0.8s)
- Overlay: `PERCHED`

1) Explore (2.3s)
- Action: open `Explore` → tap one `Try:` chip (e.g. `Quiet + outlets`) → tiny pause
- Overlay: `HOT ZONES BY VIBE`

2) Feed (2.3s)
- Action: open `Feed` → short scroll (about 1 card) → stop cleanly
- Overlay: `FRIENDS LIVE NOW`

3) Tap in → Detect (4.0s)
- Action: tap `+` → take photo → hold for “Detected: …” → tap `Use`
- Overlay: `TAP IN → DETECT`

4) Weekly recap / story card (2.6s)
- Action: go to `Profile` → tap `Create story card` → hold on the full-screen card preview
- Overlay: `WEEKLY RECAP`

5) End card (1.2s)
- Overlay: `Join early access` + `@perchedapp`

### Gesture timing (how to look “Apple”)
- Tap, then pause 150–250ms before the next input
- Keep scrolls short (1 gesture per shot)
- Don’t “hunt” for UI — know exactly where you’re going before you record

## Status Bar Checklist
- Time `9:41`
- Full battery, strong signal
- DND on / no notifications
- Consistent light/dark mode

## Title/End Cards (Ready-to-use)
Use these SVGs (export or drop into your editor as-is):
- Title card: `assets/demo/perched-title-card.svg`
- End card: `assets/demo/perched-end-card.svg`

Notes:
- Both SVGs reference `assets/demo/perched-mark.png` (keep it in the same folder when moving files).
- If your editor doesn’t render SVGs cleanly, export to PNG at `1080×1920`:
  - macOS Preview → open the SVG → File → Export… → Format: PNG

Brand tokens used:
- Ink `#0E0F12`
- Paper `#FBFAF8`
- Moss `#2F6F5E`
