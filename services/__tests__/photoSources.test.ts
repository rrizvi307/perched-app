import { findInvalidPhotoSeeds, isPhotoUriRenderable, resolvePhotoUri } from '../photoSources';

describe('photo source normalization', () => {
  it('prefers the first renderable candidate', () => {
    const uri = resolvePhotoUri({
      photoUrl: 'http://insecure.example.com/pic.jpg',
      imageUrl: 'https://cdn.example.com/pic.jpg',
    });
    expect(uri).toBe('https://cdn.example.com/pic.jpg');
  });

  it('accepts local file/blob/data URIs', () => {
    expect(isPhotoUriRenderable('file:///tmp/pic.jpg')).toBe(true);
    expect(isPhotoUriRenderable('blob:http://localhost/id')).toBe(true);
    expect(isPhotoUriRenderable('data:image/png;base64,abc')).toBe(true);
  });

  it('rejects invalid placeholders', () => {
    expect(isPhotoUriRenderable('')).toBe(false);
    expect(isPhotoUriRenderable('undefined')).toBe(false);
    expect(isPhotoUriRenderable('http://example.com/a.jpg')).toBe(false);
    expect(isPhotoUriRenderable('[object Object]')).toBe(false);
  });

  it('flags invalid seed items', () => {
    const invalid = findInvalidPhotoSeeds([
      { id: 'ok', photoUrl: 'https://images.example.com/a.jpg' },
      { id: 'bad', photoUrl: 'http://images.example.com/b.jpg' },
      { id: 'empty', photoUrl: '   ' },
    ]);
    expect(invalid).toEqual([{ id: 'bad', uri: 'http://images.example.com/b.jpg' }]);
  });
});
