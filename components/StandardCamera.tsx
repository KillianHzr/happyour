import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Camera, useCameraDevice, useCameraPermission, useMicrophonePermission } from "react-native-vision-camera";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, { useAnimatedProps, useSharedValue, runOnJS } from "react-native-reanimated";

const ReanimatedCamera = Reanimated.createAnimatedComponent(Camera);

interface Props {
  isActive?: boolean;
  facing?: "back" | "front";
  zoom?: number; // normalisé 0–1
  onZoomChange?: (zoom: number) => void;
  onPinchingChange?: (isPinching: boolean) => void;
  onDoubleTap?: () => void;
}

const StandardCamera = forwardRef<Camera, Props>(({
  isActive = true,
  facing = "back",
  zoom: externalZoom = 0,
  onZoomChange,
  onPinchingChange,
  onDoubleTap,
}, ref) => {
  const { hasPermission: hasCameraPermission, requestPermission: requestCamera } = useCameraPermission();
  const { hasPermission: hasMicPermission, requestPermission: requestMic } = useMicrophonePermission();
  const device = useCameraDevice(facing);

  const internalRef = useRef<Camera>(null);
  useImperativeHandle(ref, () => internalRef.current!, []);

  const zoom = useSharedValue(device?.minZoom ?? 1);
  const startZoom = useSharedValue(device?.minZoom ?? 1);

  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!isActive) return;
    (async () => {
      if (!hasCameraPermission) await requestCamera();
      if (!hasMicPermission) await requestMic();
      setInitialized(true);
    })();
  }, [isActive]);

  // Reset zoom quand on change de caméra
  useEffect(() => {
    if (device) {
      zoom.value = device.minZoom;
      startZoom.value = device.minZoom;
    }
  }, [device?.id]);

  // Sync zoom externe (0–1) → unités device
  useEffect(() => {
    if (!device) return;
    zoom.value = device.minZoom + externalZoom * (device.maxZoom - device.minZoom);
  }, [externalZoom]);

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      startZoom.value = zoom.value;
      if (onPinchingChange) runOnJS(onPinchingChange)(true);
    })
    .onUpdate((e) => {
      if (!device) return;
      zoom.value = Math.min(Math.max(startZoom.value * e.scale, device.minZoom), device.maxZoom);
    })
    .onEnd(() => {
      if (onPinchingChange) runOnJS(onPinchingChange)(false);
      if (onZoomChange && device) {
        const normalized = (zoom.value - device.minZoom) / (device.maxZoom - device.minZoom);
        runOnJS(onZoomChange)(Math.min(Math.max(normalized, 0), 1));
      }
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .onEnd(() => {
      if (onDoubleTap) runOnJS(onDoubleTap)();
    });

  const composedGesture = Gesture.Race(pinchGesture, doubleTapGesture);

  const animatedProps = useAnimatedProps<any>(() => ({
    zoom: zoom.value,
  }));

  if (!initialized) {
    return <View style={styles.container} />;
  }

  if (!hasCameraPermission || !hasMicPermission) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>L'accès à l'appareil photo et au micro est requis.</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={async () => {
            await requestCamera();
            await requestMic();
          }}
        >
          <Text style={styles.buttonText}>Autoriser</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return <View style={styles.container} />;
  }

  return (
    <GestureDetector gesture={composedGesture}>
      <View style={styles.container}>
        {isActive && (
          <ReanimatedCamera
            ref={internalRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={isActive}
            photo
            video
            audio
            animatedProps={animatedProps}
          />
        )}
      </View>
    </GestureDetector>
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
