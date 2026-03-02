import { Platform } from 'react-native';
import React from 'react';
import NativeMap, { Marker as NativeMarker, Circle as NativeCircle, PROVIDER_GOOGLE as NATIVE_PROVIDER_GOOGLE } from './index.native';
import WebMap, { Marker as WebMarker, Circle as WebCircle, PROVIDER_GOOGLE as WEB_PROVIDER_GOOGLE } from './index.web';

const isWeb = Platform.OS === 'web';
const BaseMap = isWeb ? WebMap : NativeMap;

export const Marker = isWeb ? WebMarker : NativeMarker;
export const Circle = isWeb ? WebCircle : NativeCircle;
export const PROVIDER_GOOGLE = isWeb ? WEB_PROVIDER_GOOGLE : NATIVE_PROVIDER_GOOGLE;

const MapView = React.forwardRef<any, React.ComponentProps<typeof BaseMap>>((props, ref) =>
  React.createElement(BaseMap as any, { ...props, ref }),
);

export default MapView;
