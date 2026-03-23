import React, { forwardRef, useEffect } from "react";
import { View, StyleSheet, Text, TouchableOpacity } from "react-native";
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
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  useEffect(() => {
    if (isActive) {
      (async () => {
        if (!cameraPermission?.granted) await requestCameraPermission();
        if (!micPermission?.granted) await requestMicPermission();
      })();
    }
  }, [isActive]);

  if (!cameraPermission || !micPermission) {
    return <View style={styles.container} />;
  }

  if (!cameraPermission.granted || !micPermission.granted) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>L'accès à l'appareil photo et au micro est requis.</Text>
        <TouchableOpacity 
          style={styles.button} 
          onPress={async () => {
            await requestCameraPermission();
            await requestMicPermission();
          }}
        >
          <Text style={styles.buttonText}>Autoriser</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
          mirror={facing === 'front'}
          autofocus="on"
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
  center: { justifyContent: "center", alignItems: "center", padding: 40 },
  errorText: { color: "#FFF", textAlign: "center", marginBottom: 20, fontFamily: "Inter_400Regular" },
  button: { backgroundColor: "#FFF", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  buttonText: { color: "#000", fontFamily: "Inter_700Bold" },
});
