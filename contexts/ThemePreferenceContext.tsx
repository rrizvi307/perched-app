import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

type Ctx = {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  ready: boolean;
};

const STORAGE_KEY = 'spot_theme_preference_v1';

const ThemePrefContext = createContext<Ctx | undefined>(undefined);

async function readNativeStorage(key: string): Promise<string | null> {
  try {
    // try to use AsyncStorage if available (native)
    // defer require to avoid breakage on web
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const val = await AsyncStorage.getItem(key);
    return val;
  } catch {
    return null;
  }
}

async function writeNativeStorage(key: string, value: string): Promise<void> {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await AsyncStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      let stored: string | null = null;
      if (typeof window !== 'undefined' && window.localStorage) {
        stored = window.localStorage.getItem(STORAGE_KEY);
      }

      if (stored == null) {
        // try native storage
        stored = await readNativeStorage(STORAGE_KEY);
      }

      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setPreferenceState(stored);
      }

      setReady(true);
    })();
  }, []);

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p);
    // persist
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, p);
      }
    } catch {}
    // try native
    void writeNativeStorage(STORAGE_KEY, p);
  };

  const value = useMemo(() => ({ preference, setPreference, ready }), [preference, ready]);
  return <ThemePrefContext.Provider value={value}>{children}</ThemePrefContext.Provider>;
}

export function useThemePreference() {
  const ctx = useContext(ThemePrefContext);
  if (!ctx) throw new Error('useThemePreference must be used within ThemePreferenceProvider');
  return ctx;
}
