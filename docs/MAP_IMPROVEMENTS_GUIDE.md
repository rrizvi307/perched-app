# Map Improvements Guide - Zabihah.com Inspired

This guide shows how to integrate zabihah.com-style map features into Perched's explore screen.

## 🎯 New Components Created

### 1. **MapLoadingSpinner** (`components/ui/map-loading-spinner.tsx`)
Smooth animated spinner that replaces the basic ActivityIndicator.

**Features:**
- Rotating gradient border animation
- Customizable size and message
- Theme-aware colors
- Smooth 1-second rotation cycle

### 2. **AnimatedMarker** (`components/map/animated-marker.tsx`)
Wrapper for markers with drop-in/fade-in animations.

**Features:**
- Staggered appearance (markers cascade onto map)
- Drop animation (markers drop from above)
- Fade animation option
- Configurable delay per marker

### 3. **MapFilterChips** (`components/ui/map-filter-chips.tsx`)
Visual filter chips with active/inactive states.

**Features:**
- Horizontal scrollable filter bar
- Icon support
- Active state highlighting (filled background)
- Smooth press feedback
- Compact variant option

### 4. **DistanceGroupedList** (`components/map/distance-grouped-list.tsx`)
List view that groups spots by distance ranges like zabihah.com.

**Features:**
- Automatic distance-based grouping (< 0.1 mi, 0.1-0.2 mi, etc.)
- Section headers showing distance range
- Walking distance indicator
- Tag display
- Check-in counts
- Long-press to focus on map

---

## 📝 Integration Steps

### Step 1: Update Imports in `explore.tsx`

Add these imports at the top of the file:

```typescript
// New component imports
import { MapLoadingSpinner } from '@/components/ui/map-loading-spinner';
import { MapFilterChips, FilterChip } from '@/components/ui/map-filter-chips';
import { DistanceGroupedList } from '@/components/map/distance-grouped-list';
import { AnimatedMarker, getMarkerDelay } from '@/components/map/animated-marker';
```

### Step 2: Replace Loading Indicator

**Find this code (around line 1482-1486):**
```typescript
{loading ? (
  <View pointerEvents="none" style={[styles.mapLoading, { backgroundColor: card }]}>
    <ActivityIndicator color={primary} />
    <Text style={{ color: muted, marginTop: 6 }}>Loading map pins…</Text>
  </View>
) : null}
```

**Replace with:**
```typescript
{loading ? (
  <MapLoadingSpinner message="Loading map pins…" />
) : null}
```

### Step 3: Add Animated Markers

**Find the marker rendering code (around line 1502-1528):**
```typescript
{markerSpots.map((s) => {
  // ... existing code
  return (
    <Marker
      key={markerKey}
      coordinate={{ latitude: displayCoords.lat, longitude: displayCoords.lng }}
      // ... rest of props
    />
  );
})}
```

**Replace with:**
```typescript
{markerSpots.map((s, index) => {
  // ... existing code
  return (
    <AnimatedMarker
      key={markerKey}
      coordinate={{ latitude: displayCoords.lat, longitude: displayCoords.lng }}
      delay={getMarkerDelay(index, markerSpots.length)}
      animationType="drop"
      // ... rest of props
    />
  );
})}
```

### Step 4: Add Filter Chips UI

**Add this new state near the top of the component (after other useState declarations):**
```typescript
const [mapListView, setMapListView] = useState<'map' | 'list' | 'both'>('both');
```

**Create filter chip configuration:**
```typescript
const vibeFilters: FilterChip[] = [
  { id: 'all', label: 'All', icon: 'square.grid.2x2', active: vibe === 'all' },
  { id: 'quiet', label: 'Quiet', icon: 'moon.fill', active: vibe === 'quiet' },
  { id: 'study', label: 'Study', icon: 'book.fill', active: vibe === 'study' },
  { id: 'social', label: 'Social', icon: 'person.2.fill', active: vibe === 'social' },
  { id: 'cowork', label: 'Cowork', icon: 'desktopcomputer', active: vibe === 'cowork' },
  { id: 'late', label: 'Late-night', icon: 'moon.stars.fill', active: vibe === 'late' },
];

const handleFilterToggle = (filterId: string) => {
  setVibe(filterId as ExploreVibe);
};
```

**Add the filter chips above the map (find the map rendering section):**
```typescript
{/* Filter Chips */}
<MapFilterChips
  filters={vibeFilters}
  onFilterToggle={handleFilterToggle}
  variant="default"
/>

{/* Existing map code */}
{canShowInteractiveMap ? (
  <View style={[styles.mapCard, { backgroundColor: card, borderColor: border }]}>
```

### Step 5: Add Distance-Grouped List View

**Add function to convert spots for the list component:**
```typescript
const spotsForList = React.useMemo(() => {
  return spots.map((s) => ({
    id: s.example?.id || s.placeId || s.name,
    name: s.name,
    distanceKm: loc ? haversine(loc, s.example?.spotLatLng || s.example?.location || { lat: 0, lng: 0 }) : undefined,
    description: s.seed ? 'Suggested spot' : `${s.count} recent check-ins`,
    tags: buildSpotTags(s),
    checkinCount: s.count,
  }));
}, [spots, loc]);
```

**Add handler for spot focus:**
```typescript
const handleSpotFocus = React.useCallback((spot: any) => {
  // Find the spot's coordinates
  const fullSpot = spots.find((s) => s.name === spot.name);
  const coords = fullSpot?.example?.spotLatLng || fullSpot?.example?.location;

  if (coords) {
    setMapFocus(coords);
    // Optionally scroll map into view if in 'both' mode
  }
}, [spots]);
```

**Add list view option (add this after the map view):**
```typescript
{/* Distance-Grouped List View */}
{(mapListView === 'list' || mapListView === 'both') && (
  <View style={styles.listContainer}>
    <DistanceGroupedList
      spots={spotsForList}
      onSpotPress={(spot) => {
        const placeId = spots.find((s) => s.name === spot.name)?.example?.spotPlaceId || '';
        router.push(`/spot?placeId=${encodeURIComponent(placeId)}&name=${encodeURIComponent(spot.name)}`);
      }}
      onSpotFocus={handleSpotFocus}
    />
  </View>
)}
```

### Step 6: Add View Toggle Buttons

**Add view mode toggle (place near the top of the rendered content):**
```typescript
<View style={styles.viewToggle}>
  <Pressable
    onPress={() => setMapListView('map')}
    style={[
      styles.toggleButton,
      mapListView === 'map' && styles.toggleButtonActive
    ]}
  >
    <IconSymbol name="map.fill" size={16} />
    <Text>Map</Text>
  </Pressable>

  <Pressable
    onPress={() => setMapListView('both')}
    style={[
      styles.toggleButton,
      mapListView === 'both' && styles.toggleButtonActive
    ]}
  >
    <IconSymbol name="square.split.2x1.fill" size={16} />
    <Text>Both</Text>
  </Pressable>

  <Pressable
    onPress={() => setMapListView('list')}
    style={[
      styles.toggleButton,
      mapListView === 'list' && styles.toggleButtonActive
    ]}
  >
    <IconSymbol name="list.bullet" size={16} />
    <Text>List</Text>
  </Pressable>
</View>
```

### Step 7: Add Styles

**Add these styles to the StyleSheet at the bottom:**
```typescript
viewToggle: {
  flexDirection: 'row',
  backgroundColor: surface,
  borderRadius: 12,
  padding: 4,
  marginBottom: 12,
  borderWidth: 1,
  borderColor: border,
},
toggleButton: {
  flex: 1,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  paddingVertical: 8,
  paddingHorizontal: 12,
  borderRadius: 8,
  gap: 6,
},
toggleButtonActive: {
  backgroundColor: primary,
},
listContainer: {
  flex: 1,
  marginTop: 12,
},
```

---

## 🎨 Enhanced Features to Add

### 1. **Marker Clustering** (Advanced)

For marker clustering, install the clustering library:
```bash
npm install react-native-map-clustering
```

Then wrap your MapView:
```typescript
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-map-clustering';

<MapView
  clusterColor={primary}
  clusterTextColor="#FFFFFF"
  clusterFontFamily="System"
  spiralEnabled={false}
  radius={50}
  maxZoom={20}
  minZoom={1}
  extent={512}
  // ... rest of props
>
```

### 2. **Real-time Distance Updates**

Add this effect to update distances as user moves the map:
```typescript
useEffect(() => {
  if (!mapFetchFocus || !spots.length) return;

  // Recalculate distances based on new map center
  const updated = spots.map((s) => ({
    ...s,
    distance: haversine(mapFetchFocus, s.example?.spotLatLng || s.example?.location || { lat: 0, lng: 0 }),
  }));

  // Re-sort by distance
  const sorted = updated.sort((a, b) => (a.distance || 999) - (b.distance || 999));
  setSpots(sorted);
}, [mapFetchFocus]);
```

### 3. **Filter Animations**

Add smooth transitions when filters change:
```typescript
import { LayoutAnimation, UIManager, Platform } from 'react-native';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const handleFilterToggle = (filterId: string) => {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  setVibe(filterId as ExploreVibe);
};
```

---

## 🚀 Key Improvements Summary

✅ **Animated marker appearance** - Markers drop in with staggered timing
✅ **Smooth loading spinner** - Professional rotating animation
✅ **Filter chips** - Visual, interactive filters with icons
✅ **Distance grouping** - Zabihah-style distance ranges
✅ **Map-list sync** - Long-press list item to focus map
✅ **View modes** - Toggle between map, list, or both
✅ **Better UX** - Smoother transitions and better visual feedback

---

## 🎯 Testing Checklist

- [ ] Loading spinner appears when fetching spots
- [ ] Markers animate in with cascade effect
- [ ] Filter chips highlight when active
- [ ] Distance grouping shows correct ranges
- [ ] Long-press list item focuses map
- [ ] View toggle switches correctly
- [ ] Smooth transitions on filter changes
- [ ] Distance updates when map moves

---

## 📱 Next Steps

1. Test on iOS and Android devices
2. Add haptic feedback on filter toggle
3. Implement marker clustering for dense areas
4. Add pull-to-refresh on list view
5. Consider adding price/rating filters (like zabihah.com)
6. Add animation when zooming to spot from list
7. Implement "Open Now" real-time updates

---

Enjoy your zabihah.com-inspired map experience! 🗺️✨
