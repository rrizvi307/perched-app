export type FriendRequestResolution = {
  status?: string | null;
  alreadyFriends?: boolean | null;
};

export function didFriendRequestResolveToFriendship(
  result: FriendRequestResolution | null | undefined
) {
  return result?.status === 'accepted' || Boolean(result?.alreadyFriends);
}
