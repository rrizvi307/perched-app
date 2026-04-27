import Logo from '@/components/logo';
import { ThemedView } from '@/components/themed-view';
import { tokens } from '@/constants/tokens';
import { useThemeColor } from '@/hooks/use-theme-color';
import { StyleSheet, Text, View } from 'react-native';

export function AppLaunchScreen() {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
        <Logo size={68} variant="lockup" />
        <Text style={[styles.title, { color: text }]}>Loading your workspace…</Text>
        <Text style={[styles.subtitle, { color: muted }]}>
          Restoring your session and preparing the first screen.
        </Text>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space.s24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: tokens.radius.r20,
    paddingHorizontal: tokens.space.s24,
    paddingVertical: tokens.space.s28,
    alignItems: 'center',
  },
  title: {
    marginTop: tokens.space.s16,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: tokens.space.s8,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});

export default AppLaunchScreen;
