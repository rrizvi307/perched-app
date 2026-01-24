import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Body, H1 } from '@/components/ui/typography';
import { useThemeColor } from '@/hooks/use-theme-color';

export default function ModalScreen() {
  const linkColor = useThemeColor({}, 'accent');
  const textColor = useThemeColor({}, 'text');
  return (
    <ThemedView style={styles.container}>
      <H1 style={{ color: textColor }}>This is a modal</H1>
      <Link href="/" dismissTo style={styles.link}>
        <Body style={{ color: linkColor, marginBottom: 0 }}>Go to home screen</Body>
      </Link>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
});
