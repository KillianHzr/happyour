import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  Animated, 
  Dimensions, 
  Platform,
  StatusBar,
  ActivityIndicator
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

// --- Icons Components ---
const SuccessIcon = () => (
  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 6L9 17l-5-5" />
  </Svg>
);

const ErrorIcon = () => (
  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="10" />
    <Path d="M15 9l-6 6M9 9l6 6" />
  </Svg>
);

const InfoIcon = () => (
  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="10" />
    <Path d="M12 16v-4M12 8h.01" />
  </Svg>
);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const nextId = useRef(0);

  const showToast = (title: string, message?: string, type: ToastType = "info") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastHost toasts={toasts} onDismiss={(id) => setToasts(prev => prev.filter(t => t.id !== id))} />
    </ToastContext.Provider>
  );
}

function AnimatedProgressBar({ progress }: { progress: number }) {
  const animatedWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: progress,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const width = animatedWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressThumb, { width }]} />
    </View>
  );
}

function ToastHost({ toasts, onDismiss }: { toasts: ToastData[], onDismiss: (id: number) => void }) {
  const { activeUploads } = useUpload();
  const topInset = Platform.OS === "ios" ? 54 : (StatusBar.currentHeight ?? 24) + 10;

  return (
    <View style={[styles.rootOverlay, { top: topInset }]} pointerEvents="box-none">
      {activeUploads.map((upload) => (
        <View key={upload.id} style={styles.uploadBanner}>
          <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[styles.uploadContent, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
            <View style={styles.uploadHeader}>
              <Text style={styles.uploadTitle}>
                {upload.status === "uploading" ? `Envoi du moment (${upload.type})...` : 
                 upload.status === "success" ? "Moment envoyé !" : "Erreur d'envoi"}
              </Text>
              {upload.status === "uploading" && <ActivityIndicator size="small" color="#FFF" style={{ scaleX: 0.6, scaleY: 0.6 }} />}
            </View>
            {upload.status === "uploading" && (
              <AnimatedProgressBar progress={upload.progress} />
            )}
          </View>
        </View>
      ))}

      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </View>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(opacity, { toValue: 1, useNativeDriver: true, tension: 40, friction: 7 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 40, friction: 7 }),
    ]).start();
  }, []);

  const renderIcon = () => {
    switch (toast.type) {
      case "success": return <SuccessIcon />;
      case "error": return <ErrorIcon />;
      default: return <InfoIcon />;
    }
  };

  return (
    <Animated.View style={[styles.toast, { opacity, transform: [{ translateY }] }]}>
      <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.4)" }]} />
      <View style={styles.iconWrapper}>
        {renderIcon()}
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.toastTitle}>{toast.title}</Text>
        {toast.message && <Text style={styles.toastMessage}>{toast.message}</Text>}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  rootOverlay: {
    position: "absolute",
    left: 20,
    right: 20,
    zIndex: 999999,
    gap: 10,
  },
  uploadBanner: {
    height: 52,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  uploadContent: {
    flex: 1,
    paddingHorizontal: 16,
    justifyContent: "center",
    gap: 6,
  },
  uploadTitle: {
    color: "#FFF",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  progressTrack: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressThumb: {
    height: "100%",
    backgroundColor: "#FFF",
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    overflow: "hidden",
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  toastTitle: {
    color: "#FFF",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  toastMessage: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
});
