import { useCheckinController } from '@/domains/checkin/useCheckinController';
import { safeImpact } from '@/utils/haptics';
import { withAlpha } from '@/utils/colors';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '@/constants/tokens';

type CheckinController = ReturnType<typeof useCheckinController>;

type CheckinSpotIntelSectionProps = {
  controller: CheckinController;
  palette: {
    inputBorder: string;
    muted: string;
    primary: string;
    success: string;
    text: string;
  };
};

const SCALE_OPTIONS = [1, 2, 3, 4, 5] as const;

export function CheckinSpotIntelSection({
  controller,
  palette,
}: CheckinSpotIntelSectionProps) {
  const {
    busyness,
    metricsSummary,
    noiseLevel,
    outletAvailability,
    overallVibe,
    setBusyness,
    setNoiseLevel,
    setOutletAvailability,
    setOverallVibe,
    setWifiSpeed,
    wifiSpeed,
  } = controller;
  const { inputBorder, muted, primary, success, text } = palette;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={{ color: text, fontWeight: '700', fontSize: 16 }}>Quick pulse (optional)</Text>
        {metricsSummary.completed > 0 ? (
          <View
            style={[
              styles.progressBadge,
              {
                backgroundColor: metricsSummary.isComplete
                  ? withAlpha(success, 0.15)
                  : withAlpha(primary, 0.15),
              },
            ]}
          >
            <Text
              style={{
                color: metricsSummary.isComplete ? success : primary,
                fontSize: 11,
                fontWeight: '700',
              }}
            >
              {metricsSummary.completed}/{metricsSummary.total}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={{ color: muted, marginBottom: 12 }}>{metricsSummary.message}</Text>

      <NumericMetricRow
        label="Noise"
        value={noiseLevel}
        helperText={getScaleHelper(
          noiseLevel,
          ['Silent', 'Quiet', 'Normal', 'Lively', 'Loud'],
          '1 = silent, 5 = loud',
        )}
        onSelect={(level) => {
          void safeImpact();
          setNoiseLevel(noiseLevel === level ? null : level);
        }}
        palette={{ inputBorder, primary, text, muted }}
      />

      <NumericMetricRow
        label="Crowd"
        value={busyness}
        helperText={getScaleHelper(
          busyness,
          ['Empty', 'Light', 'Steady', 'Busy', 'Packed'],
          '1 = empty, 5 = packed',
        )}
        onSelect={(level) => {
          void safeImpact();
          setBusyness(busyness === level ? null : level);
        }}
        palette={{ inputBorder, primary, text, muted }}
      />

      <NumericMetricRow
        label="WiFi"
        value={wifiSpeed}
        helperText={getScaleHelper(
          wifiSpeed,
          ['Bad', 'Slow', 'Fine', 'Fast', 'Great'],
          '1 = unusable, 5 = fast',
        )}
        onSelect={(level) => {
          void safeImpact();
          setWifiSpeed(wifiSpeed === level ? null : level);
        }}
        palette={{ inputBorder, primary, text, muted }}
      />

      <NumericMetricRow
        label="Outlets"
        value={typeof outletAvailability === 'number' ? outletAvailability : null}
        helperText={getScaleHelper(
          typeof outletAvailability === 'number' ? outletAvailability : null,
          ['None', 'Rare', 'Some', 'Easy', 'Everywhere'],
          '1 = none, 5 = everywhere',
        )}
        onSelect={(level) => {
          void safeImpact();
          setOutletAvailability(outletAvailability === level ? null : level);
        }}
        palette={{ inputBorder, primary, text, muted }}
      />

      <NumericMetricRow
        label="Overall vibe"
        value={overallVibe}
        helperText={getScaleHelper(
          overallVibe,
          ['Skip', 'Weak', 'Solid', 'Great', 'Top tier'],
          '1 = skip it, 5 = definitely come',
        )}
        onSelect={(level) => {
          void safeImpact();
          setOverallVibe(overallVibe === level ? null : level);
        }}
        palette={{ inputBorder, primary, text, muted }}
      />
    </View>
  );
}

type MetricPalette = {
  inputBorder: string;
  muted: string;
  primary: string;
  text: string;
};

type NumericMetricRowProps = {
  helperText: string;
  label: string;
  onSelect: (key: 1 | 2 | 3 | 4 | 5) => void;
  palette: MetricPalette;
  value: 1 | 2 | 3 | 4 | 5 | null | undefined;
};

function getScaleHelper(
  value: 1 | 2 | 3 | 4 | 5 | null | undefined,
  labels: [string, string, string, string, string],
  fallback: string,
) {
  if (!value) return fallback;
  return `${value} = ${labels[value - 1]}`;
}

function NumericMetricRow({
  helperText,
  label,
  onSelect,
  palette,
  value,
}: NumericMetricRowProps) {
  const { inputBorder, muted, primary, text } = palette;
  return (
    <View style={styles.row}>
      <Text style={{ color: muted, fontWeight: '600', marginBottom: 8 }}>{label}</Text>
      <View style={styles.metricRow}>
        {SCALE_OPTIONS.map((option) => (
          <Pressable
            key={`${label}-${option}`}
            onPress={() => onSelect(option)}
            style={[
              styles.metricChip,
              {
                borderColor: inputBorder,
                backgroundColor: value === option ? primary : 'transparent',
              },
            ]}
          >
            <Text
              style={{
                color: value === option ? '#FFFFFF' : text,
                fontWeight: '700',
                textAlign: 'center',
              }}
            >
              {option}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ color: muted, fontSize: 12, marginTop: 4 }}>{helperText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metricChip: {
    paddingHorizontal: tokens.space.s12,
    paddingVertical: tokens.space.s10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 8,
  },
  progressBadge: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  row: {
    marginBottom: 16,
  },
  section: {
    marginTop: 16,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
});
