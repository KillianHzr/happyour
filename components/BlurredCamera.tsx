import React, { forwardRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { BlurView } from "expo-blur";

const BlurredCamera = forwardRef<CameraView>((_, ref) => {
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>
          L'app a besoin de la caméra pour capturer des moments.
        </Text>
        <Text style={styles.permissionLink} onPress={requestPermission}>
          Autoriser la caméra
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={ref} style={StyleSheet.absoluteFill} facing="back" />
      <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
    </View>
  );
});

BlurredCamera.displayName = "BlurredCamera";

export default BlurredCamera;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
    padding: 32,
  },
  permissionText: {
    fontFamily: "Inter_400Regular",
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 16,
  },
  permissionLink: {
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    fontSize: 16,
    textDecorationLine: "underline",
  },
});
