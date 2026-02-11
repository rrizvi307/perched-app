/**
 * Schema Helpers Tests
 * Target: 100% coverage
 */

import { parseCheckinTimestamp, queryCheckinsBySpot, queryCheckinsByUser, queryAllCheckins, subscribeApprovedCheckins } from '../schemaHelpers';

// Note: subscribeApprovedCheckins has signature: (db, onUpdate, limit)

// Mock Firebase
const mockFirestoreTimestamp = {
  toDate: jest.fn(() => new Date('2024-01-15T10:00:00Z')),
};

const mockDoc = (data: any) => ({
  id: 'mock-doc-id',
  data: () => data,
  exists: true,
});

const mockDocWithNullData = () => ({
  id: 'mock-doc-null',
  data: () => null,
  exists: true,
});

const mockQuerySnapshot = (docs: any[]) => ({
  docs,
  empty: docs.length === 0,
  size: docs.length,
  forEach: (callback: (doc: any) => void) => docs.forEach(callback),
});

describe('parseCheckinTimestamp', () => {
  it('should parse createdAt field with Firestore Timestamp', () => {
    const value = { createdAt: mockFirestoreTimestamp };
    const result = parseCheckinTimestamp(value);
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe('2024-01-15T10:00:00.000Z');
  });

  it('should parse createdAt field with number timestamp', () => {
    const value = { createdAt: 1705314000000 }; // 2024-01-15T10:00:00Z
    const result = parseCheckinTimestamp(value);
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(1705314000000);
  });

  it('should parse createdAt field with Date object', () => {
    const date = new Date('2024-01-15T10:00:00Z');
    const value = { createdAt: date };
    const result = parseCheckinTimestamp(value);
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(date.getTime());
  });

  it('should fallback to timestamp field with Firestore Timestamp', () => {
    const value = { timestamp: mockFirestoreTimestamp };
    const result = parseCheckinTimestamp(value);
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe('2024-01-15T10:00:00.000Z');
  });

  it('should fallback to timestamp field with number', () => {
    const value = { timestamp: 1705314000000 };
    const result = parseCheckinTimestamp(value);
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(1705314000000);
  });

  it('should fallback to timestamp field with Date object', () => {
    const date = new Date('2024-01-15T10:00:00Z');
    const value = { timestamp: date };
    const result = parseCheckinTimestamp(value);
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(date.getTime());
  });

  it('should prefer createdAt over timestamp when both exist', () => {
    const value = {
      createdAt: 1705314000000, // 2024-01-15T10:00:00Z
      timestamp: 1705310400000, // 2024-01-15T09:00:00Z
    };
    const result = parseCheckinTimestamp(value);
    expect(result?.getTime()).toBe(1705314000000);
  });

  it('should return null for null value', () => {
    const result = parseCheckinTimestamp(null);
    expect(result).toBeNull();
  });

  it('should return null for undefined value', () => {
    const result = parseCheckinTimestamp(undefined);
    expect(result).toBeNull();
  });

  it('should return null for value without createdAt or timestamp', () => {
    const value = { someOtherField: 123 };
    const result = parseCheckinTimestamp(value);
    expect(result).toBeNull();
  });

  it('should return null for invalid timestamp value', () => {
    const value = { createdAt: 'invalid' };
    const result = parseCheckinTimestamp(value);
    expect(result).toBeNull();
  });

  it('should handle empty object', () => {
    const result = parseCheckinTimestamp({});
    expect(result).toBeNull();
  });

  it('should handle Timestamp.toDate() exception', () => {
    const mockTs = { toDate: jest.fn(() => { throw new Error('toDate failed'); }) };
    const result = parseCheckinTimestamp({ createdAt: mockTs });
    expect(result).toBeNull();
  });

  it('should parse Timestamp.seconds field', () => {
    const value = { createdAt: { seconds: 1705314 } };
    const result = parseCheckinTimestamp(value);
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(1705314000);
  });
});

describe('queryCheckinsBySpot', () => {
  let mockDb: any;
  let mockFb: any;
  let mockQuery: any;

  beforeEach(() => {
    mockQuery = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      startAfter: jest.fn().mockReturnThis(),
      get: jest.fn(),
    };

    mockDb = {
      collection: jest.fn(() => mockQuery),
    };

    mockFb = {
      firestore: {
        Timestamp: {
          fromDate: jest.fn((date) => ({ toDate: () => date })),
        },
      },
    };
  });

  it('should query with primary schema (spotPlaceId, createdAt)', async () => {
    const mockDocs = [
      mockDoc({ spotPlaceId: 'spot-123', createdAt: 1705314000000 }),
    ];
    mockQuery.get.mockResolvedValue(mockQuerySnapshot(mockDocs));

    const result = await queryCheckinsBySpot(mockDb, mockFb, 'spot-123');

    expect(mockDb.collection).toHaveBeenCalledWith('checkins');
    expect(mockQuery.where).toHaveBeenCalledWith('spotPlaceId', '==', 'spot-123');
    expect(mockQuery.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(result.size).toBe(1);
  });

  it('should fallback to legacy schema (spotId, timestamp) when primary returns empty', async () => {
    mockQuery.get
      .mockResolvedValueOnce(mockQuerySnapshot([])) // Primary query empty
      .mockResolvedValueOnce(mockQuerySnapshot([
        mockDoc({ spotId: 'spot-123', timestamp: 1705314000000 }),
      ]));

    const result = await queryCheckinsBySpot(mockDb, mockFb, 'spot-123');

    expect(mockQuery.where).toHaveBeenCalledWith('spotPlaceId', '==', 'spot-123');
    expect(mockQuery.where).toHaveBeenCalledWith('spotId', '==', 'spot-123');
    expect(result.size).toBe(1);
  });

  it('should apply limit option', async () => {
    mockQuery.get.mockResolvedValue(mockQuerySnapshot([]));

    await queryCheckinsBySpot(mockDb, mockFb, 'spot-123', { limit: 50 });

    expect(mockQuery.limit).toHaveBeenCalledWith(50);
  });

  it('should apply startDate filter with primary schema', async () => {
    mockQuery.get.mockResolvedValue(mockQuerySnapshot([]));

    const startDate = new Date('2024-01-01T00:00:00Z');
    await queryCheckinsBySpot(mockDb, mockFb, 'spot-123', { startDate });

    expect(mockFb.firestore.Timestamp.fromDate).toHaveBeenCalledWith(startDate);
    expect(mockQuery.where).toHaveBeenCalledWith('createdAt', '>=', expect.anything());
  });

  it('should apply startDate filter with legacy schema fallback', async () => {
    mockQuery.get
      .mockResolvedValueOnce(mockQuerySnapshot([])) // Primary query empty
      .mockResolvedValueOnce(mockQuerySnapshot([])); // Legacy query

    const startDate = new Date('2024-01-01T00:00:00Z');
    await queryCheckinsBySpot(mockDb, mockFb, 'spot-123', { startDate });

    // Should apply filter to both primary and legacy queries
    expect(mockFb.firestore.Timestamp.fromDate).toHaveBeenCalledWith(startDate);
    expect(mockQuery.where).toHaveBeenCalledWith('createdAt', '>=', expect.anything());
    expect(mockQuery.where).toHaveBeenCalledWith('timestamp', '>=', expect.anything());
  });

  it('should combine limit and startDate options', async () => {
    mockQuery.get.mockResolvedValue(mockQuerySnapshot([]));

    const startDate = new Date('2024-01-01T00:00:00Z');
    await queryCheckinsBySpot(mockDb, mockFb, 'spot-123', {
      limit: 100,
      startDate,
    });

    expect(mockQuery.limit).toHaveBeenCalledWith(100);
    expect(mockQuery.where).toHaveBeenCalledWith('createdAt', '>=', expect.anything());
  });

  it('should apply endDate filter to primary schema', async () => {
    mockQuery.get.mockResolvedValue(mockQuerySnapshot([]));

    const endDate = new Date('2024-02-01T00:00:00Z');
    await queryCheckinsBySpot(mockDb, mockFb, 'spot-123', { endDate });

    expect(mockFb.firestore.Timestamp.fromDate).toHaveBeenCalledWith(endDate);
    expect(mockQuery.where).toHaveBeenCalledWith('createdAt', '<', expect.anything());
  });

  it('should apply endDate filter to legacy schema', async () => {
    mockQuery.get
      .mockResolvedValueOnce(mockQuerySnapshot([])) // Primary query empty
      .mockResolvedValueOnce(mockQuerySnapshot([])); // Legacy query

    const endDate = new Date('2024-02-01T00:00:00Z');
    await queryCheckinsBySpot(mockDb, mockFb, 'spot-123', { endDate });

    // Should apply filter to both primary and legacy queries
    expect(mockFb.firestore.Timestamp.fromDate).toHaveBeenCalledWith(endDate);
    expect(mockQuery.where).toHaveBeenCalledWith('createdAt', '<', expect.anything());
    expect(mockQuery.where).toHaveBeenCalledWith('timestamp', '<', expect.anything());
  });

  it('should handle query errors gracefully', async () => {
    mockQuery.get.mockRejectedValue(new Error('Firestore error'));

    await expect(queryCheckinsBySpot(mockDb, mockFb, 'spot-123')).rejects.toThrow('Firestore error');
  });
});

describe('queryCheckinsByUser', () => {
  let mockDb: any;
  let mockFb: any;
  let mockQuery: any;

  beforeEach(() => {
    mockQuery = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      startAfter: jest.fn().mockReturnThis(),
      get: jest.fn(),
    };

    mockDb = {
      collection: jest.fn(() => mockQuery),
    };

    mockFb = {
      firestore: {
        Timestamp: {
          fromDate: jest.fn((date) => ({ toDate: () => date })),
        },
      },
    };
  });

  it('should query with primary schema (createdAt)', async () => {
    const mockDocs = [
      mockDoc({ userId: 'user-123', createdAt: 1705314000000 }),
    ];
    mockQuery.get.mockResolvedValue(mockQuerySnapshot(mockDocs));

    const result = await queryCheckinsByUser(mockDb, mockFb, 'user-123');

    expect(mockDb.collection).toHaveBeenCalledWith('checkins');
    expect(mockQuery.where).toHaveBeenCalledWith('userId', '==', 'user-123');
    expect(mockQuery.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(result.size).toBe(1);
  });

  it('should fallback to legacy schema (timestamp) when primary returns empty', async () => {
    mockQuery.get
      .mockResolvedValueOnce(mockQuerySnapshot([])) // Primary query empty
      .mockResolvedValueOnce(mockQuerySnapshot([
        mockDoc({ userId: 'user-123', timestamp: 1705314000000 }),
      ]));

    const result = await queryCheckinsByUser(mockDb, mockFb, 'user-123');

    expect(mockQuery.orderBy).toHaveBeenCalledWith('timestamp', 'desc');
    expect(result.size).toBe(1);
  });

  it('should apply limit option', async () => {
    mockQuery.get.mockResolvedValue(mockQuerySnapshot([]));

    await queryCheckinsByUser(mockDb, mockFb, 'user-123', { limit: 25 });

    expect(mockQuery.limit).toHaveBeenCalledWith(25);
  });

  it('should apply startAfter pagination with primary schema', async () => {
    mockQuery.get.mockResolvedValue(mockQuerySnapshot([]));

    const lastDoc = mockDoc({ userId: 'user-123', createdAt: 1705314000000 });
    await queryCheckinsByUser(mockDb, mockFb, 'user-123', { startAfter: lastDoc });

    expect(mockQuery.startAfter).toHaveBeenCalledWith(lastDoc);
  });

  it('should apply startAfter pagination with legacy schema fallback', async () => {
    mockQuery.get
      .mockResolvedValueOnce(mockQuerySnapshot([])) // Primary query empty
      .mockResolvedValueOnce(mockQuerySnapshot([])); // Legacy query

    const lastDoc = mockDoc({ userId: 'user-123', timestamp: 1705314000000 });
    await queryCheckinsByUser(mockDb, mockFb, 'user-123', { startAfter: lastDoc });

    // Should apply to both queries
    expect(mockQuery.startAfter).toHaveBeenCalledWith(lastDoc);
    expect(mockQuery.startAfter).toHaveBeenCalledTimes(2); // Once for primary, once for legacy
  });
});

describe('queryAllCheckins', () => {
  let mockDb: any;
  let mockQuery: any;

  beforeEach(() => {
    mockQuery = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      startAfter: jest.fn().mockReturnThis(),
      get: jest.fn(),
    };

    mockDb = {
      collection: jest.fn(() => mockQuery),
    };
  });

  it('should query with primary schema (createdAt)', async () => {
    const mockDocs = [mockDoc({ createdAt: 1705314000000 })];
    mockQuery.get.mockResolvedValue(mockQuerySnapshot(mockDocs));

    const result = await queryAllCheckins(mockDb);

    expect(mockDb.collection).toHaveBeenCalledWith('checkins');
    expect(mockQuery.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(result.size).toBe(1);
  });

  it('should fallback to legacy schema (timestamp) when primary returns empty', async () => {
    mockQuery.get
      .mockResolvedValueOnce(mockQuerySnapshot([])) // Primary query empty
      .mockResolvedValueOnce(mockQuerySnapshot([
        mockDoc({ timestamp: 1705314000000 }),
      ]));

    const result = await queryAllCheckins(mockDb);

    expect(mockQuery.orderBy).toHaveBeenCalledWith('timestamp', 'desc');
    expect(result.size).toBe(1);
  });

  it('should apply approvedOnly filter', async () => {
    mockQuery.get.mockResolvedValue(mockQuerySnapshot([]));

    await queryAllCheckins(mockDb, { approvedOnly: true });

    expect(mockQuery.where).toHaveBeenCalledWith('approved', '==', true);
  });

  it('should apply limit option', async () => {
    mockQuery.get.mockResolvedValue(mockQuerySnapshot([]));

    await queryAllCheckins(mockDb, { limit: 200 });

    expect(mockQuery.limit).toHaveBeenCalledWith(200);
  });

  it('should apply startAfter pagination with primary schema', async () => {
    mockQuery.get.mockResolvedValue(mockQuerySnapshot([]));

    const lastDoc = mockDoc({ createdAt: 1705314000000 });
    await queryAllCheckins(mockDb, { startAfter: lastDoc });

    expect(mockQuery.startAfter).toHaveBeenCalledWith(lastDoc);
  });

  it('should apply startAfter pagination with legacy schema fallback', async () => {
    mockQuery.get
      .mockResolvedValueOnce(mockQuerySnapshot([])) // Primary query empty
      .mockResolvedValueOnce(mockQuerySnapshot([])); // Legacy query

    const lastDoc = mockDoc({ timestamp: 1705314000000 });
    await queryAllCheckins(mockDb, { startAfter: lastDoc });

    // Should apply to both queries
    expect(mockQuery.startAfter).toHaveBeenCalledWith(lastDoc);
    expect(mockQuery.startAfter).toHaveBeenCalledTimes(2);
  });
});

describe('subscribeApprovedCheckins', () => {
  let mockDb: any;
  let mockQuery: any;

  beforeEach(() => {
    mockQuery = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      onSnapshot: jest.fn(),
    };

    mockDb = {
      collection: jest.fn(() => mockQuery),
    };
  });

  it('should subscribe with primary schema and approved filter', () => {
    const callback = jest.fn();
    const unsubscribe = jest.fn();
    mockQuery.onSnapshot.mockReturnValue(unsubscribe);

    const result = subscribeApprovedCheckins(mockDb, callback, 40);

    expect(mockDb.collection).toHaveBeenCalledWith('checkins');
    expect(mockQuery.where).toHaveBeenCalledWith('approved', '==', true);
    expect(mockQuery.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(mockQuery.limit).toHaveBeenCalledWith(40);
    expect(mockQuery.onSnapshot).toHaveBeenCalled();
    expect(result).toBeInstanceOf(Function);
  });

  it('should use default limit when not provided', () => {
    const callback = jest.fn();
    const unsubscribe = jest.fn();
    mockQuery.onSnapshot.mockReturnValue(unsubscribe);

    subscribeApprovedCheckins(mockDb, callback);

    expect(mockQuery.limit).toHaveBeenCalledWith(40);
  });

  it('should invoke callback on snapshot with items', () => {
    const callback = jest.fn();
    const mockSnapshot = mockQuerySnapshot([
      mockDoc({ userId: 'user1', createdAt: 1705314000000 }),
      mockDoc({ userId: 'user2', createdAt: 1705315000000 }),
    ]);

    mockQuery.onSnapshot.mockImplementation((cb: (snapshot: any) => void) => {
      cb(mockSnapshot);
      return jest.fn();
    });

    subscribeApprovedCheckins(mockDb, callback);

    expect(callback).toHaveBeenCalledWith([
      { id: 'mock-doc-id', userId: 'user1', createdAt: 1705314000000 },
      { id: 'mock-doc-id', userId: 'user2', createdAt: 1705315000000 },
    ]);
  });

  it('should fallback to legacy schema when primary returns empty', () => {
    const callback = jest.fn();
    const emptySnapshot = mockQuerySnapshot([]);
    const legacySnapshot = mockQuerySnapshot([
      mockDoc({ userId: 'user1', timestamp: 1705314000000 }),
      mockDoc({ userId: 'user2', timestamp: 1705315000000 }),
    ]);

    let callCount = 0;
    mockQuery.onSnapshot.mockImplementation((cb: (snapshot: any) => void) => {
      if (callCount === 0) {
        // First call (primary schema)
        setTimeout(() => cb(emptySnapshot), 0);
        callCount++;
        return jest.fn();
      } else {
        // Second call (legacy schema)
        setTimeout(() => cb(legacySnapshot), 0);
        return jest.fn();
      }
    });

    subscribeApprovedCheckins(mockDb, callback);

    // Allow async operations to complete
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(mockQuery.orderBy).toHaveBeenCalledWith('timestamp', 'desc');
        expect(callback).toHaveBeenCalledWith([
          { id: 'mock-doc-id', userId: 'user1', timestamp: 1705314000000 },
          { id: 'mock-doc-id', userId: 'user2', timestamp: 1705315000000 },
        ]);
        resolve(undefined);
      }, 10);
    });
  });

  it('should return unsubscribe function', () => {
    const callback = jest.fn();
    const mockUnsubscribe = jest.fn();
    mockQuery.onSnapshot.mockReturnValue(mockUnsubscribe);

    const unsubscribe = subscribeApprovedCheckins(mockDb, callback);

    expect(unsubscribe).toBeInstanceOf(Function);

    // Call unsubscribe
    unsubscribe();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });


  it('should cleanup both subscriptions when unsubscribe is called', () => {
    const callback = jest.fn();
    const mockUnsubscribePrimary = jest.fn();
    const mockUnsubscribeLegacy = jest.fn();

    const emptySnapshot = mockQuerySnapshot([]);
    const legacySnapshot = mockQuerySnapshot([
      mockDoc({ userId: 'user1', timestamp: 1705314000000 }),
    ]);

    let callCount = 0;
    mockQuery.onSnapshot.mockImplementation((cb: (snapshot: any) => void) => {
      if (callCount === 0) {
        // Primary subscription
        setTimeout(() => cb(emptySnapshot), 0);
        callCount++;
        return mockUnsubscribePrimary;
      } else {
        // Legacy subscription
        setTimeout(() => cb(legacySnapshot), 0);
        return mockUnsubscribeLegacy;
      }
    });

    const unsubscribe = subscribeApprovedCheckins(mockDb, callback);

    return new Promise((resolve) => {
      setTimeout(() => {
        // Call the combined unsubscribe
        unsubscribe();

        // Both should be unsubscribed
        expect(mockUnsubscribePrimary).toHaveBeenCalled();
        expect(mockUnsubscribeLegacy).toHaveBeenCalled();
        resolve(undefined);
      }, 10);
    });
  });

  it('should cleanup legacy subscription when primary gets data', () => {
    const callback = jest.fn();
    const mockUnsubscribePrimary = jest.fn();
    const mockUnsubscribeLegacy = jest.fn();

    const emptySnapshot = mockQuerySnapshot([]);
    const dataSnapshot = mockQuerySnapshot([
      mockDoc({ userId: 'user1', createdAt: 1705314000000 }),
    ]);

    let callCount = 0;
    let primaryCallback: any = null;

    mockQuery.onSnapshot.mockImplementation((cb: (snapshot: any) => void) => {
      if (callCount === 0) {
        // Primary subscription - store callback and initially return empty
        primaryCallback = cb;
        setTimeout(() => cb(emptySnapshot), 0);
        callCount++;
        return mockUnsubscribePrimary;
      } else {
        // Legacy subscription established
        setTimeout(() => cb(emptySnapshot), 0);
        // After legacy subscribes, trigger primary with data
        setTimeout(() => {
          if (primaryCallback) {
            primaryCallback(dataSnapshot);
          }
        }, 5);
        return mockUnsubscribeLegacy;
      }
    });

    subscribeApprovedCheckins(mockDb, callback);

    return new Promise((resolve) => {
      setTimeout(() => {
        // Legacy unsubscribe should have been called when primary got data
        expect(mockUnsubscribeLegacy).toHaveBeenCalled();
        resolve(undefined);
      }, 20);
    });
  });

  it('should handle documents with null data in primary subscription', () => {
    const callback = jest.fn();
    const mockSnapshot = mockQuerySnapshot([
      mockDoc({ userId: 'user1', createdAt: 1705314000000 }),
      mockDocWithNullData(),
    ]);

    mockQuery.onSnapshot.mockImplementation((cb: (snapshot: any) => void) => {
      cb(mockSnapshot);
      return jest.fn();
    });

    subscribeApprovedCheckins(mockDb, callback);

    expect(callback).toHaveBeenCalledWith([
      { id: 'mock-doc-id', userId: 'user1', createdAt: 1705314000000 },
      { id: 'mock-doc-null' }, // null data becomes empty object
    ]);
  });

  it('should handle documents with null data in legacy subscription', () => {
    const callback = jest.fn();
    const emptySnapshot = mockQuerySnapshot([]);
    const legacySnapshot = mockQuerySnapshot([
      mockDoc({ userId: 'user1', timestamp: 1705314000000 }),
      mockDocWithNullData(),
    ]);

    let callCount = 0;
    mockQuery.onSnapshot.mockImplementation((cb: (snapshot: any) => void) => {
      if (callCount === 0) {
        setTimeout(() => cb(emptySnapshot), 0);
        callCount++;
        return jest.fn();
      } else {
        setTimeout(() => cb(legacySnapshot), 0);
        return jest.fn();
      }
    });

    subscribeApprovedCheckins(mockDb, callback);

    return new Promise((resolve) => {
      setTimeout(() => {
        expect(callback).toHaveBeenCalledWith([
          { id: 'mock-doc-id', userId: 'user1', timestamp: 1705314000000 },
          { id: 'mock-doc-null' }, // null data becomes empty object
        ]);
        resolve(undefined);
      }, 10);
    });
  });

  it('should handle subscription errors', () => {
    const callback = jest.fn();
    const consoleError = jest.spyOn(console, 'error').mockImplementation();

    mockQuery.onSnapshot.mockImplementation((cb: (snapshot: any) => void, errorCb: (error: Error) => void) => {
      setTimeout(() => errorCb(new Error('Firestore subscription error')), 0);
      return jest.fn();
    });

    subscribeApprovedCheckins(mockDb, callback);

    return new Promise((resolve) => {
      setTimeout(() => {
        expect(consoleError).toHaveBeenCalledWith('subscribeApprovedCheckins error:', expect.any(Error));
        consoleError.mockRestore();
        resolve(undefined);
      }, 10);
    });
  });
});
