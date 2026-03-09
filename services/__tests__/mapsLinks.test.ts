import { buildGoogleMapsUrl, buildAppleMapsUrl } from '../mapsLinks';

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

describe('buildAppleMapsUrl', () => {
  it('uses coordinates and name', () => {
    const url = buildAppleMapsUrl({
      coords: { lat: 29.7604, lng: -95.3698 },
      name: 'Catalina Coffee',
    });
    expect(url).toBe(
      'https://maps.apple.com/?ll=29.7604,-95.3698&q=Catalina%20Coffee'
    );
  });

  it('uses coordinates without name', () => {
    const url = buildAppleMapsUrl({
      coords: { lat: 29.7604, lng: -95.3698 },
    });
    expect(url).toBe('https://maps.apple.com/?ll=29.7604,-95.3698');
  });

  it('falls back to name only when no coordinates', () => {
    const url = buildAppleMapsUrl({ name: 'Catalina Coffee Houston' });
    expect(url).toBe(
      'https://maps.apple.com/?q=Catalina%20Coffee%20Houston'
    );
  });

  it('ignores placeId (not supported by Apple Maps)', () => {
    const url = buildAppleMapsUrl({ placeId: 'abc123' });
    expect(url).toBeNull();
  });

  it('returns null when input has no usable data', () => {
    expect(buildAppleMapsUrl({})).toBeNull();
    expect(buildAppleMapsUrl({ name: '   ' })).toBeNull();
  });
});
