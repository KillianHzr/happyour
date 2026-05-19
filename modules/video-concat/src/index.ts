import { requireNativeModule } from 'expo-modules-core';

const VideoConcatModule = requireNativeModule('VideoConcat');

export async function concatVideos(uris: string[]): Promise<string> {
  return VideoConcatModule.concatVideos(uris);
}
