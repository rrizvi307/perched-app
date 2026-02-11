/**
 * Offline-First Sync Service
 *
 * Handles background synchronization and conflict resolution
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureFirebase } from './firebaseClient';
import NetInfo from '@react-native-community/netinfo';

export type SyncStatus = 'pending' | 'syncing' | 'success' | 'failed';
export type ConflictResolution = 'client_wins' | 'server_wins' | 'merge' | 'manual';

interface SyncOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  collection: string;
  documentId: string;
  data: any;
  localTimestamp: number;
  attempts: number;
  status: SyncStatus;
  error?: string;
}

interface SyncQueueItem extends SyncOperation {
  priority: number; // Higher = more important
}

interface ConflictData {
  id: string;
  operationId: string;
  collection: string;
  documentId: string;
  localVersion: any;
  serverVersion: any;
  localTimestamp: number;
  serverTimestamp: number;
  resolution?: ConflictResolution;
  resolvedData?: any;
}

const SYNC_QUEUE_KEY = '@perched_sync_queue';
const CONFLICTS_KEY = '@perched_sync_conflicts';
const LAST_SYNC_KEY = '@perched_last_sync';
const MAX_RETRY_ATTEMPTS = 3;
const SYNC_BATCH_SIZE = 10;

let syncInProgress = false;
let syncInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Initialize offline sync system
 */
export async function initOfflineSync(): Promise<void> {
  try {
    // Listen for network status changes
    NetInfo.addEventListener(state => {
      if (state.isConnected && !syncInProgress) {
        // Trigger sync when back online
        syncPendingOperations();
      }
    });

    // Start periodic sync (every 5 minutes)
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(() => {
      syncPendingOperations();
    }, 5 * 60 * 1000);

    // Initial sync
    await syncPendingOperations();

    console.log('Offline sync initialized');
  } catch (error) {
    console.error('Failed to init offline sync:', error);
  }
}

/**
 * Queue an operation for offline sync
 */
export async function queueOperation(
  type: SyncOperation['type'],
  collection: string,
  documentId: string,
  data: any,
  priority: number = 5
): Promise<string> {
  try {
    const operation: SyncQueueItem = {
      id: generateOperationId(),
      type,
      collection,
      documentId,
      data,
      localTimestamp: Date.now(),
      attempts: 0,
      status: 'pending',
      priority,
    };

    const queue = await getSyncQueue();
    queue.push(operation);

    // Sort by priority (descending) then timestamp (ascending)
    queue.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.localTimestamp - b.localTimestamp;
    });

    await saveSyncQueue(queue);

    // Trigger immediate sync if online
    const netState = await NetInfo.fetch();
    if (netState.isConnected) {
      syncPendingOperations();
    }

    return operation.id;
  } catch (error) {
    console.error('Failed to queue operation:', error);
    throw error;
  }
}

/**
 * Sync pending operations to server
 */
export async function syncPendingOperations(): Promise<{
  synced: number;
  failed: number;
  conflicts: number;
}> {
  if (syncInProgress) {
    return { synced: 0, failed: 0, conflicts: 0 };
  }

  try {
    syncInProgress = true;

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      return { synced: 0, failed: 0, conflicts: 0 };
    }

    const fb = ensureFirebase();
    if (!fb) return { synced: 0, failed: 0, conflicts: 0 };

    const db = fb.firestore();
    const queue = await getSyncQueue();

    if (queue.length === 0) {
      return { synced: 0, failed: 0, conflicts: 0 };
    }

    let syncedCount = 0;
    let failedCount = 0;
    let conflictCount = 0;

    // Process in batches
    const batch = queue.slice(0, SYNC_BATCH_SIZE);
    const remaining = queue.slice(SYNC_BATCH_SIZE);

    for (const operation of batch) {
      try {
        operation.status = 'syncing';
        operation.attempts++;

        const docRef = db.collection(operation.collection).doc(operation.documentId);

        // Check for conflicts (server version exists and is newer)
        if (operation.type === 'update' || operation.type === 'delete') {
          const serverDoc = await docRef.get();

          if (serverDoc.exists) {
            const serverData = serverDoc.data()!;
            const serverTimestamp = serverData.updatedAt || serverData.createdAt || 0;

            // Conflict: server version is newer
            if (serverTimestamp > operation.localTimestamp) {
              await recordConflict(operation, serverData, serverTimestamp);
              conflictCount++;
              continue;
            }
          }
        }

        // Execute operation
        switch (operation.type) {
          case 'create':
            await docRef.set({
              ...operation.data,
              createdAt: operation.localTimestamp,
              updatedAt: operation.localTimestamp,
              syncedAt: Date.now(),
            });
            break;

          case 'update':
            await docRef.update({
              ...operation.data,
              updatedAt: operation.localTimestamp,
              syncedAt: Date.now(),
            });
            break;

          case 'delete':
            await docRef.delete();
            break;
        }

        operation.status = 'success';
        syncedCount++;
      } catch (error) {
        console.error('Sync operation failed:', error);
        operation.status = 'failed';
        operation.error = error instanceof Error ? error.message : 'Unknown error';

        // Remove from queue if max retries exceeded
        if (operation.attempts >= MAX_RETRY_ATTEMPTS) {
          failedCount++;
        } else {
          // Keep in queue for retry
          remaining.push(operation);
        }
      }
    }

    // Save updated queue
    await saveSyncQueue(remaining);

    // Update last sync timestamp
    await AsyncStorage.setItem(LAST_SYNC_KEY, Date.now().toString());

    return { synced: syncedCount, failed: failedCount, conflicts: conflictCount };
  } catch (error) {
    console.error('Sync failed:', error);
    return { synced: 0, failed: 0, conflicts: 0 };
  } finally {
    syncInProgress = false;
  }
}

/**
 * Get sync queue
 */
export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  try {
    const json = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
    return json ? JSON.parse(json) : [];
  } catch (error) {
    console.error('Failed to get sync queue:', error);
    return [];
  }
}

/**
 * Clear sync queue
 */
export async function clearSyncQueue(): Promise<void> {
  await AsyncStorage.removeItem(SYNC_QUEUE_KEY);
}

/**
 * Get pending conflicts
 */
export async function getPendingConflicts(): Promise<ConflictData[]> {
  try {
    const json = await AsyncStorage.getItem(CONFLICTS_KEY);
    return json ? JSON.parse(json) : [];
  } catch (error) {
    console.error('Failed to get conflicts:', error);
    return [];
  }
}

/**
 * Resolve a conflict
 */
export async function resolveConflict(
  conflictId: string,
  resolution: ConflictResolution,
  resolvedData?: any
): Promise<{ success: boolean; error?: string }> {
  try {
    const conflicts = await getPendingConflicts();
    const conflict = conflicts.find(c => c.id === conflictId);

    if (!conflict) {
      return { success: false, error: 'Conflict not found' };
    }

    let finalData: any;

    switch (resolution) {
      case 'client_wins':
        finalData = conflict.localVersion;
        break;

      case 'server_wins':
        finalData = conflict.serverVersion;
        break;

      case 'merge':
        // Simple merge strategy: combine both versions
        finalData = {
          ...conflict.serverVersion,
          ...conflict.localVersion,
          mergedAt: Date.now(),
        };
        break;

      case 'manual':
        if (!resolvedData) {
          return { success: false, error: 'Resolved data required for manual resolution' };
        }
        finalData = resolvedData;
        break;
    }

    // Queue update operation with resolved data
    await queueOperation(
      'update',
      conflict.collection,
      conflict.documentId,
      finalData,
      10 // High priority
    );

    // Remove from conflicts list
    const updatedConflicts = conflicts.filter(c => c.id !== conflictId);
    await AsyncStorage.setItem(CONFLICTS_KEY, JSON.stringify(updatedConflicts));

    // Trigger sync
    await syncPendingOperations();

    return { success: true };
  } catch (error) {
    console.error('Failed to resolve conflict:', error);
    return { success: false, error: 'Resolution failed' };
  }
}

/**
 * Get sync status
 */
export async function getSyncStatus(): Promise<{
  pendingOperations: number;
  pendingConflicts: number;
  lastSync: number;
  isOnline: boolean;
}> {
  try {
    const [queue, conflicts, lastSyncStr, netState] = await Promise.all([
      getSyncQueue(),
      getPendingConflicts(),
      AsyncStorage.getItem(LAST_SYNC_KEY),
      NetInfo.fetch(),
    ]);

    return {
      pendingOperations: queue.length,
      pendingConflicts: conflicts.length,
      lastSync: lastSyncStr ? parseInt(lastSyncStr, 10) : 0,
      isOnline: netState.isConnected || false,
    };
  } catch (error) {
    console.error('Failed to get sync status:', error);
    return {
      pendingOperations: 0,
      pendingConflicts: 0,
      lastSync: 0,
      isOnline: false,
    };
  }
}

/**
 * Force immediate sync
 */
export async function forceSync(): Promise<void> {
  await syncPendingOperations();
}

/**
 * Stop sync service
 */
export function stopSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

// Helper functions

function generateOperationId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function saveSyncQueue(queue: SyncQueueItem[]): Promise<void> {
  await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

async function recordConflict(
  operation: SyncOperation,
  serverData: any,
  serverTimestamp: number
): Promise<void> {
  try {
    const conflicts = await getPendingConflicts();

    const conflict: ConflictData = {
      id: `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      operationId: operation.id,
      collection: operation.collection,
      documentId: operation.documentId,
      localVersion: operation.data,
      serverVersion: serverData,
      localTimestamp: operation.localTimestamp,
      serverTimestamp,
    };

    conflicts.push(conflict);
    await AsyncStorage.setItem(CONFLICTS_KEY, JSON.stringify(conflicts));

    console.log('Conflict recorded:', conflict.id);
  } catch (error) {
    console.error('Failed to record conflict:', error);
  }
}

/**
 * Prefetch data for offline use
 */
export async function prefetchForOffline(
  collections: Array<{ name: string; limit?: number }>
): Promise<number> {
  try {
    const fb = ensureFirebase();
    if (!fb) return 0;

    const db = fb.firestore();
    let prefetchedCount = 0;

    for (const { name, limit = 100 } of collections) {
      const snapshot = await db.collection(name).limit(limit).get();

      const docs = snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Store in local cache
      await AsyncStorage.setItem(
        `@offline_cache_${name}`,
        JSON.stringify({ data: docs, timestamp: Date.now() })
      );

      prefetchedCount += docs.length;
    }

    return prefetchedCount;
  } catch (error) {
    console.error('Failed to prefetch data:', error);
    return 0;
  }
}

/**
 * Get cached offline data
 */
export async function getOfflineCache(collection: string): Promise<any[] | null> {
  try {
    const json = await AsyncStorage.getItem(`@offline_cache_${collection}`);
    if (!json) return null;

    const { data, timestamp } = JSON.parse(json);

    // Check if cache is still fresh (24 hours)
    if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
      return null;
    }

    return data;
  } catch (error) {
    console.error('Failed to get offline cache:', error);
    return null;
  }
}

export default {
  init: initOfflineSync,
  queue: queueOperation,
  sync: syncPendingOperations,
  getSyncQueue,
  clearSyncQueue,
  getPendingConflicts,
  resolveConflict,
  getSyncStatus,
  forceSync,
  stop: stopSync,
  prefetch: prefetchForOffline,
  getCache: getOfflineCache,
};
