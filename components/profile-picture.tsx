import { useAuth } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { devLog } from '@/services/logger';
import { ensureFirebase, uploadPhotoToStorage } from '@/services/firebaseClient';
import SpotImage from '@/components/ui/spot-image';
import { withAlpha } from '@/utils/colors';
import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

export default function ProfilePicture({ size = 84 }: { size?: number }) {
  const { user, updateProfile } = useAuth();
  const bg = useThemeColor({}, 'card');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const [uploading, setUploading] = React.useState(false);

  async function pickAndUpload() {
    try {
      if (uploading) return;
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.7 });
      if (res.canceled) return;
      const uri = Array.isArray(res.assets) ? res.assets[0].uri : (res as any).uri;
      if (!uri) return;
      setUploading(true);

      // try upload to firebase if present
      try {
        const fb = ensureFirebase();
        if (fb && user) {
          const uploaded = await uploadPhotoToStorage(uri, user.id);
          if (uploaded) {
            try { if (typeof updateProfile === 'function') await updateProfile({ photoUrl: uploaded }); } catch {}
            return;
          }
        }
      } catch {
        // fallthrough to local fallback
      }
      // local fallback: update profile in context/localStorage
      try {
        if (typeof updateProfile === 'function') {
          await updateProfile({ photoUrl: uri });
          return;
        }
        if (typeof window !== 'undefined' && window.localStorage && user) {
          const raw = window.localStorage.getItem('spot_user_v1');
          const u = raw ? JSON.parse(raw) : { id: user.id, email: user.email, name: user.name };
          u.photoUrl = uri;
          window.localStorage.setItem('spot_user_v1', JSON.stringify(u));
        }
      } catch (e) {
        devLog('profile picture fallback failed', e);
      }
    } catch (e) {
      devLog('pick/upload failed', e);
    } finally {
      setUploading(false);
    }
  }

  const initials = (user?.name || user?.email || '')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View style={{ alignItems: 'center' }}>
      <Pressable onPress={pickAndUpload} accessibilityLabel="Change profile picture" disabled={uploading}>
        {user?.photoUrl ? (
          <SpotImage source={{ uri: user.photoUrl }} style={[styles.img, { width: size, height: size, borderRadius: size / 2 }]} />
        ) : (
          <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
            <Text style={{ fontWeight: '700', color: text }}>{initials}</Text>
          </View>
        )}
        {uploading ? (
          <View style={[styles.loading, { width: size, height: size, borderRadius: size / 2 }]}>
            <ActivityIndicator color={primary} />
          </View>
        ) : null}
      </Pressable>
      <View style={{ height: 8 }} />
      <Text style={{ fontSize: 12, color: muted }}>{uploading ? 'Uploading...' : 'Tap to change'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  img: { resizeMode: 'cover' as any },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  loading: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha('#000000', 0.25),
  },
});
