# Codex Tasks — Perched v1.1

## Full Plan Context

This is a v1.1 release bundling critical bug fixes, ML pipeline enablement + scoring improvements, campus feature completion, and UX polish. Premium/Stripe integration is deferred.

**Claude (Opus) is handling these items** (complex, multi-file, architectural):
- 1A: WiFi + laptop check-in flow (touches 6+ locations in checkin.tsx)
- 1B: firstDiscoveries + streak sync (cross-service Firestore coordination)
- 1M: Gamification/placeId guard refactor (restructuring publish success block)
- 2A: NLP Cloud Function (new Cloud Function + Secret Manager + OpenAI + TTL cache)
- 2D: Outlet scoring in Work Score (modifying core scoring formula)
- 2E: Behavioral signals in recommendations (cross-file integration)
- 3E: Fix EmptyState component (shared component, careful not to regress)

**You (Codex) are handling these items** (scoped, well-defined, mechanical changes). Each task below has exact file locations, line numbers, and implementation specs.

---

## Key Codebase Context

### Project Structure
- React Native / Expo app with web support
- `app/` — screens (Expo Router file-based routing)
- `services/` — business logic, Firebase, scoring, recommendations
- `storage/local.ts` — local storage helpers + types
- `components/ui/` — shared UI components
- `functions/src/index.ts` — Firebase Cloud Functions
- `utils/` — small utility helpers (colors.ts, layout.ts, phone.ts)

### Important Types (storage/local.ts lines 15-40)
```typescript
type Checkin = {
  id: string;
  spot?: string;
  spotName?: string;
  spotPlaceId?: string;
  spotLatLng?: { lat: number; lng: number };
  image?: string;
  photoUrl?: string;
  photoPending?: boolean;
  caption?: string;
  userId?: string;
  userHandle?: string;
  visibility?: 'public' | 'friends' | 'close';
  campus?: string;
  city?: string;
  expiresAt?: string;
  createdAt: string;
  tags?: string[];
  wifiSpeed?: 1 | 2 | 3 | 4 | 5;
  noiseLevel?: 'quiet' | 'moderate' | 'lively' | 1 | 2 | 3 | 4 | 5;
  busyness?: 1 | 2 | 3 | 4 | 5;
  outletAvailability?: 'plenty' | 'some' | 'few' | 'none';
};
```

### Key Existing Utilities
| Utility | Location |
|---------|----------|
| `updateUserRemote(userId, fields)` | `services/firebaseClient.ts:1574` — sanitizes fields, sets with merge:true |
| `SkeletonLoader` / `SkeletonFeedCard` | `components/ui/skeleton-loader.tsx` |
| `EmptyState` | `components/ui/empty-state.tsx` |
| `ensureFirebase()` | `services/firebaseClient.ts` |
| `getUserStats()` | `services/gamification.ts` |
| `getUserPreferenceScores()` | `storage/local.ts:~1614` |

---

## Batch 1: Shared Utilities + XS Fixes (Do First — Unblocks Everything)

### 0A. `toNumericNoiseLevel()` utility
- **File:** `services/checkinUtils.ts`
- **Existing exports in file:** `CHECKIN_TTL_MS`, `toMillis()`, `getCheckinExpiryMs()`, `isCheckinExpired()`, `formatCheckinTime()`, `formatCheckinClock()`, `formatTimeRemaining()`
- **Task:** Add and export a new function at the end of the file:
```typescript
export function toNumericNoiseLevel(value: string | number | null | undefined): 1 | 2 | 3 | 4 | 5 | null {
  if (value == null) return null;
  if (typeof value === 'number') return Math.min(5, Math.max(1, Math.round(value))) as 1 | 2 | 3 | 4 | 5;
  const map: Record<string, 1 | 2 | 3 | 4 | 5> = { quiet: 2, moderate: 3, lively: 4 };
  return map[value.toLowerCase()] ?? null;
}
```

### 0B. Safe haptics wrapper
- **File:** New file `utils/haptics.ts`
- **Existing utils/ files:** `colors.ts`, `layout.ts`, `phone.ts`
- **Task:** Create with Platform guard and try/catch:
```typescript
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export async function safeImpact(style?: Haptics.ImpactFeedbackStyle): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Haptics.impactAsync(style);
  } catch {}
}

export async function safeNotification(type?: Haptics.NotificationFeedbackType): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Haptics.notificationAsync(type);
  } catch {}
}
```

### 1E. find-friends useState anti-pattern
- **File:** `app/find-friends.tsx`, line 57
- **Current code:** `useState(() => { loadCampusSuggestions(); })`
- **Fix:** Replace with `useEffect(() => { loadCampusSuggestions(); }, [])`. Make sure `useEffect` is imported from React.

### 1F. Feed diagnostics card visible in production
- **File:** `app/(tabs)/feed.tsx`, lines 912-933
- **Current code:** A diagnostics card showing Firebase status, init error, and "Run remote test" button
- **Fix:** Wrap the entire diagnostics card JSX block with `{__DEV__ && (...)}`

### 1G. Demo mode text leaks to production
- **File:** `app/(tabs)/profile.tsx`, line 1209
- **Current code:** Text containing "@mayap or @jonstudy" — demo mode helper text
- **Fix:** Wrap with `{__DEV__ && (...)}`

### 1H. Achievement notification navigation commented out
- **File:** `app/_layout.tsx`, line 192
- **Current code:** `// router.push('/achievements');` (commented out, inside notification response handler)
- **Fix:** Uncomment it: `router.push('/achievements');`

---

## Batch 2: Scoped Fixes + Config (After Batch 1)

### 1C. Campus save/settings are no-ops
- **Files:** `app/campus-sync.tsx` (line 39), `app/campus-settings.tsx` (lines 138, 155, 166)
- **campus-sync.tsx current code (lines 36-42):**
```typescript
const handleSaveCampus = async () => {
  if (!selectedCampus) return;
  // TODO: Save campus to user profile
  console.log('Saving campus:', selectedCampus);
  router.back();
};
```
- **Fix for campus-sync.tsx:** Replace the TODO/console.log with:
```typescript
await updateUserRemote(user.id, { campus: selectedCampus, campusOrCity: 'campus' });
```
Import `updateUserRemote` from `../services/firebaseClient`. Get `user` from auth context (check how other screens in the app access the current user).

- **campus-settings.tsx** has 3 TODO locations (lines 138, 155, 166) that all need similar treatment:
  - Line 138 (after campus detection): `await updateUserRemote(user.id, { campus: detectedCampus, campusOrCity: 'campus' })`
  - Line 155 (after campus selection): `await updateUserRemote(user.id, { campus: selectedCampus, campusOrCity: 'campus' })`
  - Line 166 (campus removal): `await updateUserRemote(user.id, { campus: null, campusOrCity: null })`
  - Import `updateUserRemote` from `../services/firebaseClient`

### 1D. Campus leaderboard streak always 0
- **File:** `services/campus.ts`, line 393
- **Current code:** `const streak = 0; // TODO: Implement proper streak calculation`
- **Context:** This is inside the leaderboard generation method. Each entry has a `userData` object from Firestore.
- **Fix:** Replace with `const streak = userData?.streakDays ?? 0;`
- **Depends on:** Claude's 1B task syncs `streakDays` to Firestore user docs. This line just reads it.

### 1I. Tag votes lost on native app restart
- **File:** `app/spot.tsx`, lines 192-219
- **Current code:** Web path uses `localStorage.getItem`/`setItem`, native path uses `(global as any)._spot_tag_votes` (memory only, lost on restart)
- **Key constants:** `TAG_VOTES_KEY = 'spot_tag_votes_v1'` (line 39), `TAG_VARIANT_KEY = 'spot_tag_variant_v1'` (line 40)
- **Fix:** Replace the native path (global var) with `AsyncStorage.getItem`/`setItem` using the same key names. Import `AsyncStorage` from `@react-native-async-storage/async-storage`. The write can be fire-and-forget (no await needed). The read on mount should be async (load in useEffect or similar).

### 1K. Haptics web guards
- **Files and call sites:**
  - `components/ui/reaction-bar.tsx` line 50: `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)`
  - `app/spot.tsx` line 74: `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)`
  - `app/spot.tsx` line 580: `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)`
  - `app/checkin.tsx` line 171: `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)`
  - `app/checkin.tsx` line 1025: `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)`
  - `app/checkin.tsx` line 1071: `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)`
  - `app/checkin.tsx` line 1117: `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)`
  - `app/checkin.tsx` line 1159: `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)`
- **Fix:** In each file:
  1. Replace `import * as Haptics from 'expo-haptics';` with `import { safeImpact, safeNotification } from '../utils/haptics';` (adjust path depth per file)
  2. Replace `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)` → `safeImpact(Haptics.ImpactFeedbackStyle.Light)` — actually, since we're removing the Haptics import, use the enum value directly. Import the types:
  ```typescript
  import { safeImpact, safeNotification } from '../utils/haptics';
  import { ImpactFeedbackStyle, NotificationFeedbackType } from 'expo-haptics';
  ```
  Then: `safeImpact(ImpactFeedbackStyle.Light)`, `safeNotification(NotificationFeedbackType.Success)`, etc.
  3. Remove the `import * as Haptics from 'expo-haptics'` line if no other Haptics usage remains.

### 2B. Enable Foursquare signals
- **File:** `functions/src/index.ts`, line 959
- **Current code:** `const enableFoursquare = ['1', 'true', 'yes', 'on'].includes(...)` — reads from runtime config
- **Fix:** This is a deployment config change. In the Cloud Functions environment config, set `PLACE_INTEL_ENABLE_FOURSQUARE=true`. If there's a `.env` or config file for Cloud Functions, set it there. Otherwise document the deployment command:
```bash
firebase functions:config:set placeIntel.enableFoursquare="true"
```
- Also verify the Foursquare API key is in Secret Manager (check existing secret patterns in `functions/src/index.ts` lines 191-220).

### 2C. Enable Weather signals
- **File:** App config and/or `services/placeIntelligence.ts`
- **Fix:** Set `PLACE_INTEL_ENABLE_WEATHER=true` in the same config mechanism as 2B. Weather uses Open-Meteo (free, no key needed).
- **Note:** Do this AFTER 2G (weather confidence model) is done by Claude, so the improved confidence ships with the flag.

### 2F. Learn recommendation preferences from behavior
- **File:** `services/recommendations.ts`, lines 315-319
- **Current code:**
```typescript
wifiImportance: 'medium', // TODO: Infer from behavior
outletImportance: 'medium', // TODO: Infer from behavior
avgSessionLength: 60, // TODO: Calculate from check-in duration
```
- **Fix:** Replace `wifiImportance` and `outletImportance` with computed values:
```typescript
// Compute from user's check-in data
const avgWifi = checkins.filter(c => c.wifiSpeed).reduce((sum, c) => sum + c.wifiSpeed!, 0) / (checkins.filter(c => c.wifiSpeed).length || 1);
const wifiImportance = avgWifi >= 4 ? 'high' : avgWifi <= 2 ? 'low' : 'medium';

const outletMap = { plenty: 4, some: 3, few: 2, none: 1 };
const outletCheckins = checkins.filter(c => c.outletAvailability);
const avgOutlet = outletCheckins.reduce((sum, c) => sum + (outletMap[c.outletAvailability!] || 0), 0) / (outletCheckins.length || 1);
const outletImportance = avgOutlet >= 3.5 ? 'high' : avgOutlet <= 1.5 ? 'low' : 'medium';
```
- Keep `avgSessionLength: 60` hardcoded (no checkout timestamps exist).
- **Depends on:** Claude's 1A (wifiSpeed collection) and 2D (outlet scoring).

### 2G. Improve weather confidence model
- **File:** `services/placeIntelligence.ts`, line 434-435
- **Current code:** `confidence: 0.68` — hardcoded regardless of weather conditions
- **Fix:** Add a new function near the weather processing section:
```typescript
function deriveWeatherConfidence(code: number, precipitationMm: number): number {
  // WMO weather codes: 61-65 rain, 71-77 snow, 80-82 showers, 95-99 thunderstorm
  if (precipitationMm > 5 || (code >= 63 && code <= 65) || code >= 95) return 0.85; // heavy rain/storm
  if (precipitationMm > 0.5 || (code >= 61 && code <= 62) || (code >= 80 && code <= 82)) return 0.65; // light rain/showers
  if (code >= 71 && code <= 77) return 0.78; // snow
  if (code <= 3 && precipitationMm === 0) return 0.40; // clear/sunny
  if (code >= 45 && code <= 48) return 0.55; // fog
  return 0.55; // cloudy/overcast default
}
```
- Then replace the hardcoded `confidence: 0.68` with `confidence: deriveWeatherConfidence(weatherCode, precipitationMm)` using whatever variables hold the weather code and precipitation in that context.

---

## Batch 3: UX Polish + Tests (After Batch 2)

### 3A. Verify screen auto-refresh on foreground
- **File:** `app/verify.tsx`
- **Current state:** No AppState listener exists. Users must manually tap after clicking email verification link.
- **Fix:** Add `AppState` listener:
```typescript
import { AppState } from 'react-native';

// Inside the component:
useEffect(() => {
  const subscription = AppState.addEventListener('change', async (nextState) => {
    if (nextState === 'active') {
      const refreshed = await refreshUser(); // or however user refresh works in this app
      if (refreshed?.emailVerified) {
        router.replace('/(tabs)/feed');
      }
    }
  });
  return () => subscription.remove();
}, []);
```
- Check how `refreshUser` or equivalent works in the app's auth context. Look at other screens for the pattern.

### 3B. Loading skeletons for spot + profile-view
- **Files:** `app/spot.tsx`, `app/profile-view.tsx`
- **spot.tsx:** Currently shows blank screen while loading
- **profile-view.tsx:** Currently shows `"Loading profile..."` text (line 75)
- **Fix:** Import `SkeletonLoader` from `components/ui/skeleton-loader.tsx` and use it in the loading state of both screens:
```typescript
import { SkeletonLoader } from '../components/ui/skeleton-loader';

// In loading conditional:
if (loading) return <SkeletonLoader />;
```
- Check the actual exported component names from `skeleton-loader.tsx` and use appropriately.

### 3C. Missing empty states
- **Files:** `app/friends.tsx` (suggestions tab), `app/achievements.tsx`
- **friends.tsx:** When suggestions list is empty, show EmptyState component
- **achievements.tsx:** Currently has a basic inline empty state (lines 163-173) with hardcoded text. Replace with proper `EmptyState` component.
- **Fix:** Import `EmptyState` from `components/ui/empty-state.tsx` and use:
```typescript
import { EmptyState } from '../components/ui/empty-state';

// In friends.tsx suggestions tab when list is empty:
<EmptyState
  icon="users"
  title="No Suggestions Yet"
  message="Join a campus to see friend suggestions"
/>

// In achievements.tsx when unlockedCount === 0:
<EmptyState
  icon="trophy"
  title="Start Your Journey"
  message="Check in at spots to unlock achievements"
  actionLabel="Make your first check-in"
  onAction={() => router.push('/checkin')}
/>
```
- Check the actual EmptyState props interface first. Note: Claude is fixing EmptyState in 3E (replacing PremiumButton with standard Pressable), so your usage will benefit from that fix.

### 3D. Profile-view friend request button sends duplicates
- **File:** `app/profile-view.tsx`
- **Current code:** Friend request button exists (lines 84-99) with `requesting` state for loading
- **Fix:** Add `requestSent` state. After successful request, set it to true. Disable button + show "Request Sent" text. Also check on mount if a request already exists:
```typescript
const [requestSent, setRequestSent] = useState(false);

// On mount, check if request already exists:
useEffect(() => {
  // Check existing friend requests collection for this user pair
  // If exists, setRequestSent(true)
}, []);

// In the send request handler, after success:
setRequestSent(true);

// In JSX, disable button:
<Button disabled={requestSent || requesting} onPress={handleSendRequest}>
  {requestSent ? 'Request Sent' : 'Add Friend'}
</Button>
```

### 3F. Default map center hardcoded to Houston
- **Files:** `app/(tabs)/explore.tsx` (line 283), `components/map/index.web.tsx` (line 35), `storage/local.ts`
- **Current code in both files:** `return { lat: 29.7604, lng: -95.3698 }; // Houston`
- **Fix:**
  1. In `storage/local.ts`, add two helpers:
  ```typescript
  export async function saveLastKnownLocation(coords: { lat: number; lng: number }): Promise<void> {
    await AsyncStorage.setItem('last_known_location', JSON.stringify(coords));
  }

  export async function getLastKnownLocation(): Promise<{ lat: number; lng: number } | null> {
    const stored = await AsyncStorage.getItem('last_known_location');
    if (!stored) return null;
    try { return JSON.parse(stored); } catch { return null; }
  }
  ```
  2. In `explore.tsx` and `map/index.web.tsx`, change Houston fallback to US center:
  ```typescript
  return { lat: 39.83, lng: -98.58 }; // US geographic center fallback
  ```
  3. In `explore.tsx`, on successful location fetch, call `saveLastKnownLocation(coords)`. On mount fallback, try `getLastKnownLocation()` before the US center fallback.

### 4A. Verify urlLaunchInvariants test
- **File:** `services/__tests__/urlLaunchInvariants.test.ts`
- **Current state:** Already uses `fs.readFileSync` + regex (NOT shell `rg`). This is fine.
- **Fix:** Verify the test still passes as-is. If the patterns it checks for have drifted, update the regex patterns to match current code. Run with `npx jest services/__tests__/urlLaunchInvariants.test.ts`.

### 4B. Tests for WiFi/laptop/outlet scoring
- **File:** `services/__tests__/placeIntelligence.test.ts` (create if doesn't exist)
- **Add tests for:**
  - Checkins with `wifiSpeed: 4` produce higher work score than `wifiSpeed: 1`
  - `outletAvailability: 'plenty'` adds outlet bonus to score
  - `laptopFriendly: true` increases laptopPct in scoring
  - `toNumericNoiseLevel()` conversions: `'quiet'→2`, `'moderate'→3`, `'lively'→4`, `3→3`, `null→null`

### 4C. Tests for campus persistence
- **File:** `services/__tests__/campus.test.ts` (new file)
- **Tests:**
  - Mock `updateUserRemote` (jest.mock `../firebaseClient`)
  - Verify save calls `updateUserRemote(userId, { campus: 'MIT', campusOrCity: 'campus' })`
  - Verify remove calls `updateUserRemote(userId, { campus: null, campusOrCity: null })`

### 4D. Full test suite
- Run `npm run check:all` — must exit 0 before tagging v1.1.
- Fix any failures introduced by the above changes.

---

## Execution Order

1. **Batch 1 first** (0A, 0B, 1E, 1F, 1G, 1H) — these are all independent and unblock later work
2. **Batch 2** (1C, 1D, 1I, 1K, 2B, 2G) — can run in parallel with Claude working on 1A, 1B, 1M
   - 2C and 2F depend on Claude's work (2D, 1A) — implement the code but note the dependency
3. **Batch 3** (3A, 3B, 3C, 3D, 3F, 4A-4D) — can run in parallel with Claude on 2A, 2E, 3E

## Important Notes
- **Do NOT modify** `app/checkin.tsx` beyond the haptics replacements (1K) — Claude is making extensive changes there for 1A, 1M
- **Do NOT modify** `services/gamification.ts` — Claude is modifying it for 1B
- **Do NOT modify** `services/placeIntelligence.ts` scoring formula (lines 924-935) — Claude is modifying it for 2D. You CAN add the `deriveWeatherConfidence` function (2G) since it's in a different section (line 434).
- **Do NOT modify** `components/ui/empty-state.tsx` — Claude is fixing it in 3E
- **Do NOT modify** `services/recommendations.ts` scoring logic — Claude is modifying it for 2E. You CAN modify the hardcoded preferences section (2F, lines 315-319).
- When adding `laptopFriendly` to the Checkin type in `storage/local.ts` — **Claude is doing this in 1A**. Do not duplicate.
- After all changes, `npm run check:all` must pass.
