import { createContext, useContext, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/use-theme-color';

type ToastTone = 'info' | 'success' | 'warning' | 'error';
type Toast = { id: string; message: string; tone: ToastTone };
type ToastContextValue = { showToast: (message: string, tone?: ToastTone) => void };

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastToastByKey = useRef<Record<string, number>>({});
  const MAX_TOASTS = 1;

  const showToast = (message: string, tone: ToastTone = 'info') => {
    // suppress toasts during demo mode to keep recordings clean
    try {
      const isDemo = (typeof window !== 'undefined' && (window as any).__PERCHED_DEMO) || (global as any).__PERCHED_DEMO;
      if (isDemo) return;
    } catch {}
    const trimmed = String(message || '').trim();
    if (!trimmed) return;
    const now = Date.now();
    const dedupeKey = `${tone}:${trimmed}`;
    const last = lastToastByKey.current[dedupeKey] || 0;
    if (now - last < 6000) return;
    lastToastByKey.current[dedupeKey] = now;
    const id = `toast-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, message: trimmed, tone }].slice(-MAX_TOASTS));
    timers.current[id] = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      delete timers.current[id];
    }, 3200);
  };

  const value = useMemo(() => ({ showToast }), []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

function ToastViewport({ toasts }: { toasts: Toast[] }) {
  const insets = useSafeAreaInsets();
  const border = useThemeColor({}, 'border');
  const text = useThemeColor({}, 'text');
  const bg = useThemeColor({}, 'card');
  return (
    <View pointerEvents="none" style={[styles.viewport, { top: Math.max(insets.top + 4, 12) }]}>
      {toasts.map((t) => (
        <View key={t.id} style={[styles.toast, { borderColor: border, backgroundColor: bg }]}>
          <Text style={[styles.toastText, { color: text }]}>{t.message}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  toast: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    maxWidth: 360,
    width: '92%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 6,
  },
  toastText: { fontWeight: '600', textAlign: 'center' },
});
