import {
  getCanonicalSpotKey,
  groupSpotCheckins,
  mergeSpotSummaries,
  matchesSpotIdentity,
} from '../spotRepository';

describe('spotRepository', () => {
  it('groups legacy and canonical check-ins for the same venue together', () => {
    const groups = groupSpotCheckins([
      {
        id: 'legacy-1',
        spotName: 'Brass Tacks',
        spotLatLng: { lat: 29.7412, lng: -95.3921 },
        createdAt: 1000,
      },
      {
        id: 'canonical-1',
        spotPlaceId: 'google-brass-tacks',
        spotName: 'Brass Tacks',
        spotLatLng: { lat: 29.7413, lng: -95.3922 },
        createdAt: 2000,
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual(
      expect.objectContaining({
        placeId: 'google-brass-tacks',
        count: 2,
      }),
    );
  });

  it('merges check-in and materialized spot summaries without dropping history', () => {
    const merged = mergeSpotSummaries(
      [
        {
          key: 'place:google-brass-tacks',
          placeId: 'google-brass-tacks',
          name: 'Brass Tacks',
          _checkins: [{ id: 'checkin-1', createdAt: 1000 }],
          count: 1,
        },
      ],
      [
        {
          placeId: 'google-brass-tacks',
          name: 'Brass Tacks',
          intel: { avgRating: 4.6 },
          display: { noise: 'quiet' },
          live: { checkinCount: 1 },
        },
      ],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]._checkins).toHaveLength(1);
    expect(merged[0].intel?.avgRating).toBe(4.6);
    expect(merged[0].display?.noise).toBe('quiet');
  });

  it('builds stable canonical keys with location-aware aliases when placeId is missing', () => {
    const key = getCanonicalSpotKey({
      name: 'Brass Tacks',
      location: { lat: 29.7412, lng: -95.3921 },
    });

    expect(key).toBe('alias:brass tacks@29.741:-95.392');
  });

  it('matches legacy check-ins to a canonical spot by name and nearby coordinates', () => {
    expect(
      matchesSpotIdentity(
        {
          spotName: 'Brass Tacks',
          spotLatLng: { lat: 29.7412, lng: -95.3921 },
        },
        {
          name: 'Brass Tacks',
          location: { lat: 29.7413, lng: -95.3922 },
        },
      ),
    ).toBe(true);
  });
});
