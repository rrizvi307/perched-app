import { useThemePreference } from '@/contexts/ThemePreferenceContext';
import { useColorScheme as useRNColorScheme } from 'react-native';

export function useColorScheme() {
	const { preference } = useThemePreference();
	const systemScheme = useRNColorScheme() ?? 'light';
	if (preference === 'light') return 'light';
	if (preference === 'dark') return 'dark';
	return systemScheme;
}
