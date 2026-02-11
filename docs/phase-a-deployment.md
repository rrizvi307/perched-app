# Phase A + Phase 1 Deployment Guide

## Overview

This guide covers deploying the intelligence infrastructure (Phase A) and data safety guarantees (Phase 1) to production.

**Prerequisites:**
- Firebase service account key (`perched-service-account.json` in project root)
- OpenAI API key (for GPT-4o-mini NLP)
- Yelp API key (for Yelp Fusion API)
- Foursquare API key (optional, for enhanced data)

**Components:**
1. **Phase A Backend:** NLP review analysis + API orchestration
2. **Phase 1 Backend:** Schema contract + validation + geohash backfill
3. **Phase 1 Frontend:** Data normalizer + graceful degradation
4. **Cloud Functions:** Auto-update display data on check-in
5. **Firestore Indexes:** Support 8 filter combinations

---

## Step 1: Configure API Keys

### 1.1 Add Keys to `app.json`

Edit `/Users/rehanrizvi/perched-app/app.json`:

```json
{
  "extra": {
    "OPENAI_API_KEY": "sk-proj-...",
    "YELP_API_KEY": "Bearer YOUR_YELP_KEY",
    "FOURSQUARE_API_KEY": "fsq_...",
    "INTEL_V1_ENABLED": false  // Keep false until pre-population completes
  }
}
```

**Security Note:** For production, consider moving these to Firebase Environment Config:
```bash
firebase functions:config:set openai.key="sk-proj-..."
firebase functions:config:set yelp.key="Bearer YOUR_KEY"
```

### 1.2 Verify Keys Work

Test API access:
```bash
# OpenAI
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_OPENAI_KEY"

# Yelp
curl https://api.yelp.com/v3/businesses/search?location=Houston \
  -H "Authorization: Bearer YOUR_YELP_KEY"
```

---

## Step 2: Deploy Firestore Indexes

### 2.1 Review Index Configuration

The file `firestore.indexes.json` defines 8 composite indexes for spot filtering:

- `geoHash + isOpenNow`
- `geoHash + goodForStudying`
- `geoHash + goodForMeetings`
- `geoHash + inferredNoise`
- `geoHash + priceLevel`
- `geoHash + isOpenNow + goodForStudying`
- `geoHash + isOpenNow + inferredNoise`
- `geoHash + goodForStudying + priceLevel`

### 2.2 Deploy Indexes

```bash
firebase deploy --only firestore:indexes
```

**Expected Output:**
```
✔  firestore: deployed indexes in firestore.indexes.json successfully
```

### 2.3 Wait for Index Build

Indexes take 5-30 minutes to build depending on data size. Check status:

```bash
firebase firestore:indexes
```

Or in [Firebase Console](https://console.firebase.google.com) → Firestore → Indexes.

**Do not proceed to Step 3 until all indexes show "READY".**

---

## Step 3: Backfill Geohash for Existing Spots

### 3.1 Download Firebase Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Project Settings → Service Accounts
3. Click "Generate new private key"
4. Save as `perched-service-account.json` in project root

### 3.2 Run Backfill Script (Dry Run)

Test with dry-run mode first:

```bash
npx ts-node scripts/backfillGeohash.ts --dry-run --limit 10
```

**Expected Output:**
```
📊 Found 10 spots
🔍 DRY RUN MODE - No changes will be made

  Would update spot-123:
    geoHash: 9q5cs2f
    lat: 29.7604
    lng: -95.3698

...

📈 Progress: 10/10 (100.0%) | ✅ 8 | ⏭️  2 | ❌ 0
```

### 3.3 Run Backfill Script (Production)

If dry-run looks good, run for real:

```bash
npx ts-node scripts/backfillGeohash.ts
```

**For large databases:**
```bash
# Process in batches of 100, all spots
npx ts-node scripts/backfillGeohash.ts --limit 10000
```

**Monitor Progress:**
- ✅ Fixed: Spots that received `geoHash`, `lat`, `lng`
- ⏭️  Skipped: Spots that already had all fields
- ❌ Failed: Spots with errors (check error log at end)

**Expected Completion Time:**
- 1,000 spots: ~3-5 minutes
- 10,000 spots: ~30-45 minutes

---

## Step 4: Deploy Cloud Functions

### 4.1 Install Dependencies

```bash
cd functions
npm install
```

### 4.2 Build Functions

```bash
npm run build
```

**Expected Output:**
```
✓ compiled successfully
```

### 4.3 Deploy Functions

```bash
npm run deploy
```

Or deploy specific function:
```bash
firebase deploy --only functions:updateSpotDisplayData
```

**Expected Output:**
```
✔  functions[updateSpotDisplayData(us-central1)]: Successful update operation.
```

### 4.4 Verify Deployment

Check function is active:
```bash
firebase functions:log --only updateSpotDisplayData --limit 5
```

Or in [Firebase Console](https://console.firebase.google.com) → Functions → `updateSpotDisplayData` should show "Active".

---

## Step 5: Pre-Populate Spot Intelligence

### 5.1 Estimate Cost

The script analyzes 10 reviews per spot using GPT-4o-mini (~$0.025 per spot):

| Spots | Est. Cost | Time (10 batch size) |
|-------|-----------|---------------------|
| 100   | $2.50     | ~5 minutes          |
| 1,000 | $25       | ~45 minutes         |
| 10,000| $250      | ~7 hours            |

**Cost breakdown:**
- Google Places API: Free (< 100k requests/month)
- Yelp Fusion API: Free (5,000 calls/day)
- OpenAI GPT-4o-mini: $0.15 per 1M input tokens, $0.60 per 1M output tokens
- Average: ~1,500 input tokens, ~200 output tokens per spot

### 5.2 Run Pre-Population Script (Dry Run)

Test with a few spots first:

```bash
npx ts-node scripts/populateSpotIntelligence.ts --dry-run --limit 5
```

**Expected Output:**
```
📊 Found 5 spots without intelligence
💰 Estimated cost: $0.13
🔍 DRY RUN MODE - No changes will be made

📦 Processing batch 1 (spots 1-5)

  ✅ spot-123: Would add: cafe, $$, 4.3⭐, quiet noise

📈 Progress: 5/5 (100.0%) | ✅ 5 | ❌ 0 | ⏭️  0
💰 Cost so far: $0.13
```

### 5.3 Run Pre-Population Script (Production)

**Small batch first (100 spots):**
```bash
npx ts-node scripts/populateSpotIntelligence.ts --limit 100
```

**Monitor for errors:**
- OpenAI rate limits (wait 60s, retry)
- Yelp rate limits (5,000/day, spread over multiple days)
- Invalid data (spots without placeId or name get skipped)

**Full population (10,000 spots):**
```bash
npx ts-node scripts/populateSpotIntelligence.ts
```

**Expected Completion Time:**
- 100 spots: ~5-10 minutes
- 1,000 spots: ~45-60 minutes
- 10,000 spots: ~6-8 hours

**Resumable:** Script only processes spots where `intel === null`, so you can stop/restart safely.

---

## Step 6: Enable Feature Flag

### 6.1 Verify Intelligence Data

Before enabling the feature flag, verify intelligence was populated:

```javascript
// In Firestore Console, check a few spot documents
{
  "id": "spot-123",
  "name": "Blue Bottle Coffee",
  "intel": {
    "priceLevel": "$$",
    "avgRating": 4.3,
    "category": "cafe",
    "isOpenNow": true,
    "inferredNoise": "quiet",
    "inferredNoiseConfidence": 0.78,
    "hasWifi": true,
    "wifiConfidence": 0.92,
    "goodForStudying": true,
    "goodForMeetings": true,
    "source": "api+nlp",
    "lastUpdated": 1705314567890,
    "reviewCount": 8
  },
  "live": null,  // Will be populated as users check in
  "display": null  // Will be populated by Cloud Function
}
```

### 6.2 Enable Feature Flag

Edit `app.json`:

```json
{
  "extra": {
    "INTEL_V1_ENABLED": true  // Enable intelligence UI
  }
}
```

### 6.3 Rebuild App

```bash
npm run prebuild
eas build --platform ios --profile production
```

Or for local development:
```bash
npx expo start --clear
```

---

## Step 7: Integration Testing

### 7.1 Test Spot Intelligence Display

1. **Open Explore tab** → Tap on a spot with `intel` data
2. **Verify "Spot Intelligence" section shows:**
   - Price: `$`, `$$`, `$$$`, or `$$$$`
   - Rating: Stars with number (e.g., 4.3⭐)
   - Noise: "Quiet (inferred from reviews)"
   - WiFi: Badge if `hasWifi === true`
   - Category: cafe, coworking, library, or other

### 7.2 Test Filters

1. **Tap filter button** in Explore
2. **Apply filters:**
   - Open now ✓
   - Noise: Quiet
   - Good for studying ✓
3. **Verify:**
   - Results are filtered correctly
   - Active filter count badge shows (e.g., "3")
   - Speed notice appears if >3 Firestore filters active

### 7.3 Test Check-In Trigger

1. **Create a check-in** at a spot with intelligence
2. **Wait 10-30 seconds** for Cloud Function trigger
3. **Refresh spot detail**
4. **Verify:**
   - `live` field now has `noise`, `busyness`, `checkinCount`, `lastCheckinAt`
   - `display` field shows blended label (e.g., "Quiet (1 check-in)")

### 7.4 Test Graceful Degradation

1. **Find a spot without `intel` data** (newly added spot)
2. **Tap to open spot sheet**
3. **Verify:**
   - No crash
   - Shows "No ratings yet. Be the first to check in with metrics!"
   - Filters don't break (safely skip missing intel fields)

---

## Step 8: Monitoring & Validation

### 8.1 Check Cloud Function Logs

```bash
firebase functions:log --only updateSpotDisplayData --limit 50
```

**Look for:**
- ✅ "Updated display data for spot X" (success)
- ⚠️ "Invalid live data for spot X" (validation failure, investigate)
- ❌ Errors (fix data or function logic)

### 8.2 Validate Launch Gates

**Gate 1: NLP Accuracy** (>60% confidence)
- Sample 50 spots with inferred noise
- Manually verify noise level matches reviews
- Target: >60% match rate

**Gate 2: Cost** (<$0.03 per spot)
- Check OpenAI API usage in dashboard
- Target: Average <$0.03 per spot analyzed

**Gate 3: Latency** (<30s per spot)
- Check pre-population script logs
- Target: Average processing time <30s per spot

### 8.3 Monitor Firestore Queries

In [Firebase Console](https://console.firebase.google.com) → Firestore → Usage:

- **Read count:** Should increase (geohash queries)
- **Index usage:** Check all 8 indexes show "READY" and have usage stats
- **Error rate:** Should be <1%

---

## Step 9: Launch Checklist

Before enabling for all users:

- [ ] All 8 Firestore indexes show "READY"
- [ ] Geohash backfill completed (no spots missing `geoHash`, `lat`, `lng`)
- [ ] Cloud Function deployed and active (check logs)
- [ ] Intelligence pre-populated for >80% of spots
- [ ] Launch gates validated (accuracy, cost, latency)
- [ ] Feature flag enabled (`INTEL_V1_ENABLED: true`)
- [ ] Integration tests pass (spot display, filters, check-in trigger, graceful degradation)
- [ ] No crashes or errors in production logs

**Rollout Strategy:**
1. Internal team only (1-2 days)
2. Beta testers (~100 users, 3-5 days)
3. 10% of users (A/B test, 1 week)
4. 50% of users (1 week)
5. 100% rollout

---

## Rollback Procedure

If issues arise:

### Immediate Rollback (UI Only)

```json
// app.json
{
  "extra": {
    "INTEL_V1_ENABLED": false  // Disable feature flag
  }
}
```

Rebuild and redeploy app. This hides intelligence UI but keeps backend running.

### Full Rollback (Cloud Function)

```bash
# Disable Cloud Function trigger
firebase functions:delete updateSpotDisplayData

# Or redeploy previous version
git checkout <previous-commit>
cd functions && npm run deploy
```

### Data Rollback

Intelligence data is **additive only** (no existing data deleted). To clean up:

```javascript
// Run in Firestore Console or script
const batch = db.batch();

spots.forEach(spot => {
  batch.update(spot.ref, {
    intel: admin.firestore.FieldValue.delete(),
    live: admin.firestore.FieldValue.delete(),
    display: admin.firestore.FieldValue.delete(),
  });
});

await batch.commit();
```

---

## Troubleshooting

### Issue: Indexes stuck in "BUILDING" for >1 hour

**Cause:** Large dataset or Firestore service issue

**Fix:**
1. Check [Firebase Status](https://status.firebase.google.com)
2. Wait up to 4 hours for large datasets
3. If still stuck, delete and recreate index

### Issue: Geohash backfill fails with "Invalid coordinates"

**Cause:** Spots have malformed `location` or `example.location` fields

**Fix:**
1. Check error log for spotIds
2. Manually fix coordinates in Firestore Console
3. Re-run backfill script

### Issue: Pre-population script hits OpenAI rate limit

**Cause:** Too many requests per minute (OpenAI TPM limit)

**Fix:**
1. Reduce batch size: `--limit 50` → `--limit 10`
2. Add longer pause between batches (edit script line 126)
3. Spread over multiple days

### Issue: Cloud Function not triggering on check-in

**Cause:** Function deployment failed or wrong collection path

**Fix:**
1. Check function is active: `firebase functions:list`
2. Verify trigger path: `checkins/{checkinId}`
3. Check logs: `firebase functions:log`
4. Redeploy function

### Issue: Filters return no results

**Cause:** Indexes not ready or query too restrictive

**Fix:**
1. Verify indexes: `firebase firestore:indexes`
2. Check query combines >2 inequality filters (Firestore limitation)
3. Move some filters to client-side (edit `FIRESTORE_FILTERS` in FilterBottomSheet.tsx)

---

## Cost Estimation

### One-Time Costs (Pre-Population)

| Service | Usage | Cost |
|---------|-------|------|
| OpenAI GPT-4o-mini | 10k spots × 10 reviews | ~$250 |
| Google Places API | 10k spot details | Free (< 100k/mo) |
| Yelp Fusion API | 5k spot details | Free (< 5k/day) |
| **Total One-Time** | | **~$250** |

### Ongoing Costs (Per Month, 10k active users)

| Service | Usage | Cost |
|---------|-------|------|
| Firestore Reads | 500k reads (geohash queries) | $0.18 |
| Firestore Writes | 50k writes (check-ins) | $0.54 |
| Cloud Functions | 50k invocations | $0.00 (free tier) |
| Cloud Functions Compute | 50k × 1s × 512MB | $0.25 |
| **Total Monthly** | | **~$1-2** |

**Note:** OpenAI costs drop to near-zero after pre-population (only new spots analyzed).

---

## Support

For issues or questions:
- Check logs: `firebase functions:log`
- Review Firestore Console for data issues
- Contact backend team for schema or validation errors

**Phase A + Phase 1 deployment complete! 🎉**
