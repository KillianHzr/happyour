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
import { typography, radii as themeRadii, shadows, spacing, stroke, textStyles, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles, ForceTheme } from "../../lib/theme-context";
import Svg, { Path } from "react-native-svg";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const POPUP_WIDTH = 160;
const POPUP_HEIGHT = 40;
// How many px above the finger the popup card appears
const POPUP_OFFSET_ABOVE = 60;

interface DeleteCommentPopupProps {
  /** Absolute screen Y of the long-press touch */
  anchorY: number;
  /**
   * Absolute screen Y where the comment sheet starts.
   * The dark scrim is confined to [sheetTopY → bottom of screen]
   * so it only darkens the comment panel, not the photo behind it.
   */
  sheetTopY: number;
  onConfirm: () => void;
  onDismiss: () => void;
}

const DeleteCommentPopupInner = ({
  anchorY,
  sheetTopY,
  onConfirm,
  onDismiss,
}: DeleteCommentPopupProps) => {
  const { colors } = useTheme();
  const themedStyles = useThemedStyles(makeStyles);

  const scrimOpacity = useRef(new Animated.Value(0)).current;
  const popupScale = useRef(new Animated.Value(0.85)).current;
  const popupOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scrimOpacity, {
        toValue: 0.2,
        duration: 180,
        useNativeDriver: true,
      }),
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

  // Popup sits above the finger, but never above the top of the sheet
  const rawPopupTop = anchorY - POPUP_OFFSET_ABOVE - POPUP_HEIGHT;
  const popupTop = Math.max(sheetTopY + 16, rawPopupTop);
  const popupLeft = (SCREEN_WIDTH - POPUP_WIDTH) / 2;

  const handleConfirm = () => {
    onConfirm();
    onDismiss();
  };

  return (
    // ─── Layer order (bottom → top) ───────────────────────────────────────────
    // 1. Full-screen Pressable  → catches any outside tap to dismiss
    // 2. Scrim                  → dark fill confined to comment sheet area only
    // 3. Popup card             → the actual "Supprimer" button
    // ─────────────────────────────────────────────────────────────────────────
    <View style={[StyleSheet.absoluteFill, themedStyles.root]} pointerEvents="box-none">
      {/* 1. Dismiss catcher — behind everything else in this overlay */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />

      {/* 2. Scrim — confined to comment section, no touch events */}
      <Animated.View
        style={[
          themedStyles.scrim,
          {
            top: sheetTopY,
            opacity: scrimOpacity,
          },
        ]}
        pointerEvents="none"
      />

      {/* 3. Popup card */}
      <Animated.View
        style={[
          themedStyles.popup,
          {
            top: popupTop,
            left: popupLeft,
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
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#0C0C0D",
  },
  popup: {
    position: "absolute",
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    borderRadius: themeRadii.lg,
    backgroundColor: colors.opacityLight,
    borderWidth: stroke.sm,
    borderColor: colors.cardBorder,
    overflow: "hidden",
    ...shadows.md,
  },
  deleteButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  deleteLabel: {
    ...textStyles.singleLineBodyBaseStrong,
    color: colors.textDangerTertiary,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
});
