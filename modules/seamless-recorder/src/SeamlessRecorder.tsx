import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { findNodeHandle, ViewStyle } from 'react-native';
import { requireNativeModule, requireNativeViewManager } from 'expo-modules-core';
const NativeView = requireNativeViewManager('SeamlessRecorder');
const NativeModule = requireNativeModule('SeamlessRecorder');

export interface SeamlessRecorderRef {
  /** iOS: single session, zero post-processing. Android: restarts clip per switch. */
  capturePhoto(): Promise<string>;
  startRecording(): Promise<void>;
  /** Segments bruts (iOS: 1 ; Android: 1 par segment caméra). Concat différée à l'envoi. */
  stopRecording(): Promise<string[]>;
  switchCamera(): Promise<void>;
}

interface SeamlessRecorderProps {
  facing?: 'front' | 'back';
  /** Photo flash mode. */
  flash?: 'off' | 'on' | 'auto';
  /** Normalized zoom level 0–1. */
  zoom?: number;
  /** Video torch / flashlight. */
  torch?: boolean;
  /** Android only: switch between ImageCapture (false) and VideoCapture (true). */
  videoMode?: boolean;
  style?: ViewStyle;
}

const SeamlessRecorder = forwardRef<SeamlessRecorderRef, SeamlessRecorderProps>(
  ({ facing = 'back', flash = 'off', zoom = 0, torch = false, videoMode = false, style }, ref) => {
    const nativeRef = useRef<React.ElementRef<typeof NativeView>>(null);

    const getTag = () => {
      const tag = findNodeHandle(nativeRef.current);
      if (tag == null) throw new Error('SeamlessRecorder not mounted');
      return tag;
    };

    useImperativeHandle(ref, () => ({
      capturePhoto: async (): Promise<string> => {
        return NativeModule.capturePhoto(getTag());
      },

      startRecording: async () => {
        return NativeModule.startRecording(getTag());
      },

      stopRecording: async (): Promise<string[]> => {
        // Retourne les segments BRUTS sans concaténer : iOS = 1 fichier, Android = 1 clip
        // par segment caméra. La concaténation (coûteuse) est différée à l'envoi pour ne
        // pas bloquer l'affichage de la preview.
        const result: string | string[] = await NativeModule.stopRecording(getTag());
        return Array.isArray(result) ? result : [result];
      },

      switchCamera: async () => {
        return NativeModule.switchCamera(getTag());
      },
    }));

    return <NativeView ref={nativeRef} facing={facing} flash={flash} zoom={zoom} torch={torch} videoMode={videoMode} style={style} />;
  }
);

SeamlessRecorder.displayName = 'SeamlessRecorder';

export default SeamlessRecorder;
