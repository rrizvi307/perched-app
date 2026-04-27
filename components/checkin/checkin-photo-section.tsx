import SpotImage from '@/components/ui/spot-image';
import { Body } from '@/components/ui/typography';
import { useCheckinController } from '@/domains/checkin/useCheckinController';
import { withAlpha } from '@/utils/colors';
import { Pressable, StyleSheet, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { gapStyle } from '@/utils/layout';

type CheckinController = ReturnType<typeof useCheckinController>;

type CheckinPhotoSectionProps = {
  controller: CheckinController;
  palette: {
    backgroundAltLibrary: string;
    backgroundAltLight: string;
    cardBg: string;
    inputBorder: string;
    muted: string;
    primary: string;
    text: string;
  };
};

export function CheckinPhotoSection({ controller, palette }: CheckinPhotoSectionProps) {
  const {
    captured,
    clearAttachedPhoto,
    image,
    openCamera,
    pickImage,
    replacePhoto,
    triggerHaptic,
  } = controller;
  const { backgroundAltLibrary, backgroundAltLight, cardBg, inputBorder, muted, primary, text } =
    palette;

  if (!captured) {
    return (
      <View style={[styles.cameraContainer, { backgroundColor: cardBg, borderColor: inputBorder }]}>
        <View style={styles.cameraContent}>
          <Body style={{ color: text, marginBottom: 6 }}>Ready to tap in</Body>
          <Body style={{ color: muted }}>Choose how you want to add a photo.</Body>
          <View style={{ height: 18 }} />
          <View style={styles.mediaRow}>
            <Pressable
              testID="checkin-camera-button"
              style={[styles.mediaButton, { backgroundColor: backgroundAltLight, borderColor: inputBorder }]}
              onPress={() => {
                void triggerHaptic();
                void openCamera();
              }}
              accessibilityRole="button"
              accessibilityLabel="Take a photo with the camera"
            >
              <IconSymbol name="camera.fill" size={18} color={text} />
              <Body style={{ marginBottom: 0, color: text }}>Camera</Body>
            </Pressable>
            <Pressable
              testID="checkin-library-button"
              style={[styles.mediaButton, { backgroundColor: backgroundAltLibrary, borderColor: inputBorder }]}
              onPress={() => {
                void triggerHaptic();
                void pickImage();
              }}
              accessibilityRole="button"
              accessibilityLabel="Choose a photo from your library"
            >
              <IconSymbol name="photo.fill" size={18} color={text} />
              <Body style={{ marginBottom: 0, color: text }}>Library</Body>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.previewWrap}>
        <SpotImage source={{ uri: image as string }} style={[styles.preview, { backgroundColor: inputBorder }]} />
        <Pressable
          onPress={clearAttachedPhoto}
          accessibilityRole="button"
          accessibilityLabel="Remove photo and choose another"
          style={({ pressed }) => [
            styles.previewDismissButton,
            {
              backgroundColor: withAlpha(cardBg, pressed ? 0.78 : 0.9),
              borderColor: inputBorder,
            },
          ]}
        >
          <IconSymbol name="xmark" size={16} color={text} />
        </Pressable>
      </View>
      <View style={styles.previewActionRow}>
        <Pressable
          onPress={() => replacePhoto('camera')}
          accessibilityRole="button"
          accessibilityLabel="Use camera again"
          style={({ pressed }) => [
            styles.previewActionButton,
            {
              borderColor: inputBorder,
              backgroundColor: pressed ? withAlpha(primary, 0.12) : withAlpha(primary, 0.08),
            },
          ]}
        >
          <IconSymbol name="camera.fill" size={16} color={primary} />
          <Body style={{ color: primary, marginBottom: 0 }}>Use camera again</Body>
        </Pressable>
        <Pressable
          onPress={() => replacePhoto('library')}
          accessibilityRole="button"
          accessibilityLabel="Choose another photo"
          style={({ pressed }) => [
            styles.previewActionButton,
            {
              borderColor: inputBorder,
              backgroundColor: pressed ? withAlpha(primary, 0.12) : withAlpha(primary, 0.08),
            },
          ]}
        >
          <IconSymbol name="photo.fill" size={16} color={primary} />
          <Body style={{ color: primary, marginBottom: 0 }}>Choose another</Body>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cameraContainer: {
    height: 420,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    paddingHorizontal: 18,
  },
  cameraContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaButton: {
    minWidth: 120,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...gapStyle(12),
  },
  preview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 20,
    resizeMode: 'cover',
  },
  previewActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...gapStyle(8),
  },
  previewActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
    ...gapStyle(10),
  },
  previewDismissButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewWrap: {
    position: 'relative',
    marginBottom: 12,
  },
});
