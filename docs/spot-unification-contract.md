# Spot Unification Contract Spec

> Claude Opus 4.6 deliverable — canonical contracts, precedence rules,
> acceptance matrix, and signoff checklist for the spot data pipeline
> stabilization described in the parallel AI work plan.

---

## 1. Canonical Contracts

### 1.1 CanonicalPlace

Single, immutable identity for a place. Every screen that shows a place
must ultimately resolve to one of these. Google Places is the sole
canonical provider.

```typescript
/**
 * Immutable place identity.  Constructed once when a place is first
 * encountered (via search, nearby, check-in, or spots doc) and never
 * mutated except to backfill missing fields on legacy records.
 */
export type CanonicalPlace = {
  /** Google Places placeId — primary key */
  placeId: string;
  /** User-facing name exactly as returned by Google */
  name: string;
  /** Full formatted address */
  address: string;
  /** Canonical coordinates */
  location: { lat: number; lng: number };
  /** Always 'google' — locks canonical source */
  provider: 'google';
};
```

**Invariants:**
- `placeId` is never empty on any object that enters the repository.
- If a legacy check-in has no `spotPlaceId`, it is matched by alias (see
  section 2.1) and must not be silently dropped.
- Apple Maps place IDs (`native:…` synthetic IDs from the native geocoder)
  must never be stored as canonical placeId. If the native geocoder is the
  only source, the result is treated as unresolved and the user can still
  check in, but the check-in is flagged for backfill.

### 1.2 SpotSummary

Read model consumed by Explore list, Explore sheet, map markers, and any
compact spot representation. Every screen that shows a spot card uses this
type.

```typescript
export type SpotSummary = {
  /** Deterministic key: `${placeId}::${normalizedName}` */
  spotKey: string;
  /** Canonical place identity */
  place: CanonicalPlace;
  /** All-time visible check-in count for this spot */
  checkinCount: number;
  /** ISO-8601 timestamp of most recent visible check-in, or null */
  latestCheckinAt: string | null;
  /**
   * Up to 3 most recent visible check-ins, newest first.
   * Used for thumbnail, caption preview, and "who checked in" chips.
   */
  latestCheckinsPreview: CheckinPreview[];
  /** Number of unique users with a check-in within the last 2 hours */
  hereNowCount: number;
  /** Resolved hero visual for this spot */
  visual: SpotVisualResult;
  /** Intelligence state for this spot (may be degraded/unavailable) */
  intelligence: IntelligenceState;
  /**
   * Where the data came from and how complete it is.
   * Allows the UI to decide whether to show shimmer, stale badge, etc.
   */
  sourceState: SpotSourceState;
};

export type CheckinPreview = {
  id: string;
  userId: string;
  userHandle: string;
  caption?: string;
  photoUri: string | null;
  createdAt: string;
};

export type SpotSourceState = {
  /** Whether check-in history was loaded from the primary spotPlaceId query */
  historySource: 'canonical' | 'alias' | 'none';
  /** Whether intelligence was freshly built or loaded from cache/spots doc */
  intelligenceSource: 'fresh' | 'cached' | 'spots_doc' | 'unavailable';
  /** Whether the visual was resolved from community, provider, map, or nothing */
  visualSource: SpotVisualSource;
  /** True if any sub-source is stale or unavailable */
  isDegraded: boolean;
};
```

**Invariants:**
- `checkinCount` is the actual count of visible check-ins resolved by the
  repository, not a materialized number from the `spots` doc.
- `latestCheckinsPreview` is always sorted newest-first and limited to 3.
- `hereNowCount` uses the same 2-hour window currently in
  `aggregateSpotMetrics`, but only for presence indicators — it never
  gates what appears in the timeline.
- If `sourceState.historySource === 'none'`, the summary still renders
  (with `checkinCount: 0`) — it does not block the card from appearing
  when provider intelligence is available.

### 1.3 SpotDetailPayload

Full payload consumed by the Spot detail screen (`app/spot.tsx`).
Strictly a superset of SpotSummary.

```typescript
export type SpotDetailPayload = {
  /** The summary (Explore sheet and Spot detail share the same object) */
  summary: SpotSummary;
  /**
   * Complete visible check-in timeline, newest first.
   * Paginated — first page loads on open, subsequent pages on scroll.
   * This is ALL visible check-ins, not sampled from a global feed.
   */
  timeline: TimelinePage;
  /** Tag scores for this place (aggregated from check-in tags + remote) */
  tagScores: Record<string, number>;
  /** Friends who have checked in (any time, not just "here now") */
  friendsWhoVisited: FriendVisit[];
  /** People currently here (within 2-hour window) */
  hereNow: HereNowUser[];
  /** Google Place details (hours, types, reviews) if available */
  placeDetails: PlaceSearchResult | null;
};

export type TimelinePage = {
  items: Checkin[];
  hasMore: boolean;
  /** Cursor for next page (Firestore startAfter) */
  cursor: string | null;
};

export type FriendVisit = {
  userId: string;
  handle: string;
  avatarUrl?: string;
  lastVisitedAt: string;
};

export type HereNowUser = {
  userId: string;
  handle: string;
  avatarUrl?: string;
  checkinId: string;
};
```

**Invariants:**
- `summary` is the exact same SpotSummary used by Explore — not a
  different projection.
- `timeline.items` is strictly check-ins for this canonical placeId (plus
  alias matches), not a global feed filter.
- Pagination cursor is opaque to the UI; the repository handles
  startAfter semantics.

### 1.4 IntelligenceState

Unified intelligence envelope consumed by every screen that shows scores,
crowd data, recommendations, or availability messaging. Replaces direct
use of `PlaceIntelligence`, `spot.intel`, and `SpotIntelligence` in UI
components.

```typescript
export type IntelligenceStatus = 'full' | 'degraded' | 'unavailable';

export type IntelligenceState = {
  /** High-level availability */
  status: IntelligenceStatus;
  /**
   * Work score. Present only when status is 'full' or 'degraded'.
   * NEVER defaults to 50. When unavailable, this field is null.
   */
  workScore: number | null;
  /** Vibe scores, present only when status is 'full' or 'degraded' */
  vibeScores: VibeScores | null;
  primaryVibe: VibeType | null;
  /** Aggregate rating across Google + Yelp + Foursquare */
  aggregateRating: number | null;
  /** Total review count across all providers */
  aggregateReviewCount: number;
  /** Provider-level signal breakdown */
  providerSignals: ExternalPlaceSignal[];
  /** Provider photos (Yelp, Foursquare — not Google due to TOS) */
  providerPhotos: ExternalPlacePhoto[];
  /** 0-1 confidence in the overall intelligence quality */
  confidence: number;
  /** Human-readable reason when status !== 'full' */
  message: string | null;

  // --- pass-through fields for screens that need detail ---

  priceLevel: string | null;
  openNow: boolean | null;
  openNowSource: OpenStatusSource;
  scoreBreakdown: ScoreBreakdown | null;
  crowdLevel: 'low' | 'moderate' | 'high' | 'unknown';
  bestTime: 'morning' | 'afternoon' | 'evening' | 'late' | 'anytime';
  reliability: IntelligenceReliability;
  momentum: IntelligenceMomentum;
  recommendations: {
    goodForStudying: boolean;
    studyingConfidence: number;
    goodForMeetings: boolean;
    meetingsConfidence: number;
  };
  highlights: string[];
  useCases: string[];
  hours: string[] | null;
  crowdForecast: CrowdForecastPoint[];
  contextSignals: ContextSignal[];
  externalSignalMeta: ExternalSignalMeta;
  modelVersion: string;
  generatedAt: number;
};
```

**Invariants:**
- `workScore` is `null` when `status === 'unavailable'`.  The UI must
  handle this — it must NEVER display "50" or any synthetic neutral score
  as if it were real data.
- `workScore` is a real computed number when `status === 'full'` or
  `status === 'degraded'`.
- `scoreBreakdown` is `null` when `status === 'unavailable'`.  The Score
  Breakdown sheet must not open when breakdown is null.
- `message` is a user-facing string when `status !== 'full'`.  It is
  sourced from `getPlaceIntelligenceAvailabilityMessage()` for degraded
  states, or a hardcoded string for unavailable.
- `confidence` is `0` when `status === 'unavailable'`.

**Mapping from existing `PlaceIntelligence`:**

| PlaceIntelligence field        | IntelligenceState field     | Notes                                      |
|-------------------------------|-----------------------------|--------------------------------------------|
| workScore                     | workScore                   | null when unavailable instead of 50         |
| dataAvailability.status       | status                      | direct map                                 |
| dataAvailability.*            | (used to compute message)   | collapsed into `message` for UI simplicity |
| externalSignals               | providerSignals             | renamed for clarity                        |
| providerPhotos                | providerPhotos              | same                                       |
| confidence                    | confidence                  | 0 when unavailable                         |
| all other fields              | pass-through                | same shape                                 |

**Construction rule:**

```typescript
function toIntelligenceState(pi: PlaceIntelligence): IntelligenceState {
  const status = pi.dataAvailability.status;
  const isUnavailable = status === 'unavailable';
  const isFallback =
    pi.confidence <= 0.1 &&
    pi.reliability.sampleSize === 0 &&
    pi.externalSignalMeta.providerCount === 0;

  const effectiveStatus: IntelligenceStatus =
    isFallback ? 'unavailable' : status;

  return {
    status: effectiveStatus,
    workScore: effectiveStatus === 'unavailable' ? null : pi.workScore,
    vibeScores: effectiveStatus === 'unavailable' ? null : pi.vibeScores ?? null,
    primaryVibe: effectiveStatus === 'unavailable' ? null : pi.primaryVibe ?? null,
    aggregateRating: pi.aggregateRating,
    aggregateReviewCount: pi.aggregateReviewCount,
    providerSignals: pi.externalSignals,
    providerPhotos: pi.providerPhotos,
    confidence: effectiveStatus === 'unavailable' ? 0 : pi.confidence,
    message: effectiveStatus === 'full'
      ? null
      : getPlaceIntelligenceAvailabilityMessage(pi.dataAvailability)
        ?? (effectiveStatus === 'unavailable'
          ? 'Work score unavailable — not enough data yet.'
          : 'Some live data sources are limited right now.'),
    priceLevel: pi.priceLevel,
    openNow: pi.openNow,
    openNowSource: pi.openNowSource,
    scoreBreakdown: effectiveStatus === 'unavailable' ? null : pi.scoreBreakdown,
    crowdLevel: pi.crowdLevel,
    bestTime: pi.bestTime,
    reliability: pi.reliability,
    momentum: pi.momentum,
    recommendations: pi.recommendations,
    highlights: pi.highlights,
    useCases: pi.useCases,
    hours: pi.hours ?? null,
    crowdForecast: pi.crowdForecast,
    contextSignals: pi.contextSignals,
    externalSignalMeta: pi.externalSignalMeta,
    modelVersion: pi.modelVersion,
    generatedAt: pi.generatedAt,
  };
}
```

**Critical fallback-detection rule:** The existing
`getFallbackPlaceIntelligence()` returns `workScore: 50`,
`confidence: 0.1`, `reliability.sampleSize: 0`,
`externalSignalMeta.providerCount: 0`. The `isFallback` check above
catches this specific signature and reclassifies it as `'unavailable'`.
This is the mechanism that stops 50 from leaking into the UI.

---

## 2. Precedence Rules

### 2.1 History Source Precedence

When loading check-in history for a spot, the repository must attempt
sources in this order:

| Priority | Query                                           | When used                                     |
|----------|------------------------------------------------|-----------------------------------------------|
| 1        | `spotPlaceId === canonicalPlace.placeId`        | Always — primary query                        |
| 2        | Alias match: `normalizedName + locationBucket`  | When primary returns 0 results AND place has a name |
| 3        | (no further fallback)                           | Return empty timeline, never sample global feed |

**Alias key derivation:**
```
aliasKey = lowercase(trimWhitespace(name))
         + '::'
         + Math.round(lat * 100) + ',' + Math.round(lng * 100)
```

This matches check-ins within ~1.1 km and with the same case-insensitive
name. It is intentionally coarse to catch legacy check-ins that predate
`spotPlaceId` population.

**Rules:**
- Primary and alias queries must both filter by visibility (public,
  friends-of-viewer, owner-only).
- Alias-matched check-ins are tagged with `sourceState.historySource = 'alias'`
  so the UI can optionally show a "matched by name" footnote.
- The global-feed sampling fallback (`getCheckinsRemote(limit)` then
  filter by spotKey) is **removed**. It produces false matches, is
  expensive, and hides empty-state bugs.
- Backfill job (Codex task 6) resolves alias matches to canonical
  placeId and patches the check-in document so future queries use the
  primary path.

### 2.2 Score Source Precedence

Work score and all intelligence metrics must come from one path:

| Priority | Source                                        | Condition                                           |
|----------|----------------------------------------------|-----------------------------------------------------|
| 1        | `buildPlaceIntelligence()` → `toIntelligenceState()` | Called fresh with current check-ins, tag scores, provider signals |
| 2        | Cached `IntelligenceState` from repository    | Cache hit within 15-min TTL                         |
| 3        | `status: 'unavailable'`, `workScore: null`    | Build fails, times out, or cache expired and rebuild fails |

**Prohibited paths:**
- `spot.intel.avgRating` or any field from the Firestore `spots`
  collection must NEVER be rendered directly as a work score or shown as
  the primary intelligence on the Spot detail screen.
- `getFallbackPlaceIntelligence()` (workScore: 50) must never reach the
  UI as-is. The `toIntelligenceState` bridge catches it and converts to
  `status: 'unavailable'`.
- The `SpotIntelligence` type from `userIntelligenceService.ts`
  (trending/popularity analytics) is NOT a score source. It is a
  discovery/ranking signal only.

**Degraded vs Unavailable determination:**

| Condition | Status | UI treatment |
|-----------|--------|-------------|
| All 3 providers (Google, Foursquare, Yelp) returned data | `full` | Show score, all metrics, full breakdown |
| 1-2 providers failed but at least 1 returned data OR check-in data exists | `degraded` | Show score with amber "Limited data" badge; name failed providers in message |
| All providers failed AND no check-in data AND no inferred signals | `unavailable` | Hide score; show "Work score unavailable" message; show whatever metadata is available (name, address, map) |
| Build timed out or threw | `unavailable` | Same as above |

### 2.3 Visual Source Precedence

All spot visuals must resolve through `resolveSpotVisual()` (already
correctly implemented in `services/spotVisuals.ts`). The precedence is:

| Priority | Source                    | Description                                              |
|----------|--------------------------|----------------------------------------------------------|
| 1        | Community photo           | Most recent renderable visible check-in photo (`resolvePhotoUri`) |
| 2        | Provider photo            | First HTTPS photo from `intelligence.providerPhotos` (Yelp/Foursquare) |
| 3        | Static map                | Google Static Maps with spot coordinates                  |
| 4        | None                      | `{ uri: null, source: 'none' }` → gray placeholder       |

**Rules:**
- The same `resolveSpotVisual` call is used for Explore list thumbnail,
  Explore sheet hero, and Spot detail hero. They must show the same image.
- The `intelligence` input to `resolveSpotVisual` must come from the
  repository's `IntelligenceState.providerPhotos`, not from a separate
  fetch or the `spots` doc.
- If `IntelligenceState.status === 'unavailable'`, provider photos may
  still be available (the proxy payload for photos may succeed even when
  scoring data fails). The visual resolver should still check
  `providerPhotos` before falling back to map.

### 2.4 Degraded and Unavailable UI States

**Explore list card (`SpotListItem`):**

| State | Work score area | Subtitle | Thumbnail |
|-------|----------------|----------|-----------|
| `full` | Colored score badge (green/amber/orange) | "{N} check-ins" or "{N} here now" | Resolved visual |
| `degraded` | Score badge + amber dot indicator | Same + (no extra text needed on card) | Resolved visual |
| `unavailable` | Hidden entirely (no badge) | Same | Resolved visual (may be map or placeholder) |

**Explore sheet (bottom sheet on spot tap):**

| State | Score section | Message | Actions |
|-------|-------------|---------|---------|
| `full` | Work score + crowd level + best time + signals | None | New check-in, Open maps, View spot |
| `degraded` | Score + crowd level + best time + limited signals | Amber bar: `intelligence.message` | Same |
| `unavailable` | Hidden | Gray bar: "Work score unavailable — not enough data yet." | Same (check-in still works) |

**Spot detail screen (`app/spot.tsx`):**

| State | Intelligence card | Score breakdown button | Timeline |
|-------|------------------|----------------------|----------|
| `full` | Full card with all metrics | Tappable → ScoreBreakdownSheet | All check-ins, newest first |
| `degraded` | Card with available metrics + amber availability message | Tappable (breakdown shows 'none' sources where data is missing) | Same |
| `unavailable` | Collapsed card: "Work score unavailable — not enough data yet. Check in to help build this spot's profile." | Hidden / disabled | Same (may show 0 check-ins) |

**Score Breakdown sheet:**

| State | Behavior |
|-------|----------|
| `full` | Show all 11 factors with source badges |
| `degraded` | Show all 11 factors; factors with source `'none'` are grayed out |
| `unavailable` | Sheet must not open (button hidden/disabled) |

**Check-in flow:**

| State | Behavior |
|-------|----------|
| Search returns `status: 'ok'` | Normal result list |
| Search returns `status: 'empty'` | "No places found. Try a different search." |
| Search returns `status: 'error'` | Error message from `getProviderProxyUserMessage()` + retry button |
| Proxy unavailable, client fallback succeeds | Transparent to user |
| All search paths fail | "Search is temporarily unavailable. You can still check in by entering a spot name." |

---

## 3. Scenario Matrix

Each row describes a real-world scenario, the expected behavior under the
new contract, and specific acceptance criteria.

### 3.1 Place with many check-ins (e.g., Brass Tacks)

**Preconditions:**
- 20+ visible check-ins with `spotPlaceId` matching canonical placeId
- Active provider data (Google, Foursquare, Yelp all returning)
- Recent check-in within last 24 hours

**Expected behavior:**

| Surface | Expectation |
|---------|-------------|
| Explore list | Card shows: community photo thumbnail, real work score badge, "20 check-ins" or "2 here now" |
| Explore sheet | Hero = community photo. Intelligence snapshot: real score, crowd level, best time, external signals. |
| View spot | Same hero. Full intelligence card. Timeline shows all 20+ check-ins newest first. Score breakdown tappable with mostly `'checkin'` sources. |
| Navigation identity | `placeId` and `name` are identical across list → sheet → detail. Tapping through never changes the place. |

**Acceptance criteria:**
- [ ] `SpotSummary.checkinCount >= 20`
- [ ] `IntelligenceState.status === 'full'`
- [ ] `IntelligenceState.workScore` is a real number, not 50
- [ ] `SpotSummary.visual.source === 'community'`
- [ ] Spot detail timeline length >= 20
- [ ] No "No check-ins yet" message
- [ ] Score breakdown shows multiple `'checkin'` source factors

### 3.2 Place with old legacy check-ins but no spotPlaceId

**Preconditions:**
- 5 check-ins exist in Firestore with `spotName: "Brass Tacks"` and no
  `spotPlaceId` field
- Spot was created before placeId population was added
- A `spots` doc may or may not exist

**Expected behavior:**

| Surface | Expectation |
|---------|-------------|
| Explore list | Card appears if alias resolution finds the check-ins. Shows community photo if any have photos. |
| Explore sheet | Intelligence may be degraded (fewer check-ins to score from) but score is real, not 50. |
| View spot | Timeline shows all 5 legacy check-ins (matched by alias). `sourceState.historySource === 'alias'`. |
| Backfill | Background job should patch these check-ins with the canonical `spotPlaceId` for future queries. |

**Acceptance criteria:**
- [ ] Alias query finds check-ins by normalized name + location bucket
- [ ] `SpotSummary.checkinCount === 5` (not 0)
- [ ] Timeline shows 5 items, not "No check-ins yet"
- [ ] `SpotSummary.sourceState.historySource === 'alias'`
- [ ] After backfill runs, future queries use primary path and `historySource === 'canonical'`

### 3.3 Place with no check-ins but good provider data

**Preconditions:**
- Spot exists in `spots` collection from a geohash query
- Zero check-ins from any user
- Google returns rating 4.5, Yelp returns rating 4.3, Foursquare returns
  rating 8.2
- NLP inferred signals available (quiet, has WiFi)

**Expected behavior:**

| Surface | Expectation |
|---------|-------------|
| Explore list | Card shows: provider photo (Yelp/Foursquare), real work score from provider priors, "0 check-ins" |
| Explore sheet | Hero = provider photo. Score is real (built from provider priors + inferred signals), not 50. Message may note "Based on review analysis" or similar. |
| View spot | Intelligence card present with real score. Timeline section says "No check-ins yet. Be the first!" (not silently empty). Score breakdown shows `'api'` and `'inferred'` sources. |

**Acceptance criteria:**
- [ ] `IntelligenceState.status === 'full'` or `'degraded'` (not `'unavailable'`)
- [ ] `IntelligenceState.workScore` is a real number computed from provider priors
- [ ] `SpotSummary.visual.source === 'provider'`
- [ ] `SpotSummary.checkinCount === 0`
- [ ] Spot detail shows encouraging empty state, not bare "No check-ins yet."
- [ ] Score breakdown shows `'api'` and/or `'inferred'` sources, no `'checkin'` sources

### 3.4 Provider outage (all three providers fail)

**Preconditions:**
- 3 check-ins exist with this placeId
- Google Places proxy returns 503
- Foursquare proxy returns timeout
- Yelp proxy returns 403

**Expected behavior:**

| Surface | Expectation |
|---------|-------------|
| Explore list | Card shows: community photo, NO score badge (or degraded if check-in data alone gives a meaningful score), "{N} check-ins" |
| Explore sheet | If check-in data alone produces a meaningful score → show degraded score with message. If not → show "Work score unavailable" message. |
| View spot | Intelligence card shows degraded or unavailable state with message: "Live data is limited right now. Google + Foursquare + Yelp are unavailable." Timeline still shows all 3 check-ins. |

**Acceptance criteria:**
- [ ] `IntelligenceState.status === 'degraded'` (if check-in signals are sufficient) or `'unavailable'`
- [ ] `IntelligenceState.workScore` is either a real check-in-only score or `null` — never 50
- [ ] `IntelligenceState.message` names the failed providers
- [ ] Timeline still renders (provider outage does not block history display)
- [ ] Check-in flow still works (search may be degraded but check-in posting is independent)

### 3.5 Proxy auth failure

**Preconditions:**
- User has a valid Firebase session
- Cloud Functions proxy returns 401 (token expired or App Check rejected)
- Direct client calls are disabled in production

**Expected behavior:**

| Surface | Expectation |
|---------|-------------|
| Place search | Falls back to client if available. If client disabled: shows "Search is temporarily unavailable" with retry. |
| Intelligence | Built from check-in data only. Status is `'degraded'` or `'unavailable'`. Message: "Live place enrichment needs a fresh session." |
| Spot detail | Timeline loads (it comes from Firestore, not the proxy). Intelligence card shows degraded state. |

**Acceptance criteria:**
- [ ] `PlaceSearchResponse.status === 'error'` with `diagnostics.errorCode === 'proxy_unauthorized'`
- [ ] User sees actionable message, not silent empty results
- [ ] Intelligence degrades gracefully — never shows 50 as a proxy-auth fallback
- [ ] Timeline and check-in history are unaffected (they don't depend on the proxy)

### 3.6 Stale spots doc vs fresh live check-ins

**Preconditions:**
- `spots` doc has `intel.avgRating: 3.8`, `live.checkinCount: 5`,
  `display.noise: 'moderate'` — all from 3 days ago
- 3 new check-ins have been posted since, with noise: 'quiet', wifi: 5
- Fresh provider data shows rating 4.2

**Expected behavior:**

| Surface | Expectation |
|---------|-------------|
| Explore list | Card reflects fresh intelligence (built from 8 total check-ins + fresh provider data), not the stale spots doc. |
| Explore sheet | Score reflects latest data. Rating shows 4.2 (fresh), not 3.8 (stale doc). |
| View spot | Intelligence card built from all 8 check-ins. Score breakdown reflects actual check-in signals. Noise label reflects blended or live-dominant value, not stale doc. |

**Acceptance criteria:**
- [ ] `IntelligenceState.aggregateRating === 4.2` (fresh), not 3.8 (stale)
- [ ] `IntelligenceState.workScore` reflects all 8 check-ins
- [ ] `SpotSummary.checkinCount === 8`, not 5
- [ ] No field from the `spots` doc overrides fresh intelligence in the detail view
- [ ] The `spots` doc may inform Explore list sort order / geohash filtering, but never overrides the detail

---

## 4. Codex Review Checklist

When Codex delivers implementation PRs, Claude must audit for:

### 4.1 Hidden second-source reads
- [ ] Spot detail does NOT read from `spots` collection and merge into
  the detail view independently of the repository
- [ ] Explore sheet does NOT build intelligence differently than Spot detail
- [ ] No screen reads `spot.intel.avgRating` and renders it as if it were
  `IntelligenceState.aggregateRating`
- [ ] `normalizeSpotForExplore()` does NOT silently inject default intel
  values that look like real data (specifically: `getDefaultIntel()`
  returns `avgRating: null`, `goodForStudying: false`, etc. — these must
  not become visible as positive signals)

### 4.2 Accidental 50-score fallback
- [ ] `getFallbackPlaceIntelligence()` is never consumed directly by UI
  code
- [ ] `toIntelligenceState()` catches the fallback signature and sets
  `status: 'unavailable'`, `workScore: null`
- [ ] No UI component renders `workScore` without first checking
  `status !== 'unavailable'`
- [ ] `ScoreBreakdownSheet` refuses to open when `scoreBreakdown === null`
- [ ] No hardcoded `50` or `workScore ?? 50` in any UI file

### 4.3 UI paths depending on spot.intel directly
- [ ] `app/spot.tsx` does NOT read `spot.intel` for display — only
  `IntelligenceState` from the repository
- [ ] `app/(tabs)/explore.tsx` Explore sheet does NOT fall back to
  `selectedSpot.intel` when `PlaceIntelligence` is null
- [ ] `SpotListItem` receives `IntelligenceState` (or null), never raw
  `SpotIntel`
- [ ] Score breakdown receives `IntelligenceState.scoreBreakdown`, not
  a mix of `PlaceIntelligence` and `spot.intel` fields

### 4.4 Apple Maps as canonical identity
- [ ] No `spotPlaceId` is ever set to an Apple Maps / MapKit identifier
- [ ] `CanonicalPlace.provider` is always `'google'`
- [ ] Native geocoder results (`native:…` synthetic IDs) are never
  stored as the check-in's `spotPlaceId` without a Google Places
  resolution step
- [ ] Map rendering and "Open in Maps" can use Apple Maps on iOS without
  affecting the canonical place identity

---

## 5. Final Signoff Checklist

Before cutting a release candidate, both Claude and Codex must agree on
every item:

### Identity
- [ ] Every spot card, sheet, and detail screen resolves to one
  `CanonicalPlace` with a Google `placeId`
- [ ] Navigation from Explore list → Explore sheet → Spot detail preserves
  the same `placeId` and `name`

### History
- [ ] Spot detail timeline shows ALL visible check-ins for the canonical
  placeId, newest first
- [ ] Legacy check-ins without `spotPlaceId` are found by alias query
- [ ] No global-feed sampling fallback exists in the codebase
- [ ] "No check-ins yet" only appears when there are truly zero check-ins

### Scoring
- [ ] `workScore: 50` is never shown to the user as a real score
- [ ] `IntelligenceState.status` correctly reflects data availability
- [ ] The same `IntelligenceState` is used by Explore card, Explore sheet,
  and Spot detail
- [ ] Score breakdown sources are accurate (`checkin`, `inferred`, `api`,
  `none`)

### Visuals
- [ ] `resolveSpotVisual()` is the sole visual resolver for all surfaces
- [ ] Community photo > Provider photo > Static map > None precedence is
  respected
- [ ] Explore thumbnail, Explore sheet hero, and Spot detail hero show the
  same image for the same spot

### Search
- [ ] Production check-in search goes through the backend proxy
- [ ] Search returns typed states: `ok`, `empty`, `error`
- [ ] Error states show user-actionable messages, not empty results
- [ ] Selected place always carries `placeId` + `location`

### Degraded States
- [ ] Provider outage produces `'degraded'` or `'unavailable'`, not
  synthetic scores
- [ ] Proxy auth failure shows a message and degrades gracefully
- [ ] Timeline loads even when intelligence is unavailable
- [ ] Check-in flow works even when search is degraded

### Release Gates
- [ ] Auth smoke passes
- [ ] Place search smoke passes
- [ ] Nearby smoke passes
- [ ] Place details smoke passes
- [ ] Place signals smoke passes
- [ ] Spot detail smoke (known spot with history) passes
- [ ] Provider-photo smoke (known venue with Yelp/Foursquare photos) passes
