import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Animated,
  Dimensions,
  StyleSheet,
  Easing,
  type ViewStyle,
} from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface RightSlideModalProps {
  visible: boolean;
  onRequestClose?: () => void;
  /** Keep the native modal transparent so the screen behind shows during the slide. */
  transparent?: boolean;
  statusBarTranslucent?: boolean;
  style?: ViewStyle;
  children: React.ReactNode;
}

/**
 * A full-screen modal that slides in from the right (and back out to the right)
 * instead of the OS default bottom slide. React Native's `<Modal animationType>`
 * has no horizontal option, so we drive a `translateX` ourselves and keep the
 * modal mounted until the exit animation finishes.
 */
export function RightSlideModal({
  visible,
  onRequestClose,
  transparent = true,
  statusBarTranslucent,
  style,
  children,
}: RightSlideModalProps) {
  const [mounted, setMounted] = useState(visible);
  const translateX = useRef(new Animated.Value(visible ? 0 : SCREEN_WIDTH)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(translateX, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }).start();
    } else if (mounted) {
      Animated.timing(translateX, {
        toValue: SCREEN_WIDTH,
        duration: 250,
        useNativeDriver: true,
        easing: Easing.in(Easing.cubic),
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent={transparent}
      animationType="none"
      onRequestClose={onRequestClose}
      statusBarTranslucent={statusBarTranslucent}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }, style]}>
        {children}
      </Animated.View>
    </Modal>
  );
}
