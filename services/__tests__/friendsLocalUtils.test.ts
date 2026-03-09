import { addMutualFriend, removeFriendRequestPair, removeMutualFriend } from '../friendsLocalUtils';

describe('friends local utilities', () => {
  const normalize = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

  it('removes both request directions for a friend pair', () => {
    const requests = [
      { id: 'a_b', fromId: 'a', toId: 'b', status: 'pending' },
      { id: 'b_a', fromId: 'b', toId: 'a', status: 'pending' },
      { id: 'a_c', fromId: 'a', toId: 'c', status: 'pending' },
    ];

    const result = removeFriendRequestPair(requests, 'a', 'b');

    expect(result).toEqual([{ id: 'a_c', fromId: 'a', toId: 'c', status: 'pending' }]);
  });

  it('adds mutual friendship on both users and de-dupes', () => {
    const friendsMap: Record<string, string[]> = {
      a: ['b'],
      b: [],
    };

    addMutualFriend(friendsMap, 'a', 'b', normalize);
    addMutualFriend(friendsMap, 'a', 'b', normalize);

    expect(friendsMap.a).toEqual(['b']);
    expect(friendsMap.b).toEqual(['a']);
  });

  it('removes mutual friendship on both users', () => {
    const friendsMap: Record<string, string[]> = {
      a: ['b', 'c'],
      b: ['a'],
    };

    removeMutualFriend(friendsMap, 'a', 'b', normalize);

    expect(friendsMap.a).toEqual(['c']);
    expect(friendsMap.b).toEqual([]);
  });
});
