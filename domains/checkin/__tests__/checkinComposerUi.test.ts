import {
  createCheckinComposerResetPatch,
  createCheckinPhotoClearedPatch,
  createCheckinPhotoReplacementPatch,
  toggleBoundedSelection,
} from '../checkinComposerUi';

describe('toggleBoundedSelection', () => {
  it('adds a new value when below the limit', () => {
    expect(toggleBoundedSelection(['Quiet'], 'Cozy', 4)).toEqual({
      next: ['Quiet', 'Cozy'],
      limitReached: false,
    });
  });

  it('removes an existing value when toggled again', () => {
    expect(toggleBoundedSelection(['Quiet', 'Cozy'], 'Quiet', 4)).toEqual({
      next: ['Cozy'],
      limitReached: false,
    });
  });

  it('preserves the current selection when the limit is reached', () => {
    expect(toggleBoundedSelection(['a', 'b'], 'c', 2)).toEqual({
      next: ['a', 'b'],
      limitReached: true,
    });
  });
});

describe('createCheckinComposerResetPatch', () => {
  it('returns the fully reset screen state patch', () => {
    expect(createCheckinComposerResetPatch()).toMatchObject({
      spot: '',
      caption: '',
      image: null,
      imageExif: null,
      captured: false,
      selectedTags: [],
      photoTags: [],
      visitIntent: [],
      ambiance: null,
      placeInfo: null,
      placeSelectionSource: null,
      detectedPlace: null,
      detectedCandidates: [],
      detecting: false,
      detectionError: null,
      postStatus: null,
      pendingRemote: null,
      placeModal: false,
      visibility: 'public',
      isEditMode: false,
      editId: null,
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
    });
  });
});

describe('createCheckinPhotoClearedPatch', () => {
  it('clears spot and place state when the place was auto-detected', () => {
    expect(createCheckinPhotoClearedPatch('auto')).toMatchObject({
      image: null,
      imageExif: null,
      captured: false,
      detectedCandidates: [],
      detectionError: null,
      detecting: false,
      placeInfo: null,
      placeSelectionSource: null,
      detectedPlace: null,
      spot: '',
    });
  });

  it('preserves manual spot selection when only the photo is replaced', () => {
    expect(createCheckinPhotoClearedPatch('manual')).toEqual({
      image: null,
      imageExif: null,
      captured: false,
      detectedCandidates: [],
      detectionError: null,
      detecting: false,
    });
  });
});

describe('createCheckinPhotoReplacementPatch', () => {
  it('preserves the newly selected photo fields while clearing stale detection state', () => {
    expect(createCheckinPhotoReplacementPatch('manual')).toEqual({
      detectedCandidates: [],
      detectionError: null,
      detecting: false,
    });
  });

  it('clears auto-selected spot state when the photo changes', () => {
    expect(createCheckinPhotoReplacementPatch(null)).toMatchObject({
      detectedCandidates: [],
      detectionError: null,
      detecting: false,
      placeInfo: null,
      placeSelectionSource: null,
      detectedPlace: null,
      spot: '',
    });
  });
});
