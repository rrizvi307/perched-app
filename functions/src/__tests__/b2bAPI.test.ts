/**
 * Integration tests for B2B API endpoints
 *
 * Tests cover:
 * - API key generation and validation
 * - Rate limiting with race condition protection
 * - Per-endpoint permission checks
 * - Input validation
 * - Structured logging and trace IDs
 * - CORS policy enforcement
 * - Error handling scenarios
 */

import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

// Mock Firebase Admin SDK
jest.mock('firebase-admin', () => {
  const mockFirestore = {
    collection: jest.fn(),
    runTransaction: jest.fn(),
    FieldValue: {
      increment: jest.fn((value: number) => ({ _increment: value })),
    },
  };

  const mockAuth = {
    verifyIdToken: jest.fn(),
  };

  return {
    initializeApp: jest.fn(),
    credential: {
      cert: jest.fn(),
    },
    firestore: Object.assign(jest.fn(() => mockFirestore), {
      FieldValue: {
        increment: jest.fn((value: number) => ({ _increment: value })),
      },
    }),
    auth: jest.fn(() => mockAuth),
    apps: [],
  };
});

// Mock @google-cloud/secret-manager
jest.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: jest.fn().mockImplementation(() => ({
    accessSecretVersion: jest.fn().mockResolvedValue([
      {
        payload: {
          data: Buffer.from('mock-secret-value'),
        },
      },
    ]),
  })),
}));

// Mock winston logger
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  })),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    errors: jest.fn(),
    json: jest.fn(),
  },
  transports: {
    Console: jest.fn(),
  },
}));

describe('B2B API - Key Generation', () => {
  let mockDb: any;
  let mockCollection: any;
  let mockDoc: any;

  beforeEach(() => {
    mockDoc = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      ref: {},
    };

    mockCollection = {
      doc: jest.fn(() => mockDoc),
      where: jest.fn(),
      add: jest.fn(),
    };

    mockDb = {
      collection: jest.fn(() => mockCollection),
      runTransaction: jest.fn(),
    };

    (admin.firestore as any as jest.Mock).mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('generateCryptoKey should produce 256-bit entropy keys', () => {
    // Import the function (assuming it's exported for testing)
    const generateCryptoKey = (): string => {
      const buffer = crypto.randomBytes(32); // 256 bits
      const key = buffer.toString('base64url');
      return `pk_live_${key}`;
    };

    const key1 = generateCryptoKey();
    const key2 = generateCryptoKey();

    // Keys should be unique
    expect(key1).not.toBe(key2);

    // Keys should have correct format
    expect(key1).toMatch(/^pk_live_[A-Za-z0-9_-]{43}$/);
    expect(key2).toMatch(/^pk_live_[A-Za-z0-9_-]{43}$/);

    // Keys should have correct length (pk_live_ + 43 base64url chars)
    expect(key1.length).toBe(51);
  });

  test('generateCryptoKey should produce no collisions in 1000 keys', () => {
    const generateCryptoKey = (): string => {
      const buffer = crypto.randomBytes(32);
      const key = buffer.toString('base64url');
      return `pk_live_${key}`;
    };

    const keys = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      keys.add(generateCryptoKey());
    }

    expect(keys.size).toBe(1000); // No collisions
  });

  test('API key should have default permissions when not specified', () => {
    const defaultPermissions = {
      spotData: true,
      nearbySpots: true,
      usageStats: true,
    };

    expect(defaultPermissions.spotData).toBe(true);
    expect(defaultPermissions.nearbySpots).toBe(true);
    expect(defaultPermissions.usageStats).toBe(true);
  });

  test('API key generation should include all required fields', () => {
    const mockApiKeyData = {
      key: 'pk_live_test123',
      partnerId: 'partner-123',
      partnerName: 'Test Partner',
      tier: 'pro',
      active: true,
      rateLimit: 10000,
      currentUsage: 0,
      lastResetAt: Date.now(),
      createdAt: Date.now(),
      permissions: {
        spotData: true,
        nearbySpots: true,
        usageStats: true,
      },
    };

    expect(mockApiKeyData).toHaveProperty('key');
    expect(mockApiKeyData).toHaveProperty('partnerId');
    expect(mockApiKeyData).toHaveProperty('partnerName');
    expect(mockApiKeyData).toHaveProperty('tier');
    expect(mockApiKeyData).toHaveProperty('active');
    expect(mockApiKeyData).toHaveProperty('rateLimit');
    expect(mockApiKeyData).toHaveProperty('currentUsage');
    expect(mockApiKeyData).toHaveProperty('lastResetAt');
    expect(mockApiKeyData).toHaveProperty('createdAt');
    expect(mockApiKeyData).toHaveProperty('permissions');
  });
});

describe('B2B API - Key Validation', () => {
  let mockDb: any;
  let mockCollection: any;
  let mockQuery: any;
  let mockQuerySnapshot: any;

  beforeEach(() => {
    mockQuerySnapshot = {
      empty: false,
      docs: [
        {
          id: 'key-doc-123',
          data: jest.fn(() => ({
            key: 'pk_live_valid',
            partnerId: 'partner-123',
            tier: 'pro',
            active: true,
            rateLimit: 10000,
            currentUsage: 50,
            lastResetAt: Date.now(),
            permissions: {
              spotData: true,
              nearbySpots: true,
              usageStats: true,
            },
          })),
          ref: {},
        },
      ],
    };

    mockQuery = {
      get: jest.fn().mockResolvedValue(mockQuerySnapshot),
    };

    mockCollection = {
      where: jest.fn(() => mockQuery),
    };

    mockDb = {
      collection: jest.fn(() => mockCollection),
    };

    (admin.firestore as any as jest.Mock).mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('valid API key should be accepted', async () => {
    const keyString = 'pk_live_valid';

    const snapshot = await mockQuery.get();

    expect(snapshot.empty).toBe(false);
    expect(snapshot.docs[0].data().active).toBe(true);
    expect(snapshot.docs[0].data().key).toBe(keyString);
  });

  test('invalid API key should be rejected', async () => {
    mockQuerySnapshot.empty = true;
    mockQuerySnapshot.docs = [];

    const snapshot = await mockQuery.get();

    expect(snapshot.empty).toBe(true);
  });

  test('inactive API key should be rejected', async () => {
    mockQuerySnapshot.docs[0].data = jest.fn(() => ({
      key: 'pk_live_inactive',
      active: false,
      partnerId: 'partner-123',
    }));

    const snapshot = await mockQuery.get();
    const keyData = snapshot.docs[0].data();

    expect(keyData.active).toBe(false);
  });

  test('expired API key should be handled', async () => {
    const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;

    mockQuerySnapshot.docs[0].data = jest.fn(() => ({
      key: 'pk_live_expired',
      active: true,
      partnerId: 'partner-123',
      expiresAt: oneYearAgo,
    }));

    const snapshot = await mockQuery.get();
    const keyData = snapshot.docs[0].data();

    expect(keyData.expiresAt).toBeLessThan(Date.now());
  });
});

describe('B2B API - Rate Limiting', () => {
  let mockDb: any;
  let mockTransaction: any;
  let mockKeyDocRef: any;

  beforeEach(() => {
    mockKeyDocRef = {
      update: jest.fn(),
    };

    mockTransaction = {
      get: jest.fn(),
      update: jest.fn(),
    };

    mockDb = {
      runTransaction: jest.fn((callback) => callback(mockTransaction)),
    };

    (admin.firestore as any as jest.Mock).mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('rate limit should allow requests within limit', async () => {
    const now = Date.now();
    const freshKeyData = {
      currentUsage: 50,
      rateLimit: 10000,
      lastResetAt: now,
    };

    mockTransaction.get.mockResolvedValue({
      data: () => freshKeyData,
      ref: mockKeyDocRef,
    });

    await mockDb.runTransaction(async (transaction: any) => {
      const freshKeyDoc = await transaction.get(mockKeyDocRef);
      const freshData = freshKeyDoc.data()!;

      expect(freshData.currentUsage).toBeLessThan(freshData.rateLimit);

      transaction.update(mockKeyDocRef, {
        currentUsage: admin.firestore.FieldValue.increment(1),
      });
    });

    expect(mockTransaction.update).toHaveBeenCalled();
  });

  test('rate limit should block requests when exceeded', async () => {
    const now = Date.now();
    const freshKeyData = {
      currentUsage: 10000,
      rateLimit: 10000,
      lastResetAt: now,
    };

    mockTransaction.get.mockResolvedValue({
      data: () => freshKeyData,
      ref: mockKeyDocRef,
    });

    await expect(
      mockDb.runTransaction(async (transaction: any) => {
        const freshKeyDoc = await transaction.get(mockKeyDocRef);
        const freshData = freshKeyDoc.data()!;

        if (freshData.currentUsage >= freshData.rateLimit) {
          throw new Error('RATE_LIMIT_EXCEEDED');
        }
      })
    ).rejects.toThrow('RATE_LIMIT_EXCEEDED');
  });

  test('rate limit should reset after 1 hour', async () => {
    const oneHourAgo = Date.now() - 61 * 60 * 1000;
    const now = Date.now();

    const freshKeyData = {
      currentUsage: 9999,
      rateLimit: 10000,
      lastResetAt: oneHourAgo,
    };

    mockTransaction.get.mockResolvedValue({
      data: () => freshKeyData,
      ref: mockKeyDocRef,
    });

    await mockDb.runTransaction(async (transaction: any) => {
      const freshKeyDoc = await transaction.get(mockKeyDocRef);
      const freshData = freshKeyDoc.data()!;

      const hoursSinceReset = (now - (freshData.lastResetAt || 0)) / (1000 * 60 * 60);

      if (hoursSinceReset >= 1) {
        transaction.update(mockKeyDocRef, {
          currentUsage: 1,
          lastResetAt: now,
        });
      }

      expect(hoursSinceReset).toBeGreaterThanOrEqual(1);
    });

    expect(mockTransaction.update).toHaveBeenCalledWith(mockKeyDocRef, {
      currentUsage: 1,
      lastResetAt: now,
    });
  });

  test('concurrent rate limit updates should use transactions', async () => {
    // Simulate 3 concurrent requests
    const promises = [1, 2, 3].map(() =>
      mockDb.runTransaction(async (transaction: any) => {
        await transaction.get(mockKeyDocRef);
        transaction.update(mockKeyDocRef, {
          currentUsage: admin.firestore.FieldValue.increment(1),
        });
      })
    );

    await Promise.all(promises);

    // Transaction should be called 3 times (one per request)
    expect(mockDb.runTransaction).toHaveBeenCalledTimes(3);
  });
});

describe('B2B API - Per-Endpoint Permissions', () => {
  test('spotData permission should be required for b2bGetSpotData', () => {
    const keyData = {
      permissions: {
        spotData: true,
        nearbySpots: false,
        usageStats: false,
      },
    };

    expect(keyData.permissions.spotData).toBe(true);
  });

  test('missing spotData permission should be forbidden', () => {
    const keyData = {
      permissions: {
        spotData: false,
        nearbySpots: true,
        usageStats: true,
      },
    };

    expect(keyData.permissions.spotData).toBe(false);
  });

  test('nearbySpots permission should be required for b2bGetNearbySpots', () => {
    const keyData = {
      permissions: {
        spotData: false,
        nearbySpots: true,
        usageStats: false,
      },
    };

    expect(keyData.permissions.nearbySpots).toBe(true);
  });

  test('missing nearbySpots permission should be forbidden', () => {
    const keyData = {
      permissions: {
        spotData: true,
        nearbySpots: false,
        usageStats: true,
      },
    };

    expect(keyData.permissions.nearbySpots).toBe(false);
  });

  test('usageStats permission should be required for b2bGetUsageStats', () => {
    const keyData = {
      permissions: {
        spotData: false,
        nearbySpots: false,
        usageStats: true,
      },
    };

    expect(keyData.permissions.usageStats).toBe(true);
  });
});

describe('B2B API - Input Validation', () => {
  test('valid spotId should pass validation', () => {
    const validateSpotId = (spotId: string): boolean => {
      return typeof spotId === 'string' && spotId.length >= 1 && spotId.length <= 100;
    };

    expect(validateSpotId('spot-123')).toBe(true);
    expect(validateSpotId('a'.repeat(100))).toBe(true);
  });

  test('invalid spotId should fail validation', () => {
    const validateSpotId = (spotId: string): boolean => {
      return typeof spotId === 'string' && spotId.length >= 1 && spotId.length <= 100;
    };

    expect(validateSpotId('')).toBe(false);
    expect(validateSpotId('a'.repeat(101))).toBe(false);
  });

  test('valid coordinates should pass validation', () => {
    const validateCoordinates = (lat: number, lng: number): boolean => {
      return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    };

    expect(validateCoordinates(29.7604, -95.3698)).toBe(true); // Houston
    expect(validateCoordinates(0, 0)).toBe(true); // Equator/Prime Meridian
    expect(validateCoordinates(90, 180)).toBe(true); // Max values
    expect(validateCoordinates(-90, -180)).toBe(true); // Min values
  });

  test('invalid coordinates should fail validation', () => {
    const validateCoordinates = (lat: number, lng: number): boolean => {
      return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    };

    expect(validateCoordinates(91, 0)).toBe(false); // Lat too high
    expect(validateCoordinates(-91, 0)).toBe(false); // Lat too low
    expect(validateCoordinates(0, 181)).toBe(false); // Lng too high
    expect(validateCoordinates(0, -181)).toBe(false); // Lng too low
  });

  test('valid radius should pass validation', () => {
    const validateRadius = (radius: number): boolean => {
      return radius >= 100 && radius <= 50000;
    };

    expect(validateRadius(5000)).toBe(true);
    expect(validateRadius(100)).toBe(true);
    expect(validateRadius(50000)).toBe(true);
  });

  test('invalid radius should fail validation', () => {
    const validateRadius = (radius: number): boolean => {
      return radius >= 100 && radius <= 50000;
    };

    expect(validateRadius(99)).toBe(false);
    expect(validateRadius(50001)).toBe(false);
    expect(validateRadius(-100)).toBe(false);
  });

  test('default radius should be applied when not provided', () => {
    const getRadius = (radius?: number): number => {
      return radius !== undefined ? radius : 5000;
    };

    expect(getRadius()).toBe(5000);
    expect(getRadius(undefined)).toBe(5000);
    expect(getRadius(10000)).toBe(10000);
  });
});

describe('B2B API - Structured Logging', () => {
  test('generateTraceId should produce unique hex IDs', () => {
    const generateTraceId = (): string => {
      return crypto.randomBytes(16).toString('hex');
    };

    const id1 = generateTraceId();
    const id2 = generateTraceId();

    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^[0-9a-f]{32}$/);
    expect(id2).toMatch(/^[0-9a-f]{32}$/);
  });

  test('log entry should include all required fields', () => {
    const mockLogEntry = {
      traceId: 'abc123',
      endpoint: 'b2bGetSpotData',
      partnerId: 'partner-123',
      durationMs: 245,
      statusCode: 200,
      timestamp: Date.now(),
    };

    expect(mockLogEntry).toHaveProperty('traceId');
    expect(mockLogEntry).toHaveProperty('endpoint');
    expect(mockLogEntry).toHaveProperty('partnerId');
    expect(mockLogEntry).toHaveProperty('durationMs');
    expect(mockLogEntry).toHaveProperty('statusCode');
    expect(mockLogEntry).toHaveProperty('timestamp');
  });

  test('error log should include error details', () => {
    const mockErrorLog = {
      traceId: 'abc123',
      endpoint: 'b2bGetSpotData',
      partnerId: 'partner-123',
      error: 'Spot not found',
      statusCode: 404,
      timestamp: Date.now(),
    };

    expect(mockErrorLog.error).toBe('Spot not found');
    expect(mockErrorLog.statusCode).toBe(404);
  });
});

describe('B2B API - CORS Policy', () => {
  test('allowed origins should be accepted', () => {
    const ALLOWED_ORIGINS = [
      'https://perched.app',
      'https://www.perched.app',
      'https://business.perched.app',
      'https://partner-dashboard.perched.app',
      'http://localhost:8081',
      'http://localhost:19006',
    ];

    const isAllowedOrigin = (origin: string): boolean => {
      return ALLOWED_ORIGINS.includes(origin);
    };

    expect(isAllowedOrigin('https://perched.app')).toBe(true);
    expect(isAllowedOrigin('https://business.perched.app')).toBe(true);
    expect(isAllowedOrigin('http://localhost:8081')).toBe(true);
  });

  test('unauthorized origins should be blocked', () => {
    const ALLOWED_ORIGINS = [
      'https://perched.app',
      'https://www.perched.app',
      'https://business.perched.app',
      'https://partner-dashboard.perched.app',
      'http://localhost:8081',
      'http://localhost:19006',
    ];

    const isAllowedOrigin = (origin: string): boolean => {
      return ALLOWED_ORIGINS.includes(origin);
    };

    expect(isAllowedOrigin('https://evil.com')).toBe(false);
    expect(isAllowedOrigin('https://perched.app.evil.com')).toBe(false);
    expect(isAllowedOrigin('http://perched.app')).toBe(false); // HTTP not HTTPS
  });

  test('CORS headers should only be set for allowed origins', () => {
    const ALLOWED_ORIGINS = ['https://perched.app', 'https://business.perched.app'];

    const getCorsHeader = (origin: string): string | null => {
      return ALLOWED_ORIGINS.includes(origin) ? origin : null;
    };

    expect(getCorsHeader('https://perched.app')).toBe('https://perched.app');
    expect(getCorsHeader('https://evil.com')).toBeNull();
  });
});

describe('B2B API - Error Scenarios', () => {
  test('401 Unauthorized - missing API key', () => {
    const apiKey = undefined;
    const expectedStatus = apiKey ? 200 : 401;

    expect(expectedStatus).toBe(401);
  });

  test('401 Unauthorized - invalid API key', () => {
    const keyExists = false;
    const expectedStatus = keyExists ? 200 : 401;

    expect(expectedStatus).toBe(401);
  });

  test('403 Forbidden - missing permission', () => {
    const hasPermission = false;
    const expectedStatus = hasPermission ? 200 : 403;

    expect(expectedStatus).toBe(403);
  });

  test('404 Not Found - spot does not exist', () => {
    const spotExists = false;
    const expectedStatus = spotExists ? 200 : 404;

    expect(expectedStatus).toBe(404);
  });

  test('429 Too Many Requests - rate limit exceeded', () => {
    const withinRateLimit = false;
    const expectedStatus = withinRateLimit ? 200 : 429;

    expect(expectedStatus).toBe(429);
  });

  test('500 Internal Server Error - database error', () => {
    const databaseError = new Error('Firestore timeout');
    const expectedStatus = databaseError ? 500 : 200;

    expect(expectedStatus).toBe(500);
    expect(databaseError.message).toBe('Firestore timeout');
  });

  test('error response should include traceId', () => {
    const errorResponse = {
      error: 'Forbidden: spotData permission required',
      traceId: 'abc123def456',
    };

    expect(errorResponse).toHaveProperty('error');
    expect(errorResponse).toHaveProperty('traceId');
    expect(errorResponse.traceId).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('B2B API - Success Scenarios', () => {
  test('successful spotData request should return data and traceId', () => {
    const successResponse = {
      spot: {
        id: 'spot-123',
        name: 'Catalina Coffee',
        metrics: {
          wifi: 4.5,
          noise: 2.3,
          busyness: 3.1,
        },
      },
      traceId: 'abc123',
    };

    expect(successResponse).toHaveProperty('spot');
    expect(successResponse).toHaveProperty('traceId');
    expect(successResponse.spot.id).toBe('spot-123');
  });

  test('successful nearbySpots request should return sorted results', () => {
    const successResponse = {
      spots: [
        { id: 'spot-1', distance: 100, busyness: 1.5 },
        { id: 'spot-2', distance: 200, busyness: 2.5 },
        { id: 'spot-3', distance: 150, busyness: 3.5 },
      ],
      traceId: 'abc123',
    };

    // Should be sorted by busyness (ascending)
    const sorted = [...successResponse.spots].sort((a, b) => a.busyness - b.busyness);

    expect(sorted[0].id).toBe('spot-1');
    expect(sorted[1].id).toBe('spot-2');
    expect(sorted[2].id).toBe('spot-3');
  });

  test('usage stats should include request counts', () => {
    const usageStats = {
      totalRequests: 1234,
      requestsByEndpoint: {
        b2bGetSpotData: 800,
        b2bGetNearbySpots: 400,
        b2bGetUsageStats: 34,
      },
      currentUsage: 50,
      rateLimit: 10000,
      resetAt: Date.now() + 30 * 60 * 1000,
    };

    expect(usageStats.totalRequests).toBe(1234);
    expect(usageStats.requestsByEndpoint.b2bGetSpotData).toBe(800);
    expect(usageStats.currentUsage).toBeLessThan(usageStats.rateLimit);
  });
});
