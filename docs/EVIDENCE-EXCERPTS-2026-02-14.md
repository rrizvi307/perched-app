# Evidence Excerpts (2026-02-14)

All excerpts below are verbatim command output with line numbers.

## QA Ledger Sections

### Baseline report
- Exact command used:
  `nl -ba docs/QA-BUG-LEDGER-2026-02-14.md | sed -n '3,20p'`
- Exact line range: `3-20`
- Summary: This shows the baseline stack, run commands, and baseline-failures statement.

```text
     3	## Baseline report
     4	
     5	### Stack detected
     6	- Expo SDK 54 + React Native 0.81 + Expo Router 6
     7	- Firebase client (`firebase`) + Firebase Functions (Node 22)
     8	- TypeScript + ESLint + Jest (app + functions)
     9	
    10	### How to run
    11	- Dev: `CI=1 npm run start -- --clear`
    12	- Typecheck: `npx tsc --noEmit`
    13	- Lint: `npm run lint`
    14	- Unit tests: `npm test -- --runInBand`
    15	- App build check: `npx expo export --platform ios --clear --output-dir .expo-export`
    16	- Functions build: `npm --prefix functions run build`
    17	- Functions tests: `npm --prefix functions test -- --runInBand`
    18	
    19	### Baseline failing commands
    20	- None. All baseline commands passed.
```

### QA walkthrough script
- Exact command used:
  `nl -ba docs/QA-BUG-LEDGER-2026-02-14.md | sed -n '22,30p'`
- Exact line range: `22-30`
- Summary: This is the executed manual QA script checklist.

```text
    22	## QA walkthrough script
    23	
    24	1. Launch app (`CI=1 npm run start -- --clear`).
    25	2. Validate auth-gated feed behavior (no crash with empty/unauth state).
    26	3. Validate public feed subscription fallback behavior when Firestore indexes are missing.
    27	4. Validate explore spot loading fallback path when remote returns empty.
    28	5. Validate telemetry path does not spam hard errors on permission-denied environments.
    29	6. Re-run full checks (`npm run check:all`).
    30	
```

### Issue 1 excerpt
- Exact command used:
  `nl -ba docs/QA-BUG-LEDGER-2026-02-14.md | sed -n '33,48p'`
- Exact line range: `33-48`
- Summary: Duplicate legacy feed listener attachment bug and fix details.

```text
    33	### 1) Duplicate legacy subscriptions in feed listeners
    34	- Steps to reproduce:
    35	  1. Trigger `subscribeCheckins` / `subscribeCheckinsForUsers` with empty primary snapshots.
    36	  2. Keep stream active while primary callback fires again.
    37	- Expected:
    38	  - One legacy listener per stream/batch.
    39	- Actual:
    40	  - Legacy listener could be attached repeatedly, causing duplicate updates and churn.
    41	- Root cause:
    42	  - Legacy `onSnapshot` attachment happened inside callbacks without a guard.
    43	- Fix implemented:
    44	  - Added guarded `startLegacySubscription()` + shared unordered fallback in both subscription paths.
    45	  - File: `services/firebaseClient.ts`
    46	- Regression test:
    47	  - Not added for this exact listener lifecycle (requires heavier Firestore listener harness); fallback logic remains covered by existing integration/query tests.
    48	
```

### Issue 2 excerpt
- Exact command used:
  `nl -ba docs/QA-BUG-LEDGER-2026-02-14.md | sed -n '49,64p'`
- Exact line range: `49-64`
- Summary: Telemetry permission-denied error classification bug and fix details.

```text
    49	### 2) Telemetry permission-denied noise treated as hard error
    50	- Steps to reproduce:
    51	  1. Run app in environment where writes to `performanceMetrics` are denied.
    52	  2. Observe repeated `Error persisting metrics to Firestore` logging.
    53	- Expected:
    54	  - Permission-denied should be recognized and downgraded to one-time warning.
    55	- Actual:
    56	  - Some error variants were not matched by strict code check and logged as hard errors.
    57	- Root cause:
    58	  - Error matching only checked exact `code === 'permission-denied'`.
    59	- Fix implemented:
    60	  - Added shared permission matcher handling `permission-denied`, `firestore/permission-denied`, code variants, and message fallback.
    61	  - File: `services/permissionErrors.ts`
    62	  - Wired into `services/perfMonitor.ts`
    63	- Regression test:
    64	  - Added: `services/__tests__/perfMonitor.test.ts`
```

### Issue 3 excerpt
- Exact command used:
  `nl -ba docs/QA-BUG-LEDGER-2026-02-14.md | sed -n '66,81p'`
- Exact line range: `66-81`
- Summary: Cursor fallback behavior bug and fix details.

```text
    66	### 3) Legacy cursor pagination fragility in checkin fetches
    67	- Steps to reproduce:
    68	  1. Query data where legacy `timestamp` exists but `createdAt` is missing.
    69	  2. Use returned cursor for pagination.
    70	- Expected:
    71	  - Cursor should advance using available sort field.
    72	- Actual:
    73	  - Cursor could be `null` if only `timestamp` existed.
    74	- Root cause:
    75	  - Cursor derivation used `createdAt` only.
    76	- Fix implemented:
    77	  - Cursor now resolves from `createdAt ?? timestamp`.
    78	  - Also sorted unordered fallback payloads by newest timestamp.
    79	  - File: `services/firebaseClient.ts`
    80	- Regression test:
    81	  - Covered indirectly by existing schema fallback tests; no new dedicated cursor test added.
```

### Emulator notes excerpt
- Exact command used:
  `nl -ba docs/QA-BUG-LEDGER-2026-02-14.md | sed -n '92,107p'`
- Exact line range: `92-107`
- Summary: iOS run result and Android **NOT VERIFIED** status.

```text
    92	## Emulator QA rerun (2026-02-14)
    93	
    94	### iOS simulator
    95	- Command: `npm run ios`
    96	- Result:
    97	  - First attempt failed due CocoaPods CDN/source setup.
    98	  - Fixed by configuring CocoaPods CDN repo, then reran with elevated permissions (required for `~/.cocoapods` writes in this environment).
    99	  - Build + install succeeded on simulator (`iPhone 16e`), app launched.
   100	
   101	### Android emulator
   102	- Command: `npm run android`
   103	- Result:
   104	  - **NOT VERIFIED** in this environment due missing local Android SDK/ADB (`ANDROID_HOME` unset, `adb ENOENT`).
   105	  - No Android UI/flow assertions are claimed in this report.
   106	
   107	### Additional defects found during simulator run
```

### Issue 4 excerpt
- Exact command used:
  `nl -ba docs/QA-BUG-LEDGER-2026-02-14.md | sed -n '109,123p'`
- Exact line range: `109-123`
- Summary: Dev-client deep-link warning bug and fix details.

```text
   109	### 4) Dev client deep-link noise (`Invalid deep link`)
   110	- Steps to reproduce:
   111	  1. Launch iOS dev client via `npm run ios`.
   112	  2. Observe incoming URL `app.perched://expo-development-client/?url=...`.
   113	- Expected:
   114	  - Dev client bootstrap URLs should be ignored silently.
   115	- Actual:
   116	  - App logged `Invalid deep link` warning.
   117	- Root cause:
   118	  - Deep link handler attempted to parse Expo dev-client bootstrap URLs as app routes.
   119	- Fix implemented:
   120	  - Added dev-link guard and short-circuit handling.
   121	  - Files: `services/deepLinkGuards.ts`, `services/deepLinking.ts`
   122	- Regression test:
   123	  - Added: `services/__tests__/deepLinkGuards.test.ts`
```

### Issue 5 excerpt
- Exact command used:
  `nl -ba docs/QA-BUG-LEDGER-2026-02-14.md | sed -n '125,139p'`
- Exact line range: `125-139`
- Summary: Require-cycle warning root cause and fix details.

```text
   125	### 5) Runtime require cycle warning (`firebaseClient -> perfMonitor -> firebaseClient`)
   126	- Steps to reproduce:
   127	  1. Launch iOS dev client.
   128	  2. Observe metro warning about require cycle.
   129	- Expected:
   130	  - No top-level circular import between telemetry and firebase client modules.
   131	- Actual:
   132	  - Cycle warning shown in runtime logs.
   133	- Root cause:
   134	  - `perfMonitor` imported `ensureFirebase` at module load, while `firebaseClient` imports telemetry.
   135	- Fix implemented:
   136	  - Replaced top-level import with lazy dynamic import inside `persistMetricsToFirestore`.
   137	  - File: `services/perfMonitor.ts`
   138	- Regression test:
   139	  - Not added for this runtime module-load warning (integration-level behavior); smoke-verified via simulator relaunch logs.
```

### Issue 6 excerpt
- Exact command used:
  `nl -ba docs/QA-BUG-LEDGER-2026-02-14.md | sed -n '141,156p'`
- Exact line range: `141-156`
- Summary: Duplicate notification setup side-effects bug and fix details.

```text
   141	### 6) Duplicate notification setup side effects on app boot
   142	- Steps to reproduce:
   143	  1. Launch iOS dev client.
   144	  2. Observe repeated analytics events for `push_notification_enabled` / `notification_scheduled`.
   145	- Expected:
   146	  - Notification setup should run once per authenticated user session.
   147	- Actual:
   148	  - Setup side effects could re-run as `user` object identity changed, producing duplicate calls/logs.
   149	- Root cause:
   150	  - `_layout` notification effect depended on full `user` object and lacked idempotence guard.
   151	- Fix implemented:
   152	  - Scoped effect dependency to `user?.id`.
   153	  - Added `notificationsInitializedForUser` guard to prevent duplicate setup per user id.
   154	  - File: `app/_layout.tsx`
   155	- Regression test:
   156	  - Not added (behavior depends on app lifecycle/auth object churn); smoke-verified via simulator relaunch.
```

### Issue 7 excerpt
- Exact command used:
  `nl -ba docs/QA-BUG-LEDGER-2026-02-14.md | sed -n '158,172p'`
- Exact line range: `158-172`
- Summary: Missing-index user-checkins empty fallback bug and fix details.

```text
   158	### 7) User checkins path returned empty on missing composite index
   159	- Steps to reproduce:
   160	  1. Launch iOS simulator and sign in.
   161	  2. Observe log: `getCheckinsForUserRemote query fallback to empty` with Firestore index error.
   162	- Expected:
   163	  - Missing user-checkins index should degrade to unordered user query, not empty response.
   164	- Actual:
   165	  - Catch block returned `{ items: [], lastCursor: null }` immediately.
   166	- Root cause:
   167	  - `getCheckinsForUserRemote` catch path treated index failures as hard empty fallback.
   168	- Fix implemented:
   169	  - Added unordered fallback query (`where('userId','==', userId).limit(limit)`), then local sort + cursor derivation.
   170	  - File: `services/firebaseClient.ts`
   171	- Regression test:
   172	  - Not added (requires firebase client mocking harness); covered by simulator smoke run and existing schema fallback tests.
```

### Final verification excerpt
- Exact command used:
  `nl -ba docs/QA-BUG-LEDGER-2026-02-14.md | sed -n '174,183p'`
- Exact line range: `174-183`
- Summary: Final pass list captured in the QA ledger.

```text
   174	## Verification (post-fix)
   175	
   176	Passed:
   177	- `npx tsc --noEmit`
   178	- `npm run lint`
   179	- `npm test -- --runInBand` (248/248)
   180	- `npx expo export --platform ios --clear --output-dir .expo-export`
   181	- `npm --prefix functions run build`
   182	- `npm --prefix functions test -- --runInBand` (40/40)
   183	- `npm run check:all`
```

## CI Verify Excerpt

### CI output file excerpt
- Exact command used:
  `nl -ba docs/CI-VERIFY-2026-02-14.txt | sed -n '1,140p'`
- Exact line range: `1-140`
- Summary: This captures all requested command invocations and terminal outputs.

```text
     1	# CI Verification Log (2026-02-14)
     2	
     3	$ CI=1 npm run start -- --clear
     4	
     5	> perched-app@1.0.0 start
     6	> expo start --clear
     7	
     8	env: load .env.local
     9	env: export GOOGLE_MAPS_API_KEY FIREBASE_API_KEY FIREBASE_AUTH_DOMAIN FIREBASE_PROJECT_ID FIREBASE_STORAGE_BUCKET FIREBASE_MESSAGING_SENDER_ID FIREBASE_APP_ID FIREBASE_MEASUREMENT_ID OPENAI_API_KEY YELP_API_KEY FOURSQUARE_API_KEY INTEL_V1_ENABLED
    10	Starting project at /Users/rehanrizvi/perched-app
    11	
    12	$ npx tsc --noEmit
    13	
    14	$ npm run lint
    15	
    16	> perched-app@1.0.0 lint
    17	> expo lint
    18	
    19	env: load .env.local
    20	env: export GOOGLE_MAPS_API_KEY FIREBASE_API_KEY FIREBASE_AUTH_DOMAIN FIREBASE_PROJECT_ID FIREBASE_STORAGE_BUCKET FIREBASE_MESSAGING_SENDER_ID FIREBASE_APP_ID FIREBASE_MEASUREMENT_ID OPENAI_API_KEY YELP_API_KEY FOURSQUARE_API_KEY INTEL_V1_ENABLED
    21	
    22	$ npm test -- --runInBand
    23	
    24	> perched-app@1.0.0 test
    25	> jest --runInBand
    26	
    27	
    28	$ npx expo export --platform ios --clear --output-dir .expo-export
    29	env: load .env.local
    30	env: export GOOGLE_MAPS_API_KEY FIREBASE_API_KEY FIREBASE_AUTH_DOMAIN FIREBASE_PROJECT_ID FIREBASE_STORAGE_BUCKET FIREBASE_MESSAGING_SENDER_ID FIREBASE_APP_ID FIREBASE_MEASUREMENT_ID OPENAI_API_KEY YELP_API_KEY FOURSQUARE_API_KEY INTEL_V1_ENABLED
    31	Starting Metro Bundler
    32	iOS node_modules/expo-router/entry.js ▓▓▓▓▓▓▓▓▓░░░░░░░ 58.5% ( 819/1071)
    33	iOS node_modules/expo-router/entry.js ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░ 99.9% (3165/3165)
    34	iOS Bundled 5724ms node_modules/expo-router/entry.js (3165 modules)
    35	iOS node_modules/expo-router/entry.js ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░ 99.9% (3165/3165)
    36	
    37	› Assets (26):
    38	node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome5_Brands.ttf (134 kB)
    39	node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome5_Regular.ttf (33.7 kB)
    40	node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome5_Solid.ttf (203 kB)
    41	node_modules/@react-navigation/elements/lib/module/assets/back-icon-mask.png (653 B)
    42	node_modules/@react-navigation/elements/lib/module/assets/back-icon.png (4 variations | 566 B)
    43	node_modules/@react-navigation/elements/lib/module/assets/clear-icon.png (4 variations | 425 B)
    44	node_modules/@react-navigation/elements/lib/module/assets/close-icon.png (4 variations | 235 B)
    45	node_modules/@react-navigation/elements/lib/module/assets/search-icon.png (3 variations | 582 B)
    46	node_modules/expo-router/assets/arrow_down.png (9.46 kB)
    47	node_modules/expo-router/assets/error.png (469 B)
    48	node_modules/expo-router/assets/file.png (138 B)
    49	node_modules/expo-router/assets/forward.png (188 B)
    50	node_modules/expo-router/assets/pkg.png (364 B)
    51	node_modules/expo-router/assets/sitemap.png (465 B)
    52	node_modules/expo-router/assets/unmatched.png (4.75 kB)
    53	
    54	› ios bundles (1):
    55	_expo/static/js/ios/entry-7cd5292acb9fb5c5df1eb20c39011fa6.hbc (10.7 MB)
    56	
    57	› Files (1):
    58	metadata.json (1.97 kB)
    59	
    60	Exported: .expo-export
    61	
    62	$ npm --prefix functions run build
    63	
    64	> build
    65	> tsc
    66	
    67	
    68	$ npm --prefix functions test -- --runInBand
    69	
    70	> test
    71	> jest --runInBand --runInBand
    72	
    73	
    74	$ npm run check:all
    75	
    76	> perched-app@1.0.0 check:all
    77	> npm run check:app && npm --prefix functions run build && npm --prefix functions test -- --runInBand
    78	
    79	
    80	> perched-app@1.0.0 check:app
    81	> npm run typecheck && npm run lint && npm test -- --runInBand && npm run build:ios:export
    82	
    83	
    84	> perched-app@1.0.0 typecheck
    85	> tsc --noEmit
    86	
    87	
    88	> perched-app@1.0.0 lint
    89	> expo lint
    90	
    91	env: load .env.local
    92	env: export GOOGLE_MAPS_API_KEY FIREBASE_API_KEY FIREBASE_AUTH_DOMAIN FIREBASE_PROJECT_ID FIREBASE_STORAGE_BUCKET FIREBASE_MESSAGING_SENDER_ID FIREBASE_APP_ID FIREBASE_MEASUREMENT_ID OPENAI_API_KEY YELP_API_KEY FOURSQUARE_API_KEY INTEL_V1_ENABLED
    93	
    94	> perched-app@1.0.0 test
    95	> jest --runInBand
    96	
    97	
    98	> perched-app@1.0.0 build:ios:export
    99	> expo export --platform ios --clear --output-dir .expo-export
   100	
   101	env: load .env.local
   102	env: export GOOGLE_MAPS_API_KEY FIREBASE_API_KEY FIREBASE_AUTH_DOMAIN FIREBASE_PROJECT_ID FIREBASE_STORAGE_BUCKET FIREBASE_MESSAGING_SENDER_ID FIREBASE_APP_ID FIREBASE_MEASUREMENT_ID OPENAI_API_KEY YELP_API_KEY FOURSQUARE_API_KEY INTEL_V1_ENABLED
   103	Starting Metro Bundler
   104	iOS node_modules/expo-router/entry.js ▓▓▓▓▓▓▓▓▓▓▓▓░░░░ 78.7% (2290/2590)
   105	iOS node_modules/expo-router/entry.js ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░ 99.9% (3165/3165)
   106	iOS Bundled 5920ms node_modules/expo-router/entry.js (3165 modules)
   107	iOS node_modules/expo-router/entry.js ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░ 99.9% (3165/3165)
   108	
   109	› Assets (26):
   110	node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome5_Brands.ttf (134 kB)
   111	node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome5_Regular.ttf (33.7 kB)
   112	node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome5_Solid.ttf (203 kB)
   113	node_modules/@react-navigation/elements/lib/module/assets/back-icon-mask.png (653 B)
   114	node_modules/@react-navigation/elements/lib/module/assets/back-icon.png (4 variations | 566 B)
   115	node_modules/@react-navigation/elements/lib/module/assets/clear-icon.png (4 variations | 425 B)
   116	node_modules/@react-navigation/elements/lib/module/assets/close-icon.png (4 variations | 235 B)
   117	node_modules/@react-navigation/elements/lib/module/assets/search-icon.png (3 variations | 582 B)
   118	node_modules/expo-router/assets/arrow_down.png (9.46 kB)
   119	node_modules/expo-router/assets/error.png (469 B)
   120	node_modules/expo-router/assets/file.png (138 B)
   121	node_modules/expo-router/assets/forward.png (188 B)
   122	node_modules/expo-router/assets/pkg.png (364 B)
   123	node_modules/expo-router/assets/sitemap.png (465 B)
   124	node_modules/expo-router/assets/unmatched.png (4.75 kB)
   125	
   126	› ios bundles (1):
   127	_expo/static/js/ios/entry-7cd5292acb9fb5c5df1eb20c39011fa6.hbc (10.7 MB)
   128	
   129	› Files (1):
   130	metadata.json (1.97 kB)
   131	
   132	Exported: .expo-export
   133	
   134	> build
   135	> tsc
   136	
   137	
   138	> test
   139	> jest --runInBand --runInBand
   140	
```

## README Verify Section Excerpt

### README "How To Verify"
- Exact command used:
  `nl -ba README.md | sed -n '66,76p'`
- Exact line range: `66-76`
- Summary: README now points to `npm run check:all` and the CI verification file.

```text
    66	## How To Verify
    67	
    68	1. Run the full gate:
    69	
    70	```bash
    71	npm run check:all
    72	```
    73	
    74	2. Review the captured verification transcript:
    75	
    76	- `docs/CI-VERIFY-2026-02-14.txt`
```

## Code-Location Proof Excerpts

### services/firebaseClient.ts — `getCheckinsRemote` fallback + cursor
- Exact command used:
  `nl -ba services/firebaseClient.ts | sed -n '862,925p'`
- Exact line range: `862-925`
- Summary: Shows unordered fallback sorting and `lastCursor` derived from `createdAt ?? timestamp`.

```text
   862	export async function getCheckinsRemote(limit = 50, startAfter?: any) {
   863	  return withErrorBoundary('firebase_get_checkins_remote', async () => {
   864	    const startedAt = Date.now();
   865	    const fb = ensureFirebase();
   866	    if (!fb) throw new Error('Firebase not initialized.');
   867	    if (!fb.auth()?.currentUser?.uid) {
   868	      return { items: [], lastCursor: null };
   869	    }
   870	    const cacheKey = `${limit}:${cursorKey(startAfter)}`;
   871	    const cached = getCachedValue(checkinsCache, cacheKey, 10000);
   872	    if (cached) {
   873	      void recordPerfMetric('firebase_get_checkins_remote_cache_hit', Date.now() - startedAt, true);
   874	      return cached;
   875	    }
   876	
   877	    const db = fb.firestore();
   878	
   879	    // Query public feed only so collection reads satisfy Firestore query rules.
   880	    let snapshot: any;
   881	    try {
   882	      let q: any = db
   883	        .collection('checkins')
   884	        .where('visibility', '==', 'public')
   885	        .orderBy('createdAt', 'desc')
   886	        .limit(limit);
   887	      if (startAfter) q = q.startAfter(startAfter);
   888	      snapshot = await q.get();
   889	    } catch {
   890	      // Legacy timestamp fallback
   891	      try {
   892	        let legacyQ: any = db
   893	          .collection('checkins')
   894	          .where('visibility', '==', 'public')
   895	          .orderBy('timestamp', 'desc')
   896	          .limit(limit);
   897	        if (startAfter) legacyQ = legacyQ.startAfter(startAfter);
   898	        snapshot = await legacyQ.get();
   899	      } catch {
   900	        // Both indexes missing — fall back to unordered query (can't paginate)
   901	        snapshot = await db
   902	          .collection('checkins')
   903	          .where('visibility', '==', 'public')
   904	          .limit(limit)
   905	          .get();
   906	        const items: any[] = [];
   907	        snapshot.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
   908	        items.sort((a, b) => toMillisSafe(b.createdAt || b.timestamp) - toMillisSafe(a.createdAt || a.timestamp));
   909	        const payload = { items, lastCursor: null };
   910	        setCachedValue(checkinsCache, cacheKey, payload, CHECKINS_CACHE_MAX);
   911	        return payload;
   912	      }
   913	    }
   914	    const items: any[] = [];
   915	    snapshot.forEach((doc: any) => {
   916	      items.push({ id: doc.id, ...(doc.data() || {}) });
   917	    });
   918	
   919	    const lastCursor = items.length
   920	      ? (items[items.length - 1].createdAt ?? items[items.length - 1].timestamp ?? null)
   921	      : null;
   922	    const payload = { items, lastCursor };
   923	    setCachedValue(checkinsCache, cacheKey, payload, CHECKINS_CACHE_MAX);
   924	    return payload;
   925	  }, { items: [], lastCursor: null });
```

### services/firebaseClient.ts — `getCheckinsForUserRemote` index fallback
- Exact command used:
  `nl -ba services/firebaseClient.ts | sed -n '928,980p'`
- Exact line range: `928-980`
- Summary: Shows index-failure fallback to unordered `where('userId','==', userId)` query with sort/cursor.

```text
   928	export async function getCheckinsForUserRemote(userId: string, limit = 80, startAfter?: any) {
   929	  return withErrorBoundary('firebase_get_checkins_for_user', async () => {
   930	    const startedAt = Date.now();
   931	    const fb = ensureFirebase();
   932	    if (!fb) throw new Error('Firebase not initialized.');
   933	    if (!userId) return { items: [], lastCursor: null };
   934	    const cacheKey = `user:${userId}:${limit}:${cursorKey(startAfter)}`;
   935	    const cached = getCachedValue(checkinsCache, cacheKey, 10000);
   936	    if (cached) {
   937	      void recordPerfMetric('firebase_get_checkins_for_user_cache_hit', Date.now() - startedAt, true);
   938	      return cached;
   939	    }
   940	
   941	    const db = fb.firestore();
   942	
   943	    // Use schema helper with automatic fallback for legacy data.
   944	    // If query fails (permissions/index/network/auth timing), degrade to empty state.
   945	    let snapshot: any;
   946	    try {
   947	      snapshot = await queryCheckinsByUser(db, fb, userId, { limit, startAfter });
   948	    } catch (error) {
   949	      devLog('getCheckinsForUserRemote index fallback to unordered query', error);
   950	      try {
   951	        const fallbackSnapshot = await db
   952	          .collection('checkins')
   953	          .where('userId', '==', userId)
   954	          .limit(limit)
   955	          .get();
   956	        const fallbackItems: any[] = [];
   957	        fallbackSnapshot.forEach((doc: any) => fallbackItems.push({ id: doc.id, ...(doc.data() || {}) }));
   958	        fallbackItems.sort((a, b) => toMillisSafe(b.createdAt || b.timestamp) - toMillisSafe(a.createdAt || a.timestamp));
   959	        const fallbackCursor = fallbackItems.length
   960	          ? (fallbackItems[fallbackItems.length - 1].createdAt ?? fallbackItems[fallbackItems.length - 1].timestamp ?? null)
   961	          : null;
   962	        const fallbackPayload = { items: fallbackItems, lastCursor: fallbackCursor };
   963	        setCachedValue(checkinsCache, cacheKey, fallbackPayload, CHECKINS_CACHE_MAX);
   964	        return fallbackPayload;
   965	      } catch (unorderedError) {
   966	        devLog('getCheckinsForUserRemote unordered fallback to empty', unorderedError);
   967	        return { items: [], lastCursor: null };
   968	      }
   969	    }
   970	    const items: any[] = [];
   971	    snapshot.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
   972	    items.sort((a, b) => toMillisSafe(b.createdAt || b.timestamp) - toMillisSafe(a.createdAt || a.timestamp));
   973	    const lastCursor = items.length
   974	      ? (items[items.length - 1].createdAt ?? items[items.length - 1].timestamp ?? null)
   975	      : null;
   976	    const payload = { items, lastCursor };
   977	    setCachedValue(checkinsCache, cacheKey, payload, CHECKINS_CACHE_MAX);
   978	    return payload;
   979	  }, { items: [], lastCursor: null });
   980	}
```

### services/firebaseClient.ts — `subscribeCheckins` legacy guard
- Exact command used:
  `nl -ba services/firebaseClient.ts | sed -n '1059,1132p'`
- Exact line range: `1059-1132`
- Summary: Shows `startLegacySubscription` guard and shared unordered fallback in stream subscription.

```text
  1059	export function subscribeCheckins(onUpdate: (items: any[]) => void, limit = 40) {
  1060	  const fb = ensureFirebase();
  1061	  if (!fb) return () => {};
  1062	  if (!fb.auth()?.currentUser?.uid) return () => {};
  1063	
  1064	  const db = fb.firestore();
  1065	
  1066	  // Try primary schema first (createdAt)
  1067	  let primaryUnsub: (() => void) | null = null;
  1068	  let legacyUnsub: (() => void) | null = null;
  1069	  let settled = false;
  1070	
  1071	  const runUnorderedFallback = () => {
  1072	    db.collection('checkins')
  1073	      .where('visibility', '==', 'public')
  1074	      .limit(limit)
  1075	      .get()
  1076	      .then((snap: any) => {
  1077	        const items: any[] = [];
  1078	        snap.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
  1079	        items.sort((a, b) => toMillisSafe(b.createdAt || b.timestamp) - toMillisSafe(a.createdAt || a.timestamp));
  1080	        onUpdate(items);
  1081	      })
  1082	      .catch(() => onUpdate([]));
  1083	  };
  1084	
  1085	  const startLegacySubscription = () => {
  1086	    if (legacyUnsub) return;
  1087	    const legacyQuery = db
  1088	      .collection('checkins')
  1089	      .where('visibility', '==', 'public')
  1090	      .orderBy('timestamp', 'desc')
  1091	      .limit(limit);
  1092	    legacyUnsub = registerSubscription(legacyQuery.onSnapshot((legacySnapshot: any) => {
  1093	      const items: any[] = [];
  1094	      legacySnapshot.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
  1095	      onUpdate(items);
  1096	    }, runUnorderedFallback));
  1097	  };
  1098	
  1099	  const primaryQuery = db
  1100	    .collection('checkins')
  1101	    .where('visibility', '==', 'public')
  1102	    .orderBy('createdAt', 'desc')
  1103	    .limit(limit);
  1104	  primaryUnsub = registerSubscription(primaryQuery.onSnapshot((snapshot: any) => {
  1105	    if (settled) return;
  1106	    if (!snapshot.empty) {
  1107	      const items: any[] = [];
  1108	      snapshot.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
  1109	      onUpdate(items);
  1110	
  1111	      // Clean up legacy subscription if it exists
  1112	      if (legacyUnsub) {
  1113	        legacyUnsub();
  1114	        legacyUnsub = null;
  1115	      }
  1116	    } else {
  1117	      // No results, try legacy schema (timestamp)
  1118	      startLegacySubscription();
  1119	    }
  1120	  }, () => {
  1121	    if (settled) return;
  1122	    settled = true;
  1123	    // Index missing — try legacy
  1124	    startLegacySubscription();
  1125	  }));
  1126	
  1127	  // Return combined unsubscribe function
  1128	  return () => {
  1129	    if (primaryUnsub) primaryUnsub();
  1130	    if (legacyUnsub) legacyUnsub();
  1131	  };
  1132	}
```

### services/firebaseClient.ts — `subscribeCheckinsForUsers` legacy guard
- Exact command used:
  `nl -ba services/firebaseClient.ts | sed -n '1244,1294p'`
- Exact line range: `1244-1294`
- Summary: Shows guarded per-batch legacy subscription and unordered fallback path.

```text
  1244	    // Try primary schema first (createdAt)
  1245	    const primaryQuery = db.collection('checkins').where('userId', 'in', batch).orderBy('createdAt', 'desc').limit(limit);
  1246	    let legacyUnsub: (() => void) | null = null;
  1247	
  1248	    const runUnorderedFallback = () => {
  1249	      db.collection('checkins').where('userId', 'in', batch).limit(limit).get()
  1250	        .then((snap: any) => {
  1251	          const items: any[] = [];
  1252	          snap.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
  1253	          items.sort((a, b) => toMillisSafe(b.createdAt || b.timestamp) - toMillisSafe(a.createdAt || a.timestamp));
  1254	          snapshotsByBatch.set(batchIndex, items);
  1255	          scheduleFlush();
  1256	        })
  1257	        .catch(() => {
  1258	          snapshotsByBatch.set(batchIndex, []);
  1259	          scheduleFlush();
  1260	        });
  1261	    };
  1262	
  1263	    const startLegacySubscription = () => {
  1264	      if (legacyUnsub) return;
  1265	      const legacyQuery = db.collection('checkins').where('userId', 'in', batch).orderBy('timestamp', 'desc').limit(limit);
  1266	      legacyUnsub = registerSubscription(legacyQuery.onSnapshot((legacySnapshot: any) => {
  1267	        const items: any[] = [];
  1268	        legacySnapshot.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
  1269	        snapshotsByBatch.set(batchIndex, items);
  1270	        scheduleFlush();
  1271	      }, runUnorderedFallback));
  1272	    };
  1273	
  1274	    const primaryUnsub = registerSubscription(primaryQuery.onSnapshot((snapshot: any) => {
  1275	      if (!snapshot.empty) {
  1276	        // Primary schema has data, use it
  1277	        const items: any[] = [];
  1278	        snapshot.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
  1279	        snapshotsByBatch.set(batchIndex, items);
  1280	        scheduleFlush();
  1281	
  1282	        // Clean up legacy subscription if it exists
  1283	        if (legacyUnsub) {
  1284	          legacyUnsub();
  1285	          legacyUnsub = null;
  1286	        }
  1287	      } else {
  1288	        // No results from primary, try legacy schema (timestamp)
  1289	        startLegacySubscription();
  1290	      }
  1291	    }, () => {
  1292	      // Index error on primary — fall back to legacy subscription
  1293	      startLegacySubscription();
  1294	    }));
```

### services/perfMonitor.ts — `persistMetricsToFirestore` lazy import + permission handling
- Exact command used:
  `nl -ba services/perfMonitor.ts | sed -n '203,275p'`
- Exact line range: `203-275`
- Summary: Shows lazy `import('./firebaseClient')` and permission-denied classification guard.

```text
   203	async function persistMetricsToFirestore(): Promise<void> {
   204	  try {
   205	    // Disabled by default. Client-side telemetry persistence can generate noisy permission errors
   206	    // unless rules explicitly allow this collection (recommended only for controlled diagnostics).
   207	    if (!isPerfFirestorePersistenceEnabled()) return;
   208	
   209	    const { ensureFirebase } = await import('./firebaseClient');
   210	    const fb = await ensureFirebase();
   211	    if (!fb) {
   212	      console.warn('Firebase not available, skipping metrics persistence');
   213	      return;
   214	    }
   215	
   216	    const authUid = fb.auth?.()?.currentUser?.uid;
   217	    if (!authUid) return;
   218	
   219	    const db = fb.firestore();
   220	    const now = Date.now();
   221	
   222	    // Get metrics snapshot
   223	    await ensureHydrated();
   224	    const entries = Object.entries(store);
   225	
   226	    if (entries.length === 0) {
   227	      return; // Nothing to persist
   228	    }
   229	
   230	    // Batch write metrics to Firestore (max 20 per batch to avoid quota issues)
   231	    const batches: typeof entries[] = [];
   232	    for (let i = 0; i < entries.length; i += FIRESTORE_BATCH_SIZE) {
   233	      batches.push(entries.slice(i, i + FIRESTORE_BATCH_SIZE));
   234	    }
   235	
   236	    for (const batch of batches) {
   237	      const writes = batch.map(async ([name, value]) => {
   238	        const samples = value.samples || [];
   239	        const count = value.count || 0;
   240	        const metricDoc = {
   241	          operation: name,
   242	          count,
   243	          errorCount: value.errorCount || 0,
   244	          errorRate: count > 0 ? (value.errorCount || 0) / count : 0,
   245	          avgMs: count > 0 ? value.totalMs / count : 0,
   246	          p50: computeP50(samples),
   247	          p95: computeP95(samples),
   248	          p99: computeP99(samples),
   249	          maxMs: value.maxMs || 0,
   250	          lastMs: value.lastMs || 0,
   251	          timestamp: now,
   252	          updatedAt: value.updatedAt || now,
   253	        };
   254	
   255	        // Add to performanceMetrics collection
   256	        await db.collection('performanceMetrics').add(metricDoc);
   257	      });
   258	
   259	      await Promise.all(writes);
   260	    }
   261	
   262	    lastFirestorePersist = now;
   263	    console.log(`Persisted ${entries.length} performance metrics to Firestore`);
   264	  } catch (error: any) {
   265	    if (isPermissionDeniedError(error)) {
   266	      if (!perfFirestorePermissionWarned) {
   267	        perfFirestorePermissionWarned = true;
   268	        console.warn('Skipping performanceMetrics Firestore persistence: permission denied');
   269	      }
   270	      return;
   271	    }
   272	    console.error('Error persisting metrics to Firestore:', error);
   273	    // Don't throw - telemetry failures should not break the app
   274	  }
   275	}
```

### services/deepLinkGuards.ts — `isExpoDevClientLink`
- Exact command used:
  `nl -ba services/deepLinkGuards.ts | sed -n '1,8p'`
- Exact line range: `1-8`
- Summary: Defines explicit guard for Expo dev links.

```text
     1	export function isExpoDevClientLink(url: string) {
     2	  if (!url) return false;
     3	  return (
     4	    url.startsWith('exp://') ||
     5	    url.includes('expo-development-client') ||
     6	    url.includes('expo-go')
     7	  );
     8	}
```

### services/deepLinking.ts — `handleDeepLink` dev-link short-circuit
- Exact command used:
  `nl -ba services/deepLinking.ts | sed -n '144,157p'`
- Exact line range: `144-157`
- Summary: Shows early return when link is a dev-client bootstrap URL.

```text
   144	/**
   145	 * Handle a deep link by navigating to the appropriate screen
   146	 */
   147	export function handleDeepLink(url: string) {
   148	  try {
   149	    if (isExpoDevClientLink(url)) {
   150	      return true;
   151	    }
   152	
   153	    const result = parseDeepLink(url);
   154	    if (!result || !result.route) {
   155	      console.warn('Invalid deep link:', url);
   156	      return false;
   157	    }
```

### app/_layout.tsx — notification idempotence guard
- Exact command used:
  `nl -ba app/_layout.tsx | sed -n '144,173p'`
- Exact line range: `144-173`
- Summary: Shows per-user notification init guard and failure reset behavior.

```text
   144	  useEffect(() => {
   145	    const userId = user?.id;
   146	    if (!userId || isDemoMode()) return;
   147	    const runSync = async () => {
   148	      try {
   149	        const res = await syncPendingCheckins(5);
   150	        if (res.synced > 0) {
   151	          showToast(`Synced ${res.synced} check-in${res.synced === 1 ? '' : 's'}.`, 'success');
   152	        }
   153	        await syncPendingProfileUpdates(5);
   154	      } catch {}
   155	    };
   156	
   157	    // Initialize push notifications
   158	    const setupNotifications = async () => {
   159	      try {
   160	        if (notificationsInitializedForUser.current === userId) return;
   161	        notificationsInitializedForUser.current = userId;
   162	
   163	        const token = await initPushNotifications();
   164	        if (token) {
   165	          // Save token to Firebase for Cloud Function notifications
   166	          await savePushToken(userId, token);
   167	        }
   168	        // Schedule weekly recap
   169	        await scheduleWeeklyRecap();
   170	      } catch (error) {
   171	        notificationsInitializedForUser.current = null;
   172	        console.error('Failed to setup notifications:', error);
   173	      }
```

### app/_layout.tsx — effect dependency narrowed to `user?.id`
- Exact command used:
  `nl -ba app/_layout.tsx | sed -n '207,214p'`
- Exact line range: `207-214`
- Summary: Confirms effect dependency is `user?.id`, avoiding repeated setup due to object identity churn.

```text
   207	      return () => {
   208	        initialTask?.cancel?.();
   209	        sub.remove();
   210	        notificationSubscription.remove();
   211	      };
   212	    }
   213	  }, [showToast, user?.id]);
   214	
```
