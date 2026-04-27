import { useCheckinController } from '@/domains/checkin/useCheckinController';
import { withAlpha } from '@/utils/colors';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { tokens } from '@/constants/tokens';

const TAG_OPTIONS = [
  'Good Coffee',
  'Good for Work',
  'Social',
  'Cozy',
  'Spacious',
  'Food',
  'Outdoor',
  'Open Late',
] as const;
const MAX_TAGS = 3;

type CheckinController = ReturnType<typeof useCheckinController>;

type CheckinComposerDetailsSectionProps = {
  controller: CheckinController;
  palette: {
    inputBg: string;
    inputBorder: string;
    muted: string;
    primary: string;
    text: string;
  };
};

export function CheckinComposerDetailsSection({
  controller,
  palette,
}: CheckinComposerDetailsSectionProps) {
  const {
    caption,
    selectedTags,
    setCaption,
    setPlaceModal,
    spot,
    toggleTag,
  } = controller;
  const { inputBg, inputBorder, muted, primary, text } = palette;

  return (
    <>
      <Pressable
        onPress={() => setPlaceModal(true)}
        testID="checkin-spot-selector"
        accessibilityRole="button"
        accessibilityLabel={spot ? `Change selected spot from ${spot}` : 'Select a spot'}
        style={[styles.input, styles.selectInput, { borderColor: inputBorder, backgroundColor: inputBg }]}
      >
        <Text style={{ color: spot ? text : muted, fontWeight: spot ? '600' : '400' }}>
          {spot || 'Spot name'}
        </Text>
        <Text style={{ color: primary, fontWeight: '600' }}>{spot ? 'Change' : 'Lookup'}</Text>
      </Pressable>
      {!spot ? (
        <Text style={{ color: muted, marginBottom: 6 }}>Choose the coffee shop before posting.</Text>
      ) : (
        <Text style={{ color: muted, marginBottom: 6 }}>
          Add a short note or a few quick tags so people know why this place matters right now.
        </Text>
      )}
      <TextInput
        testID="checkin-caption-input"
        placeholder="Short note (optional)"
        placeholderTextColor={muted}
        value={caption}
        onChangeText={setCaption}
        accessibilityLabel="Check-in caption"
        style={[styles.input, { borderColor: inputBorder, backgroundColor: inputBg, color: text }]}
        maxLength={140}
      />
      <Text style={{ color: muted, marginBottom: 8 }}>{caption.length}/140</Text>

      <Text style={{ color: muted, fontWeight: '600', marginBottom: 6 }}>Quick tags</Text>
      <View style={styles.tagRow}>
        {TAG_OPTIONS.map((tag) => {
          const active = selectedTags.includes(tag);
          return (
            <Pressable
              key={tag}
              onPress={() => toggleTag(tag)}
              accessibilityRole="button"
              accessibilityLabel={`${active ? 'Remove' : 'Add'} tag ${tag}`}
              style={({ pressed }) => [
                styles.tagChip,
                {
                  borderColor: inputBorder,
                  backgroundColor: active ? primary : pressed ? withAlpha(primary, 0.12) : 'transparent',
                },
              ]}
            >
              <Text style={{ color: active ? '#FFFFFF' : text, fontWeight: '600' }}>{tag}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: muted, marginBottom: 8 }}>
        Pick up to {MAX_TAGS} tags that best explain the current utility and vibe.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    padding: 12,
    borderRadius: 14,
    marginBottom: 12,
    fontSize: tokens.type.body.fontSize,
  },
  selectInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tagChip: {
    paddingHorizontal: tokens.space.s12,
    paddingVertical: tokens.space.s8,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: tokens.space.s8,
    marginBottom: tokens.space.s8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
});
