import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Pressable,
} from "react-native";
import { radii as themeRadii, shadows, spacing, stroke, textStyles, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles, ForceTheme } from "../../lib/theme-context";
import Svg, { Path } from "react-native-svg";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

/** Rect écran (window) du commentaire visé, mesuré au long-press. */
export interface CommentRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DeleteCommentPopupProps {
  /** Rect écran du commentaire ciblé — le tooltip s'affiche juste en dessous. */
  rect: CommentRect;
  onConfirm: () => void;
  onDismiss: () => void;
}

// Espace entre le bas du commentaire et le tooltip.
const GAP_BELOW = 8;

const DeleteCommentPopupInner = ({
  rect,
  onConfirm,
  onDismiss,
}: DeleteCommentPopupProps) => {
  const { colors } = useTheme();
  const themedStyles = useThemedStyles(makeStyles);

  const popupScale = useRef(new Animated.Value(0.85)).current;
  const popupOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(popupScale, {
        toValue: 1,
        tension: 180,
        friction: 14,
        useNativeDriver: true,
      }),
      Animated.timing(popupOpacity, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Tooltip affiché juste sous le commentaire ciblé, aligné sur son bord gauche.
  const popupTop = rect.y + rect.height + GAP_BELOW;
  const popupLeft = Math.max(spacing.lg, rect.x);

  const handleConfirm = () => {
    onConfirm();
    onDismiss();
  };

  return (
    // 1. Pressable plein écran → capte un tap à l'extérieur pour fermer
    // 2. Tooltip "Supprimer"
    <View style={[StyleSheet.absoluteFill, themedStyles.root]} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />

      <Animated.View
        style={[
          themedStyles.popup,
          {
            top: popupTop,
            left: popupLeft,
            maxWidth: SCREEN_WIDTH - popupLeft - spacing.lg,
            opacity: popupOpacity,
            transform: [{ scale: popupScale }],
          },
        ]}
        pointerEvents="auto"
      >
        <TouchableOpacity
          style={themedStyles.deleteButton}
          onPress={handleConfirm}
          activeOpacity={0.75}
        >
          <Svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <Path d="M14.833 5.99902H5.16699V16.666C5.16699 16.8428 5.23728 17.0127 5.3623 17.1377C5.48722 17.2624 5.65647 17.3329 5.83301 17.333H14.167C14.3435 17.3329 14.5128 17.2624 14.6377 17.1377C14.7627 17.0127 14.833 16.8428 14.833 16.666V5.99902ZM12.333 3.33301C12.333 3.1562 12.2627 2.98635 12.1377 2.86133C12.0128 2.73648 11.8436 2.6661 11.667 2.66602H8.33301C8.15639 2.6661 7.98724 2.73648 7.8623 2.86133C7.73728 2.98635 7.66699 3.1562 7.66699 3.33301V3.99902H12.333V3.33301ZM14.333 3.99902H17.5C18.0522 3.99902 18.4998 4.44689 18.5 4.99902C18.5 5.55131 18.0523 5.99902 17.5 5.99902H16.833V16.666C16.833 17.3732 16.5527 18.0517 16.0527 18.5518C15.5527 19.0518 14.8741 19.3329 14.167 19.333H5.83301C5.12588 19.3329 4.44729 19.0518 3.94727 18.5518C3.44727 18.0517 3.16699 17.3732 3.16699 16.666V5.99902H2.5C1.94772 5.99902 1.5 5.55131 1.5 4.99902C1.50018 4.44689 1.94782 3.99902 2.5 3.99902H5.66699V3.33301C5.66699 2.62592 5.94737 1.94733 6.44727 1.44727C6.94729 0.947245 7.62588 0.666102 8.33301 0.666016H11.667C12.3741 0.666102 13.0527 0.947245 13.5527 1.44727C14.0526 1.94733 14.333 2.62592 14.333 3.33301V3.99902Z" fill={colors.bgDanger} />
          </Svg>
          <Text style={themedStyles.deleteLabel}>Supprimer</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

export const DeleteCommentPopup = (props: DeleteCommentPopupProps) => {
  return (
    <ForceTheme mode="Light">
      <DeleteCommentPopupInner {...props} />
    </ForceTheme>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  root: {
    zIndex: 20,
  },
  // Parent : padding space/200 space/400, colonne, gap space/200, radius/300
  popup: {
    position: "absolute",
    paddingVertical: spacing.sm,      // space/200 = 8
    paddingHorizontal: spacing.lg,    // space/400 = 16
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: spacing.sm,                  // space/200 = 8
    borderRadius: themeRadii.md,      // radius/300 = 12
    backgroundColor: colors.opacityLight,
    borderWidth: stroke.sm,
    borderColor: colors.cardBorder,
    ...shadows.md,
  },
  // Inner : padding space/200, row centré, gap space/200
  deleteButton: {
    flexDirection: "row",
    padding: spacing.sm,             // space/200 = 8
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,                 // space/200 = 8
  },
  deleteLabel: {
    ...textStyles.singleLineBodyBaseStrong,
    color: colors.textDangerTertiary,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
});
