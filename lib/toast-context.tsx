import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { Animated, Text, StyleSheet, View, Platform, StatusBar } from "react-native";

type ToastType = "error" | "success" | "info";

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

// Shared state so ToastHost can render toasts from anywhere
let _setToasts: React.Dispatch<React.SetStateAction<ToastData[]>> | null = null;
let _nextId = 0;

function _showToast(title: string, message?: string, type: ToastType = "error") {
  if (!_setToasts) return;
  const id = _nextId++;
  _setToasts((prev) => [...prev, { id, title, message, type }]);
  setTimeout(() => {
    _setToasts?.((prev) => prev.filter((t) => t.id !== id));
  }, 3200);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const showToast = useCallback((title: string, message?: string, type?: ToastType) => {
    _showToast(title, message, type);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
    </ToastContext.Provider>
  );
}

/**
 * Render this component at the VERY TOP of your component tree,
 * AFTER all other views, so it sits above everything.
 */
export function ToastHost() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  useEffect(() => {
    _setToasts = setToasts;
    return () => { _setToasts = null; };
  }, []);

  if (toasts.length === 0) return null;

  const topInset = Platform.OS === "ios" ? 58 : (StatusBar.currentHeight ?? 24) + 12;

  return (
    <View style={[styles.rootOverlay, { top: topInset }]} pointerEvents="box-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))} />
      ))}
    </View>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(opacity, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 0 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 4 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 4 }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -20, duration: 250, useNativeDriver: true }),
      ]).start(() => onDismiss());
    }, 2700);

    return () => clearTimeout(timer);
  }, []);

  const accentColor =
    toast.type === "success" ? "#34D399" :
    toast.type === "info" ? "#60A5FA" :
    "#F87171";

  return (
    <Animated.View style={[styles.toast, { opacity, transform: [{ translateY }, { scale }], borderLeftColor: accentColor }]}>
      <View style={[styles.dot, { backgroundColor: accentColor }]} />
      <View style={styles.textContainer}>
        <Text style={styles.toastTitle} numberOfLines={1}>{toast.title}</Text>
        {toast.message ? <Text style={styles.toastMessage} numberOfLines={2}>{toast.message}</Text> : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  rootOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "flex-end",
    paddingHorizontal: 16,
    zIndex: 2147483647,
    elevation: 2147483647,
    gap: 8,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15,15,15,0.97)",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    maxWidth: 320,
    minWidth: 180,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 2147483647,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  textContainer: {
    flex: 1,
  },
  toastTitle: {
    color: "#FFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  toastMessage: {
    color: "rgba(255,255,255,0.55)",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
});
