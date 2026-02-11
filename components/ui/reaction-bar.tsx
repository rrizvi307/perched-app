import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useState } from 'react';
import { ReactionType, REACTION_EMOJIS, addReaction, removeReaction } from '@/services/social';
import { useThemeColor } from '@/hooks/use-theme-color';
import { tokens } from '@/constants/tokens';

interface ReactionBarProps {
  checkinId: string;
  userId: string;
  userName: string;
  userHandle?: string;
  initialCounts?: Record<ReactionType, number>;
  userReaction?: ReactionType | null;
  onReactionChange?: () => void;
}

export function ReactionBar({
  checkinId,
  userId,
  userName,
  userHandle,
  initialCounts = {} as Record<ReactionType, number>,
  userReaction: initialUserReaction = null,
  onReactionChange,
}: ReactionBarProps) {
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const surface = useThemeColor({}, 'surface');
  const border = useThemeColor({}, 'border');

  const [counts, setCounts] = useState(initialCounts);
  const [userReaction, setUserReaction] = useState<ReactionType | null>(initialUserReaction);
  const [animating, setAnimating] = useState<ReactionType | null>(null);

  const handleReaction = async (type: ReactionType) => {
    if (animating) return; // Prevent double-tap

    setAnimating(type);

    if (userReaction === type) {
      // Remove reaction
      setUserReaction(null);
      setCounts((prev) => ({
        ...prev,
        [type]: Math.max(0, (prev[type] || 0) - 1),
      }));
      await removeReaction(checkinId, type, userId);
    } else {
      // Add new reaction (remove old if exists)
      if (userReaction) {
        setCounts((prev) => ({
          ...prev,
          [userReaction]: Math.max(0, (prev[userReaction] || 0) - 1),
        }));
        await removeReaction(checkinId, userReaction, userId);
      }

      setUserReaction(type);
      setCounts((prev) => ({
        ...prev,
        [type]: (prev[type] || 0) + 1,
      }));
      await addReaction(checkinId, type, userId, userName, userHandle);
    }

    onReactionChange?.();
    setTimeout(() => setAnimating(null), 300);
  };

  const reactionTypes: ReactionType[] = ['fire', 'coffee', 'book', 'party', 'heart', 'thumbs_up'];

  return (
    <View style={styles.container}>
      {reactionTypes.map((type) => {
        const count = counts[type] || 0;
        const isActive = userReaction === type;
        const isAnimating = animating === type;

        return (
          <Pressable
            key={type}
            onPress={() => handleReaction(type)}
            style={({ pressed }) => [
              styles.reaction,
              {
                backgroundColor: isActive ? primary : surface,
                borderColor: isActive ? primary : border,
                opacity: pressed ? 0.7 : 1,
                transform: [{ scale: isAnimating ? 1.2 : 1 }],
              },
            ]}
          >
            <Text style={styles.emoji}>{REACTION_EMOJIS[type]}</Text>
            {count > 0 && (
              <Text
                style={[
                  styles.count,
                  {
                    color: isActive ? '#FFFFFF' : muted,
                    fontWeight: isActive ? '700' : '600',
                  },
                ]}
              >
                {count}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 8,
  },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.5,
    gap: 6,
  },
  emoji: {
    fontSize: 16,
  },
  count: {
    fontSize: tokens.type.small.fontSize,
  },
});
