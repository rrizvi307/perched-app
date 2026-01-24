import { getMapsKey } from '@/services/googleMaps';
import { useThemeColor } from '@/hooks/use-theme-color';
import { withAlpha } from '@/utils/colors';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

type MapContextValue = {
  map: any;
};

const MapContext = createContext<MapContextValue | null>(null);

let googleMapsPromise: Promise<void> | null = null;

function loadGoogleMaps(key: string) {
  if (typeof window === 'undefined') return Promise.resolve();
  const w = window as any;
  if (w.google?.maps) return Promise.resolve();
  if (googleMapsPromise) return googleMapsPromise;
  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Maps failed to load'));
    document.head.appendChild(script);
  });
  return googleMapsPromise;
}

function centerFromRegion(initialRegion: any) {
  if (initialRegion?.latitude && initialRegion?.longitude) {
    return { lat: initialRegion.latitude, lng: initialRegion.longitude };
  }
  return { lat: 29.7604, lng: -95.3698 };
}

function toLatLng(input: any) {
  if (!input) return null;
  const lat = typeof input.latitude === 'number' ? input.latitude : input.lat;
  const lng = typeof input.longitude === 'number' ? input.longitude : input.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { lat, lng };
}

export default function MapView({ children, style, initialRegion, onRegionChangeComplete }: any) {
  const key = getMapsKey();
  const mapStyle = useMemo(() => StyleSheet.flatten(style) || {}, [style]);
  const containerStyle = useMemo(
    () => [mapStyle, { overflow: 'hidden', touchAction: 'auto', cursor: 'grab', position: 'relative' } as any],
    [mapStyle],
  );
  const center = useMemo(() => centerFromRegion(initialRegion), [initialRegion]);
  const mapRef = useRef<any>(null);
  const [map, setMap] = useState<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!key || !mapRef.current) return;
    let active = true;
    loadGoogleMaps(key)
      .then(() => {
        if (!active || !mapRef.current) return;
        const g = (window as any).google;
        const nextMap = new g.maps.Map(mapRef.current, {
          center,
          zoom: 13,
          gestureHandling: 'greedy',
          disableDefaultUI: true,
        });
        nextMap.addListener('idle', () => {
          if (!onRegionChangeComplete) return;
          const bounds = nextMap.getBounds?.();
          const mapCenter = nextMap.getCenter?.();
          if (!bounds || !mapCenter) return;
          const ne = bounds.getNorthEast();
          const sw = bounds.getSouthWest();
          const latitudeDelta = Math.abs(ne.lat() - sw.lat());
          const longitudeDelta = Math.abs(ne.lng() - sw.lng());
          onRegionChangeComplete({
            latitude: mapCenter.lat(),
            longitude: mapCenter.lng(),
            latitudeDelta,
            longitudeDelta,
          });
        });
        setMap(nextMap);
        setReady(true);
      })
      .catch(() => {
        setReady(false);
      });
    return () => {
      active = false;
    };
  }, [key, center, onRegionChangeComplete]);

  useEffect(() => {
    if (!map) return;
    map.setCenter(center);
  }, [map, center]);

  const fallbackUri = key
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${center.lat},${center.lng}&zoom=13&size=800x300&scale=2&key=${key}`
    : null;

  return (
    <View style={containerStyle}>
      <View ref={mapRef} style={StyleSheet.absoluteFill} />
      {!ready && fallbackUri ? <Image source={{ uri: fallbackUri }} style={StyleSheet.absoluteFill} /> : null}
      <MapContext.Provider value={{ map }}>{children}</MapContext.Provider>
    </View>
  );
}

export function Marker({ coordinate, title, description, pinColor, onPress }: any) {
  const ctx = useContext(MapContext);
  const surface = useThemeColor({}, 'surface');
  const primary = useThemeColor({}, 'primary');
  useEffect(() => {
    if (!ctx?.map) return;
    const pos = toLatLng(coordinate);
    if (!pos) return;
    const g = (window as any).google;
    const marker = new g.maps.Marker({
      position: pos,
      map: ctx.map,
      title: title || undefined,
    });
    if (pinColor || primary) {
      marker.setIcon({
        path: g.maps.SymbolPath.CIRCLE,
        scale: 6,
        fillColor: pinColor || primary,
        fillOpacity: 1,
        strokeColor: surface,
        strokeWeight: 1.5,
      });
    }
    const listener = onPress ? marker.addListener('click', onPress) : null;
    return () => {
      if (listener?.remove) listener.remove();
      marker.setMap(null);
    };
  }, [ctx?.map, coordinate, title, description, pinColor, onPress, primary, surface]);
  return null;
}

export function Circle({ center, radius, strokeColor, fillColor }: any) {
  const ctx = useContext(MapContext);
  const primary = useThemeColor({}, 'primary');
  useEffect(() => {
    if (!ctx?.map) return;
    const pos = toLatLng(center);
    if (!pos) return;
    const g = (window as any).google;
    const circle = new g.maps.Circle({
      map: ctx.map,
      center: pos,
      radius: radius || 0,
      strokeColor: strokeColor || primary,
      strokeOpacity: 0.7,
      strokeWeight: 1,
      fillColor: fillColor || withAlpha(primary, 0.2),
      fillOpacity: 0.4,
    });
    return () => {
      circle.setMap(null);
    };
  }, [ctx?.map, center, radius, strokeColor, fillColor, primary]);
  return null;
}

export const PROVIDER_GOOGLE = null;
