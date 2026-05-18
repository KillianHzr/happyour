import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { findNodeHandle, ViewStyle } from 'react-native';
import { requireNativeModule, requireNativeViewManager } from 'expo-modules-core';
import { concatVideos } from 'video-concat';

const NativeView = requireNativeViewManager('SeamlessRecorder');
const NativeModule = requireNativeModule('SeamlessRecorder');

export interface SeamlessRecorderRef {
  startRecording(): Promise<void>;
  /** Resolves with the final video URI (single file on iOS, concat'd file on Android). */
  stopRecording(): Promise<string>;
  switchCamera(): Promise<void>;
}

interface SeamlessRecorderProps {
  facing?: 'front' | 'back';
  style?: ViewStyle;
}

const SeamlessRecorder = forwardRef<SeamlessRecorderRef, SeamlessRecorderProps>(
  ({ facing = 'back', style }, ref) => {
    const nativeRef = useRef<React.ElementRef<typeof NativeView>>(null);

    useImperativeHandle(ref, () => ({
      startRecording: async () => {
        const tag = findNodeHandle(nativeRef.current);
        if (tag == null) throw new Error('SeamlessRecorder not mounted');
        return NativeModule.startRecording(tag);
      },

      stopRecording: async (): Promise<string> => {
        const tag = findNodeHandle(nativeRef.current);
        if (tag == null) throw new Error('SeamlessRecorder not mounted');

        // iOS returns a single string URI.
        // Android returns an array of clip URIs (one per camera segment).
        const result: string | string[] = await NativeModule.stopRecording(tag);
        const uris = Array.isArray(result) ? result : [result];

        if (uris.length === 1) return uris[0];

        // Multiple clips (Android camera switch) — concat with the existing native module.
        return concatVideos(uris);
      },

      switchCamera: async () => {
        const tag = findNodeHandle(nativeRef.current);
        if (tag == null) throw new Error('SeamlessRecorder not mounted');
        return NativeModule.switchCamera(tag);
      },
    }));

    return <NativeView ref={nativeRef} facing={facing} style={style} />;
  }
);

SeamlessRecorder.displayName = 'SeamlessRecorder';

export default SeamlessRecorder;
