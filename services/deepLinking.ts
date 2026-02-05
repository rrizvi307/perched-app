import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { track } from './analytics';
import { captureException } from './sentry';

const APP_SCHEME = 'perched://';
const UNIVERSAL_LINK_PREFIX = 'https://perched.app';

export type DeepLinkRoute =
  | 'profile'
  | 'checkin'
  | 'spot'
  | 'explore'
  | 'feed'
  | 'friend-request';

export interface DeepLinkParams {
  userId?: string;
  checkinId?: string;
  spotId?: string;
  placeId?: string;
  requestId?: string;
  referralCode?: string;
  [key: string]: string | undefined;
}

/**
 * Parse a deep link URL and extract route + params
 */
export function parseDeepLink(url: string): {
  route: DeepLinkRoute | null;
  params: DeepLinkParams;
} | null {
  try {
    const parsed = Linking.parse(url);
    const { hostname, path, queryParams } = parsed;

    // Track deep link opened
    track('deeplink_opened', {
      url,
      hostname: hostname || undefined,
      path: path || undefined,
    });

    // Handle different deep link formats
    // perched://profile/user123
    // https://perched.app/profile/user123
    // https://perched.app/c/checkin123 (short link)

    let route: DeepLinkRoute | null = null;
    const params: DeepLinkParams = { ...queryParams };

    if (hostname === 'profile' || path?.startsWith('/profile')) {
      route = 'profile';
      const userId = path?.split('/profile/')[1] || queryParams?.userId;
      if (userId) params.userId = userId;
    } else if (hostname === 'checkin' || path?.startsWith('/checkin') || path?.startsWith('/c/')) {
      route = 'checkin';
      const checkinId = path?.split('/checkin/')[1] || path?.split('/c/')[1] || queryParams?.checkinId;
      if (checkinId) params.checkinId = checkinId;
    } else if (hostname === 'spot' || path?.startsWith('/spot') || path?.startsWith('/s/')) {
      route = 'spot';
      const spotId = path?.split('/spot/')[1] || path?.split('/s/')[1] || queryParams?.spotId;
      if (spotId) {
        params.spotId = spotId;
        params.placeId = queryParams?.placeId;
      }
    } else if (hostname === 'explore' || path?.startsWith('/explore')) {
      route = 'explore';
    } else if (hostname === 'feed' || path?.startsWith('/feed')) {
      route = 'feed';
    } else if (hostname === 'friend-request' || path?.startsWith('/friend-request') || path?.startsWith('/fr/')) {
      route = 'friend-request';
      const requestId = path?.split('/friend-request/')[1] || path?.split('/fr/')[1] || queryParams?.requestId;
      if (requestId) params.requestId = requestId;
    }

    // Extract referral code if present
    if (queryParams?.ref) {
      params.referralCode = queryParams.ref;
    }

    return { route, params };
  } catch (error) {
    console.error('Failed to parse deep link:', url, error);
    captureException(error as Error, { url });
    return null;
  }
}

/**
 * Handle a deep link by navigating to the appropriate screen
 */
export function handleDeepLink(url: string) {
  try {
    const result = parseDeepLink(url);
    if (!result || !result.route) {
      console.warn('Invalid deep link:', url);
      return false;
    }

    const { route, params } = result;

    // Navigate to the appropriate screen
    switch (route) {
      case 'profile':
        if (params.userId) {
          router.push(`/profile?userId=${params.userId}`);
        }
        break;

      case 'checkin':
        if (params.checkinId) {
          router.push(`/checkin-detail?id=${params.checkinId}`);
        }
        break;

      case 'spot':
        if (params.spotId || params.placeId) {
          const query = params.placeId
            ? `placeId=${params.placeId}`
            : `spotId=${params.spotId}`;
          router.push(`/spot?${query}`);
        }
        break;

      case 'explore':
        router.push('/(tabs)/explore');
        break;

      case 'feed':
        router.push('/(tabs)/feed');
        break;

      case 'friend-request':
        if (params.requestId) {
          router.push(`/(tabs)/feed?friendRequest=${params.requestId}`);
        }
        break;

      default:
        console.warn('Unhandled deep link route:', route);
        return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to handle deep link:', url, error);
    captureException(error as Error, { url });
    return false;
  }
}

/**
 * Initialize deep linking listener
 */
export function initDeepLinking() {
  // Handle initial URL (app opened via link)
  Linking.getInitialURL().then((url) => {
    if (url) {
      handleDeepLink(url);
    }
  });

  // Handle URLs while app is running
  const subscription = Linking.addEventListener('url', (event) => {
    handleDeepLink(event.url);
  });

  return () => {
    subscription.remove();
  };
}

/**
 * Generate a deep link URL for sharing
 */
export function createDeepLink(
  route: DeepLinkRoute,
  params?: DeepLinkParams
): string {
  let path = '';
  const queryParams = new URLSearchParams();

  switch (route) {
    case 'profile':
      path = `/profile/${params?.userId || ''}`;
      break;

    case 'checkin':
      path = `/c/${params?.checkinId || ''}`; // Short link
      break;

    case 'spot':
      path = `/s/${params?.spotId || params?.placeId || ''}`;
      if (params?.placeId) queryParams.set('placeId', params.placeId);
      break;

    case 'explore':
      path = '/explore';
      break;

    case 'feed':
      path = '/feed';
      break;

    case 'friend-request':
      path = `/fr/${params?.requestId || ''}`;
      break;
  }

  // Add referral code if provided
  if (params?.referralCode) {
    queryParams.set('ref', params.referralCode);
  }

  // Build full URL
  const query = queryParams.toString();
  return `${UNIVERSAL_LINK_PREFIX}${path}${query ? `?${query}` : ''}`;
}

/**
 * Generate a shareable text + link for a check-in
 */
export function createShareContent(
  type: 'checkin' | 'profile' | 'spot',
  params: DeepLinkParams,
  customMessage?: string
): { message: string; url: string } {
  let message = customMessage || '';
  let url = '';

  switch (type) {
    case 'checkin':
      message = message || `Check out my spot on Perched!`;
      url = createDeepLink('checkin', params);
      break;

    case 'profile':
      message = message || `Follow me on Perched!`;
      url = createDeepLink('profile', params);
      break;

    case 'spot':
      message = message || `Check out this spot on Perched!`;
      url = createDeepLink('spot', params);
      break;
  }

  return {
    message: `${message} ${url}`,
    url,
  };
}

/**
 * Open a deep link (useful for testing)
 */
export async function openDeepLink(url: string) {
  const supported = await Linking.canOpenURL(url);
  if (supported) {
    await Linking.openURL(url);
  } else {
    console.error('Cannot open URL:', url);
  }
}

export default {
  parseDeepLink,
  handleDeepLink,
  initDeepLinking,
  createDeepLink,
  createShareContent,
  openDeepLink,
};
