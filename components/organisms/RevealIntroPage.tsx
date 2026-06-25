import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { Svg, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurredImageBackground } from "../atoms/BlurredImageBackground";
import { TextSticker } from "../atoms/TextSticker";
import { spacing, typography, radii, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";

const NAVBAR_HEIGHT = 100;

interface RevealIntroPageProps {
  groupName?: string;
  isVisible: boolean;
  customTitle?: string;
  customSubtitle?: string;
  firstPhotoUrl?: string;
  momentsCount?: number;
}

export const RevealIntroPage = ({
  groupName,
  isVisible,
  customTitle,
  customSubtitle,
  firstPhotoUrl,
  momentsCount = 0
}: RevealIntroPageProps) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  const hintOpacity = useRef(new Animated.Value(0)).current;
  const hintY = useRef(new Animated.Value(0)).current;
  const hasPlayed = useRef(false);

  useEffect(() => {
    if (!isVisible || hasPlayed.current) return;
    hasPlayed.current = true;
    opacity.setValue(0);
    scale.setValue(0.9);
    hintOpacity.setValue(0);
    hintY.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, tension: 55, friction: 9, useNativeDriver: true }),
      ]),
      Animated.delay(300),
      Animated.timing(hintOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(hintY, { toValue: 8, duration: 600, useNativeDriver: true }),
          Animated.timing(hintY, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    });
  }, [isVisible]);

  return (
    <View style={[styles.fullscreenPage, { paddingTop: insets.top }]}>
      <View style={styles.momentWrapper}>
        <BlurredImageBackground uri={firstPhotoUrl} />

        <Animated.View style={[styles.middleContainer, { opacity, transform: [{ scale }] }]}>
          <View style={styles.stickerWrapper}>
            <TextSticker
              text={groupName || "—"}
              fontSize={typography.size.titleSm}
              padY={spacing.md}
              uppercase={false}
            />
          </View>

          <View style={styles.titlesContainer}>
            <Text style={styles.mainTitle}>{customTitle ?? "REVEAL"}</Text>
            <Text style={styles.subtitle}>{customSubtitle ?? "de la semaine"}</Text>
          </View>

          {momentsCount > 0 ? (
            <View style={styles.momentsBadge}>
              <Text style={styles.momentsBadgeText}>
                {momentsCount} {momentsCount > 1 ? "moments" : "moment"}
              </Text>
            </View>
          ) : null}
        </Animated.View>

        <Animated.View
          style={[
            styles.revealIntroHint,
            {
              bottom: spacing.lg,
              opacity: hintOpacity,
              transform: [{ translateY: hintY }]
            }
          ]}
        >
          <Text style={styles.revealIntroHintText}>Swipe vers le bas</Text>
        </Animated.View>
      </View>
    </View>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  fullscreenPage: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  momentWrapper: {
    flex: 1,
    width: "100%",
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: "hidden",
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  middleContainer: {
    alignItems: "center",
    gap: spacing.xl,
    zIndex: 10,
  },
  titlesContainer: {
    alignItems: "center",
    gap: spacing.negSm, // var space neg-200 (-8px)
  },
  stickerWrapper: {
    transform: [{ rotate: "-2deg" }],
  },
  mainTitle: {
    fontFamily: typography.family.bold,
    fontSize: typography.size.hero,
    lineHeight: typography.size.hero * 1.20,
    color: colors.text,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: -2,
  },
  subtitle: {
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xxl,
    lineHeight: typography.size.xxl * 1.20,
    color: colors.text,
    textAlign: "center",
    marginTop: spacing.negSm,
  },
  momentsBadge: {
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.opacityLight,
  },
  momentsBadgeText: {
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
    color: colors.text,
    textAlign: "center",
  },
  revealIntroHint: {
    position: "absolute",
    alignItems: "center",
    zIndex: 10,
  },
  revealIntroHintText: {
    fontFamily: typography.family.semibold, // body/font-weight-strong SemiBold
    fontSize: typography.size.md, // body/size-medium (16px)
    lineHeight: typography.size.md * 1.2, // line height 100%
    color: colors.textSecondary,
  },
});
