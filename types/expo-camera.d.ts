declare module 'expo-camera' {
  import { ComponentType } from 'react';
    import { ViewProps } from 'react-native';

  export const Camera: ComponentType<ViewProps & { ref?: any }>;
  export function requestCameraPermissionsAsync(): Promise<{ status: 'granted' | 'denied' }>;
  export function requestMicrophonePermissionsAsync(): Promise<{ status: 'granted' | 'denied' }>;
  export function useCameraPermissions(): any;
}
