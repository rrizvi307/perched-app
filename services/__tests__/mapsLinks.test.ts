import { buildGoogleMapsUrl, buildAppleMapsUrl } from '../mapsLinks';

describe('buildGoogleMapsUrl', () => {
  it('uses place details when coordinates and place id are both available', () => {
    const url = buildGoogleMapsUrl({
      coords: { lat: 29.7604, lng: -95.3698 },
      placeId: 'spot-place-id',
      name: 'Houston',
    });
    expect(url).toBe(
      'https://www.google.com/maps/search/?api=1&query=29.7604%2C-95.3698&query_place_id=spot-place-id'
    );
  });

  it('uses place details when name and place id are both available', () => {
    const url = buildGoogleMapsUrl({ placeId: 'abc123', name: 'Catalina Coffee' });
    expect(url).toBe(
      'https://www.google.com/maps/search/?api=1&query=Catalina%20Coffee&query_place_id=abc123'
    );
  });

  it('falls back to coordinates when no place id is available', () => {
    const url = buildGoogleMapsUrl({ coords: { lat: 29.7604, lng: -95.3698 } });
    expect(url).toBe(
      'https://www.google.com/maps/search/?api=1&query=29.7604%2C-95.3698'
    );
  });

  it('falls back to place id when it is the only destination hint', () => {
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
