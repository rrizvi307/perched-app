# Perched B2B API
Last updated: 2026-02-10
Reference implementation: `functions/src/index.ts` (`b2bGenerateAPIKey`, `b2bGetSpotData`, `b2bGetNearbySpots`, `b2bGetUsageStats`).

## 1) Overview
Perched B2B API exposes spot-level utility and crowd metrics from Perched data for partner products.
Primary use cases:
- Delivery/logistics: avoid crowded pickup/dropoff areas.
- Urban/campus planning: monitor demand and crowd distribution.
- Real estate intelligence: compare activity + utility signals by location.
- Third-party discovery apps: enrich place cards with busyness/utility context.
Pricing tiers:
| Tier | Limit |
|---|---:|
| Free | 100 req/hour |
| Pro | 10,000 req/hour |
| Enterprise | 100,000 req/hour |
Base URL pattern:
`https://<region>-<project-id>.cloudfunctions.net`

## 2) Authentication
API keys are generated via admin-only callable `b2bGenerateAPIKey` after partner approval.
Required onboarding fields: `partnerId`, `partnerName`, `tier`, optional `permissions`.
API key format:
- Prefix: `pk_live_`
- Suffix: 32-byte random base64url token
- Example: `pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
How to send key:
- Preferred: `X-API-Key` header
- Also supported for `b2bGetSpotData`: `apiKey` query parameter
Security best practices:
- Never commit keys.
- Store in secret manager/env vault.
- Rotate keys regularly.
- Grant least-privilege permissions.
- Monitor usage + errors per partner.

## 3) Endpoints
Common behavior (HTTPS endpoints):
- CORS allowlist enforced.
- `X-Trace-Id` response header is set.
- Error response includes `error` and `traceId`.

## A) GET/POST /b2bGetSpotData
Purpose: get one spot with aggregated metrics from recent check-ins.
Auth/permission:
- API key required
- key must be active
- permission: `permissions.spotData === true`
- hourly rate limit enforced
Validation (`spotDataSchema`):
- `spotId`: required string, 1..100 chars
Request examples:
```http
GET /b2bGetSpotData?spotId=abc123
X-API-Key: pk_live_xxx
```
```http
POST /b2bGetSpotData
Content-Type: application/json
X-API-Key: pk_live_xxx

{
  "spotId": "abc123"
}
```
Success response (200):
```json
{
  "spot": {
    "id": "abc123",
    "name": "Perched Coffee Lab",
    "location": { "lat": 29.7174, "lng": -95.4018 },
    "address": "123 Campus Dr, Houston, TX",
    "type": "cafe",
    "avgWifi": 4.2,
    "avgNoise": 2.7,
    "avgBusyness": 3.1,
    "totalCheckins": 87
  },
  "traceId": "f0f2cfb53c6d6d0c8c1c2f6e12e3b7ae"
}
```
Implementation notes:
- Metrics computed from latest 100 check-ins where `spotPlaceId == spotId`.
- `avgWifi` from `checkin.wifiQuality` numeric values.
- `avgNoise` from `checkin.noise` numeric values.
- `avgBusyness` from `checkin.busyness` numeric values.
- Averages are `null` if no valid values.
Error codes:
- 401 invalid/missing API key
- 403 inactive key or missing `spotData` permission
- 404 spot not found
- 429 rate limit exceeded
- 500 internal error
Also possible: 400 validation error, 405 method not allowed.
Error examples:
```json
{ "error": "Invalid API key", "traceId": "..." }
```
```json
{ "error": "Forbidden: spotData permission required", "traceId": "..." }
```
```json
{ "error": "Rate limit exceeded", "retryAfter": 1720, "traceId": "..." }
```

## B) POST /b2bGetNearbySpots
Purpose: get nearby spots sorted by busyness (lowest first).
Auth/permission:
- API key required (`X-API-Key`)
- key must be active
- permission: `permissions.nearbySpots === true`
- hourly rate limit enforced
Validation (`nearbySchema`):
- `lat`: required number, -90..90
- `lng`: required number, -180..180
- `radius`: optional number, 100..50000, default 5000 (meters)
Request example:
```http
POST /b2bGetNearbySpots
Content-Type: application/json
X-API-Key: pk_live_xxx

{
  "lat": 29.7174,
  "lng": -95.4018,
  "radius": 3000
}
```
Success response (200):
```json
{
  "spots": [
    {
      "id": "spot_001",
      "name": "North Library",
      "location": { "lat": 29.7191, "lng": -95.3992 },
      "distance": 412.4,
      "busyness": 1.9,
      "recentCheckins": 12
    },
    {
      "id": "spot_002",
      "name": "Perched Coffee Lab",
      "location": { "lat": 29.7174, "lng": -95.4018 },
      "distance": 640.7,
      "busyness": 2.6,
      "recentCheckins": 8
    }
  ],
  "traceId": "205f3d7280f936d1d8916b7e84552f0b"
}
```
Implementation notes:
- Current function loads up to 100 spot docs, then filters by distance.
- Busyness is calculated from check-ins within last 2 hours.
- Returns max 20 spots.
Error codes:
- 401 invalid/missing API key
- 403 inactive key or missing `nearbySpots` permission
- 429 rate limit exceeded
- 500 internal error
Also possible: 400 validation error, 405 method not allowed.

## C) b2bGetUsageStats (callable)
Purpose: partner usage analytics for dashboarding.
Auth:
- Firebase Auth required (`context.auth`)
- requester must own `partnerId` OR have admin claim
Input:
```json
{
  "partnerId": "partner_abc",
  "timeRangeMs": 604800000
}
```
- `partnerId` required
- `timeRangeMs` optional (default 7 days)
Success response:
```json
{
  "success": true,
  "stats": {
    "partnerId": "partner_abc",
    "partnerName": "Campus Mobility Inc",
    "tier": "pro",
    "rateLimit": 10000,
    "currentUsage": 1337,
    "timeRange": {
      "start": 1738512000000,
      "end": 1739116800000,
      "durationMs": 604800000
    },
    "totalRequests": 2451,
    "totalErrors": 19,
    "errorRate": 0.00775,
    "endpointBreakdown": {
      "getSpotData": 1680,
      "getNearbySpots": 771
    },
    "recentMetrics": [
      {
        "traceId": "...",
        "partnerId": "partner_abc",
        "endpoint": "getSpotData",
        "spotId": "abc123",
        "timestamp": 1739116700000,
        "responseTimeMs": 312,
        "statusCode": 200
      }
    ]
  }
}
```
Callable error classes:
- `unauthenticated`
- `invalid-argument`
- `permission-denied`
- `not-found`
- `internal`

## 4) Rate Limiting
Rate limiting is transaction-based on the API key doc (`currentUsage`, `rateLimit`, `lastResetAt`).
Rules:
- Usage window resets every 1 hour.
- If reset window passed, usage is set to 1.
- Otherwise usage increments and is blocked at limit.
429 behavior:
```json
{ "error": "Rate limit exceeded", "retryAfter": 1720, "traceId": "..." }
```
Notes:
- `retryAfter` is seconds until next reset.
- Current implementation returns it in JSON body (no HTTP `Retry-After` header yet).
Best practices:
- exponential backoff + jitter
- honor `retryAfter`
- cache responses where safe
- avoid unnecessary burst traffic

## 5) CORS Policy
Allowed origins in current code:
- `https://perched.app`
- `https://www.perched.app`
- `https://business.perched.app`
- `https://partner-dashboard.perched.app`
- `http://localhost:8081`
- `http://localhost:19006`
For custom origins, contact support.

## 6) Error Handling
Standard HTTP error body:
```json
{ "error": "<message>", "traceId": "<trace-id>" }
```
Error code table:
| Code | Meaning |
|---:|---|
| 401 | Invalid/missing API key |
| 403 | Permission denied or inactive key |
| 404 | Spot not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
Also possible in implementation:
- 400: validation failed
- 405: method not allowed
Debugging requirement:
- Capture `X-Trace-Id` header + `traceId` body value.

## 7) Request Tracing
Every HTTPS response includes `X-Trace-Id`.
Every JSON response also includes `traceId`.
Backend logs are structured with trace ID, endpoint, partner, status code, and duration.
Include trace IDs in all support tickets.

## 8) Data Model
Spot object (`b2bGetSpotData`):
```ts
interface Spot {
  id: string;
  name: string;
  location: unknown;
  address?: string;
  type?: string;
  avgWifi: number | null;
  avgNoise: number | null;
  avgBusyness: number | null;
  totalCheckins: number;
}
```
Nearby spot object (`b2bGetNearbySpots`):
```ts
interface NearbySpot {
  id: string;
  name: string;
  location: { lat: number; lng: number };
  distance: number; // meters
  busyness: number | null;
  recentCheckins: number;
}
```
Usage stats (`b2bGetUsageStats`):
```ts
interface UsageStats {
  partnerId: string;
  partnerName: string;
  tier: 'free' | 'pro' | 'enterprise';
  rateLimit: number;
  currentUsage: number;
  timeRange: { start: number; end: number; durationMs: number };
  totalRequests: number;
  totalErrors: number;
  errorRate: number;
  endpointBreakdown: Record<string, number>;
  recentMetrics: Array<Record<string, unknown>>;
}
```
Location format:
- Nearby endpoint always returns normalized `{ lat, lng }`.
- SpotData endpoint returns stored `spot.location` as-is.

## 9) SLA Guarantees
Target SLO/SLA values for partner workloads:
- `b2bGetSpotData` p95 latency: < 1s
- `b2bGetNearbySpots` p95 latency: < 2s
- Error rate: < 5%
- Uptime: 99.5%

## 10) Getting Started
1. Request partner approval + API key.
2. Confirm tier and permission flags.
3. Test with curl/Postman.
4. Integrate with retries/backoff and caching.
5. Add usage dashboard via callable `b2bGetUsageStats`.
6. Monitor trace IDs and errors in your logs.

## 11) Code Examples
cURL: spot data GET
```bash
curl -X GET \
  "https://us-central1-your-project.cloudfunctions.net/b2bGetSpotData?spotId=abc123" \
  -H "X-API-Key: pk_live_xxx"
```
cURL: nearby spots POST
```bash
curl -X POST \
  "https://us-central1-your-project.cloudfunctions.net/b2bGetNearbySpots" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: pk_live_xxx" \
  -d '{"lat":29.7174,"lng":-95.4018,"radius":5000}'
```
JavaScript/Node fetch example
```js
async function getSpotData(spotId) {
  const res = await fetch(
    `https://us-central1-your-project.cloudfunctions.net/b2bGetSpotData?spotId=${encodeURIComponent(spotId)}`,
    { headers: { 'X-API-Key': process.env.PERCHED_API_KEY } }
  );
  const traceId = res.headers.get('X-Trace-Id');
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`status=${res.status} error=${body.error} traceId=${traceId} retryAfter=${body.retryAfter || 'n/a'}`);
  }
  return body.spot;
}
```
Python requests example
```python
import requests
BASE = "https://us-central1-your-project.cloudfunctions.net"
API_KEY = "pk_live_xxx"
resp = requests.post(
    f"{BASE}/b2bGetNearbySpots",
    headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
    json={"lat": 29.7174, "lng": -95.4018, "radius": 5000},
    timeout=10,
)
trace_id = resp.headers.get("X-Trace-Id")
body = resp.json()
if resp.status_code != 200:
    raise RuntimeError(f"status={resp.status_code} error={body.get('error')} traceId={trace_id}")
print(body["spots"])
```
Error handling helper
```js
function assertOk(res, body) {
  const traceId = res.headers.get('X-Trace-Id') || body.traceId;
  if (!res.ok) throw new Error(`B2B API error ${res.status}: ${body.error} traceId=${traceId}`);
}
```

## 12) Support
Support email: `perchedappteam@gmail.com`
Include in support tickets: `traceId`, `X-Trace-Id`, endpoint name, timestamp/timezone, partnerId.
API status page: planned (future).
