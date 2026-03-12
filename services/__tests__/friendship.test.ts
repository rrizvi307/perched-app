import { didFriendRequestResolveToFriendship } from '../friendship';

describe('didFriendRequestResolveToFriendship', () => {
  it('returns true when the request was accepted', () => {
    expect(didFriendRequestResolveToFriendship({ status: 'accepted' })).toBe(true);
  });

  it('returns true when the users were already friends', () => {
    expect(didFriendRequestResolveToFriendship({ status: 'pending', alreadyFriends: true })).toBe(true);
  });

  it('returns false for a pending request', () => {
    expect(didFriendRequestResolveToFriendship({ status: 'pending' })).toBe(false);
  });

  it('returns false for empty input', () => {
    expect(didFriendRequestResolveToFriendship(null)).toBe(false);
  });
});
