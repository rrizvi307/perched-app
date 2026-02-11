/**
 * Internationalization Service
 *
 * Handles multi-language support and localization
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

export type SupportedLocale =
  | 'en-US' // English (United States)
  | 'en-GB' // English (United Kingdom)
  | 'es-ES' // Spanish (Spain)
  | 'es-MX' // Spanish (Mexico)
  | 'fr-FR' // French (France)
  | 'de-DE' // German (Germany)
  | 'pt-BR' // Portuguese (Brazil)
  | 'ja-JP' // Japanese (Japan)
  | 'ko-KR' // Korean (South Korea)
  | 'zh-CN' // Chinese (Simplified)
  | 'zh-TW'; // Chinese (Traditional)

export type TranslationKey = string;

interface LocaleConfig {
  code: SupportedLocale;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  dateFormat: string;
  currency: string;
  numberFormat: {
    decimal: string;
    thousands: string;
  };
}

const LOCALE_CONFIG: Record<SupportedLocale, LocaleConfig> = {
  'en-US': {
    code: 'en-US',
    name: 'English (US)',
    nativeName: 'English',
    direction: 'ltr',
    dateFormat: 'MM/DD/YYYY',
    currency: 'USD',
    numberFormat: { decimal: '.', thousands: ',' },
  },
  'en-GB': {
    code: 'en-GB',
    name: 'English (UK)',
    nativeName: 'English',
    direction: 'ltr',
    dateFormat: 'DD/MM/YYYY',
    currency: 'GBP',
    numberFormat: { decimal: '.', thousands: ',' },
  },
  'es-ES': {
    code: 'es-ES',
    name: 'Spanish (Spain)',
    nativeName: 'Español',
    direction: 'ltr',
    dateFormat: 'DD/MM/YYYY',
    currency: 'EUR',
    numberFormat: { decimal: ',', thousands: '.' },
  },
  'es-MX': {
    code: 'es-MX',
    name: 'Spanish (Mexico)',
    nativeName: 'Español',
    direction: 'ltr',
    dateFormat: 'DD/MM/YYYY',
    currency: 'MXN',
    numberFormat: { decimal: '.', thousands: ',' },
  },
  'fr-FR': {
    code: 'fr-FR',
    name: 'French',
    nativeName: 'Français',
    direction: 'ltr',
    dateFormat: 'DD/MM/YYYY',
    currency: 'EUR',
    numberFormat: { decimal: ',', thousands: ' ' },
  },
  'de-DE': {
    code: 'de-DE',
    name: 'German',
    nativeName: 'Deutsch',
    direction: 'ltr',
    dateFormat: 'DD.MM.YYYY',
    currency: 'EUR',
    numberFormat: { decimal: ',', thousands: '.' },
  },
  'pt-BR': {
    code: 'pt-BR',
    name: 'Portuguese (Brazil)',
    nativeName: 'Português',
    direction: 'ltr',
    dateFormat: 'DD/MM/YYYY',
    currency: 'BRL',
    numberFormat: { decimal: ',', thousands: '.' },
  },
  'ja-JP': {
    code: 'ja-JP',
    name: 'Japanese',
    nativeName: '日本語',
    direction: 'ltr',
    dateFormat: 'YYYY/MM/DD',
    currency: 'JPY',
    numberFormat: { decimal: '.', thousands: ',' },
  },
  'ko-KR': {
    code: 'ko-KR',
    name: 'Korean',
    nativeName: '한국어',
    direction: 'ltr',
    dateFormat: 'YYYY.MM.DD',
    currency: 'KRW',
    numberFormat: { decimal: '.', thousands: ',' },
  },
  'zh-CN': {
    code: 'zh-CN',
    name: 'Chinese (Simplified)',
    nativeName: '简体中文',
    direction: 'ltr',
    dateFormat: 'YYYY-MM-DD',
    currency: 'CNY',
    numberFormat: { decimal: '.', thousands: ',' },
  },
  'zh-TW': {
    code: 'zh-TW',
    name: 'Chinese (Traditional)',
    nativeName: '繁體中文',
    direction: 'ltr',
    dateFormat: 'YYYY-MM-DD',
    currency: 'TWD',
    numberFormat: { decimal: '.', thousands: ',' },
  },
};

// Sample translations (in production, load from JSON files)
const EN_US_TRANSLATIONS = {
  'app.name': 'Perched',
  'common.loading': 'Loading...',
  'common.error': 'Error',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'explore.title': 'Explore',
  'explore.search_placeholder': 'Search for spots...',
  'checkin.add_caption': 'Add a caption...',
  'checkin.rate_wifi': 'Rate WiFi',
  'checkin.rate_noise': 'Rate noise level',
  'profile.title': 'Profile',
  'settings.language': 'Language',
};

const ES_ES_TRANSLATIONS = {
  'app.name': 'Perched',
  'common.loading': 'Cargando...',
  'common.error': 'Error',
  'common.save': 'Guardar',
  'common.cancel': 'Cancelar',
  'common.delete': 'Eliminar',
  'common.edit': 'Editar',
  'explore.title': 'Explorar',
  'explore.search_placeholder': 'Buscar lugares...',
  'checkin.add_caption': 'Añadir una descripción...',
  'checkin.rate_wifi': 'Calificar WiFi',
  'checkin.rate_noise': 'Calificar nivel de ruido',
  'profile.title': 'Perfil',
  'settings.language': 'Idioma',
};

const FR_FR_TRANSLATIONS = {
  'app.name': 'Perched',
  'common.loading': 'Chargement...',
  'common.error': 'Erreur',
  'common.save': 'Enregistrer',
  'common.cancel': 'Annuler',
  'common.delete': 'Supprimer',
  'common.edit': 'Modifier',
  'explore.title': 'Explorer',
  'explore.search_placeholder': 'Rechercher des lieux...',
  'checkin.add_caption': 'Ajouter une légende...',
  'checkin.rate_wifi': 'Évaluer le WiFi',
  'checkin.rate_noise': 'Évaluer le niveau de bruit',
  'profile.title': 'Profil',
  'settings.language': 'Langue',
};

const TRANSLATIONS: Record<SupportedLocale, Record<string, string>> = {
  'en-US': EN_US_TRANSLATIONS,
  'en-GB': EN_US_TRANSLATIONS, // Use en-US as fallback
  'es-ES': ES_ES_TRANSLATIONS,
  'es-MX': ES_ES_TRANSLATIONS, // Use es-ES as fallback
  'fr-FR': FR_FR_TRANSLATIONS,
  'de-DE': EN_US_TRANSLATIONS, // Use en-US as fallback for now
  'pt-BR': EN_US_TRANSLATIONS,
  'ja-JP': EN_US_TRANSLATIONS,
  'ko-KR': EN_US_TRANSLATIONS,
  'zh-CN': EN_US_TRANSLATIONS,
  'zh-TW': EN_US_TRANSLATIONS,
};

const LOCALE_STORAGE_KEY = '@perched_locale';
let currentLocale: SupportedLocale = 'en-US';

/**
 * Initialize internationalization
 */
export async function initI18n(): Promise<SupportedLocale> {
  try {
    // Try to load saved locale
    const saved = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);

    if (saved && isSupportedLocale(saved)) {
      currentLocale = saved as SupportedLocale;
    } else {
      // Auto-detect from device
      const deviceLocales = Localization.getLocales();
      const detected = detectSupportedLocale(deviceLocales.map((l: any) => l.languageTag));

      if (detected) {
        currentLocale = detected;
        await setLocale(detected);
      }
    }

    return currentLocale;
  } catch (error) {
    console.error('Failed to init i18n:', error);
    return 'en-US';
  }
}

/**
 * Get current locale
 */
export function getCurrentLocale(): SupportedLocale {
  return currentLocale;
}

/**
 * Set locale
 */
export async function setLocale(locale: SupportedLocale): Promise<void> {
  if (!isSupportedLocale(locale)) {
    throw new Error(`Unsupported locale: ${locale}`);
  }

  currentLocale = locale;
  await AsyncStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

/**
 * Translate a key
 */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const translations = TRANSLATIONS[currentLocale];
  let text = translations[key] || key;

  // Replace parameters
  if (params) {
    Object.entries(params).forEach(([param, value]: [string, string | number]) => {
      text = text.replace(`{{${param}}}`, String(value));
    });
  }

  return text;
}

/**
 * Translate with pluralization
 */
export function tn(
  key: TranslationKey,
  count: number,
  params?: Record<string, string | number>
): string {
  const pluralKey = count === 1 ? `${key}.singular` : `${key}.plural`;
  const mergedParams = { ...params, count };
  return t(pluralKey, mergedParams);
}

/**
 * Get locale config
 */
export function getLocaleConfig(locale?: SupportedLocale): LocaleConfig {
  return LOCALE_CONFIG[locale || currentLocale];
}

/**
 * Get all supported locales
 */
export function getSupportedLocales(): LocaleConfig[] {
  return Object.values(LOCALE_CONFIG);
}

/**
 * Format date according to locale
 */
export function formatDate(date: Date | number, locale?: SupportedLocale): string {
  const targetLocale = locale || currentLocale;
  const dateObj = typeof date === 'number' ? new Date(date) : date;

  return new Intl.DateTimeFormat(targetLocale).format(dateObj);
}

/**
 * Format number according to locale
 */
export function formatNumber(
  num: number,
  options?: { decimals?: number; currency?: boolean; locale?: SupportedLocale }
): string {
  const targetLocale = options?.locale || currentLocale;
  const config = LOCALE_CONFIG[targetLocale];

  if (options?.currency) {
    return new Intl.NumberFormat(targetLocale, {
      style: 'currency',
      currency: config.currency,
      minimumFractionDigits: options?.decimals ?? 2,
      maximumFractionDigits: options?.decimals ?? 2,
    }).format(num);
  }

  return new Intl.NumberFormat(targetLocale, {
    minimumFractionDigits: options?.decimals,
    maximumFractionDigits: options?.decimals,
  }).format(num);
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(timestamp: number, locale?: SupportedLocale): string {
  const targetLocale = locale || currentLocale;
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  const rtf = new Intl.RelativeTimeFormat(targetLocale, { numeric: 'auto' });

  if (years > 0) return rtf.format(-years, 'year');
  if (months > 0) return rtf.format(-months, 'month');
  if (weeks > 0) return rtf.format(-weeks, 'week');
  if (days > 0) return rtf.format(-days, 'day');
  if (hours > 0) return rtf.format(-hours, 'hour');
  if (minutes > 0) return rtf.format(-minutes, 'minute');
  return rtf.format(-seconds, 'second');
}

/**
 * Get region-specific spot types
 */
export function getLocalizedSpotTypes(locale?: SupportedLocale): string[] {
  const targetLocale = locale || currentLocale;

  // Region-specific spot types
  const spotTypesByLocale: Record<string, string[]> = {
    'en-US': ['Coffee Shop', 'Coworking Space', 'Library', 'Cafe', 'Restaurant'],
    'en-GB': ['Coffee Shop', 'Cafe', 'Coworking Space', 'Library', 'Pub'],
    'ja-JP': ['Cafe', 'Coworking Space', 'Manga Cafe', 'Library', 'Tea House'],
    'ko-KR': ['Cafe', 'Study Cafe', 'Coworking Space', 'Library', 'PC Bang'],
    'zh-CN': ['Cafe', 'Tea House', 'Coworking Space', 'Library', 'Study Room'],
  };

  return spotTypesByLocale[targetLocale] || spotTypesByLocale['en-US'];
}

/**
 * Detect supported locale from device locale list
 */
function detectSupportedLocale(locales: string[]): SupportedLocale | null {
  for (const locale of locales) {
    // Exact match
    if (isSupportedLocale(locale)) {
      return locale as SupportedLocale;
    }

    // Language match (e.g., "en" matches "en-US")
    const lang = locale.split('-')[0];
    const match = Object.keys(LOCALE_CONFIG).find(
      (supported) => supported.startsWith(lang)
    );

    if (match) {
      return match as SupportedLocale;
    }
  }

  return null;
}

/**
 * Check if locale is supported
 */
function isSupportedLocale(locale: string): boolean {
  return locale in LOCALE_CONFIG;
}

/**
 * Load translations dynamically (for production)
 */
export async function loadTranslations(locale: SupportedLocale): Promise<void> {
  // In production, load from JSON files or API
  // For now, translations are hardcoded above
  try {
    // Example: const translations = await import(`./i18n/${locale}.json`);
    // TRANSLATIONS[locale] = translations;
  } catch (error) {
    console.error('Failed to load translations:', error);
  }
}

export default {
  init: initI18n,
  getCurrentLocale,
  setLocale,
  t,
  tn,
  getLocaleConfig,
  getSupportedLocales,
  formatDate,
  formatNumber,
  formatRelativeTime,
  getLocalizedSpotTypes,
  loadTranslations,
};
