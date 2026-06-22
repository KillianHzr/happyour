import React from "react";
import { Text, StyleSheet, Animated, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { radii, spacing, textStyles, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";

interface StickerToastProps {
  message: string;
  animValue: Animated.Value;
  topInset: number;
  /** Tapping the X dismisses the toast. When omitted, the X is hidden. */
  onClose?: () => void;
}

const CloseIcon = ({ color }: { color: string }) => (
  <Svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <Path
      d="M14.2929 4.29289C14.6834 3.90237 15.3159 3.90237 15.7065 4.29289C16.097 4.68342 16.097 5.31594 15.7065 5.70647L11.4133 9.99968L15.7065 14.2929C16.097 14.6834 16.097 15.3159 15.7065 15.7065C15.3159 16.097 14.6834 16.097 14.2929 15.7065L9.99968 11.4133L5.70647 15.7065C5.31594 16.097 4.68342 16.097 4.29289 15.7065C3.90237 15.3159 3.90237 14.6834 4.29289 14.2929L8.58611 9.99968L4.29289 5.70647C3.90237 5.31594 3.90237 4.68342 4.29289 4.29289C4.68342 3.90237 5.31594 3.90237 5.70647 4.29289L9.99968 8.58611L14.2929 4.29289Z"
      fill={color}
    />
  </Svg>
);

export function StickerToast({ message, animValue, topInset, onClose }: StickerToastProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();

  const translateY = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-80, 0],
    extrapolate: "clamp",
  });

  return (
    <Animated.View
      style={[
        styles.card,
        {
          top: topInset + 8,
          opacity: animValue,
          transform: [{ translateY }],
        },
      ]}
      // box-none so the toast itself doesn't intercept touches, but the close
      // button below still receives them.
      pointerEvents="box-none"
    >
      <Text style={[styles.title, { color: colors.text }]}>{message}</Text>
      {onClose && (
        <Pressable
          onPress={onClose}
          hitSlop={10}
          style={styles.closeButton}
          accessibilityRole="button"
          accessibilityLabel="Fermer"
        >
          <CloseIcon color={colors.icon} />
        </Pressable>
      )}
    </Animated.View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      position: "absolute",
      // 16px side padding so the toast spans almost the whole screen width.
      left: 16,
      right: 16,
      zIndex: 999,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card, // var(--sds-color-background-default-secondary)
      borderRadius: radii.sm, // var(--sds-size-radius-200)
      padding: spacing.lg, // var(--sds-size-space-400)
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 8,
    },
    title: {
      ...textStyles.bodyStrong,
      flex: 1,
    },
    closeButton: {
      marginLeft: spacing.md,
      justifyContent: "center",
      alignItems: "center",
    },
  });
