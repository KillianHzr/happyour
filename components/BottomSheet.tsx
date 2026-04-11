import { useEffect, useRef, useState, useCallback } from "react";
import {
  Animated, PanResponder, StyleSheet, Modal,
  Pressable, View, Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

export default function BottomSheet({ visible, onClose, children }: Props) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(false);
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(600)).current;

  // Each close animation captures its own gen. If a new open arrives before
  // the callback fires, gen increments and the stale callback is ignored.
  const animGenRef = useRef(0);

  const handleCloseRef = useRef<() => void>(() => {});

  const animateOut = useCallback((cb?: () => void) => {
    const myGen = ++animGenRef.current;
    Animated.parallel([
      Animated.timing(overlayAnim, {
        toValue: 0, duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 600, duration: 220,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished && animGenRef.current === myGen) cb?.();
    });
  }, [overlayAnim, translateY]);

  const handleClose = useCallback(() => {
    animateOut(() => {
      setMounted(false);
      onClose();
    });
  }, [animateOut, onClose]);

  handleCloseRef.current = handleClose;

  useEffect(() => {
    if (visible) {
      animGenRef.current++;
      translateY.setValue(600);
      overlayAnim.setValue(0);
      setMounted(true);
      // rAF lets the Modal render its first frame before we hand off to
      // the native driver — eliminates the half-second freeze on open
      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(overlayAnim, {
            toValue: 1, duration: 220,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0, duration: 280,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start();
      });
    } else {
      animateOut(() => setMounted(false));
    }
  }, [visible]);

  // PanResponder lives only on the handle bar — no conflict with inner ScrollViews
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, { dy, dx }) =>
        dy > 2 && Math.abs(dy) > Math.abs(dx),
      onPanResponderMove: (_, { dy }) => {
        if (dy > 0) translateY.setValue(dy);
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > 80 || vy > 0.5) {
          handleCloseRef.current();
        } else {
          Animated.spring(translateY, {
            toValue: 0, useNativeDriver: true,
            tension: 120, friction: 20,
          }).start();
        }
      },
    })
  ).current;

  if (!mounted) return null;

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.root}>
        {/* Overlay */}
        <Animated.View style={[styles.overlay, { opacity: overlayAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>

        {/* Sheet */}
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + 16, transform: [{ translateY }] },
          ]}
        >
          {/* Drag handle — only this area activates the swipe gesture */}
          <View style={styles.handleArea} {...panResponder.panHandlers}>
            <View style={styles.handle} />
          </View>

          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  sheet: {
    backgroundColor: "#161616",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
  },
  // Tall tap/drag target around the handle bar
  handleArea: {
    alignItems: "center",
    paddingTop: 14,
    paddingBottom: 10,
  },
  handle: {
    width: 36, height: 4,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 2,
  },
});
