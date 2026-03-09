import { useThemeColor } from '@/hooks/use-theme-color';
import { withAlpha } from '@/utils/colors';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Tone = 'info' | 'warning' | 'error' | 'success';

const StatusBanner = memo(function StatusBanner({
  message,
  tone = 'info',
  actionLabel,
  onAction,
}: {
  message: string;
  tone?: Tone;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const border = useThemeColor({}, 'border');
  const text = useThemeColor({}, 'text');
  const primary = useThemeColor({}, 'primary');
  const accent = useThemeColor({}, 'accent');
  const danger = useThemeColor({}, 'danger');
  const success = useThemeColor({}, 'success');

  const base = tone === 'info'
    ? primary
    : tone === 'warning'
      ? accent
      : tone === 'error'
        ? danger
        : success;
  const bg = withAlpha(base, 0.12);
  const outline = withAlpha(base, 0.28);

  return (
    <View style={[styles.container, { backgroundColor: bg, borderColor: outline || border }]}>
      <Text style={[styles.text, { color: base || text }]}>{message}</Text>
      {actionLabel && onAction ? (
        <View style={styles.actionRow}>
          <Text onPress={onAction} style={[styles.actionText, { color: base || text }]}>
            {actionLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

export default StatusBanner;

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  text: { fontWeight: '600' },
  actionRow: { marginTop: 6 },
  actionText: { fontWeight: '700' },
});
