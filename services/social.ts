import { track } from './analytics';
import { devLog } from './logger';

export type ReactionType = 'fire' | 'coffee' | 'book' | 'party' | 'heart' | 'thumbs_up';

export interface Reaction {
  id: string;
  checkinId: string;
  userId: string;
  userName: string;
  userHandle?: string;
  type: ReactionType;
  createdAt: number;
}

export interface Comment {
  id: string;
  checkinId: string;
  userId: string;
  userName: string;
  userHandle?: string;
  userPhotoUrl?: string;
  text: string;
  createdAt: number;
  updatedAt?: number;
}

export const REACTION_EMOJIS: Record<ReactionType, string> = {
  fire: '🔥',
  coffee: '☕',
  book: '📚',
  party: '🎉',
  heart: '❤️',
  thumbs_up: '👍',
};

/**
 * Add a reaction to a check-in
 */
export async function addReaction(
  checkinId: string,
  type: ReactionType,
  userId: string,
  userName: string,
  userHandle?: string
): Promise<Reaction> {
  const sanitizeId = (value: string) => String(value || '').replace(/[\/#?]+/g, '_');
  const reaction: Reaction = {
    id: `rx_${sanitizeId(checkinId)}_${sanitizeId(userId)}`,
    checkinId,
    userId,
    userName,
    userHandle,
    type,
    createdAt: Date.now(),
  };

  try {
    // Add to Firestore
    const { addReactionToFirestore } = await import('./firebaseClient');
    await addReactionToFirestore(reaction);

    // Track analytics
    track('checkin_reacted', {
      reaction_type: type,
      checkin_id: checkinId,
    });
  } catch (error) {
    devLog('addReaction failed', error);
  }

  return reaction;
}

/**
 * Remove a reaction
 */
export async function removeReaction(
  checkinId: string,
  type: ReactionType,
  userId: string
): Promise<void> {
  try {
    const { removeReactionFromFirestore } = await import('./firebaseClient');
    await removeReactionFromFirestore(checkinId, userId, type);
  } catch (error) {
    devLog('removeReaction failed', error);
  }
}

/**
 * Get reactions for a check-in
 */
export async function getReactions(checkinId: string): Promise<Reaction[]> {
  try {
    const { getReactionsFromFirestore } = await import('./firebaseClient');
    return await getReactionsFromFirestore(checkinId);
  } catch (error) {
    devLog('getReactions failed', error);
    return [];
  }
}

/**
 * Get reaction counts grouped by type
 */
export function getReactionCounts(reactions: Reaction[]): Record<ReactionType, number> {
  const counts: Record<string, number> = {};

  for (const reaction of reactions) {
    counts[reaction.type] = (counts[reaction.type] || 0) + 1;
  }

  return counts as Record<ReactionType, number>;
}

/**
 * Add a comment to a check-in
 */
export async function addComment(
  checkinId: string,
  text: string,
  userId: string,
  userName: string,
  userHandle?: string,
  userPhotoUrl?: string
): Promise<Comment> {
  const comment: Comment = {
    id: `comment_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    checkinId,
    userId,
    userName,
    userHandle,
    userPhotoUrl,
    text: text.trim(),
    createdAt: Date.now(),
  };

  try {
    // Add to Firestore
    const { addCommentToFirestore } = await import('./firebaseClient');
    await addCommentToFirestore(comment);

    // Track analytics
    track('comment_posted', {
      checkin_id: checkinId,
      comment_length: text.length,
    });
  } catch (error) {
    console.error('Failed to add comment:', error);
  }

  return comment;
}

/**
 * Get comments for a check-in
 */
export async function getComments(checkinId: string): Promise<Comment[]> {
  try {
    const { getCommentsFromFirestore } = await import('./firebaseClient');
    const comments = (await getCommentsFromFirestore(checkinId)) as Comment[];
    return comments.sort((a, b) => a.createdAt - b.createdAt); // Oldest first
  } catch (error) {
    console.error('Failed to get comments:', error);
    return [];
  }
}

/**
 * Delete a comment
 */
export async function deleteComment(commentId: string, userId: string): Promise<void> {
  try {
    const { deleteCommentFromFirestore } = await import('./firebaseClient');
    await deleteCommentFromFirestore(commentId, userId);

    track('comment_deleted', {
      comment_id: commentId,
    });
  } catch (error) {
    console.error('Failed to delete comment:', error);
  }
}

/**
 * Update a comment
 */
export async function updateComment(
  commentId: string,
  text: string,
  userId: string
): Promise<void> {
  try {
    const { updateCommentInFirestore } = await import('./firebaseClient');
    await updateCommentInFirestore(commentId, userId, text.trim());
  } catch (error) {
    console.error('Failed to update comment:', error);
  }
}

export default {
  addReaction,
  removeReaction,
  getReactions,
  getReactionCounts,
  addComment,
  getComments,
  deleteComment,
  updateComment,
  REACTION_EMOJIS,
};
