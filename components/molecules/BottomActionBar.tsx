import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Reanimated, { LinearTransition, FadeIn, FadeOut } from "react-native-reanimated";
import { radii, spacing, typography, textStyles, type ThemeColors } from "../../lib/theme";
import { useThemedStyles } from "../../lib/theme-context";

const AnimatedTouchableOpacity = Reanimated.createAnimatedComponent(TouchableOpacity);

// ─── Layout transition animations (single source of truth) ───────────────────
// `layout` morphs the primary button as the secondary button appears/disappears;
// `enter`/`exit` fade the secondary button in and out.
const transitions = {
  layout: LinearTransition.duration(300),
  // Delay the fade-in so it starts after the primary button has shrunk to make room —
  // otherwise the secondary button fades in on top of (overlapping) the primary one
  // while the layout is still morphing.
  secondaryEnter: FadeIn.duration(300).delay(150),
  secondaryExit: FadeOut.duration(200),
};

export interface BottomActionSecondary {
  /** Stable identity — changing it re-triggers the enter/exit fade (e.g. swapping share ↔ refresh). */
  key: string;
  icon: React.ReactNode;
  onPress: () => void;
}

interface BottomActionBarProps {
  primaryLabel: string;
  onPrimaryPress: () => void;
  /** When non-null, shows a count badge on the primary button. */
  badgeCount?: number | null;
  secondary?: BottomActionSecondary | null;
  /** Grise le bouton principal et bloque l'appui (ex: défi sans réponse). */
  primaryDisabled?: boolean;
}

export const BottomActionBar = ({
  primaryLabel,
  onPrimaryPress,
  badgeCount,
  secondary,
  primaryDisabled = false,
}: BottomActionBarProps) => {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.bottomSection}>
      <AnimatedTouchableOpacity
        key="orange-btn"
        layout={transitions.layout}
        style={[styles.reactionsBtn, primaryDisabled && styles.reactionsBtnDisabled]}
        onPress={onPrimaryPress}
        disabled={primaryDisabled}
        activeOpacity={0.85}
      >
        <Text style={[styles.reactionsBtnText, primaryDisabled && styles.reactionsBtnTextDisabled]}>{primaryLabel}</Text>
        {badgeCount != null && (
          <View style={styles.reactionsBtnBadge}>
            <Text style={styles.reactionsBtnBadgeText}>{badgeCount}</Text>
          </View>
        )}
      </AnimatedTouchableOpacity>

      {secondary && (
        <AnimatedTouchableOpacity
          key={secondary.key}
          entering={transitions.secondaryEnter}
          exiting={transitions.secondaryExit}
          layout={transitions.layout}
          style={styles.placeholderBtn}
          activeOpacity={0.7}
          onPress={secondary.onPress}
        >
          {secondary.icon}
        </AnimatedTouchableOpacity>
      )}
    </View>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  bottomSection: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 100, // NAVBAR_HEIGHT
    backgroundColor: colors.bg,
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingTop: 11,
    gap: spacing.md,
    alignItems: "flex-start",
    zIndex: 10,
  },
  reactionsBtn: {
    flex: 1,
    height: 52,
    backgroundColor: colors.brand,
    borderRadius: radii.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  reactionsBtnDisabled: {
    backgroundColor: colors.bgDisabled, // background/disabled/default
  },
  reactionsBtnText: {
    fontFamily: typography.family.bold,
    fontSize: typography.size.md,
    color: colors.textBrandOnBrandSecondary,
  },
  reactionsBtnTextDisabled: {
    color: colors.textOnDisabled, // text/disabled/on-disabled
  },
  reactionsBtnBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: radii.full,
    backgroundColor: colors.bgInverse,
    justifyContent: "center",
    alignItems: "center",
  },
  reactionsBtnBadgeText: {
    ...textStyles.bodySmall,
    color: colors.textBrandTertiary,
    textAlign: "center",
  },
  placeholderBtn: {
    width: 52,
    height: 52,
    borderRadius: radii.lg,
    backgroundColor: colors.card, // background/default/secondary
    justifyContent: "center",
    alignItems: "center",
  },
});
