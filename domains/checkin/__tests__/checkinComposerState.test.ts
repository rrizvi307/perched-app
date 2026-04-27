import {
  buildComposerDraftPayload,
  hasComposerDraftContent,
  hydrateComposerFromSource,
  parseComposerRouteParams,
} from '../checkinComposerState';

describe('hydrateComposerFromSource', () => {
  it('normalizes edit or draft data into composer fields', () => {
    expect(
      hydrateComposerFromSource({
        spotName: 'Agora Coffee',
        caption: 'Quiet morning',
        photoUrl: 'https://cdn.example.com/photo.jpg',
        tags: ['Quiet', '', 'Cozy'],
        photoTags: ['Latte', 'Patio', 'Friends', 'Extra'],
        visitIntent: ['deep_work', 'group_study', 'invalid'],
        ambiance: 'cozy',
        visibility: 'friends',
        spotPlaceId: 'place-1',
        spotLatLng: { lat: 29.7, lng: -95.4 },
        noiseLevel: '2',
        busyness: 3,
        overallVibe: 4,
        drinkPrice: 2,
        drinkQuality: 4,
        wifiSpeed: 5,
        outletAvailability: 'some',
        laptopFriendly: true,
        parkingAvailability: 'limited',
        parkingType: 'street',
      }),
    ).toEqual({
      spot: 'Agora Coffee',
      caption: 'Quiet morning',
      image: 'https://cdn.example.com/photo.jpg',
      captured: true,
      selectedTags: ['Quiet', 'Cozy'],
      photoTags: ['Latte', 'Patio', 'Friends'],
      visitIntent: ['deep_work', 'group_study'],
      ambiance: 'cozy',
      visibility: 'friends',
      placeInfo: {
        placeId: 'place-1',
        name: 'Agora Coffee',
        location: { lat: 29.7, lng: -95.4 },
      },
      placeSelectionSource: 'manual',
      noiseLevel: 2,
      busyness: 3,
      overallVibe: 4,
      drinkPrice: 2,
      drinkQuality: 4,
      wifiSpeed: 5,
      outletAvailability: 4,
      laptopFriendly: true,
      parkingAvailability: 'limited',
      parkingType: 'street',
    });
  });
});

describe('buildComposerDraftPayload', () => {
  it('prefers explicit place info over detected place when saving drafts', () => {
    expect(
      buildComposerDraftPayload({
        spot: 'Agora Coffee',
        caption: 'Quiet morning',
        image: 'local://image.jpg',
        selectedTags: ['Quiet'],
        photoTags: ['Latte'],
        visitIntent: ['deep_work'],
        ambiance: 'cozy',
        placeInfo: { placeId: 'manual-place', location: { lat: 1, lng: 2 } },
        detectedPlace: { placeId: 'auto-place', location: { lat: 3, lng: 4 } },
        noiseLevel: 2,
        busyness: 3,
        overallVibe: 5,
        drinkPrice: 1,
        drinkQuality: 4,
        wifiSpeed: 5,
        outletAvailability: 4,
        laptopFriendly: true,
        parkingAvailability: 'yes',
        parkingType: 'lot',
      }),
    ).toEqual({
      spot: 'Agora Coffee',
      caption: 'Quiet morning',
      image: 'local://image.jpg',
      tags: ['Quiet'],
      photoTags: ['Latte'],
      visitIntent: ['deep_work'],
      ambiance: 'cozy',
      placeId: 'manual-place',
      location: { lat: 1, lng: 2 },
      noiseLevel: 2,
      busyness: 3,
      overallVibe: 5,
      drinkPrice: 1,
      drinkQuality: 4,
      wifiSpeed: 5,
      outletAvailability: 4,
      laptopFriendly: true,
      parkingAvailability: 'yes',
      parkingType: 'lot',
    });
  });
});

describe('hasComposerDraftContent', () => {
  it('returns false for an empty draft snapshot', () => {
    expect(
      hasComposerDraftContent({
        spot: '',
        caption: '',
        image: null,
        selectedTags: [],
        photoTags: [],
        visitIntent: [],
        ambiance: null,
        placeInfo: null,
        detectedPlace: null,
        noiseLevel: null,
        busyness: null,
        overallVibe: null,
        drinkPrice: null,
        drinkQuality: null,
        wifiSpeed: null,
        outletAvailability: null,
        laptopFriendly: null,
        parkingAvailability: null,
        parkingType: null,
      }),
    ).toBe(false);
  });
});

describe('parseComposerRouteParams', () => {
  it('extracts prefill place info and edit id', () => {
    expect(
      parseComposerRouteParams(
        {
          spot: 'Agora Coffee',
          placeId: 'place-1',
          lat: '29.7',
          lng: '-95.4',
          editId: 'checkin-1',
        },
        '',
      ),
    ).toEqual({
      editId: 'checkin-1',
      patch: {
        spot: 'Agora Coffee',
        placeInfo: {
          placeId: 'place-1',
          name: 'Agora Coffee',
          location: { lat: 29.7, lng: -95.4 },
        },
        placeSelectionSource: 'prefill',
      },
    });
  });
});
