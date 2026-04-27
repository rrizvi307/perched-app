import * as ImagePicker from 'expo-image-picker';
import { logEvent } from '@/services/logEvent';
import { getPermissionPrimerSeen, setPermissionPrimerSeen } from '@/storage/local';

type PickedAsset = {
  uri: string;
  base64?: string | null;
  exif?: any;
};

export type CheckinImagePickResult =
  | {
      status: 'success';
      image: string;
      exif: any;
    }
  | {
      status: 'cancelled';
    }
  | {
      status: 'permission_denied';
      permission: 'camera' | 'library';
      message: string;
      hasCameraPermission?: boolean;
    }
  | {
      status: 'error';
      message: string;
      hasCameraPermission?: boolean;
      error?: unknown;
    };

export type CheckinMediaBootstrapState = {
  showCameraPrimer: boolean;
  hasCameraPermission: boolean | null;
};

type CheckinMediaInput = {
  imageQuality: number;
  isWeb: boolean;
  userId?: string | null;
};

function getPickedAsset(result: any): PickedAsset | null {
  if (result?.canceled) return null;
  if (Array.isArray(result?.assets) && result.assets.length > 0) {
    const asset = result.assets[0];
    return {
      uri: asset?.uri,
      base64: asset?.base64 ?? null,
      exif: asset?.exif ?? null,
    };
  }
  if (typeof result?.uri === 'string') {
    return {
      uri: result.uri,
      base64: result?.base64 ?? null,
      exif: result?.exif ?? null,
    };
  }
  return null;
}

function formatPickedImage(asset: PickedAsset, isWeb: boolean) {
  const image = isWeb && asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
  return {
    image,
    exif: asset.exif || null,
  };
}

async function logPickedPhoto(userId?: string | null) {
  try {
    await logEvent('photo_captured', userId ?? undefined);
  } catch {}
}

export async function loadCheckinMediaBootstrapState(): Promise<CheckinMediaBootstrapState> {
  const seen = await getPermissionPrimerSeen('camera');
  if (!seen) {
    return {
      showCameraPrimer: true,
      hasCameraPermission: null,
    };
  }

  const cam = await ImagePicker.requestCameraPermissionsAsync();
  await ImagePicker.requestMediaLibraryPermissionsAsync();
  return {
    showCameraPrimer: false,
    hasCameraPermission: cam.status === 'granted',
  };
}

export async function confirmCheckinCameraPrimerPermissions(): Promise<{ hasCameraPermission: boolean }> {
  await setPermissionPrimerSeen('camera', true);
  const cam = await ImagePicker.requestCameraPermissionsAsync();
  await ImagePicker.requestMediaLibraryPermissionsAsync();
  return {
    hasCameraPermission: cam.status === 'granted',
  };
}

export async function captureCheckinPhoto(input: CheckinMediaInput): Promise<CheckinImagePickResult> {
  try {
    const current = await ImagePicker.getCameraPermissionsAsync();
    let granted = current.granted;
    if (!granted) {
      const requested = await ImagePicker.requestCameraPermissionsAsync();
      granted = requested.status === 'granted';
      if (!granted) {
        return {
          status: 'permission_denied',
          permission: 'camera',
          message: 'Enable camera access in Settings to take a photo.',
          hasCameraPermission: false,
        };
      }
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: input.imageQuality,
      exif: true,
      base64: input.isWeb,
    });
    const asset = getPickedAsset(result);
    if (!asset) return { status: 'cancelled' };
    const picked = formatPickedImage(asset, input.isWeb);
    await logPickedPhoto(input.userId);
    return {
      status: 'success',
      image: picked.image,
      exif: picked.exif,
    };
  } catch (error) {
    return {
      status: 'error',
      message: 'Unable to open camera. Check permissions and try again.',
      error,
    };
  }
}

export async function chooseCheckinPhotoFromLibrary(input: CheckinMediaInput): Promise<CheckinImagePickResult> {
  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      return {
        status: 'permission_denied',
        permission: 'library',
        message:
          permission.canAskAgain === false
            ? 'Enable photo library access in Settings to choose a photo.'
            : 'Allow photo library access to choose a photo.',
      };
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: input.imageQuality,
      exif: true,
      base64: input.isWeb,
    });
    const asset = getPickedAsset(result);
    if (!asset) return { status: 'cancelled' };
    const picked = formatPickedImage(asset, input.isWeb);
    await logPickedPhoto(input.userId);
    return {
      status: 'success',
      image: picked.image,
      exif: picked.exif,
    };
  } catch (error) {
    return {
      status: 'error',
      message: 'Unable to open photo library. Check permissions and try again.',
      error,
    };
  }
}
