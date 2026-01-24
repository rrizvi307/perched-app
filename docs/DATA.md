# Data Model and Engineering Notes

This document describes the storage and data engineering decisions for the Perched app. It's intended for resume/project documentation and for future work (indexing, analytics, migration).

## Overview
- Platform: Expo + React Native (web via react-native-web)
- Local persistence: `storage/local.ts` uses `localStorage` on web and an in-memory fallback on native for now.
- Remote persistence: Firestore (optional; controlled via `services/firebaseClient.ts`). Images stored in Firebase Storage (when configured).
- Analytics/logging: `services/logEvent.ts` records events; it attempts Firestore or falls back to console logs when Firebase is not configured.

## Local storage keys
- `spot_checkins_v1` — list of locally persisted check-in objects used for offline/optimistic UX.
- `spot_waitlist_v1` — list of waitlist emails saved locally before remote sync.

## Firestore collections (recommended)
- `users` (document id = `uid`)
  - Fields: `name: string`, `campusOrCity?: string`, `email?: string`, `createdAt: timestamp`
  - Indexes: none required for basic queries; index on `campusOrCity` if you plan to query by campus.

- `checkins` (document id = firestore-assigned)
  - Fields:
    - `userId: string` — reference to `users` doc
    - `photoUrl: string` — storage URL
    - `caption?: string`
    - `spotName?: string` — human-friendly name (from search or typed)
    - `spotPlaceId?: string` — Google Place ID when selected
    - `spotLatLng?: { lat: number, lng: number }` — optional coords
    - `createdAt: timestamp` — indexed for feed ordering
    - `campusOrCity?: string` — denormalized from user for queries
  - Indexes: single-field index on `createdAt` (default). For feed queries by campus, add a composite index like (`campusOrCity`, `createdAt` desc).

- `analytics_events` (optional)
  - Fields: `eventName: string`, `userId?: string`, `metadata?: map`, `createdAt: timestamp`
  - Purpose: durable analytics log for offline replay and auditing.

## Local optimistic model
- When creating a checkin, the UI will:
  1. Save an optimistic local entry with id `local-<ts>` and `createdAt` ISO.
  2. Publish it to a lightweight in-app pub/sub (`services/feedEvents.ts`) so Feed displays it immediately.
  3. Attempt to upload the image and create the remote Firestore document; on success reconcile the remote doc (swap IDs or mark synced), on failure keep the local entry as fallback.

## Image storage
- Images uploaded to `images/{userId}/{timestamp}.jpg` or similar path in Firebase Storage.
- Store public or authenticated download URLs in the `photoUrl` field on the `checkins` document.

## Google Maps integration (Places API)
- The app includes a scaffold `services/googleMaps.ts` which calls the Places Text Search and Place Details endpoints.
- Requirements:
  - Provide `GOOGLE_MAPS_API_KEY` at runtime / build time (for web builds this must be restricted and scoped appropriately).
  - Consider using server-side proxy for secure key handling, or restrict the key to HTTP referrers.
- Data stored when selecting a place:
  - `spotName` — place name
  - `spotPlaceId` — Google Place ID
  - `spotLatLng` — coordinates

## Analytics events (sample)
- `checkin_started` — user opened check-in flow
- `photo_captured` — camera/gallerly capture event
- `photo_uploaded` — image upload complete
- `checkin_created` — successful remote create (metadata: { fallbackLocal?: boolean, hasCaption?: boolean, spotLength?: number })
- `user_signed_up`, `user_upgraded_email`, `user_signed_in_email`, `user_password_changed`, `user_deleted`
- `feed_viewed`, `profile_viewed`

When writing events to Firestore, use a batched writer or server-side collector if you need high throughput or retention guarantees.

## Data engineering considerations
- Denormalize for read performance: keep `campusOrCity` on `checkins` to support quick feed filtering.
- Use server-side Cloud Functions or scheduled jobs for:
  - Cleaning orphaned images (images with no matching checkin)
  - Aggregating popular spots for the `topSpots` display (precompute daily)
- For resume project write-ups:
  - Describe optimistic UI flow, eventual consistency strategies, and trade-offs.
  - Include diagrams: client offline -> optimistic save -> remote write -> reconciliation.
  - Mention data privacy & storage decisions (what's stored, retention, image access controls).

## Migration notes
- If you change schema, provide a migration script or Cloud Function to backfill new fields (e.g., populating `spotPlaceId` or `spotLatLng` from legacy `spot` strings).

---

Add this file to your repo and update it as you change the data model.
