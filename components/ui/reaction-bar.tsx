import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useState } from 'react';
import { ReactionType, REACTION_EMOJIS, addReaction, removeReaction } from '@/services/social';
import { useThemeColor } from '@/hooks/use-theme-color';
import { tokens } from '@/constants/tokens';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { safeImpact } from '@/utils/haptics';

interface ReactionBarProps {
  checkinId: string;
  userId: string;
  userName: string;
  userHandle?: string;
  initialCounts?: Record<ReactionType, number>;
  userReaction?: ReactionType | null;
  onReactionChange?: () => void;
}

function ReactionButton({
  type,
  emoji,
  count,
  isSelected,
  onPress,
  primary,
  surface,
  border,
  muted,
}: {
  type: ReactionType;
  emoji: string;
  count: number;
  isSelected: boolean;
  onPress: (type: ReactionType) => void;
  primary: string;
  surface: string;
  border: string;
  muted: string;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSequence(
      withSpring(1.4, { damping: 4, stiffness: 300 }),
      withSpring(1, { damping: 8, stiffness: 200 }),
    );
    void safeImpact();
    onPress(type);
  };

  return (
    <Pressable onPress={handlePress}>
      <Animated.View
        style={[
          styles.reaction,
          {
            backgroundColor: isSelected ? primary : surface,
            borderColor: isSelected ? primary : border,
          },
          animatedStyle,
        ]}
      >
        <Text style={styles.emoji}>{emoji}</Text>
        {count > 0 ? (
          <Text
            style={[
              styles.count,
              {
                color: isSelected ? '#FFFFFF' : muted,
                fontWeight: isSelected ? '700' : '600',
              },
            ]}
          >
            {count}
          </Text>
        ) : null}
      </Animated.View>
    </Pressable>
  );
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
  const [animating, setAnimating] = useState(false);

  const handleReaction = async (type: ReactionType) => {
    if (animating) return; // Prevent double-tap

    setAnimating(true);

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
    setTimeout(() => setAnimating(false), 300);
  };

  const reactionTypes: ReactionType[] = ['fire', 'coffee', 'book', 'party', 'heart', 'thumbs_up'];

  return (
    <View style={styles.container}>
      {reactionTypes.map((type) => (
        <ReactionButton
          key={type}
          type={type}
          emoji={REACTION_EMOJIS[type]}
          count={counts[type] || 0}
          isSelected={userReaction === type}
          onPress={handleReaction}
          primary={primary}
          surface={surface}
          border={border}
          muted={muted}
        />
      ))}
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
