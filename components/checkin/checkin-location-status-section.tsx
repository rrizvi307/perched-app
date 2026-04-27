import SpotImage from '@/components/ui/spot-image';
import StatusBanner from '@/components/ui/status-banner';
import { Body } from '@/components/ui/typography';
import { useCheckinController } from '@/domains/checkin/useCheckinController';
import { gapStyle } from '@/utils/layout';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type CheckinController = ReturnType<typeof useCheckinController>;

type CheckinLocationStatusSectionProps = {
  controller: CheckinController;
  palette: {
    inputBg: string;
    inputBorder: string;
    muted: string;
    primary: string;
    text: string;
  };
};

export function CheckinLocationStatusSection({
  controller,
  palette,
}: CheckinLocationStatusSectionProps) {
  const {
    buildStaticMapUrl,
    clearSpot,
    detectedCandidates,
    detectedPlace,
    detectionError,
    detectionLabel,
    detecting,
    displayPlace,
    mapPreviewUrl,
    pendingRemote,
    placeInfo,
    postStatus,
    retryRemotePost,
    selectDetectedCandidate,
    selectDetectedPlace,
    setVisibility,
    spot,
    visibility,
    visibilityNote,
  } = controller;
  const { inputBg, inputBorder, muted, primary, text } = palette;

  return (
    <>
      <View style={{ height: 8 }} />
      {spot ? (
        <Pressable
          onPress={clearSpot}
          accessibilityRole="button"
          accessibilityLabel="Clear selected spot"
          style={{ marginBottom: 8, alignSelf: 'flex-start' }}
        >
          <Body style={{ color: muted }}>Clear spot</Body>
        </Pressable>
      ) : null}

      {detectedPlace && (!placeInfo || placeInfo?.placeId === detectedPlace?.placeId) ? (
        <View style={[styles.detectedRow, { borderColor: inputBorder, backgroundColor: inputBg }]}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={{ color: text, fontWeight: '600' }}>Detected: {detectedPlace.name}</Text>
            {detectionLabel ? <Text style={{ color: muted, marginTop: 4 }}>{detectionLabel}</Text> : null}
          </View>
          <Pressable
            onPress={selectDetectedPlace}
            disabled={placeInfo?.placeId === detectedPlace?.placeId}
            accessibilityRole="button"
            accessibilityLabel={
              placeInfo?.placeId === detectedPlace?.placeId
                ? `Selected detected spot ${detectedPlace.name}`
                : `Use detected spot ${detectedPlace.name}`
            }
            style={[
              styles.detectedChip,
              {
                backgroundColor: placeInfo?.placeId === detectedPlace?.placeId
                  ? inputBorder
                  : primary,
              },
            ]}
          >
            <Text style={{ color: placeInfo?.placeId === detectedPlace?.placeId ? text : '#FFFFFF', fontWeight: '700' }}>
              {placeInfo?.placeId === detectedPlace?.placeId ? 'Selected' : 'Use'}
            </Text>
          </Pressable>
        </View>
      ) : detecting ? (
        <Text style={{ color: muted }}>Detecting location...</Text>
      ) : detectionError ? (
        <Text style={{ color: muted }}>{detectionError}</Text>
      ) : null}

      {detectedCandidates.length > 0 && !placeInfo ? (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: muted, marginBottom: 6 }}>Suggestions</Text>
          {detectedCandidates.map((candidate) => {
            const thumb = candidate.location ? buildStaticMapUrl(candidate.location) : null;
            return (
              <Pressable
                key={`cand-${candidate.placeId}`}
                onPress={() => selectDetectedCandidate(candidate)}
                accessibilityRole="button"
                accessibilityLabel={`Use suggested spot ${candidate.name}`}
                style={[styles.suggestionRow, { borderColor: inputBorder, backgroundColor: inputBg }]}
              >
                {thumb ? <SpotImage source={{ uri: thumb }} style={styles.suggestionThumb} /> : null}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: text, fontWeight: '600' }}>{candidate.name}</Text>
                  {typeof candidate.distanceKm === 'number' ? (
                    <Text style={{ color: muted }}>
                      Why this? Closest match {`· ${Math.round(candidate.distanceKm * 1000)}m`}
                    </Text>
                  ) : (
                    <Text style={{ color: muted }}>Why this? Nearby place</Text>
                  )}
                </View>
                <Text style={{ color: primary, fontWeight: '700' }}>Use</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {mapPreviewUrl ? (
        <SpotImage source={{ uri: mapPreviewUrl }} style={styles.mapPreview} />
      ) : displayPlace?.location ? (
        <View style={[styles.mapPlaceholder, { borderColor: inputBorder }]}>
          <Body style={{ color: muted, marginBottom: 0 }}>Location pinned</Body>
        </View>
      ) : null}

      <View style={{ height: 8 }} />
      <View style={[styles.visibilityRow, gapStyle(10)]}>
        <VisibilityChip
          active={visibility === 'public'}
          label="Public"
          onPress={() => setVisibility('public')}
          palette={{ inputBorder, primary, text }}
          accessibilityLabel="Set visibility to public"
        />
        <VisibilityChip
          active={visibility === 'friends'}
          label="Friends"
          onPress={() => setVisibility('friends')}
          palette={{ inputBorder, primary, text }}
          accessibilityLabel="Set visibility to friends"
        />
        <VisibilityChip
          active={visibility === 'close'}
          label="Close"
          onPress={() => setVisibility('close')}
          palette={{ inputBorder, primary, text }}
          accessibilityLabel="Set visibility to close friends"
        />
      </View>
      <Text style={{ color: muted, marginTop: 6 }}>{visibilityNote}</Text>

      <View style={{ height: 12 }} />
      {postStatus ? (
        <StatusBanner
          message={postStatus.message}
          tone={postStatus.tone}
          actionLabel={pendingRemote ? 'Retry' : undefined}
          onAction={pendingRemote ? retryRemotePost : undefined}
        />
      ) : null}
      <View style={{ height: 8 }} />
    </>
  );
}

type VisibilityChipProps = {
  accessibilityLabel: string;
  active: boolean;
  label: string;
  onPress: () => void;
  palette: {
    inputBorder: string;
    primary: string;
    text: string;
  };
};

function VisibilityChip({
  accessibilityLabel,
  active,
  label,
  onPress,
  palette,
}: VisibilityChipProps) {
  const { inputBorder, primary, text } = palette;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.visibilityChip,
        {
          borderColor: inputBorder,
          backgroundColor: active ? primary : 'transparent',
        },
      ]}
    >
      <Body style={[styles.visibilityText, { color: active ? '#FFFFFF' : text }]}>{label}</Body>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  detectedChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  detectedRow: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mapPlaceholder: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    alignItems: 'center',
  },
  mapPreview: {
    width: '100%',
    height: 160,
    borderRadius: 16,
    marginBottom: 10,
  },
  suggestionRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...gapStyle(10),
  },
  suggestionThumb: {
    width: 70,
    height: 70,
    borderRadius: 10,
  },
  visibilityChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  visibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  visibilityText: {
    marginBottom: 0,
    fontWeight: '600',
  },
});
