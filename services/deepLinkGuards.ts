export function isExpoDevClientLink(url: string) {
  if (!url) return false;
  return (
    url.startsWith('exp://') ||
    url.includes('expo-development-client') ||
    url.includes('expo-go')
  );
}
