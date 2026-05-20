import React, { forwardRef, useEffect, useRef, useState } from "react";
import { View, StyleSheet, Text, TouchableOpacity, Dimensions } from "react-native";
import { CameraView, useCameraPermissions, useMicrophonePermissions, FlashMode, CameraType } from "expo-camera";
import { colors, radii, typography } from "../lib/theme";

interface Props {
  isActive?: boolean;
  facing?: CameraType;
  flash?: FlashMode;
  zoom?: number;
  mode?: "picture" | "video";
  mirror?: boolean;
  onZoomChange?: (zoom: number) => void;
  onPinchingChange?: (isPinching: boolean) => void;
  onDoubleTap?: () => void;
  onCameraReady?: () => void;
}

const StandardCamera = forwardRef<CameraView, Props>(({
  isActive = true,
  facing = 'back',
  flash = 'off',
  zoom: initialZoom = 0,
  mode = 'picture',
  mirror = false,
  onZoomChange,
  onPinchingChange,
  onDoubleTap,
  onCameraReady,
}, ref) => {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [localZoom, setLocalZoom] = useState(initialZoom);

  const savedZoom = useRef(initialZoom);
  const prevPinchDistance = useRef<number | null>(null);
  const isPinching = useRef(false);
  const rafId = useRef<number | null>(null);
  const lastTapTime = useRef(0);

  useEffect(() => {
    if (isPinching.current) return;
    setLocalZoom(initialZoom);
    savedZoom.current = initialZoom;
  }, [initialZoom]);

  useEffect(() => {
    if (isActive) {
      (async () => {
        if (!cameraPermission?.granted) await requestCameraPermission();
        if (!micPermission?.granted) await requestMicPermission();
      })();
    }
  }, [isActive]);

  const scheduleZoomUpdate = () => {
    if (rafId.current !== null) return;
    rafId.current = requestAnimationFrame(() => {
      setLocalZoom(savedZoom.current);
      rafId.current = null;
    });
  };

  const handleTouchStart = (event: any) => {
    const touches = event.nativeEvent.touches;
    if (touches.length === 2) {
      isPinching.current = true;
      prevPinchDistance.current = null;
      onPinchingChange?.(true);
    } else if (touches.length === 1 && onDoubleTap) {
      const now = Date.now();
      if (now - lastTapTime.current < 300) {
        onDoubleTap();
        lastTapTime.current = 0;
      } else {
        lastTapTime.current = now;
      }
    }
  };

  const handleTouchMove = (event: any) => {
    const touches = event.nativeEvent.touches;
    if (touches.length !== 2) return;

    const dx = touches[1].pageX - touches[0].pageX;
    const dy = touches[1].pageY - touches[0].pageY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (prevPinchDistance.current !== null) {
      const delta = distance - prevPinchDistance.current;
      const newZoom = Math.min(Math.max(savedZoom.current + delta * 0.003, 0), 1);
      savedZoom.current = newZoom;
      scheduleZoomUpdate();
    }
    prevPinchDistance.current = distance;
  };

  const handleTouchEnd = (event: any) => {
    if (event.nativeEvent.touches.length < 2) {
      prevPinchDistance.current = null;
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      if (isPinching.current) {
        isPinching.current = false;
        setLocalZoom(savedZoom.current);
        onZoomChange?.(savedZoom.current);
        onPinchingChange?.(false);
      }
    }
  };

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
    <View
      style={styles.cameraWrapper}
      onStartShouldSetResponderCapture={(e) => e.nativeEvent.touches.length >= 2}
      onMoveShouldSetResponderCapture={(e) => e.nativeEvent.touches.length >= 2}
      onResponderGrant={handleTouchStart}
      onResponderMove={handleTouchMove}
      onResponderRelease={handleTouchEnd}
      onResponderTerminate={handleTouchEnd}
      onResponderTerminationRequest={() => !isPinching.current}
    >
      {/* CameraView reste toujours monté pour éviter les crashes Android liés aux remontages répétés */}
      <CameraView
        ref={ref}
        style={[StyleSheet.absoluteFill, !isActive && { opacity: 0 }]}
        facing={facing}
        flash={flash}
        zoom={localZoom}
        mode={mode}
        mirror={mirror}
        videoQuality="1080p"
        enableTorch={false}
        autofocus="off"
        onCameraReady={onCameraReady}
      />
    </View>
  );
});

StandardCamera.displayName = "StandardCamera";
export default StandardCamera;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  cameraWrapper: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.black,
    borderRadius: radii.xl,
    overflow: "hidden",
  },
  center: { justifyContent: "center", alignItems: "center", padding: 40 },
  errorText: { color: colors.white, textAlign: "center", marginBottom: 20, fontFamily: typography.family.regular },
  button: { backgroundColor: colors.white, paddingHorizontal: 24, paddingVertical: 12, borderRadius: radii.md },
  buttonText: { color: colors.black, fontFamily: typography.family.bold },
});
