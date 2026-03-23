import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
  StatusBar,
} from "react-native";
import { BlurView } from "expo-blur";
import Svg, { Path, Circle } from "react-native-svg";
import { useUpload } from "./upload-context";

type ToastType = "success" | "error" | "info";

interface ToastData {
  id: number;
  title: string;
  message?: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (title: string, message?: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });
export const useToast = () => useContext(ToastContext);

// --- Icônes ---
const CheckIcon = () => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 6L9 17l-5-5" />
  </Svg>
);

const CrossIcon = () => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="10" />
    <Path d="M15 9l-6 6M9 9l6 6" />
  </Svg>
);

const InfoCircleIcon = () => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="10" />
    <Path d="M12 16v-4M12 8h.01" />
  </Svg>
);

function SpinnerIcon() {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(rotation, { toValue: 1, duration: 750, useNativeDriver: true })
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <Circle cx="12" cy="12" r="10" stroke="rgba(0,0,0,0.12)" strokeWidth="2.5" />
        <Path d="M12 2a10 10 0 0 1 10 10" stroke="#111" strokeWidth="2.5" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

// --- Progress bar ---
function AnimatedProgressBar({ progress }: { progress: number }) {
  const animatedWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: progress,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const width = animatedWidth.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressThumb, { width }]} />
    </View>
  );
}

// --- Provider ---
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const nextId = useRef(0);

  const showToast = (title: string, message?: string, type: ToastType = "info") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastHost toasts={toasts} onDismiss={(id) => setToasts(prev => prev.filter(t => t.id !== id))} />
    </ToastContext.Provider>
  );
}

// --- Host ---
function ToastHost({ toasts, onDismiss }: { toasts: ToastData[]; onDismiss: (id: number) => void }) {
  const { activeUploads } = useUpload();
  const topInset = Platform.OS === "ios" ? 54 : (StatusBar.currentHeight ?? 24) + 10;

  return (
    <View style={[styles.rootOverlay, { top: topInset }]} pointerEvents="box-none">
      {activeUploads.map((upload) => (
        <UploadBanner key={upload.id} upload={upload} />
      ))}
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </View>
  );
}

// --- Upload banner ---
function UploadBanner({ upload }: { upload: { id: string; progress: number; status: string; type: string } }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(opacity, { toValue: 1, useNativeDriver: true, tension: 40, friction: 7 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 40, friction: 7 }),
    ]).start();
  }, []);

  const label =
    upload.status === "uploading"
      ? upload.type === "video" ? "Envoi de la vidéo..." : upload.type === "texte" ? "Envoi du texte..." : "Envoi de la photo..."
      : upload.status === "success"
      ? upload.type === "video" ? "Vidéo envoyée !" : upload.type === "texte" ? "Texte envoyé !" : "Photo envoyée !"
      : "Erreur lors de l'envoi";

  const iconBg =
    upload.status === "error" ? "rgba(220,38,38,0.08)" :
    upload.status === "success" ? "rgba(22,163,74,0.08)" :
    "rgba(0,0,0,0.05)";

  return (
    <Animated.View style={[styles.card, { opacity, transform: [{ translateY }] }]}>
      <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.45)" }]} />
      <View style={[styles.iconWrapper, { backgroundColor: iconBg }]}>
        {upload.status === "uploading" ? <SpinnerIcon /> : upload.status === "success" ? <CheckIcon /> : <CrossIcon />}
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{label}</Text>
        {upload.status === "uploading" && <AnimatedProgressBar progress={upload.progress} />}
      </View>
    </Animated.View>
  );
}

// --- Toast item ---
function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(opacity, { toValue: 1, useNativeDriver: true, tension: 40, friction: 7 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 40, friction: 7 }),
    ]).start();
  }, []);

  const iconBg =
    toast.type === "success" ? "rgba(22,163,74,0.08)" :
    toast.type === "error" ? "rgba(220,38,38,0.08)" :
    "rgba(37,99,235,0.08)";

  return (
    <Animated.View style={[styles.card, { opacity, transform: [{ translateY }] }]}>
      <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.45)" }]} />
      <View style={[styles.iconWrapper, { backgroundColor: iconBg }]}>
        {toast.type === "success" ? <CheckIcon /> : toast.type === "error" ? <CrossIcon /> : <InfoCircleIcon />}
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{toast.title}</Text>
        {toast.message && <Text style={styles.message}>{toast.message}</Text>}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  rootOverlay: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 999999,
    gap: 8,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    overflow: "hidden",
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  iconWrapper: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    gap: 5,
  },
  title: {
    color: "#111",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  message: {
    color: "rgba(0,0,0,0.5)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  progressTrack: {
    height: 3,
    backgroundColor: "rgba(0,0,0,0.08)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressThumb: {
    height: "100%",
    backgroundColor: "#111",
    borderRadius: 2,
  },
});
