import { buildGoogleMapsUrl } from '../mapsLinks';

describe('buildGoogleMapsUrl', () => {
  it('uses coordinates when available', () => {
    const url = buildGoogleMapsUrl({
      coords: { lat: 29.7604, lng: -95.3698 },
      placeId: 'ignored-place-id',
      name: 'Houston',
    });
    expect(url).toBe(
      'https://www.google.com/maps/search/?api=1&query=29.7604%2C-95.3698'
    );
  });

  it('falls back to place id', () => {
    const url = buildGoogleMapsUrl({ placeId: 'abc123' });
    expect(url).toBe(
      'https://www.google.com/maps/search/?api=1&query=place_id%3Aabc123'
    );
  });

  it('falls back to place name when no id or coordinates', () => {
    const url = buildGoogleMapsUrl({ name: 'Catalina Coffee Houston' });
    expect(url).toBe(
      'https://www.google.com/maps/search/?api=1&query=Catalina%20Coffee%20Houston'
    );
  });

  it('returns null when input has no usable query', () => {
    expect(buildGoogleMapsUrl({})).toBeNull();
    expect(buildGoogleMapsUrl({ name: '   ' })).toBeNull();
  });
});
