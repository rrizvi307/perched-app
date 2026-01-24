import { useThemeColor } from '@/hooks/use-theme-color';
import { gapStyle } from '@/utils/layout';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  visible: boolean;
  title: string;
  body: string;
  bullets?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
};

export default function PermissionSheet({
  visible,
  title,
  body,
  bullets = [],
  confirmLabel = 'Continue',
  cancelLabel = 'Not now',
  onConfirm,
  onCancel,
}: Props) {
  const card = useThemeColor({}, 'card');
  const border = useThemeColor({}, 'border');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');

  if (!visible || Platform.OS === 'web') return null;

  const content = (
    <View style={styles.backdrop}>
      <View style={[styles.sheet, { backgroundColor: card, borderColor: border }]}>
        <Text style={[styles.title, { color: text }]}>{title}</Text>
        <Text style={[styles.body, { color: muted }]}>{body}</Text>
        {bullets.length ? (
          <View style={{ marginTop: 10 }}>
            {bullets.map((b) => (
              <Text key={b} style={[styles.bullet, { color: muted }]}>• {b}</Text>
            ))}
          </View>
        ) : null}
        <View style={styles.actions}>
          {onCancel ? (
            <Pressable onPress={onCancel} style={[styles.secondary, { borderColor: border }]}>
              <Text style={{ color: text, fontWeight: '600' }}>{cancelLabel}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onConfirm} style={[styles.primary, { backgroundColor: primary }]}>
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  title: { fontSize: 18, fontWeight: '700' },
  body: { marginTop: 8, fontSize: 14, lineHeight: 20 },
  bullet: { marginTop: 6, fontSize: 13 },
  actions: { flexDirection: 'row', marginTop: 16, justifyContent: 'flex-end', ...gapStyle(10) },
  primary: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  secondary: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
});
