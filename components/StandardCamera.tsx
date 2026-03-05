import React, { forwardRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { CameraView, useCameraPermissions, useMicrophonePermissions, FlashMode, CameraType } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../lib/theme";

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

  if (!cameraPermission || !micPermission) return <View style={styles.container} />;

  if (!cameraPermission.granted || (mode === 'video' && !micPermission.granted)) {
    const handleRequest = async () => {
      const cam = await requestCameraPermission();
      if (mode === 'video' && cam.granted) {
        await requestMicPermission();
      }
    };

    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>
          {!cameraPermission.granted 
            ? "L'app a besoin de la caméra." 
            : "L'app a besoin du micro pour la vidéo."}
        </Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={handleRequest}>
          <Text style={styles.permissionBtnText}>Autoriser</Text>
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
          responsiveOrientationWhenOrientationLocked
        />
      )}
      <LinearGradient
        colors={["rgba(0,0,0,0.4)", "transparent", "transparent", "rgba(0,0,0,0.6)"]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
});

StandardCamera.displayName = "StandardCamera";
export default StandardCamera;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  permissionContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000", padding: 40 },
  permissionText: { fontFamily: "Inter_400Regular", color: "#AAA", fontSize: 16, textAlign: "center", marginBottom: 24 },
  permissionBtn: { backgroundColor: "#FFF", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 100 },
  permissionBtnText: { fontFamily: "Inter_600SemiBold", color: "#000" },
});
