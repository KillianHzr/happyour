import { Alert } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from 'expo-media-library';

export const handleDownloadMedia = async (url: string, filename: string) => {
  if (!url) return;
  try {
    const { status, canAskAgain } = await MediaLibrary.getPermissionsAsync();
    let finalStatus = status;

    if (finalStatus !== 'granted' && canAskAgain) {
      const { status: askStatus } = await MediaLibrary.requestPermissionsAsync();
      finalStatus = askStatus;
    }

    if (finalStatus !== 'granted') {
      Alert.alert("Permission requise", "Nous avons besoin de votre permission pour enregistrer le média.");
      return;
    }

    let localUri = url;
    
    // If it's a remote URL, check if we already have it in cache
    if (url.startsWith('http')) {
      const extension = url.split('.').pop()?.split('?')[0] || (url.includes('video') ? 'mp4' : 'jpg');
      const cachePath = FileSystem.cacheDirectory + `download_${filename}.${extension}`;
      
      const fileInfo = await FileSystem.getInfoAsync(cachePath);
      if (fileInfo.exists) {
        localUri = fileInfo.uri;
      } else {
        // Only fetch if not in cache
        const { uri } = await FileSystem.downloadAsync(url, cachePath);
        localUri = uri;
      }
    }

    const asset = await MediaLibrary.createAssetAsync(localUri);
    try {
      await MediaLibrary.createAlbumAsync('Happyour', asset, true);
    } catch (e) {
      console.log("[MediaLibrary] Album creation skipped, asset is in gallery.", e);
    }
    Alert.alert("Succès", "Média enregistré !");
  } catch (error) {
    console.error("[Download Error]", error);
    Alert.alert("Erreur", "Impossible d'enregistrer le média.");
  }
};
