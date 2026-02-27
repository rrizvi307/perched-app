import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { tokens } from '@/constants/tokens';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { buildStoryCard, renderStoryCardSVG } from '@/services/storyCards';
import { withAlpha } from '@/utils/colors';
import { cacheDirectory, documentDirectory, EncodingType, writeAsStringAsync } from 'expo-file-system/legacy';
import { useLocalSearchParams } from 'expo-router';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

type StoryMode = 'light' | 'dark';

function normalizeStoryMode(input: unknown, fallback: StoryMode): StoryMode {
  if (input === 'light' || input === 'dark') return input;
  return fallback;
}

function buildStoryCardHtml(svg: string) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
    <style>
      html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: transparent; overflow: hidden; }
      #wrap { width: 100%; height: 100%; display: flex; align-items: stretch; justify-content: stretch; }
      svg { width: 100%; height: 100%; display: block; }
    </style>
  </head>
  <body>
    <div id="wrap">${svg}</div>
    <script>
      (function () {
        function post(payload) {
          try {
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(payload));
          } catch (e) {}
        }

	        async function exportJpeg(quality) {
	          try {
	            var svgEl = document.querySelector('svg');
	            if (!svgEl) throw new Error('missing_svg');
	            var width = Number(svgEl.getAttribute('width') || 1080);
	            var height = Number(svgEl.getAttribute('height') || 1920);

	            function serializeSvg(stripImages) {
	              try {
	                if (!stripImages) return new XMLSerializer().serializeToString(svgEl);
	                var clone = svgEl.cloneNode(true);
	                var imgs = clone.querySelectorAll ? clone.querySelectorAll('image') : [];
	                for (var i = 0; i < imgs.length; i++) {
	                  try {
	                    var el = imgs[i];
	                    if (el && el.parentNode) el.parentNode.removeChild(el);
	                  } catch (e) {}
	                }
	                return new XMLSerializer().serializeToString(clone);
	              } catch (e) {
	                return new XMLSerializer().serializeToString(svgEl);
	              }
	            }

	            function attemptExport(stripImages) {
	              return new Promise(function (resolve, reject) {
	                try {
	                  var svgText = serializeSvg(stripImages);
	                  var svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
	                  var img = new Image();
	                  try { img.crossOrigin = 'anonymous'; } catch (e) {}
	                  img.onload = function () {
	                    try {
	                      var canvas = document.createElement('canvas');
	                      canvas.width = width;
	                      canvas.height = height;
	                      var ctx = canvas.getContext('2d');
	                      ctx.drawImage(img, 0, 0, width, height);
	                      var dataUrl = canvas.toDataURL('image/jpeg', typeof quality === 'number' ? quality : 0.92);
	                      var base64 = dataUrl.split(',')[1] || '';
	                      resolve({ width: width, height: height, base64: base64, stripped: !!stripImages });
	                    } catch (e) {
	                      reject(e);
	                    }
	                  };
	                  img.onerror = function () {
	                    reject(new Error('image_load_failed'));
	                  };
	                  img.src = svgUrl;
	                } catch (e) {
	                  reject(e);
	                }
	              });
	            }

	            attemptExport(false).then(function (res) {
	              post({ type: 'EXPORT_RESULT', mime: 'image/jpeg', width: res.width, height: res.height, base64: res.base64, stripped: res.stripped });
	            }).catch(function () {
	              attemptExport(true).then(function (res) {
	                post({ type: 'EXPORT_RESULT', mime: 'image/jpeg', width: res.width, height: res.height, base64: res.base64, stripped: res.stripped });
	              }).catch(function (e) {
	                post({ type: 'EXPORT_ERROR', message: String((e && e.message) || e || 'export_failed') });
	              });
	            });
	          } catch (e) {
	            post({ type: 'EXPORT_ERROR', message: String((e && e.message) || e || 'export_failed') });
	          }
	        }

        function onMessage(event) {
          var raw = event && event.data ? event.data : '';
          var msg = null;
          try { msg = JSON.parse(raw); } catch (e) { return; }
          if (!msg || !msg.type) return;
          if (msg.type === 'EXPORT_JPEG') exportJpeg(msg.quality);
        }

        document.addEventListener('message', onMessage);
        window.addEventListener('message', onMessage);
        post({ type: 'READY' });
      })();
    </script>
  </body>
</html>`;
}

export default function StoryCardScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const systemScheme = useColorScheme();
  const { showToast } = useToast();
  const params = useLocalSearchParams();

  const backgroundColor = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const primary = useThemeColor({}, 'primary');
  const highlight = withAlpha(primary, 0.12);

  const mode = normalizeStoryMode(params.mode, systemScheme === 'dark' ? 'dark' : 'light');

  const webViewRef = useRef<WebView>(null);
  const pendingActionRef = useRef<'save' | 'share' | null>(null);

  const [svg, setSvg] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user?.id) return;
      setLoading(true);
      try {
        const payload = await buildStoryCard(user.id, { name: user.name, handle: user.handle });
        if (!active) return;
        setSvg(renderStoryCardSVG(payload, { mode, width: 1080, height: 1920 }));
      } catch {
        if (!active) return;
        setSvg(renderStoryCardSVG({ topSpots: [], totalPosts: 0, estimatedHours: 0, uniqueCount: 0 }, { mode, width: 1080, height: 1920 }));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [mode, user?.handle, user?.id, user?.name]);

  const html = useMemo(() => (svg ? buildStoryCardHtml(svg) : ''), [svg]);

  async function writeJpegToCache(base64: string) {
    const dir = cacheDirectory || documentDirectory;
    if (!dir) throw new Error('No writable directory available');
    const uri = `${dir}PerchedRecap.jpg`;
    await writeAsStringAsync(uri, base64, { encoding: EncodingType.Base64 });
    return uri;
  }

  async function saveToPhotos(uri: string, stripped?: boolean) {
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) {
      showToast('Allow Photos access to save your story card.', 'info');
      return;
    }
    const asset = await MediaLibrary.createAssetAsync(uri);
    try {
      const albumName = 'Perched';
      const existing = await MediaLibrary.getAlbumAsync(albumName);
      if (!existing) {
        await MediaLibrary.createAlbumAsync(albumName, asset, false);
      } else {
        await MediaLibrary.addAssetsToAlbumAsync([asset], existing, false);
      }
    } catch {
      // Album ops can fail under limited permissions; asset is still created.
    }
    showToast(stripped ? 'Saved to Photos (photos removed for export).' : 'Saved to Photos.', stripped ? 'warning' : 'success');
  }

  async function shareImage(uri: string) {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: 'Share story card' });
      return;
    }
    showToast('Sharing not available on this device.', 'warning');
  }

  function requestExport(action: 'save' | 'share') {
    if (exporting) return;
    if (!webViewRef.current) return;
    pendingActionRef.current = action;
    setExporting(true);
    try {
      webViewRef.current.postMessage(JSON.stringify({ type: 'EXPORT_JPEG', quality: 0.92 }));
    } catch {
      pendingActionRef.current = null;
      setExporting(false);
      showToast('Unable to export story card.', 'error');
    }
  }

  return (
    <ThemedView style={styles.container}>
      <Atmosphere variant="cool" />

      <View style={styles.body}>
        <View style={[styles.previewFrame, { borderColor: withAlpha(border, 0.9), backgroundColor: withAlpha(card, 0.98) }]}>
          {loading ? (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator color={primary} />
              <Text style={{ color: muted, marginTop: 8 }}>Building your recap…</Text>
            </View>
          ) : null}
          {svg ? (
            <WebView
              ref={webViewRef}
              originWhitelist={['*']}
              source={{ html }}
              scrollEnabled={false}
              bounces={false as any}
              style={styles.webview}
              onMessage={async (event) => {
                try {
                  const data = event?.nativeEvent?.data || '';
                  const msg = JSON.parse(data);
                  if (msg?.type === 'READY') return;
                  if (msg?.type === 'EXPORT_ERROR') {
                    pendingActionRef.current = null;
                    setExporting(false);
                    showToast('Export failed. Try again.', 'error');
                    return;
                  }
                  if (msg?.type === 'EXPORT_RESULT' && typeof msg?.base64 === 'string' && msg.base64.length) {
                    const stripped = !!msg?.stripped;
                    const uri = await writeJpegToCache(msg.base64);
                    const action = pendingActionRef.current;
                    pendingActionRef.current = null;
                    setExporting(false);
                    if (action === 'save') await saveToPhotos(uri, stripped);
                    if (action === 'share') await shareImage(uri);
                  }
                } catch {
                  pendingActionRef.current = null;
                  setExporting(false);
                  showToast('Export failed. Try again.', 'error');
                }
              }}
            />
          ) : (
            <View style={[styles.emptyState, { backgroundColor }]}>
              <Text style={{ color: muted }}>Unable to render story card.</Text>
            </View>
          )}
        </View>

        <View style={[styles.actions, { paddingBottom: Math.max(18, insets.bottom + 12) }]}>
          <Pressable
            onPress={() => requestExport('save')}
            disabled={loading || exporting}
            style={({ pressed }) => [
              styles.actionButton,
              { borderColor: border, backgroundColor: pressed ? highlight : card },
              (loading || exporting) ? { opacity: 0.6 } : null,
            ]}
          >
            <IconSymbol name="photo.fill" size={18} color={text} />
            <Text style={{ color: text, fontWeight: '800', marginLeft: 8 }}>Save</Text>
          </Pressable>
          <Pressable
            onPress={() => requestExport('share')}
            disabled={loading || exporting}
            style={({ pressed }) => [
              styles.actionButton,
              { borderColor: border, backgroundColor: pressed ? highlight : card },
              (loading || exporting) ? { opacity: 0.6 } : null,
            ]}
          >
            <IconSymbol name="paperplane.fill" size={18} color={text} />
            <Text style={{ color: text, fontWeight: '800', marginLeft: 8 }}>Share</Text>
          </Pressable>
        </View>

        {exporting ? (
          <View pointerEvents="none" style={[styles.exportToast, { backgroundColor: withAlpha(card, 0.92), borderColor: withAlpha(border, 0.9) }]}>
            <ActivityIndicator color={primary} />
            <Text style={{ color: text, fontWeight: '700', marginLeft: 10 }}>Exporting…</Text>
          </View>
        ) : null}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 18, paddingTop: 8 },
  previewFrame: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    width: '100%',
    aspectRatio: 9 / 16,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    position: 'absolute',
    zIndex: 2,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actions: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.space.s12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  exportToast: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
