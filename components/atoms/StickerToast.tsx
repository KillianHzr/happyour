import React from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import Svg, { Path } from "react-native-svg";
import { radii, spacing, textStyles, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";

interface StickerToastProps {
  message: string;
  animValue: Animated.Value;
  topInset: number;
}

const CheckIcon = () => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 6L9 17l-5-5" />
  </Svg>
);

const TrashIcon = () => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
  </Svg>
);

export function StickerToast({ message, animValue, topInset }: StickerToastProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const isDelete = message.includes("supprimé");

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
      pointerEvents="none"
    >
      <View style={[styles.iconWrapper, { backgroundColor: isDelete ? "rgba(220,38,38,0.08)" : "rgba(22,163,74,0.08)" }]}>
        {isDelete ? <TrashIcon /> : <CheckIcon />}
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{message}</Text>
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
    iconWrapper: {
      width: 34,
      height: 34,
      borderRadius: radii.lg,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    title: {
      ...textStyles.bodyStrong,
      flex: 1,
    },
  });
