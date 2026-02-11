# Perched Production Deployment Runbook

**Last Updated:** 2026-02-09
**Version:** 1.0
**Owner:** Engineering Team

This runbook covers the complete deployment process for Perched's production infrastructure, including Cloud Functions, Secret Manager, Firestore indexes, and Cloud Scheduler.

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [GCP Project Setup](#gcp-project-setup)
3. [Secret Manager Configuration](#secret-manager-configuration)
4. [Cloud Functions Deployment](#cloud-functions-deployment)
5. [Firestore Index Creation](#firestore-index-creation)
6. [Cloud Scheduler Setup](#cloud-scheduler-setup)
7. [Monitoring & Verification](#monitoring--verification)
8. [Rollback Procedures](#rollback-procedures)
9. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

**Before deploying to production, ensure ALL of the following are complete:**

### Code Quality Gates

```bash
# 1. TypeScript compilation must pass
npm run typecheck
# Expected: No errors

# 2. All tests must pass
npm test -- --runInBand
# Expected: All suites pass (185+ tests)

# 3. Cloud Functions tests must pass
cd functions
npm test -- --runInBand
# Expected: 40/40 B2B tests pass

# 4. Coverage thresholds must be met
npm test -- --coverage
# Expected: Global coverage ≥70%

# 5. Build must succeed
cd functions
npm run build
# Expected: Compilation successful, lib/ directory created
```

### Environment Verification

- [ ] Firebase project ID confirmed: `[YOUR_PROJECT_ID]`
- [ ] GCP project ID confirmed: `[YOUR_PROJECT_ID]`
- [ ] GCP billing enabled and verified
- [ ] Firebase Blaze plan active (required for Cloud Functions)
- [ ] User has Owner or Editor role on GCP project
- [ ] Firebase CLI authenticated: `firebase login`
- [ ] Correct project selected: `firebase use [PROJECT_ID]`

### API Keys Ready

- [ ] Foursquare API key obtained from https://foursquare.com/developers
- [ ] Yelp API key obtained from https://www.yelp.com/developers
- [ ] Slack incoming webhook URL created (see [Slack Setup](#slack-incoming-webhook-setup))
- [ ] Place Intelligence proxy secret generated (see [Secret Generation](#secret-generation))

---

## GCP Project Setup

### 1. Enable Required APIs

```bash
# Enable Secret Manager API
gcloud services enable secretmanager.googleapis.com

# Enable Cloud Scheduler API
gcloud services enable cloudscheduler.googleapis.com

# Enable Cloud Functions API
gcloud services enable cloudfunctions.googleapis.com

# Enable Cloud Build API
gcloud services enable cloudbuild.googleapis.com

# Verify APIs are enabled
gcloud services list --enabled | grep -E 'secretmanager|cloudscheduler|cloudfunctions|cloudbuild'
```

### 2. Set Default Project

```bash
# Set your GCP project
export PROJECT_ID="your-project-id"
gcloud config set project $PROJECT_ID

# Verify
gcloud config get-value project
```

### 3. Grant Cloud Functions Service Account Permissions

```bash
# Get the Cloud Functions service account
export CF_SA="${PROJECT_ID}@appspot.gserviceaccount.com"

# Grant Secret Manager access
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${CF_SA}" \
  --role="roles/secretmanager.secretAccessor"

# Verify
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:${CF_SA}"
```

---

## Secret Manager Configuration

### Secret Generation

Generate a cryptographically secure secret for place intelligence proxy:

```bash
# Generate 32-byte random secret
openssl rand -base64 32
# Copy this value for PLACE_INTEL_PROXY_SECRET
```

### Slack Incoming Webhook Setup

1. Go to https://api.slack.com/messaging/webhooks
2. Click "Create your Slack app" → "From scratch"
3. Name: "Perched Alerts", Workspace: [Your workspace]
4. Navigate to "Incoming Webhooks" → Toggle "Activate Incoming Webhooks" ON
5. Click "Add New Webhook to Workspace"
6. Select channel: `#perched-alerts` (or create new channel)
7. Copy webhook URL (format: `<slack-webhook-url>`)

### Create Secrets in Secret Manager

**IMPORTANT:** Use the exact secret names below. Cloud Functions code references these names.

```bash
# 1. FOURSQUARE_API_KEY
echo -n "YOUR_FOURSQUARE_API_KEY_HERE" | \
  gcloud secrets create FOURSQUARE_API_KEY \
    --data-file=- \
    --replication-policy="automatic"

# 2. YELP_API_KEY
echo -n "YOUR_YELP_API_KEY_HERE" | \
  gcloud secrets create YELP_API_KEY \
    --data-file=- \
    --replication-policy="automatic"

# 3. SLACK_WEBHOOK_URL
echo -n "<slack-webhook-url>" | \
  gcloud secrets create SLACK_WEBHOOK_URL \
    --data-file=- \
    --replication-policy="automatic"

# 4. PLACE_INTEL_PROXY_SECRET
echo -n "YOUR_GENERATED_SECRET_FROM_ABOVE" | \
  gcloud secrets create PLACE_INTEL_PROXY_SECRET \
    --data-file=- \
    --replication-policy="automatic"
```

### Verify Secrets Created

```bash
# List all secrets
gcloud secrets list

# Verify each secret exists and has a version
gcloud secrets versions access latest --secret="FOURSQUARE_API_KEY"
gcloud secrets versions access latest --secret="YELP_API_KEY"
gcloud secrets versions access latest --secret="SLACK_WEBHOOK_URL"
gcloud secrets versions access latest --secret="PLACE_INTEL_PROXY_SECRET"
```

### Grant Cloud Functions Access to Secrets

```bash
# For each secret, grant the Cloud Functions service account access
for secret in FOURSQUARE_API_KEY YELP_API_KEY SLACK_WEBHOOK_URL PLACE_INTEL_PROXY_SECRET; do
  gcloud secrets add-iam-policy-binding $secret \
    --member="serviceAccount:${CF_SA}" \
    --role="roles/secretmanager.secretAccessor"
done

# Verify access
gcloud secrets get-iam-policy FOURSQUARE_API_KEY
```

---

## Cloud Functions Deployment

### 1. Install Dependencies

```bash
cd functions
npm install

# Verify all dependencies installed
npm ls --depth=0
```

### 2. Build Functions

```bash
npm run build

# Verify build output
ls -la lib/
# Should see index.js and other compiled files
```

### 3. Deploy All Functions

**Note:** First deployment may take 5-10 minutes.

```bash
# Deploy all functions (from /functions directory)
npm run deploy

# OR deploy manually with Firebase CLI
firebase deploy --only functions
```

**Expected Output:**
```
✔  functions: Finished running predeploy script.
i  functions: preparing codebase functions for deployment
i  functions: ensuring required API cloudfunctions.googleapis.com is enabled...
i  functions: ensuring required API cloudbuild.googleapis.com is enabled...
✔  functions: required API cloudfunctions.googleapis.com is enabled
✔  functions: required API cloudbuild.googleapis.com is enabled
i  functions: uploading functions source code...
✔  functions: functions source uploaded successfully
i  functions: creating Node.js 20 function b2bGenerateAPIKey...
i  functions: creating Node.js 20 function b2bGetSpotData...
i  functions: creating Node.js 20 function b2bGetNearbySpots...
i  functions: creating Node.js 20 function b2bGetUsageStats...
i  functions: creating Node.js 20 function checkSLOViolations...
✔  functions[b2bGenerateAPIKey] Successful create operation.
✔  functions[b2bGetSpotData] Successful create operation.
✔  functions[b2bGetNearbySpots] Successful create operation.
✔  functions[b2bGetUsageStats] Successful create operation.
✔  functions[checkSLOViolations] Successful create operation.

✔  Deploy complete!
```

### 4. Get Function URLs

```bash
# List all deployed functions with URLs
firebase functions:list

# Get specific function URLs
firebase functions:config:get b2bGetSpotData
firebase functions:config:get b2bGetNearbySpots
```

**Save these URLs for testing:**
- `https://us-central1-[PROJECT_ID].cloudfunctions.net/b2bGetSpotData`
- `https://us-central1-[PROJECT_ID].cloudfunctions.net/b2bGetNearbySpots`

### 5. Verify Functions Deployed

```bash
# Check Cloud Functions console
gcloud functions list --project=$PROJECT_ID

# Expected output:
# NAME                    STATUS  TRIGGER       REGION
# b2bGenerateAPIKey       ACTIVE  HTTP Trigger  us-central1
# b2bGetSpotData          ACTIVE  HTTP Trigger  us-central1
# b2bGetNearbySpots       ACTIVE  HTTP Trigger  us-central1
# b2bGetUsageStats        ACTIVE  HTTP Trigger  us-central1
# checkSLOViolations      ACTIVE  Event Trigger us-central1
```

---

## Firestore Index Creation

### Required Indexes for B2B API Performance

**1. Performance Metrics Query Index**

```bash
# Index for SLO violation detection (timestamp + operation)
gcloud firestore indexes composite create \
  --collection-group=performanceMetrics \
  --field-config field-path=timestamp,order=DESCENDING \
  --field-config field-path=operation,order=ASCENDING \
  --project=$PROJECT_ID
```

**2. API Keys Query Index**

```bash
# Index for API key lookup (key + active status)
gcloud firestore indexes composite create \
  --collection-group=apiKeys \
  --field-config field-path=key,order=ASCENDING \
  --field-config field-path=active,order=ASCENDING \
  --project=$PROJECT_ID
```

**3. B2B Metrics Query Index**

```bash
# Index for usage analytics (partnerId + timestamp)
gcloud firestore indexes composite create \
  --collection-group=b2bMetrics \
  --field-config field-path=partnerId,order=ASCENDING \
  --field-config field-path=timestamp,order=DESCENDING \
  --project=$PROJECT_ID
```

**4. SLO Violations Query Index**

```bash
# Index for violation alerts (timestamp + severity)
gcloud firestore indexes composite create \
  --collection-group=sloViolations \
  --field-config field-path=timestamp,order=DESCENDING \
  --field-config field-path=severity,order=ASCENDING \
  --project=$PROJECT_ID
```

### Verify Index Creation

```bash
# List all indexes
gcloud firestore indexes composite list --project=$PROJECT_ID

# Check index status (should be READY, not CREATING)
# Wait 5-10 minutes for indexes to build if status is CREATING
```

**Index Building Time:**
- Empty database: 1-2 minutes
- With existing data: 5-10 minutes
- Large datasets (1M+ docs): 30-60 minutes

---

## Cloud Scheduler Setup

### Create SLO Monitoring Job

**Purpose:** Runs `checkSLOViolations` function every 5 minutes to detect performance issues.

```bash
# Create Cloud Scheduler job
gcloud scheduler jobs create pubsub slo-monitor-job \
  --schedule="*/5 * * * *" \
  --topic="firebase-schedule-checkSLOViolations-us-central1" \
  --message-body="{}" \
  --time-zone="America/Chicago" \
  --project=$PROJECT_ID \
  --description="Monitor SLO violations every 5 minutes"
```

**Schedule Format:** `*/5 * * * *` = Every 5 minutes
**Topic Name:** Auto-created by Firebase Functions deployment

### Verify Scheduler Job

```bash
# List all jobs
gcloud scheduler jobs list --project=$PROJECT_ID

# Expected output:
# ID                                                    LOCATION      SCHEDULE      TARGET_TYPE
# slo-monitor-job                                       us-central1   */5 * * * *   Pub/Sub

# Check job details
gcloud scheduler jobs describe slo-monitor-job --project=$PROJECT_ID
```

### Manually Trigger Job (Testing)

```bash
# Force run the job immediately
gcloud scheduler jobs run slo-monitor-job --project=$PROJECT_ID

# Check Cloud Functions logs to verify execution
firebase functions:log --only checkSLOViolations --limit 50
```

---

## Monitoring & Verification

### 1. Test B2B API Endpoints

**Generate Test API Key (Admin Only)**

From Firebase Console or using Firebase Auth:
1. Get admin user ID token
2. Call `b2bGenerateAPIKey` function

```javascript
// Example: Generate API key via Firebase callable function
const functions = firebase.functions();
const generateKey = functions.httpsCallable('b2bGenerateAPIKey');

const result = await generateKey({
  partnerId: 'test-partner',
  partnerName: 'Test Partner Inc',
  tier: 'free',
  permissions: { spotData: true, nearbySpots: true, usageStats: true }
});

console.log('API Key:', result.data.apiKey);
// Save this key: pk_live_xxxxxxxxxxxxx
```

**Test GET Spot Data**

```bash
# Replace with your function URL and API key
export API_KEY="pk_live_xxxxxxxxxxxxx"
export FUNCTION_URL="https://us-central1-YOUR_PROJECT.cloudfunctions.net/b2bGetSpotData"

# Test valid request
curl -X GET "${FUNCTION_URL}?spotId=test-spot-123" \
  -H "X-API-Key: ${API_KEY}" \
  -H "Content-Type: application/json"

# Expected response:
# {
#   "spot": {
#     "id": "test-spot-123",
#     "name": "Coffee Shop",
#     "location": { "lat": 29.76, "lng": -95.36 },
#     "avgWifi": 4.5,
#     "avgNoise": 2.3,
#     "avgBusyness": 3.1,
#     "totalCheckins": 42
#   },
#   "traceId": "abcdef123456"
# }
```

**Test POST Nearby Spots**

```bash
export FUNCTION_URL="https://us-central1-YOUR_PROJECT.cloudfunctions.net/b2bGetNearbySpots"

curl -X POST $FUNCTION_URL \
  -H "X-API-Key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 29.7604,
    "lng": -95.3698,
    "radius": 5000
  }'

# Expected response:
# {
#   "spots": [
#     { "id": "spot1", "name": "Cafe 1", "busyness": 2.1, "distance": 450 },
#     { "id": "spot2", "name": "Cafe 2", "busyness": 3.5, "distance": 890 }
#   ],
#   "traceId": "xyz789"
# }
```

**Test Rate Limiting**

```bash
# Make 101 requests rapidly (should get 429 on 101st)
for i in {1..101}; do
  curl -X GET "${FUNCTION_URL}?spotId=test" \
    -H "X-API-Key: ${API_KEY}" \
    -s -o /dev/null -w "%{http_code}\n"
done

# Expected: First 100 return 200, 101st returns 429
```

**Test Invalid API Key**

```bash
curl -X GET "${FUNCTION_URL}?spotId=test" \
  -H "X-API-Key: invalid-key-123"

# Expected: 401 Unauthorized
```

### 2. Verify Firestore Collections

```bash
# Check that metrics are being written
gcloud firestore documents list performanceMetrics --limit=10 --project=$PROJECT_ID

# Check B2B API usage logs
gcloud firestore documents list b2bMetrics --limit=10 --project=$PROJECT_ID

# Check SLO violations (may be empty if no violations)
gcloud firestore documents list sloViolations --limit=10 --project=$PROJECT_ID

# Check API keys
gcloud firestore documents list apiKeys --limit=10 --project=$PROJECT_ID
```

### 3. Check Cloud Logging

**View B2B API Request Logs**

```bash
# View structured logs from Winston logger
gcloud logging read "resource.type=cloud_function AND jsonPayload.service=perched-b2b-api" \
  --limit=50 \
  --format=json \
  --project=$PROJECT_ID

# View only errors
gcloud logging read "resource.type=cloud_function AND severity>=ERROR" \
  --limit=20 \
  --project=$PROJECT_ID
```

**View SLO Monitoring Logs**

```bash
# Check checkSLOViolations function execution
firebase functions:log --only checkSLOViolations --limit 20

# Look for lines like:
# "Detected 2 SLO violations"
# "Sent Slack alert for 1 violations"
```

### 4. Verify Slack Alerts

**Trigger Test Violation:**

Option A: Manually create violation in Firestore:
```javascript
// In Firebase Console or via script
db.collection('sloViolations').add({
  operation: 'test_operation',
  violationTypes: ['p95', 'p99'],
  p50: 150,
  p95: 1200,
  p99: 2500,
  errorRate: 0.02,
  sloTargets: { p50: 200, p95: 500, p99: 1000, errorRate: 0.01 },
  severity: 'high',
  priority: 'critical',
  timestamp: Date.now(),
  metricCount: 10
});
```

Option B: Trigger scheduler job manually:
```bash
gcloud scheduler jobs run slo-monitor-job --project=$PROJECT_ID
```

**Expected Result:** Slack message in #perched-alerts channel:
```
🚨 SLO Violation Detected

1 critical violation(s) detected in the last 5 minutes:

• test_operation: p95, p99 exceeded (high severity)
  p95: 1200ms / 500ms

Timestamp: Feb 9, 2026 at 10:30 AM
```

### 5. Access Observability Dashboard

**In Perched App (Admin Only):**

1. Log in as admin user (with `admin: true` custom claim)
2. Navigate to Settings → Admin Panel → Observability
3. Verify dashboard loads with:
   - ✅ SLO compliance status (green/yellow/red indicators)
   - ✅ Latency trend charts (p50/p95/p99 lines)
   - ✅ Error rate bars per operation
   - ✅ Recent violations table
   - ✅ Top 10 slow operations list
   - ✅ Cache hit rate metrics

**Troubleshooting Dashboard:**
- Empty charts: App needs to run for 5-10 minutes to generate metrics
- "Not authorized": User needs admin custom claim set in Firebase Auth
- Metrics not appearing: Check `perfMonitor.ts` is called in app code

---

## Rollback Procedures

### Scenario 1: Cloud Functions Deployment Failed

**Symptoms:** Functions not responding, 500 errors, deployment errors

**Rollback Steps:**

```bash
# 1. List previous versions
gcloud functions list --project=$PROJECT_ID

# 2. Get deployment history
firebase functions:log --only b2bGetSpotData --limit 100

# 3. Rollback to previous version
firebase rollback functions:b2bGetSpotData
# Repeat for other affected functions

# OR: Redeploy from previous git commit
git checkout [PREVIOUS_COMMIT_HASH]
cd functions
npm install
npm run build
firebase deploy --only functions
git checkout main
```

**Validation:**
```bash
# Test endpoints again
curl -X GET "${FUNCTION_URL}?spotId=test" -H "X-API-Key: ${API_KEY}"
```

### Scenario 2: Secret Manager Issues

**Symptoms:** Functions crash with "secret not found" errors, 500 responses

**Rollback Steps:**

```bash
# 1. Check if secret exists
gcloud secrets list --project=$PROJECT_ID

# 2. Verify version
gcloud secrets versions access latest --secret="FOURSQUARE_API_KEY"

# 3. If corrupted, recreate secret
gcloud secrets delete FOURSQUARE_API_KEY --project=$PROJECT_ID
echo -n "CORRECT_KEY_VALUE" | gcloud secrets create FOURSQUARE_API_KEY --data-file=-

# 4. Grant access again
gcloud secrets add-iam-policy-binding FOURSQUARE_API_KEY \
  --member="serviceAccount:${CF_SA}" \
  --role="roles/secretmanager.secretAccessor"

# 5. Restart affected functions (triggers reload)
gcloud functions deploy b2bGetSpotData --project=$PROJECT_ID
```

### Scenario 3: Firestore Index Corruption

**Symptoms:** Queries timing out, "index not found" errors

**Rollback Steps:**

```bash
# 1. Delete corrupted index
gcloud firestore indexes composite delete INDEX_NAME --project=$PROJECT_ID

# 2. Recreate index (see Firestore Index Creation section)
gcloud firestore indexes composite create \
  --collection-group=performanceMetrics \
  --field-config field-path=timestamp,order=DESCENDING \
  --field-config field-path=operation,order=ASCENDING

# 3. Wait for READY status
gcloud firestore indexes composite list --project=$PROJECT_ID
```

### Scenario 4: SLO Monitoring Flooding Slack

**Symptoms:** Too many Slack alerts, alert fatigue

**Immediate Action:**

```bash
# 1. Pause Cloud Scheduler job
gcloud scheduler jobs pause slo-monitor-job --project=$PROJECT_ID

# 2. Clear recent violations
# In Firebase Console: Delete all docs in sloViolations collection

# 3. Adjust SLO thresholds in functions/src/index.ts
# Edit lines 1149-1155, increase targets:
# 'checkin_query': { p50: 300, p95: 800, p99: 1500, ... }  # More lenient

# 4. Redeploy
cd functions && npm run build && firebase deploy --only functions

# 5. Resume scheduler
gcloud scheduler jobs resume slo-monitor-job --project=$PROJECT_ID
```

### Scenario 5: Critical Production Incident

**P0 Incident - Complete Rollback:**

```bash
# 1. STOP ALL TRAFFIC - Pause Cloud Scheduler
gcloud scheduler jobs pause slo-monitor-job --project=$PROJECT_ID

# 2. Get last known good deployment
git log --oneline | head -20
# Find commit before incident

# 3. Checkout last good version
git checkout [GOOD_COMMIT_HASH]

# 4. Full redeploy
cd functions
npm install
npm run build
firebase deploy --only functions

# 5. Verify all endpoints working
./test-endpoints.sh  # Create script from test commands above

# 6. Document incident
# Create post-mortem in docs/incidents/YYYY-MM-DD-incident.md

# 7. Resume normal operations
gcloud scheduler jobs resume slo-monitor-job --project=$PROJECT_ID
git checkout main
```

---

## Troubleshooting

### Issue: "Permission Denied" During Deployment

**Error:**
```
Error: HTTP Error: 403, The caller does not have permission
```

**Fix:**
```bash
# Verify you have correct role
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:YOUR_EMAIL"

# If missing, add yourself as editor
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="user:YOUR_EMAIL@example.com" \
  --role="roles/editor"
```

### Issue: Functions Not Accessing Secrets

**Error in logs:**
```
Error fetching secret FOURSQUARE_API_KEY: PERMISSION_DENIED
```

**Fix:**
```bash
# Grant Cloud Functions service account access
gcloud secrets add-iam-policy-binding FOURSQUARE_API_KEY \
  --member="serviceAccount:${PROJECT_ID}@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Restart function to reload
gcloud functions deploy placeIntelligenceProxy --project=$PROJECT_ID
```

### Issue: Firestore Query Timeout

**Error:**
```
DEADLINE_EXCEEDED: The query requires an index
```

**Fix:**
```bash
# Check index status
gcloud firestore indexes composite list --project=$PROJECT_ID

# If index is CREATING, wait 5-10 minutes
# If index is FAILED, delete and recreate:
gcloud firestore indexes composite delete INDEX_NAME
# Then recreate (see Firestore Index Creation section)
```

### Issue: Rate Limit Not Resetting

**Symptom:** API key stuck at rate limit even after 1 hour

**Fix:**
```javascript
// Manually reset in Firestore
// Firebase Console → Firestore → apiKeys collection → [key document]
// Update fields:
{
  currentUsage: 0,
  lastResetAt: Date.now()
}
```

### Issue: Slack Alerts Not Sending

**Error in logs:**
```
Slack webhook failed: 404
```

**Fix:**
```bash
# 1. Verify webhook URL is correct
gcloud secrets versions access latest --secret="SLACK_WEBHOOK_URL"

# 2. Test webhook manually
curl -X POST "YOUR_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"text": "Test alert"}'

# 3. If URL changed, update secret
echo -n "NEW_WEBHOOK_URL" | gcloud secrets versions add SLACK_WEBHOOK_URL --data-file=-

# 4. Restart checkSLOViolations function
firebase deploy --only functions:checkSLOViolations
```

### Issue: High Cloud Functions Cost

**Symptom:** Unexpected GCP billing spike

**Investigation:**
```bash
# Check function invocation counts
gcloud logging read "resource.type=cloud_function" \
  --format="table(timestamp, resource.labels.function_name)" \
  --limit=1000 \
  --project=$PROJECT_ID | sort | uniq -c

# Check for excessive retries or errors
gcloud logging read "resource.type=cloud_function AND severity>=ERROR" \
  --limit=100 \
  --project=$PROJECT_ID
```

**Mitigation:**
```bash
# 1. Reduce checkSLOViolations frequency (if excessive)
gcloud scheduler jobs update pubsub slo-monitor-job \
  --schedule="*/10 * * * *"  # Change to every 10 minutes

# 2. Add min instances = 0 to reduce idle costs (already default)
# 3. Review and optimize Firestore queries (add indexes)
# 4. Enable caching in functions (already implemented with 5-min TTL)
```

---

## Emergency Contacts

**On-Call Engineering:**
- Primary: [Your Email/Phone]
- Secondary: [Backup Contact]

**GCP Support:**
- Support Portal: https://console.cloud.google.com/support
- Support Level: [Basic/Standard/Enhanced/Premium]

**Firebase Support:**
- Console: https://console.firebase.google.com/project/[PROJECT_ID]/support
- Slack Plan: [Flame/Blaze]

---

## Post-Deployment Validation Checklist

After deployment, verify the following within 24 hours:

- [ ] All B2B API endpoints responding (200 OK)
- [ ] Rate limiting working (429 after limit exceeded)
- [ ] Structured logging appearing in Cloud Logging
- [ ] Performance metrics being written to Firestore
- [ ] SLO monitoring job running every 5 minutes
- [ ] Slack alerts received for test violation
- [ ] Observability dashboard loading for admin users
- [ ] Error budget calculations accurate
- [ ] No unexpected GCP costs in billing console
- [ ] All Firestore indexes in READY state
- [ ] Secret Manager secrets accessible by Cloud Functions

---

## Appendix

### Useful Commands Reference

```bash
# Check deployed function versions
gcloud functions list --project=$PROJECT_ID

# View live function logs
gcloud functions logs read FUNCTION_NAME --limit=100 --project=$PROJECT_ID

# Check Firestore collection sizes
gcloud firestore databases describe --project=$PROJECT_ID

# Export Firestore data (backup)
gcloud firestore export gs://YOUR_BUCKET/backup-$(date +%Y%m%d)

# Import Firestore data (restore)
gcloud firestore import gs://YOUR_BUCKET/backup-20260209

# Monitor real-time Cloud Scheduler executions
gcloud logging tail "resource.type=cloud_scheduler_job"

# Check Secret Manager audit logs
gcloud logging read "resource.type=secretmanager.googleapis.com/Secret"
```

### Related Documentation

- [B2B API Documentation](./b2b-api.md) - Partner integration guide
- [SLO Configuration](../services/sloConfig.ts) - Performance targets
- [Error Budget Tracking](../services/errorBudget.ts) - Budget calculations
- [Firebase Functions Docs](https://firebase.google.com/docs/functions)
- [GCP Secret Manager Docs](https://cloud.google.com/secret-manager/docs)
- [Cloud Scheduler Docs](https://cloud.google.com/scheduler/docs)

---

**End of Runbook**
