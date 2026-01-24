// Lazily require react-native-maps at runtime to avoid bundling native-only internals into web builds.
let RNMapView: any = null;
let RNMarker: any = null;
let RNCircle: any = null;
let RN_PROVIDER_GOOGLE: any = null;
try {
	// use eval to hide the static require from bundlers that scan source
	const req: any = eval('require');
	const mod = req('react-native-maps');
	RNMapView = mod.default || mod.MapView || mod;
	RNMarker = mod.Marker || null;
	RNCircle = mod.Circle || null;
	RN_PROVIDER_GOOGLE = mod.PROVIDER_GOOGLE || null;
} catch {
	// if native maps not available at runtime, exports will be null and callers should handle fallback
}

export const MapView = RNMapView;
export const Marker = RNMarker;
export const Circle = RNCircle;
export const PROVIDER_GOOGLE = RN_PROVIDER_GOOGLE;

export default RNMapView;
