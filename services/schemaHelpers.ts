/**
 * Schema Migration Helpers
 *
 * Centralized helpers for handling Firestore schema migrations:
 * - spotPlaceId → spotId (field rename)
 * - createdAt → timestamp (field rename)
 *
 * This ensures backward compatibility by trying primary schema first,
 * then falling back to legacy schema if no results found.
 */

import type firebase from 'firebase/compat/app';

export interface TimestampValue {
  toDate?: () => Date;
  seconds?: number;
  toMillis?: () => number;
}

/**
 * Parse timestamp from either createdAt (new) or timestamp (legacy) fields
 * Handles Firestore Timestamp, number (milliseconds), or Date formats
 *
 * @param value - Object that may contain createdAt or timestamp field
 * @returns Date object or null if parsing fails
 */
export function parseCheckinTimestamp(value: any): Date | null {
  const ts = value?.createdAt || value?.timestamp;
  if (!ts) return null;

  // Firestore Timestamp with toDate method
  if (typeof ts?.toDate === 'function') {
    try {
      return ts.toDate();
    } catch {
      return null;
    }
  }

  // Firestore Timestamp with seconds field
  if (typeof ts?.seconds === 'number') {
    return new Date(ts.seconds * 1000);
  }

  // Unix timestamp in milliseconds
  if (typeof ts === 'number') {
    return new Date(ts);
  }

  // Try parsing as string or Date
  const parsed = new Date(ts);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Query checkins by spot ID with automatic schema fallback
 *
 * Primary schema: spotPlaceId + createdAt
 * Fallback schema: spotId + timestamp
 *
 * @param db - Firestore database instance
 * @param fb - Firebase instance (for Timestamp creation)
 * @param spotId - The spot ID to query
 * @param options - Query options (date range, limit, ordering)
 * @returns Firestore QuerySnapshot
 */
export async function queryCheckinsBySpot(
  db: firebase.firestore.Firestore,
  fb: typeof firebase,
  spotId: string,
  options?: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    orderBy?: 'asc' | 'desc';
  }
): Promise<firebase.firestore.QuerySnapshot> {
  const { startDate, endDate, limit = 100, orderBy = 'desc' } = options || {};

  // Try primary schema: spotPlaceId + createdAt
  let query: firebase.firestore.Query = db
    .collection('checkins')
    .where('spotPlaceId', '==', spotId)
    .orderBy('createdAt', orderBy);

  if (startDate) {
    query = query.where('createdAt', '>=', fb.firestore.Timestamp.fromDate(startDate));
  }
  if (endDate) {
    query = query.where('createdAt', '<', fb.firestore.Timestamp.fromDate(endDate));
  }
  if (limit > 0) {
    query = query.limit(limit);
  }

  const primary = await query.get();
  if (!primary.empty) return primary;

  // Fallback to legacy schema: spotId + timestamp
  let legacyQuery: firebase.firestore.Query = db
    .collection('checkins')
    .where('spotId', '==', spotId)
    .orderBy('timestamp', orderBy);

  if (startDate) {
    legacyQuery = legacyQuery.where('timestamp', '>=', fb.firestore.Timestamp.fromDate(startDate));
  }
  if (endDate) {
    legacyQuery = legacyQuery.where('timestamp', '<', fb.firestore.Timestamp.fromDate(endDate));
  }
  if (limit > 0) {
    legacyQuery = legacyQuery.limit(limit);
  }

  return legacyQuery.get();
}

/**
 * Query checkins by user ID with automatic schema fallback
 *
 * Primary schema: createdAt
 * Fallback schema: timestamp
 *
 * @param db - Firestore database instance
 * @param fb - Firebase instance
 * @param userId - The user ID to query
 * @param options - Query options (limit, pagination cursor)
 * @returns Firestore QuerySnapshot
 */
export async function queryCheckinsByUser(
  db: firebase.firestore.Firestore,
  fb: typeof firebase,
  userId: string,
  options?: {
    limit?: number;
    startAfter?: any;
  }
): Promise<firebase.firestore.QuerySnapshot> {
  const { limit = 80, startAfter } = options || {};

  // Try primary schema: createdAt
  let query: firebase.firestore.Query = db
    .collection('checkins')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc');

  if (startAfter) query = query.startAfter(startAfter);
  query = query.limit(limit);

  const primary = await query.get();
  if (!primary.empty) return primary;

  // Fallback to legacy schema: timestamp
  let legacyQuery: firebase.firestore.Query = db
    .collection('checkins')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'desc');

  if (startAfter) legacyQuery = legacyQuery.startAfter(startAfter);
  legacyQuery = legacyQuery.limit(limit);

  return legacyQuery.get();
}

/**
 * Query all checkins (optionally approved only) with automatic schema fallback
 *
 * Primary schema: createdAt
 * Fallback schema: timestamp
 *
 * @param db - Firestore database instance
 * @param options - Query options (limit, pagination, approval filter)
 * @returns Firestore QuerySnapshot
 */
export async function queryAllCheckins(
  db: firebase.firestore.Firestore,
  options?: {
    limit?: number;
    startAfter?: any;
    approvedOnly?: boolean;
  }
): Promise<firebase.firestore.QuerySnapshot> {
  const { limit = 50, startAfter, approvedOnly = false } = options || {};

  let query: firebase.firestore.Query = db.collection('checkins');

  if (approvedOnly) {
    query = query.where('approved', '==', true);
  }

  // Try primary schema: createdAt
  let primaryQuery = query.orderBy('createdAt', 'desc');
  if (startAfter) primaryQuery = primaryQuery.startAfter(startAfter);
  primaryQuery = primaryQuery.limit(limit);

  const primary = await primaryQuery.get();
  if (!primary.empty) return primary;

  // Fallback to legacy schema: timestamp
  let legacyQuery = query.orderBy('timestamp', 'desc');
  if (startAfter) legacyQuery = legacyQuery.startAfter(startAfter);
  legacyQuery = legacyQuery.limit(limit);

  return legacyQuery.get();
}

/**
 * Subscribe to approved checkins with real-time updates
 *
 * Attempts primary schema first, then legacy schema
 *
 * @param db - Firestore database instance
 * @param onUpdate - Callback function receiving checkin documents
 * @param limit - Maximum number of checkins to retrieve
 * @returns Unsubscribe function
 */
export function subscribeApprovedCheckins(
  db: firebase.firestore.Firestore,
  onUpdate: (items: any[]) => void,
  limit: number = 40
): () => void {
  // Try primary schema first
  const primaryQuery = db
    .collection('checkins')
    .where('approved', '==', true)
    .orderBy('createdAt', 'desc')
    .limit(limit);

  let unsubscribePrimary: (() => void) | null = null;
  let unsubscribeLegacy: (() => void) | null = null;

  // Subscribe to primary schema
  unsubscribePrimary = primaryQuery.onSnapshot(
    (snapshot: any) => {
      // If we got results, use them
      if (!snapshot.empty) {
        const items: any[] = [];
        snapshot.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
        onUpdate(items);

        // Clean up legacy subscription if it exists
        if (unsubscribeLegacy) {
          unsubscribeLegacy();
          unsubscribeLegacy = null;
        }
      } else {
        // No results from primary, try legacy
        const legacyQuery = db
          .collection('checkins')
          .where('approved', '==', true)
          .orderBy('timestamp', 'desc')
          .limit(limit);

        unsubscribeLegacy = legacyQuery.onSnapshot((legacySnapshot: any) => {
          const items: any[] = [];
          legacySnapshot.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
          onUpdate(items);
        });
      }
    },
    (error: Error) => {
      console.error('subscribeApprovedCheckins error:', error);
    }
  );

  // Return combined unsubscribe function
  return () => {
    if (unsubscribePrimary) unsubscribePrimary();
    if (unsubscribeLegacy) unsubscribeLegacy();
  };
}

export default {
  parseCheckinTimestamp,
  queryCheckinsBySpot,
  queryCheckinsByUser,
  queryAllCheckins,
  subscribeApprovedCheckins,
};
