import { ensureFirebase } from '@/services/firebaseClient';
import { Image as ExpoImage } from 'expo-image';
import React, { useEffect, useMemo, useState } from 'react';
import { Image as RNImage, Platform, StyleSheet } from 'react-native';

type ExpoImageProps = React.ComponentProps<typeof ExpoImage>;

const storageUrlCache = new Map<string, string>();
const storageUrlInflight = new Map<string, Promise<string | null>>();
const STORAGE_URL_CACHE_MAX = 300;

function rememberStorageUrl(gsUrl: string, resolvedUrl: string) {
  storageUrlCache.set(gsUrl, resolvedUrl);
  while (storageUrlCache.size > STORAGE_URL_CACHE_MAX) {
    const oldestKey = storageUrlCache.keys().next().value;
    if (!oldestKey) break;
    storageUrlCache.delete(oldestKey);
  }
}

async function resolveStorageUrl(gsUrl: string): Promise<string | null> {
  const cached = storageUrlCache.get(gsUrl);
  if (cached) return cached;
  const inflight = storageUrlInflight.get(gsUrl);
  if (inflight) return inflight;

  const request = (async () => {
    try {
      const fb = ensureFirebase();
      if (!fb) return null;
      const url = await fb.storage().refFromURL(gsUrl).getDownloadURL();
      if (typeof url === 'string' && url.length) {
        rememberStorageUrl(gsUrl, url);
        return url;
      }
      return null;
    } catch {
      return null;
    } finally {
      storageUrlInflight.delete(gsUrl);
    }
  })();

  storageUrlInflight.set(gsUrl, request);
  return request;
}

export default function SpotImage({ style, source, cachePolicy, contentFit, transition, ...props }: ExpoImageProps) {
  const resolvedStyle = (Platform.OS === 'web' && style ? StyleSheet.flatten(style as any) : style) as any;
  const normalizedSource = useMemo(() => (typeof source === 'string' ? { uri: source } : source), [source]);
  const uri = (normalizedSource as any)?.uri;
  const [resolvedUri, setResolvedUri] = useState<string | null>(() => {
    if (typeof uri !== 'string' || !uri.startsWith('gs://')) return typeof uri === 'string' ? uri : null;
    return storageUrlCache.get(uri) || null;
  });

  useEffect(() => {
    let active = true;
    if (typeof uri !== 'string') {
      setResolvedUri(null);
      return () => {
        active = false;
      };
    }
    if (!uri.startsWith('gs://')) {
      setResolvedUri(uri);
      return () => {
        active = false;
      };
    }
    const cached = storageUrlCache.get(uri);
    if (cached) {
      setResolvedUri(cached);
      return () => {
        active = false;
      };
    }
    setResolvedUri(null);
    void resolveStorageUrl(uri).then((nextUri) => {
      if (!active) return;
      setResolvedUri(nextUri);
    });
    return () => {
      active = false;
    };
  }, [uri]);

  const activeSource = useMemo(() => {
    if (typeof uri === 'string' && uri.startsWith('gs://')) {
      return resolvedUri ? { ...(normalizedSource as any), uri: resolvedUri } : null;
    }
    return normalizedSource;
  }, [normalizedSource, resolvedUri, uri]);

  const renderUri = (activeSource as any)?.uri;
  const useNativeImage = Platform.OS === 'web' && typeof renderUri === 'string' && (renderUri.startsWith('blob:') || renderUri.startsWith('file:') || renderUri.startsWith('data:'));
  if (useNativeImage) {
    const nativeProps = props as any;
    return (
      <RNImage
        {...nativeProps}
        source={{ uri: renderUri }}
        resizeMode={(contentFit as any) || 'cover'}
        style={resolvedStyle}
      />
    );
  }
  return (
    <ExpoImage
      {...props}
      source={activeSource as any}
      cachePolicy={cachePolicy || 'memory-disk'}
      contentFit={contentFit || 'cover'}
      transition={transition ?? 120}
      style={resolvedStyle}
    />
  );
}
