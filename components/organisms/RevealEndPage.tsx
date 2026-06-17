import React from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import BlurView from "../atoms/BlurView";
import { ShapebandIcon } from "../atoms/ShapebandIcon";
import { spacing, typography, radii, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { PhotoEntry } from "../../lib/feed-types";
import { supabase } from "../../lib/supabase";

interface RevealEndPageProps {
  photos: PhotoEntry[];
  isVisible: boolean;
  firstPhotoUrl?: string;
}

export const RevealEndPage = ({
  photos,
  isVisible,
  firstPhotoUrl,
}: RevealEndPageProps) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const opacity = React.useRef(new Animated.Value(0)).current;
  const scale = React.useRef(new Animated.Value(0.9)).current;
  const hasPlayed = React.useRef(false);

  const [commentsCount, setCommentsCount] = React.useState(0);
  const stickersCount = React.useMemo(() => {
    return photos.reduce((acc, p) => acc + (p.reactions?.length || 0), 0);
  }, [photos]);

  React.useEffect(() => {
    if (!isVisible || hasPlayed.current) return;
    hasPlayed.current = true;
    opacity.setValue(0);
    scale.setValue(0.9);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, tension: 55, friction: 9, useNativeDriver: true }),
    ]).start();
  }, [isVisible]);

  React.useEffect(() => {
    let active = true;
    const fetchCommentsCount = async () => {
      const photoIds = photos.map((p) => p.id);
      if (photoIds.length === 0) return;
      try {
        const { count, error } = await supabase
          .from("comments")
          .select("*", { count: "exact", head: true })
          .in("photo_id", photoIds);
        if (error) throw error;
        if (active && typeof count === "number") {
          setCommentsCount(count);
        }
      } catch (err) {
        console.error("Error fetching comments count in RevealEndPage:", err);
      }
    };
    fetchCommentsCount();
    return () => {
      active = false;
    };
  }, [photos]);

  const totalReactionsCount = commentsCount + stickersCount;

  return (
    <View style={styles.fullscreenPage}>
      {firstPhotoUrl ? (
        <View style={StyleSheet.absoluteFill}>
          <Image
            source={{ uri: firstPhotoUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          <BlurView intensity={75} tint="dark" style={StyleSheet.absoluteFill} />
        </View>
      ) : null}

      <Animated.View style={[styles.middleContainer, { opacity, transform: [{ scale }] }]}>
        <View style={styles.shapebandContainer}>
          <ShapebandIcon width={180} height={56} />
        </View>

        <View style={styles.titlesContainer}>
          <Text style={styles.mainTitle}>REVEAL</Text>
          <Text style={styles.subtitle}>de la semaine</Text>
        </View>

        <View style={styles.momentsBadge}>
          <Text style={styles.momentsBadgeText}>
            ( {totalReactionsCount} réactions )
          </Text>
        </View>
      </Animated.View>
    </View>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  fullscreenPage: {
    flex: 1,
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg
  },
  middleContainer: {
    alignItems: "center",
    gap: spacing.xl,
    zIndex: 10,
  },
  shapebandContainer: {
    marginBottom: spacing.xs,
  },
  titlesContainer: {
    alignItems: "center",
    gap: spacing.negSm, // var space neg-200 (-8px)
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
});
