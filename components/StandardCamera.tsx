import React, { forwardRef } from "react";
import { View, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions, useMicrophonePermissions, FlashMode, CameraType } from "expo-camera";

interface Props {
  isActive?: boolean;
  facing?: CameraType;
  flash?: FlashMode;
  zoom?: number;
  mode?: "picture" | "video";
}

const StandardCamera = forwardRef<CameraView, Props>(({ 
  isActive = true, 
  facing = 'back', 
  flash = 'off', 
  zoom = 0,
  mode = 'picture'
}, ref) => {
  const [cameraPermission] = useCameraPermissions();
  const [micPermission] = useMicrophonePermissions();

  if (!cameraPermission?.granted) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      {isActive && (
        <CameraView 
          ref={ref} 
          style={StyleSheet.absoluteFill} 
          facing={facing}
          flash={flash}
          zoom={zoom}
          mode={mode}
          enableTorch={false}
          mirror={facing === 'front'} // Correction : utiliser la prop comme demandé par l'avertissement
          responsiveOrientationWhenOrientationLocked
        />
      )}
    </View>
  );
});

StandardCamera.displayName = "StandardCamera";
export default StandardCamera;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
});
