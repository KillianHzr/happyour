import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { findNodeHandle, ViewStyle } from 'react-native';
import { requireNativeModule, requireNativeViewManager } from 'expo-modules-core';
import { concatVideos } from 'video-concat';

const NativeView = requireNativeViewManager('SeamlessRecorder');
const NativeModule = requireNativeModule('SeamlessRecorder');

export interface SeamlessRecorderRef {
  /** iOS: single session, zero post-processing. Android: restarts clip per switch, concats at end. */
  capturePhoto(): Promise<string>;
  startRecording(): Promise<void>;
  stopRecording(): Promise<string>;
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

      stopRecording: async (): Promise<string> => {
        // iOS returns a single string URI.
        // Android returns an array of clip URIs (one per camera segment).
        const result: string | string[] = await NativeModule.stopRecording(getTag());
        const uris = Array.isArray(result) ? result : [result];
        if (uris.length === 1) return uris[0];
        return concatVideos(uris);
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
