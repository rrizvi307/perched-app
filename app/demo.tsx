import { ThemedView } from '@/components/themed-view';
import { DemoControlPanel } from '@/components/demo-control-panel';
import { useRouter } from 'expo-router';

/**
 * Demo Control Screen
 * Access via: /demo route or triple-tap settings icon
 */
export default function DemoScreen() {
  const router = useRouter();

  return (
    <ThemedView style={{ flex: 1 }}>
      <DemoControlPanel onClose={() => router.back()} />
    </ThemedView>
  );
}
