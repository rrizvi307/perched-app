export function removeFriendRequestPair(items: any[], userA: string, userB: string) {
  if (!Array.isArray(items)) return [];
  return items.filter((request: any) => {
    const fromId = String(request?.fromId || '');
    const toId = String(request?.toId || '');
    if (!fromId || !toId) return true;
    const isPair = (fromId === userA && toId === userB) || (fromId === userB && toId === userA);
    return !isPair;
  });
}

export function addMutualFriend(map: any, userA: string, userB: string, normalize: (value: unknown) => string[]) {
  const left = new Set(normalize(map[userA]));
  left.add(userB);
  map[userA] = Array.from(left);

  const right = new Set(normalize(map[userB]));
  right.add(userA);
  map[userB] = Array.from(right);
}

export function removeMutualFriend(map: any, userA: string, userB: string, normalize: (value: unknown) => string[]) {
  map[userA] = normalize(map[userA]).filter((id: string) => id !== userB);
  map[userB] = normalize(map[userB]).filter((id: string) => id !== userA);
}
