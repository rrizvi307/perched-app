import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import CelebrationOverlay from '@/components/ui/CelebrationOverlay';
import { CheckinComposerDetailsSection } from '@/components/checkin/checkin-composer-details-section';
import { CheckinLocationStatusSection } from '@/components/checkin/checkin-location-status-section';
import { CheckinPhotoSection } from '@/components/checkin/checkin-photo-section';
import { CheckinSpotIntelSection } from '@/components/checkin/checkin-spot-intel-section';
import { useCheckinController } from '@/domains/checkin/useCheckinController';
import PermissionSheet from '@/components/ui/permission-sheet';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import PlaceSearch from '@/components/place-search';
import { Body, H1, Label } from '@/components/ui/typography';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { tokens } from '@/constants/tokens';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useKeyboardHeight } from '@/hooks/use-keyboard-visible';
import { withAlpha } from '@/utils/colors';
import { gapStyle } from '@/utils/layout';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CheckinScreen() {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const router = useRouter();
  const color = useThemeColor({}, 'text');
  const cardBg = useThemeColor({}, 'card');
  const primary = useThemeColor({}, 'primary');
  const surface = useThemeColor({}, 'surface');
  const inputBorder = useThemeColor({}, 'border');
  const inputBg = useThemeColor({}, 'surface');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const success = useThemeColor({}, 'success');
  const controller = useCheckinController();
  const backgroundAltLight = withAlpha(surface, 0.92);
  const backgroundAltLibrary = withAlpha(primary, 0.14);
  const stickyBottom =
    (Platform.OS === 'android' ? keyboardHeight : 0) + Math.max(0, insets.bottom) + 12;
  const stickySpacer = controller.captured ? stickyBottom + 96 : Math.max(24, insets.bottom + 24);
  const sectionPalette = {
    backgroundAltLibrary,
    backgroundAltLight,
    cardBg,
    inputBg,
    inputBorder,
    muted,
    primary,
    success,
    text,
  };

  if (controller.hasPermission === false) {
    return (
      <ThemedView testID="checkin-camera-permission-screen" style={styles.container}>
        <H1 style={{ color }}>Camera access required</H1>
        <Body style={{ color, marginTop: 12 }}>Enable camera permissions in system settings.</Body>
      </ThemedView>
    );
  }

  return (
    <ThemedView testID="checkin-screen" style={styles.container}>
      {Platform.OS !== 'web' ? (
        <>
          <PermissionSheet
            visible={controller.showCameraPrimer}
            title="Camera access"
            body="Perched uses your camera so you can tap in with a photo."
            bullets={['We only use photos you choose', 'No background recording']}
            confirmLabel="Enable camera"
            onConfirm={controller.confirmCameraPrimer}
            onCancel={() => controller.setShowCameraPrimer(false)}
          />
          <PermissionSheet
            visible={controller.showLocationPrimer}
            title="Location access"
            body="Location helps confirm your spot and power nearby pins."
            bullets={['We only store your spot when you check in', 'Exact location only for friends']}
            confirmLabel="Enable location"
            onConfirm={controller.confirmLocationPrimer}
            onCancel={() => controller.setShowLocationPrimer(false)}
          />
        </>
      ) : null}
      <Atmosphere />
      <PlaceSearch
        visible={controller.placeModal}
        onClose={() => controller.setPlaceModal(false)}
        onSelect={controller.handlePlaceSelect}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
        style={{ flex: 1 }}
      >
        <View style={styles.scrollContainer}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: stickySpacer }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.topBar, { marginTop: Math.max(0, insets.top - 10) }]}>
              <Pressable
                testID="checkin-close-button"
                onPress={() => router.back()}
                accessibilityLabel="Close"
                style={({ pressed }) => [styles.topBarButton, pressed ? { opacity: 0.75 } : null]}
              >
                <IconSymbol name="xmark" size={18} color={muted} />
              </Pressable>
            </View>

            <Label style={{ color: muted, marginBottom: 8 }}>New check-in</Label>
            <H1 style={{ color }}>Share your spot.</H1>
            {!controller.captured ? (
              <Text style={{ color: muted, marginTop: 4 }}>Your photo is the check-in. Keep it real.</Text>
            ) : null}

            <View style={{ height: 12 }} />

            <View style={styles.stepRow}>
              <View
                style={[
                  styles.stepChip,
                  {
                    borderColor: inputBorder,
                    backgroundColor: controller.captured ? inputBg : primary,
                  },
                ]}
              >
                <Text style={{ color: controller.captured ? text : '#FFFFFF', fontWeight: '700' }}>
                  1 Photo
                </Text>
              </View>
              <View
                style={[
                  styles.stepChip,
                  {
                    borderColor: inputBorder,
                    backgroundColor: controller.spot ? primary : inputBg,
                  },
                ]}
              >
                <Text style={{ color: controller.spot ? '#FFFFFF' : text, fontWeight: '700' }}>
                  2 Spot
                </Text>
              </View>
              <View
                style={[
                  styles.stepChip,
                  {
                    borderColor: inputBorder,
                    backgroundColor: controller.caption.trim().length ? primary : inputBg,
                  },
                ]}
              >
                <Text
                  style={{
                    color: controller.caption.trim().length ? '#FFFFFF' : text,
                    fontWeight: '700',
                  }}
                >
                  3 Share
                </Text>
              </View>
            </View>
            <View style={{ height: 10 }} />

            <CheckinPhotoSection controller={controller} palette={sectionPalette} />

            {controller.captured ? (
              <>
                <CheckinComposerDetailsSection controller={controller} palette={sectionPalette} />
                <CheckinSpotIntelSection controller={controller} palette={sectionPalette} />
                <CheckinLocationStatusSection controller={controller} palette={sectionPalette} />
              </>
            ) : null}
          </ScrollView>

          {controller.captured ? (
            <View
              style={[
                styles.stickyBar,
                {
                  borderColor: inputBorder,
                  backgroundColor: cardBg,
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: stickyBottom,
                },
              ]}
            >
              <Pressable
                testID="checkin-submit-button"
                style={({ pressed }) => [
                  styles.saveButton,
                  { backgroundColor: primary },
                  controller.submitState.disabled ? { opacity: 0.6 } : null,
                  pressed ? { opacity: 0.85 } : null,
                ]}
                onPress={controller.handlePost}
                disabled={controller.submitState.disabled}
                accessibilityRole="button"
                accessibilityLabel={controller.submitState.accessibilityLabel}
              >
                <View style={styles.ctaRow}>
                  {controller.submitState.showPlusIcon ? (
                    <IconSymbol name="plus" size={18} color="#FFFFFF" />
                  ) : null}
                  <Text style={[styles.saveButtonText, { color: '#FFFFFF' }]}>
                    {controller.submitState.label}
                  </Text>
                </View>
              </Pressable>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
      <CelebrationOverlay visible={controller.showCelebration} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    position: 'relative',
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...gapStyle(8),
  },
  saveButton: {
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontWeight: '600',
    fontSize: tokens.type.body.fontSize,
  },
  scrollContainer: {
    flex: 1,
    position: 'relative',
  },
  scrollContent: {
    flexGrow: 1,
  },
  stepChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  stepRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    ...gapStyle(8),
  },
  stickyBar: {
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  topBar: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 6,
  },
  topBarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
