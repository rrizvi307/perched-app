import { useThemeColor } from '@/hooks/use-theme-color';
import { StyleSheet, Text, View } from 'react-native';

type Tone = 'info' | 'warning' | 'error' | 'success';

function withAlpha(hex: string, alpha: number) {
  if (!hex || !hex.startsWith('#')) return `rgba(0,0,0,${alpha})`;
  const full = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  if (full.length !== 7) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(full.slice(1, 3), 16);
  const g = parseInt(full.slice(3, 5), 16);
  const b = parseInt(full.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function StatusBanner({
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
}

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
