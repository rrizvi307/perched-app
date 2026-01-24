import { tokens } from '@/constants/tokens';
import { useThemeColor } from '@/hooks/use-theme-color';
import { withAlpha } from '@/utils/colors';
import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

type SegmentOption = {
  key: string;
  label: string;
  disabled?: boolean;
};

type SegmentedControlProps = {
  value: string;
  options: SegmentOption[];
  onChange: (next: string) => void;
  activeColor?: string;
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
};

export default function SegmentedControl({
  value,
  options,
  onChange,
  activeColor,
  maxWidth,
  style,
}: SegmentedControlProps) {
  const border = useThemeColor({}, 'border');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const highlight = withAlpha(primary, 0.12);
  const active = activeColor || primary;

  return (
    <View style={[styles.segment, { borderColor: border, backgroundColor: withAlpha(border, 0.25), maxWidth }, style]}>
      {options.map((option) => {
        const isActive = value === option.key;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            disabled={option.disabled}
            style={({ pressed }) => [
              styles.segmentItem,
              { backgroundColor: isActive ? active : pressed ? highlight : 'transparent' },
              option.disabled ? { opacity: 0.5 } : null,
            ]}
          >
            <Text style={{ color: isActive ? '#FFFFFF' : muted, fontWeight: '600' }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 999,
    overflow: 'hidden',
    alignSelf: 'center',
    width: '100%',
    padding: 2,
  },
  segmentItem: {
    flex: 1,
    paddingHorizontal: tokens.space.s12,
    paddingVertical: tokens.space.s8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
});
