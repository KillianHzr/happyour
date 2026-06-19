import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { radii, spacing, typography, type ThemeColors } from "../../lib/theme";
import { useThemedStyles } from "../../lib/theme-context";

interface PostCountBadgeProps {
  /** e.g. "2/5". When empty/undefined the badge renders nothing. */
  text?: string;
}

export const PostCountBadge = ({ text }: PostCountBadgeProps) => {
  const styles = useThemedStyles(makeStyles);
  if (!text) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  badge: {
    backgroundColor: colors.opacityLight,
    borderRadius: radii.md,
    paddingTop: spacing.xs,
    paddingRight: spacing.sm,
    paddingBottom: spacing.xs,
    paddingLeft: spacing.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    color: colors.text,
    fontFamily: typography.family.bold,
    fontSize: typography.size.xxs,
    lineHeight: typography.size.xxs * 1.4, // headroom so glyphs aren't clipped at the top on iOS
  },
});
