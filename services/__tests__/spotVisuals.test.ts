import { resolveSpotVisual } from '../spotVisuals';

describe('resolveSpotVisual', () => {
  it('prefers community photos over provider photos and maps', () => {
    const result = resolveSpotVisual({
      checkins: [{ photoUrl: 'https://images.example.com/community.jpg' }],
      intelligence: {
        providerPhotos: [{ source: 'yelp', url: 'https://images.example.com/provider.jpg' }],
      } as any,
      fallbackMapUrl: 'https://maps.example.com/static.png',
    });

    expect(result).toEqual({
      uri: 'https://images.example.com/community.jpg',
      source: 'community',
    });
  });

  it('falls back to provider photos before static maps', () => {
    const result = resolveSpotVisual({
      checkins: [],
      intelligence: {
        providerPhotos: [{ source: 'foursquare', url: 'https://images.example.com/provider.jpg' }],
      } as any,
      fallbackMapUrl: 'https://maps.example.com/static.png',
    });

    expect(result).toEqual({
      uri: 'https://images.example.com/provider.jpg',
      source: 'provider',
    });
  });

  it('uses the map fallback when no community or provider photo exists', () => {
    const result = resolveSpotVisual({
      checkins: [],
      intelligence: { providerPhotos: [] } as any,
      fallbackMapUrl: 'https://maps.example.com/static.png',
    });

    expect(result).toEqual({
      uri: 'https://maps.example.com/static.png',
      source: 'map',
    });
  });
});
