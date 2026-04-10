import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { withAlpha } from '@/utils/colors';

const REASONS = [
  { key: 'spam', label: 'Spam or fake' },
  { key: 'harassment', label: 'Harassment or bullying' },
  { key: 'inappropriate', label: 'Inappropriate content' },
  { key: 'misleading', label: 'Misleading information' },
  { key: 'other', label: 'Something else' },
] as const;

export type ReportReason = (typeof REASONS)[number]['key'];

interface ReportSheetProps {
  visible: boolean;
  onSubmit: (reason: ReportReason, description: string) => void;
  onCancel: () => void;
}

export function ReportSheet({ visible, onSubmit, onCancel }: ReportSheetProps) {
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');

  const bg = useThemeColor({}, 'background');
  const card = useThemeColor({}, 'card');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const border = useThemeColor({}, 'border');
  const danger = useThemeColor({}, 'danger');

  function handleSubmit() {
    if (!selectedReason) return;
    onSubmit(selectedReason, description.trim());
    setSelectedReason(null);
    setDescription('');
  }

  function handleCancel() {
    setSelectedReason(null);
    setDescription('');
    onCancel();
  }

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={handleCancel}>
      <View style={[styles.overlay, { backgroundColor: withAlpha(bg, 0.6) }]}>
        <View style={[styles.sheet, { backgroundColor: card, borderColor: border }]}>
          <ScrollView bounces={false}>
            <Text style={[styles.title, { color: text }]}>Report this check-in</Text>
            <Text style={[styles.subtitle, { color: muted }]}>
              Why are you reporting this? Your report is anonymous.
            </Text>

            {REASONS.map((r) => (
              <Pressable
                key={r.key}
                onPress={() => setSelectedReason(r.key)}
                style={[
                  styles.reasonRow,
                  { borderColor: border },
                  selectedReason === r.key && { borderColor: primary, backgroundColor: withAlpha(primary, 0.08) },
                ]}
              >
                <View style={[styles.radio, { borderColor: selectedReason === r.key ? primary : muted }]}>
                  {selectedReason === r.key && <View style={[styles.radioFill, { backgroundColor: primary }]} />}
                </View>
                <Text style={{ color: text, flex: 1 }}>{r.label}</Text>
              </Pressable>
            ))}

            <TextInput
              placeholder="Add details (optional)"
              placeholderTextColor={muted}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={500}
              style={[styles.input, { color: text, borderColor: border }]}
            />

            <View style={styles.actions}>
              <Pressable onPress={handleCancel} style={[styles.button, { borderColor: border }]}>
                <Text style={[styles.buttonText, { color: muted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={!selectedReason}
                style={[
                  styles.button,
                  styles.submitButton,
                  { backgroundColor: selectedReason ? danger : withAlpha(danger, 0.4) },
                ]}
              >
                <Text style={[styles.buttonText, { color: '#fff' }]}>Submit Report</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 16,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioFill: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    minHeight: 60,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  button: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  submitButton: {
    borderWidth: 0,
  },
  buttonText: {
    fontWeight: '700',
    fontSize: 15,
  },
});
