import { useThemeColor } from '@/hooks/use-theme-color';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface Props {
  confidence: number;
  label?: string;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function getConfidenceColor(confidence: number, success: string, danger: string): string {
  if (confidence >= 0.8) return success;
  if (confidence >= 0.5) return '#F59E0B';
  return danger;
}

export function ConfidenceBar({ confidence, label }: Props) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const success = useThemeColor({}, 'success');
  const danger = useThemeColor({}, 'danger');

  const safeConfidence = clampConfidence(confidence);
  const percentage = Math.round(safeConfidence * 100);
  const barColor = getConfidenceColor(safeConfidence, success, danger);

  return (
    <View style={styles.container}>
      {label ? <Text style={[styles.label, { color: muted }]}>{label}</Text> : null}
      <View style={[styles.row, { borderColor: border }]}>
        <View style={[styles.fill, { width: `${percentage}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={[styles.percent, { color: text }]}>{percentage}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
    marginBottom: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  row: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  percent: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
  },
});
