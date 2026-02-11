# Perched Ops Runbook

## Scope
This runbook is the fast path for production operations on the intelligence rollout:
- Phase A intelligence pre-population
- Demo account seeding
- Feature-flag rollout
- Rollback
- API key/service account rotation

Use this with:
- `docs/phase-a-deployment.md` for full background
- `scripts/populateSpotIntelligence.ts`
- `scripts/seedDemoAccount.ts`

## Owners
- App/Frontend: Codex workstream
- Infra/Deploy: Claude workstream
- Final go/no-go: project owner

## Preflight Checklist
1. Ensure local branch is up-to-date and clean enough for deployment commands.
2. Confirm Firebase project is correct:
```bash
firebase use
```
3. Confirm service account file exists locally and is gitignored:
```bash
test -f perched-service-account.json && echo "service account present"
rg -n "perched-service-account.json" .gitignore
```
4. Confirm required keys are available via environment (preferred):
```bash
echo "$GOOGLE_MAPS_API_KEY" | wc -c
echo "$YELP_API_KEY" | wc -c
echo "$FOURSQUARE_API_KEY" | wc -c
echo "$OPENAI_API_KEY" | wc -c
```
5. Verify health gates:
```bash
npm run typecheck
npm test -- services/__tests__/integration.test.ts
```

## Secrets Policy
- Do not hardcode keys in scripts or committed config.
- Prefer environment variables for all external API keys.
- Service account JSON must stay local and outside git history.
- Rotate keys immediately if exposed.

## Deployment Order (Production-Safe)
1. Deploy Firestore indexes:
```bash
firebase deploy --only firestore:indexes
```
2. Wait for indexes to finish building in Firebase Console (`READY`).
3. Run geohash backfill dry-run:
```bash
npx ts-node scripts/backfillGeohash.ts --dry-run --limit 20
```
4. Run geohash backfill real:
```bash
npx ts-node scripts/backfillGeohash.ts
```
5. Run intelligence pre-population dry-run:
```bash
npx ts-node scripts/populateSpotIntelligence.ts --dry-run --limit 100 --batch-size 8
```
6. Run intelligence pre-population staged:
```bash
npx ts-node scripts/populateSpotIntelligence.ts --limit 500 --batch-size 8 --pause-ms 2000
```
7. Seed demo account:
```bash
npx ts-node scripts/seedDemoAccount.ts
```
8. Verify data in app/admin tools and Firestore (spot `intel/live/display`, demo user, checkins).
9. Flip feature flag from `false` to `true` for internal cohort first:
- `INTEL_V1_ENABLED=true`
10. Monitor for 24-48 hours before broader rollout.

## Suggested Rollout Stages
1. Internal-only
2. Pilot users (small %)
3. Full rollout

Advance only if:
- No spike in crashes
- No spike in query failures
- Explore/filter latency remains acceptable
- Integrity checks pass (no malformed spot/intel payloads)

## Rollback Plan
### Fast rollback (UI)
Set:
- `INTEL_V1_ENABLED=false`

This hides new intelligence UI while preserving stored data.

### Data-path rollback
If pre-population writes are problematic:
1. Stop script execution immediately.
2. Keep flag off.
3. Patch write logic and rerun in dry-run mode.
4. Optionally clear/recompute bad intel docs with a targeted script (do not mass delete blindly).

### Infra rollback
- Re-deploy last known good Cloud Functions revision.
- Keep indexes (safe to leave in place).

## Key Rotation Checklist
Rotate on schedule or immediately after any exposure.

### Keys to rotate
1. `OPENAI_API_KEY`
2. `GOOGLE_MAPS_API_KEY`
3. `YELP_API_KEY`
4. `FOURSQUARE_API_KEY`
5. Firebase service account key (`perched-service-account.json`)
6. Any other production secrets (Sentry/RevenueCat/etc.)

### Rotation steps
1. Generate new key in provider console.
2. Update secret store / CI / local env.
3. Re-run smoke checks using new key.
4. Deploy if needed.
5. Revoke old key.
6. Confirm no references to old key remain:
```bash
rg -n "AIza|sk-|Bearer|FOURSQUARE|YELP" app.json app.config.js scripts services docs
```

## Incident Response Quick Steps
1. Disable feature flag (`INTEL_V1_ENABLED=false`).
2. Capture scope:
- affected users
- failing endpoint/service
- first failure timestamp
3. Pull logs (functions + client where available).
4. Apply minimal safe fix.
5. Validate in staging/dry-run.
6. Re-enable in phased rollout.

## Verification Checklist After Each Run
- Spot docs have valid `intel` shape.
- `lastUpdated` is populated.
- No malformed enum values for:
  - `intel.inferredNoise`
  - `display.noiseSource`
  - `display.busynessSource`
- Demo user can log in and shows expected feed/check-ins.
- Explore does not crash for spots missing partial fields.

## Command Cheat Sheet
```bash
# Typecheck
npm run typecheck

# Integration tests
npm test -- services/__tests__/integration.test.ts

# Full coverage
npm run test:coverage

# Pre-population dry-run
npx ts-node scripts/populateSpotIntelligence.ts --dry-run --limit 100

# Pre-population run
npx ts-node scripts/populateSpotIntelligence.ts --limit 1000 --batch-size 8 --pause-ms 2000

# Demo seed
npx ts-node scripts/seedDemoAccount.ts
```

## Handoff Notes (Claude)
- Run dry-run first for every script.
- Use staged writes (`--limit`) before full dataset.
- Keep feature flag off until post-run validation is complete.
- If anything fails: stop, collect logs, rollback flag first.
