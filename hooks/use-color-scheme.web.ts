import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);
  // Read persisted preference directly from localStorage on web to avoid
  // calling React hooks (useThemePreference) during static rendering or
  // before the ThemePreferenceProvider is mounted.
  type ThemePref = 'system' | 'light' | 'dark';
  const initialPref = (() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const v = window.localStorage.getItem('spot_theme_preference_v1');
        if (v === 'light' || v === 'dark' || v === 'system') return v as ThemePref;
      }
    } catch {
      // ignore
    }
    return 'system' as ThemePref;
  })();

  const [preference] = useState<ThemePref>(initialPref);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const colorScheme = useRNColorScheme();

  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}
