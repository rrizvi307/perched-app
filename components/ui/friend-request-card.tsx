import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useState } from 'react';
import SpotImage from './spot-image';
import { IconSymbol } from './icon-symbol';
import { PremiumButton } from './premium-button';
import { PolishedCard } from './polished-card';
import { useThemeColor } from '@/hooks/use-theme-color';
import { withAlpha } from '@/utils/colors';
import { tokens } from '@/constants/tokens';

interface FriendRequestCardProps {
  id: string;
  fromUser: {
    id: string;
    name: string;
    handle?: string;
    photoUrl?: string;
    campus?: string;
    mutualFriends?: number;
  };
  onAccept: (id: string) => Promise<void>;
  onDecline: (id: string) => Promise<void>;
  animated?: boolean;
  delay?: number;
}

/**
 * Silicon Valley-grade friend request card
 * Smooth animations, clear actions, social proof
 */
export function FriendRequestCard({
  id,
  fromUser,
  onAccept,
  onDecline,
  animated = true,
  delay = 0,
}: FriendRequestCardProps) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const success = useThemeColor({}, 'success');
  const border = useThemeColor({}, 'border');

  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [declined, setDeclined] = useState(false);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await onAccept(id);
      setAccepted(true);
    } catch (error) {
      console.error('Failed to accept request:', error);
    } finally {
      setAccepting(false);
    }
  };

  const handleDecline = async () => {
    setDeclining(true);
    try {
      await onDecline(id);
      setDeclined(true);
    } catch (error) {
      console.error('Failed to decline request:', error);
    } finally {
      setDeclining(false);
    }
  };

  if (declined) {
    return null; // Hide declined requests
  }

  return (
    <PolishedCard
      variant="elevated"
      animated={animated}
      delay={delay}
      pressable={false}
      style={styles.card}
    >
      {accepted && (
        <View style={[styles.acceptedBanner, { backgroundColor: withAlpha(success, 0.1) }]}>
          <IconSymbol name="checkmark.circle.fill" size={16} color={success} />
          <Text style={[styles.acceptedText, { color: success }]}>
            Now friends!
          </Text>
        </View>
      )}

      <View style={styles.content}>
        {/* Profile Photo */}
        {fromUser.photoUrl ? (
          <SpotImage
            source={{ uri: fromUser.photoUrl }}
            style={styles.photo}
          />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: border }]}>
            <Text style={{ fontSize: 24, color: text }}>
              {fromUser.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        {/* User Info */}
        <View style={styles.info}>
          <Text style={[styles.name, { color: text }]} numberOfLines={1}>
            {fromUser.name}
          </Text>

          {fromUser.handle && (
            <Text style={[styles.handle, { color: muted }]} numberOfLines={1}>
              @{fromUser.handle}
            </Text>
          )}

          {fromUser.campus && (
            <View style={styles.metaRow}>
              <IconSymbol name="building.2.fill" size={12} color={muted} />
              <Text style={[styles.metaText, { color: muted }]} numberOfLines={1}>
                {fromUser.campus}
              </Text>
            </View>
          )}

          {fromUser.mutualFriends !== undefined && fromUser.mutualFriends > 0 && (
            <View style={styles.metaRow}>
              <IconSymbol name="person.2.fill" size={12} color={primary} />
              <Text style={[styles.metaText, { color: primary }]}>
                {fromUser.mutualFriends} mutual friend{fromUser.mutualFriends !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Actions */}
      {!accepted && (
        <View style={styles.actions}>
          <PremiumButton
            onPress={handleAccept}
            variant="primary"
            size="medium"
            icon="checkmark"
            loading={accepting}
            disabled={declining}
            style={{ flex: 1 }}
          >
            Accept
          </PremiumButton>

          <PremiumButton
            onPress={handleDecline}
            variant="ghost"
            size="medium"
            icon="xmark"
            loading={declining}
            disabled={accepting}
            style={{ flex: 1 }}
          >
            Decline
          </PremiumButton>
        </View>
      )}
    </PolishedCard>
  );
}

/**
 * Mutual friends component - shows overlapping friend circles
 */
export function MutualFriendsIndicator({
  count,
  preview,
}: {
  count: number;
  preview?: string[];
}) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');

  if (count === 0) return null;

  return (
    <View style={styles.mutualContainer}>
      <View style={styles.mutualPhotos}>
        {preview?.slice(0, 3).map((photoUrl, i) => (
          <SpotImage
            key={i}
            source={{ uri: photoUrl }}
            style={[styles.mutualPhoto, { marginLeft: i > 0 ? -8 : 0 }]}
          />
        ))}
      </View>
      <Text style={[styles.mutualText, { color: primary }]}>
        {count} mutual friend{count !== 1 ? 's' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginBottom: 12,
  },
  acceptedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  acceptedText: {
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  photo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 12,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    fontSize: tokens.type.h4.fontSize,
    fontWeight: '700',
    marginBottom: 2,
  },
  handle: {
    fontSize: 14,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  metaText: {
    fontSize: 13,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  mutualContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  mutualPhotos: {
    flexDirection: 'row',
    marginRight: 8,
  },
  mutualPhoto: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  mutualText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
