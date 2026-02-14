# NLP-Inferred Score Fallbacks + Score Breakdown Sheet — Implementation Plan

## Overview
Places with zero checkins get near-zero work scores because WiFi (×10), noise (×7), busyness (×6) are all null. NLP-inferred data from `spot.intel` (inferredNoise, hasWifi, wifiConfidence, goodForStudying) is never fed into the score formula. This plan fixes that and adds a tappable score breakdown UI.

---

## File 1: `services/placeIntelligence.ts`

### 1A. Add `ScoreBreakdown` type (after line 56, before `PlaceIntelligence` type)

```ts
export type ScoreFactorSource = 'checkin' | 'inferred' | 'api' | 'none';

export type ScoreBreakdown = {
  wifi: { value: number; source: ScoreFactorSource };
  noise: { value: number; source: ScoreFactorSource };
  busyness: { value: number; source: ScoreFactorSource };
  laptop: { value: number; source: ScoreFactorSource };
  tags: { value: number; source: ScoreFactorSource };
  externalRating: { value: number; source: ScoreFactorSource };
  venueType: { value: number };
  openStatus: { value: number };
  momentum: { value: number };
};
```

### 1B. Add `scoreBreakdown` to `PlaceIntelligence` type (line 57)

Add this field to the `PlaceIntelligence` type:
```ts
scoreBreakdown: ScoreBreakdown;
```

### 1C. Add `inferred` to `BuildIntelligenceInput` type (line 74)

Add this optional field:
```ts
inferred?: {
  noise?: 'quiet' | 'moderate' | 'loud' | null;
  noiseConfidence?: number;
  hasWifi?: boolean;
  wifiConfidence?: number;
  goodForStudying?: boolean;
} | null;
```

### 1D. Add inferred fallback logic in `buildPlaceIntelligenceCore` (after line 795)

After `laptopPct` is computed (line 793-795), add fallback logic. Replace the simple variable declarations with mutable `let` bindings that track source:

Change lines 787-795 from:
```ts
const wifiAvg = avg(wifiValues);
const busynessAvg = avg(busynessValues);
const noiseAvg = avg(noiseValues);
const laptopVotes = checkins
  .map((c: any) => c?.laptopFriendly)
  .filter((v: any) => typeof v === 'boolean') as boolean[];
const laptopPct = laptopVotes.length
  ? (laptopVotes.filter(Boolean).length / laptopVotes.length) * 100
  : null;
```

To:
```ts
let wifiAvg = avg(wifiValues);
let noiseAvg = avg(noiseValues);
const laptopVotes = checkins
  .map((c: any) => c?.laptopFriendly)
  .filter((v: any) => typeof v === 'boolean') as boolean[];
let laptopPct = laptopVotes.length
  ? (laptopVotes.filter(Boolean).length / laptopVotes.length) * 100
  : null;

// Track data sources for score breakdown
let wifiSource: ScoreFactorSource = wifiAvg !== null ? 'checkin' : 'none';
let noiseSource: ScoreFactorSource = noiseAvg !== null ? 'checkin' : 'none';
let laptopSource: ScoreFactorSource = laptopPct !== null ? 'checkin' : 'none';
let usedInferred = false;

// Apply NLP-inferred fallbacks when checkin data is missing
const inf = input.inferred;
if (inf) {
  if (wifiAvg === null && inf.hasWifi === true) {
    const conf = typeof inf.wifiConfidence === 'number' ? inf.wifiConfidence : 0.5;
    wifiAvg = 3.5 * 0.6 * conf;
    wifiSource = 'inferred';
    usedInferred = true;
  }
  if (noiseAvg === null && inf.noise) {
    const mapped = toNoiseLevel(inf.noise);
    if (mapped !== null) {
      const conf = typeof inf.noiseConfidence === 'number' ? inf.noiseConfidence : 0.5;
      noiseAvg = mapped * 0.6 * conf;
      noiseSource = 'inferred';
      usedInferred = true;
    }
  }
  if (laptopPct === null && inf.goodForStudying === true) {
    laptopPct = 60 * 0.6;
    laptopSource = 'inferred';
    usedInferred = true;
  }
}
```

Note: `busynessAvg` stays as `const` — there's no inferred busyness signal.
```ts
const busynessAvg = avg(busynessValues);
```

### 1E. Build scoreBreakdown during score computation (around lines 834-857)

After the existing score computation variables are set up (tagBoost, studyTypeBoost, cafePenalty, openBoost, momentumBoost), and the `score` is calculated, build the breakdown.

The existing score formula (lines 846-856) is:
```ts
const score =
  (wifiAvg || 0) * 10 +
  (laptopPct || 0) * 0.22 +
  (noiseAvg !== null ? (6 - noiseAvg) * 7 : 0) +
  (adjustedBusynessAvg !== null ? (6 - adjustedBusynessAvg) * 6 : 0) +
  Math.log10(1 + Math.max(0, tagBoost)) * 18 +
  (externalRatingAvg || 0) * 6 +
  studyTypeBoost +
  openBoost -
  cafePenalty +
  momentumBoost;
```

**After** the `workScore` line (line 857), add:
```ts
const scoreBreakdown: ScoreBreakdown = {
  wifi: { value: round((wifiAvg || 0) * 10, 1), source: wifiSource },
  noise: { value: round(noiseAvg !== null ? (6 - noiseAvg) * 7 : 0, 1), source: noiseSource },
  busyness: { value: round(adjustedBusynessAvg !== null ? (6 - adjustedBusynessAvg) * 6 : 0, 1), source: adjustedBusynessAvg !== null ? 'checkin' : 'none' },
  laptop: { value: round((laptopPct || 0) * 0.22, 1), source: laptopSource },
  tags: { value: round(Math.log10(1 + Math.max(0, tagBoost)) * 18, 1), source: tagBoost > 0 ? 'checkin' : 'none' },
  externalRating: { value: round((externalRatingAvg || 0) * 6, 1), source: externalRatingAvg ? 'api' : 'none' },
  venueType: { value: round(studyTypeBoost - cafePenalty, 1) },
  openStatus: { value: round(openBoost, 1) },
  momentum: { value: round(momentumBoost, 1) },
};
```

### 1F. Cap confidence when using inferred data with no checkins (lines 866-870)

Change the confidence clamping (lines 866-870) from:
```ts
const confidence = clamp(
  round(reliability.score * 0.72 + externalTrustSupport + reviewSupport, 2),
  0.1,
  0.97
);
```

To:
```ts
const maxConfidence = usedInferred && checkins.length === 0 ? 0.35 : 0.97;
const confidence = clamp(
  round(reliability.score * 0.72 + externalTrustSupport + reviewSupport, 2),
  0.1,
  maxConfidence
);
```

### 1G. Add `scoreBreakdown` to the payload object (line 900-915)

Add `scoreBreakdown` to the payload:
```ts
const payload: PlaceIntelligence = {
  workScore,
  scoreBreakdown,  // <-- ADD THIS
  crowdLevel: deriveCrowdLevel(adjustedBusynessAvg),
  // ... rest stays the same
};
```

### 1H. Add default `scoreBreakdown` to `getFallbackPlaceIntelligence()` (line 97-132)

Add this field to the return object:
```ts
scoreBreakdown: {
  wifi: { value: 0, source: 'none' as const },
  noise: { value: 0, source: 'none' as const },
  busyness: { value: 0, source: 'none' as const },
  laptop: { value: 0, source: 'none' as const },
  tags: { value: 0, source: 'none' as const },
  externalRating: { value: 0, source: 'none' as const },
  venueType: { value: 0 },
  openStatus: { value: 0 },
  momentum: { value: 0 },
},
```

---

## File 2: `components/ui/ScoreBreakdownSheet.tsx` (NEW FILE)

Create this new file following the `FilterBottomSheet` pattern:

```tsx
import { useThemeColor } from '@/hooks/use-theme-color';
import type { PlaceIntelligence, ScoreBreakdown, ScoreFactorSource } from '@/services/placeIntelligence';
import { withAlpha } from '@/utils/colors';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = {
  visible: boolean;
  intelligence: PlaceIntelligence;
  checkinCount?: number;
  onDismiss: () => void;
};

const FACTOR_LABELS: { key: keyof ScoreBreakdown; label: string; icon: string }[] = [
  { key: 'wifi', label: 'WiFi', icon: '📶' },
  { key: 'noise', label: 'Noise', icon: '🔇' },
  { key: 'busyness', label: 'Busyness', icon: '👥' },
  { key: 'laptop', label: 'Laptop Friendly', icon: '💻' },
  { key: 'tags', label: 'Tags', icon: '🏷️' },
  { key: 'externalRating', label: 'External Rating', icon: '⭐' },
  { key: 'venueType', label: 'Venue Type', icon: '🏢' },
  { key: 'openStatus', label: 'Open / Closed', icon: '🕐' },
  { key: 'momentum', label: 'Trend', icon: '📈' },
];

function sourceLabel(source: ScoreFactorSource): string {
  switch (source) {
    case 'checkin': return 'From checkins';
    case 'inferred': return 'Inferred from reviews';
    case 'api': return 'External data';
    case 'none': return 'No data';
  }
}

function sourceColor(source: ScoreFactorSource): string {
  switch (source) {
    case 'checkin': return '#22C55E';
    case 'inferred': return '#F59E0B';
    case 'api': return '#3B82F6';
    case 'none': return '#94A3B8';
  }
}

export default function ScoreBreakdownSheet({ visible, intelligence, checkinCount, onDismiss }: Props) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');

  const workScore = intelligence.workScore;
  const scoreTone = workScore >= 78 ? '#22C55E' : workScore >= 62 ? '#F59E0B' : '#F97316';
  const breakdown = intelligence.scoreBreakdown;
  const hasInferred = breakdown
    ? Object.values(breakdown).some((f: any) => f?.source === 'inferred')
    : false;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={[styles.sheet, { borderColor: border, backgroundColor: card }]} onPress={() => {}}>
          <View style={[styles.handle, { backgroundColor: withAlpha(text, 0.2) }]} />

          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.scoreBubble, { backgroundColor: withAlpha(scoreTone, 0.15), borderColor: withAlpha(scoreTone, 0.4) }]}>
              <Text style={{ color: scoreTone, fontSize: 28, fontWeight: '800' }}>{workScore}</Text>
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={{ color: text, fontSize: 18, fontWeight: '800' }}>Work Score</Text>
              <Text style={{ color: muted, fontSize: 13, marginTop: 2 }}>
                {Math.round(intelligence.confidence * 100)}% confidence
              </Text>
            </View>
          </View>

          {/* Factor rows */}
          <ScrollView style={styles.factorList} showsVerticalScrollIndicator={false}>
            {FACTOR_LABELS.map(({ key, label, icon }) => {
              const factor = breakdown[key];
              const value = typeof factor === 'object' && 'value' in factor ? factor.value : (factor as any)?.value ?? 0;
              const source: ScoreFactorSource | null =
                typeof factor === 'object' && 'source' in factor ? (factor as any).source : null;

              return (
                <View key={key} style={[styles.factorRow, { borderBottomColor: border }]}>
                  <Text style={{ fontSize: 16, width: 28 }}>{icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
                    {source ? (
                      <View style={[styles.sourcePill, { backgroundColor: withAlpha(sourceColor(source), 0.14) }]}>
                        <Text style={{ color: sourceColor(source), fontSize: 10, fontWeight: '700' }}>
                          {sourceLabel(source)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ color: value > 0 ? '#22C55E' : value < 0 ? '#F97316' : muted, fontSize: 15, fontWeight: '700' }}>
                    {value > 0 ? '+' : ''}{value}
                  </Text>
                </View>
              );
            })}
          </ScrollView>

          {/* Footer */}
          <Text style={{ color: muted, fontSize: 12, textAlign: 'center', marginTop: 12, marginBottom: 8 }}>
            {(checkinCount ?? 0) > 0
              ? `Based on ${checkinCount} checkin${checkinCount === 1 ? '' : 's'}`
              : hasInferred
                ? 'Based on review analysis'
                : 'Limited data available'}
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 16,
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  scoreBubble: {
    width: 64,
    height: 64,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factorList: {
    maxHeight: 400,
  },
  factorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sourcePill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
});
```

---

## File 3: `components/ui/spot-list-item.tsx`

### 3A. Add `onScorePress` prop (line 9, in the type)

Add to `SpotListItemProps`:
```ts
onScorePress?: () => void;
```

### 3B. Destructure `onScorePress` in the component (line 25)

Add `onScorePress` to the destructured props list.

### 3C. Wrap workScoreBadge in Pressable (lines 89-102)

Change the `<View style={[styles.workScoreBadge, ...]}> ... </View>` block to:
```tsx
<Pressable
  onPress={onScorePress}
  disabled={!onScorePress}
  style={[
    styles.workScoreBadge,
    {
      borderColor: withAlpha(workScoreTone, 0.4),
      backgroundColor: withAlpha(workScoreTone, 0.15),
    },
  ]}
>
  <View style={[styles.workScoreDot, { backgroundColor: workScoreTone }]} />
  <Text style={{ color: workScoreTone, fontSize: 11, fontWeight: '800' }}>
    {Math.round(intelligence.workScore)} Work Score
  </Text>
</Pressable>
```

(Change `<View` → `<Pressable` and `</View>` → `</Pressable>`, add `onPress` and `disabled` props.)

### 3D. Update memo comparison (line 291)

Add to the comparison function:
```ts
prevProps.onScorePress === nextProps.onScorePress &&
```

---

## File 4: `app/(tabs)/explore.tsx`

### 4A. Add state for breakdown sheet (near other state declarations)

```ts
const [breakdownSpotKey, setBreakdownSpotKey] = useState<string | null>(null);
const breakdownIntelligence = breakdownSpotKey ? intelligenceMap.get(breakdownSpotKey) || null : null;
const breakdownCheckinCount = breakdownSpotKey
  ? (listData.find(s => spotKey(s?.example?.spotPlaceId || s?.placeId || '', s?.name || '') === breakdownSpotKey)?._checkins?.length ?? 0)
  : 0;
```

### 4B. Add import for ScoreBreakdownSheet

```ts
import ScoreBreakdownSheet from '@/components/ui/ScoreBreakdownSheet';
```

### 4C. Pass `inferred` to all 3 `buildPlaceIntelligence` call sites

**Call site 1 (~line 725):** Change to:
```ts
const intel = await buildPlaceIntelligence({
  placeName: name,
  placeId,
  location: spot?.example?.spotLatLng || spot?.example?.location || spot?.location || null,
  openNow: spot?.openNow,
  types: spot?.types,
  checkins: spot?._checkins || [],
  inferred: spot?.intel ? {
    noise: spot.intel.inferredNoise ?? null,
    noiseConfidence: spot.intel.inferredNoiseConfidence,
    hasWifi: spot.intel.hasWifi,
    wifiConfidence: spot.intel.wifiConfidence,
    goodForStudying: spot.intel.goodForStudying,
  } : null,
});
```

**Call site 2 (~line 774):** Same pattern — add the `inferred` field with the same shape using `selectedSpot?.intel`.

### 4D. Pass `onScorePress` to SpotListItem

Where `<SpotListItem>` is rendered, add:
```ts
onScorePress={() => {
  const key = spotKey(item?.example?.spotPlaceId || item?.placeId || '', item?.name || '');
  setBreakdownSpotKey(key);
}}
```

### 4E. Render ScoreBreakdownSheet

At the end of the component JSX (before the closing fragment/view), add:
```tsx
{breakdownIntelligence ? (
  <ScoreBreakdownSheet
    visible={!!breakdownSpotKey}
    intelligence={breakdownIntelligence}
    checkinCount={breakdownCheckinCount}
    onDismiss={() => setBreakdownSpotKey(null)}
  />
) : null}
```

---

## File 5: `app/spot.tsx`

### 5A. Add state and import

```ts
import ScoreBreakdownSheet from '@/components/ui/ScoreBreakdownSheet';
```

Add state:
```ts
const [showBreakdown, setShowBreakdown] = useState(false);
```

### 5B. Pass `inferred` to `buildPlaceIntelligence` (~line 272)

Add the `inferred` field. The spot data is accessed via `place` (the Firestore document). Check what field name holds the intel — it's likely `place?.intel` or similar. Add:
```ts
const payload = await buildPlaceIntelligence({
  placeName: displayName,
  placeId: placeId || undefined,
  location: coords || undefined,
  openNow: place?.openNow,
  types: place?.types,
  checkins: visibleCheckins,
  tagScores: aggregatedTagScores,
  inferred: place?.intel ? {
    noise: place.intel.inferredNoise ?? null,
    noiseConfidence: place.intel.inferredNoiseConfidence,
    hasWifi: place.intel.hasWifi,
    wifiConfidence: place.intel.wifiConfidence,
    goodForStudying: place.intel.goodForStudying,
  } : null,
});
```

### 5C. Make work score tappable in Smart Snapshot card (~line 347)

Wrap the work score `<View style={styles.intelItem}>` in a `Pressable`:
```tsx
<Pressable onPress={() => setShowBreakdown(true)}>
  <View style={styles.intelItem}>
    <Text style={{ color: text, fontWeight: '800', fontSize: 22 }}>{intelligence.workScore}</Text>
    <Text style={{ color: muted, fontSize: 12 }}>Work score</Text>
  </View>
</Pressable>
```

### 5D. Render ScoreBreakdownSheet

At end of component JSX:
```tsx
{intelligence ? (
  <ScoreBreakdownSheet
    visible={showBreakdown}
    intelligence={intelligence}
    checkinCount={visibleCheckins.length}
    onDismiss={() => setShowBreakdown(false)}
  />
) : null}
```

---

## Verification Checklist
1. `npx tsc --noEmit` — clean (no type errors)
2. `npm run lint` — clean
3. `npm test -- --runInBand` — all pass
4. The `ScoreBreakdown` type is exported from `placeIntelligence.ts`
5. The `toNoiseLevel` function already handles 'quiet'/'moderate'/'loud' (line 156-162) — note it maps 'lively' not 'loud', so add `if (value === 'loud') return 4;` to the function as well
6. All `buildPlaceIntelligence` callers pass the new `inferred` field (it's optional so existing tests won't break)

## Important: `toNoiseLevel` update

The existing `toNoiseLevel` (line 156) doesn't handle `'loud'`. Add it:
```ts
function toNoiseLevel(value: unknown) {
  if (typeof value === 'number') return value;
  if (value === 'quiet') return 2;
  if (value === 'moderate') return 3;
  if (value === 'lively') return 4;
  if (value === 'loud') return 4;
  return null;
}
```
