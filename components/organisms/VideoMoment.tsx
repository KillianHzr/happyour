import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import { Svg, Path } from "react-native-svg";

import { PhotoImage } from "../atoms/PhotoImage";
import { SecondCaptureThumbnail } from "../molecules/SecondCaptureThumbnail";
import { AuthorInfo } from "../molecules/AuthorInfo";
import { ReactionsRow } from "../molecules/ReactionsRow";
import { PostCountBadge } from "../molecules/PostCountBadge";
import { r2Storage } from "../../lib/r2";
import { radii, spacing, typography, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { PhotoEntry, Reaction } from "../../lib/feed-types";

interface VideoMomentProps {
  moment: PhotoEntry;
  currentUserId?: string;
  crownWinnerId?: string | null;
  onOpenPicker?: (photoId: string) => void;
  onOpenComments?: (photoId: string, ownerId: string) => void;
  isVisible?: boolean;
  cachedUrl: string;
  isShrunken?: boolean;
  postCountText?: string;
}

const NAVBAR_HEIGHT = 100;

const getDayText = (dateStr: string) => {
  const d = new Date(dateStr);
  const day = d.toLocaleDateString("fr-FR", { weekday: "long" });
  return day.charAt(0).toUpperCase() + day.slice(1);
};

const getTimeText = (dateStr: string) => {
  const d = new Date(dateStr);
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

export const VideoMoment = ({
  moment,
  currentUserId,
  crownWinnerId,
  onOpenPicker,
  onOpenComments,
  isVisible,
  cachedUrl,
  isShrunken = false,
  postCountText,
}: VideoMomentProps) => {
  const insets = useSafeAreaInsets();
  const { colors, mode } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const scrimColor = mode === "Dark" ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.85)";
  const [isPaused, setIsPaused] = useState(false);
  const [swapped, setSwapped] = useState(false);
  const isOwn = moment.user_id === currentUserId;

  const uiOpacity = useSharedValue(1);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fade the in-preview UI in/out when entering/exiting comments instead of toggling.
  const shrinkProgress = useSharedValue(isShrunken ? 1 : 0);
  useEffect(() => {
    shrinkProgress.value = withTiming(isShrunken ? 1 : 0, { duration: 250 });
  }, [isShrunken]);

  const animatedUiStyle = useAnimatedStyle(() => ({
    opacity: uiOpacity.value * (1 - shrinkProgress.value),
  }));

  const hasSecond = !!moment.second_image_path;
  const player = useVideoPlayer((!swapped && cachedUrl) ? cachedUrl : null, (p) => {
    p.loop = true;
    p.muted = false;
  });

  const isVisibleRef = useRef(isVisible ?? false);
  const isPausedRef = useRef(isPaused);
  const playerRef = useRef(player);
  playerRef.current = player;

  useEffect(() => {
    isVisibleRef.current = isVisible ?? false;
    isPausedRef.current = isPaused;
    if (isVisible && !isPaused) {
      playerRef.current.play();
    } else {
      playerRef.current.pause();
    }
  }, [isVisible, isPaused]);

  useEffect(() => {
    if (!player) return;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    const subscription = player.addListener("playingChange", ({ isPlaying }) => {
      if (!isPlaying && isVisibleRef.current && !isPausedRef.current) {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          stallTimer = null;
          if (isVisibleRef.current && !isPausedRef.current) player.play();
        }, 200);
      }
    });
    if (isVisibleRef.current && !isPausedRef.current) player.play();
    return () => {
      if (stallTimer) clearTimeout(stallTimer);
      subscription.remove();
    };
  }, [player]);

  useEffect(() => {
    if (!isVisible) setIsPaused(false);
  }, [isVisible]);

  const handlePressIn = () => {
    holdTimer.current = setTimeout(() => {
      uiOpacity.value = withTiming(0, { duration: 200 });
    }, 300);
  };

  const handlePressOut = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    uiOpacity.value = withTiming(1, { duration: 200 });
  };

  const paddingTop = insets.top;
  const paddingBottom = 0;

  const renderContent = () => {
    if (swapped && hasSecond) {
      const secondPath = moment.second_image_path!;
      const secondIsText = secondPath === "text_mode";
      const secondIsDrawing = secondPath.includes("_draw");
      const secondUrl = secondIsText ? "" : r2Storage.getPublicUrl(secondPath);
      const secondNote = moment.second_note;
      const textLen = secondNote?.length ?? 0;
      const fontSize = textLen <= 40 ? 32 : textLen <= 100 ? 26 : textLen <= 200 ? 21 : textLen <= 300 ? 17 : 15;

      if (secondIsText) {
        return (
          <View style={styles.textMomentBg}>
            <View style={styles.quoteContainer}>
              <Text style={[styles.textMomentContent, { fontSize, lineHeight: Math.round(fontSize * 1.4) }]}>
                {secondNote}
              </Text>
            </View>
          </View>
        );
      }
      return <PhotoImage url={secondUrl} isDrawing={secondIsDrawing} />;
    }

    return (
      <>
        <View style={[StyleSheet.absoluteFill, { justifyContent: "center", alignItems: "center" }]} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.textMuted} />
        </View>
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
        {isVisible && isPaused && (
          <View style={styles.pauseOverlay} pointerEvents="none">
            <View style={styles.pauseCircle}>
              <Svg width="24" height="24" viewBox="0 0 24 24" fill={colors.text}>
                <Path d="M8 5v14l11-7z" />
              </Svg>
            </View>
          </View>
        )}
      </>
    );
  };

  const overlayNote = swapped && hasSecond ? moment.second_note : moment.note;

  const animatedWrapperStyle = useAnimatedStyle(() => {
    const radius = withTiming(isShrunken ? radii.xxl : radii.xl, { duration: 250 });
    const bottomRadius = withTiming(isShrunken ? radii.xxl : 0, { duration: 250 });
    return {
      borderTopLeftRadius: radius,
      borderTopRightRadius: radius,
      borderBottomLeftRadius: bottomRadius,
      borderBottomRightRadius: bottomRadius,
    };
  });

  return (
    <View style={[styles.fullscreenPage, { paddingTop, paddingBottom }]}>
      <Reanimated.View style={[styles.momentWrapper, animatedWrapperStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => !swapped && setIsPaused((v) => !v)}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          {renderContent()}
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {moment.groupName && (
              <Reanimated.View style={[styles.groupTag, animatedUiStyle]} pointerEvents="none">
                <Text style={styles.groupTagText}>{moment.groupName}</Text>
              </Reanimated.View>
            )}
            <Reanimated.View style={[styles.momentOverlay, animatedUiStyle]} pointerEvents="box-none">
              <LinearGradient
                colors={["transparent", scrimColor]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={styles.detailsContainer} pointerEvents="box-none">
                <View style={styles.topInfoRow} pointerEvents="none">
                  <View style={styles.topLeftInfo}>
                    <Text style={styles.dayText}>{getDayText(moment.created_at)}</Text>
                    <Text style={styles.timeText}>{getTimeText(moment.created_at)}</Text>
                  </View>
                  <PostCountBadge text={postCountText} />
                </View>
                <AuthorInfo
                  avatar_url={moment.avatar_url}
                  username={moment.username}
                  created_at={moment.created_at}
                  note={overlayNote}
                  isCrown={false}
                  isOwn={isOwn}
                  hasNewComments={moment.hasNewComments}
                  onOpenComments={() => onOpenComments?.(moment.id, moment.user_id)}
                  onOpenPicker={() => onOpenPicker?.(moment.id)}
                />
              </View>
            </Reanimated.View>
            {hasSecond && (
              <Reanimated.View style={[StyleSheet.absoluteFill, animatedUiStyle]} pointerEvents="box-none">
                <SecondCaptureThumbnail
                  secondPath={swapped ? moment.image_path : moment.second_image_path!}
                  secondNote={swapped ? moment.note : moment.second_note}
                  onPress={() => setSwapped(v => !v)}
                />
              </Reanimated.View>
            )}
          </View>
        </Pressable>
      </Reanimated.View>
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
    paddingHorizontal: 0
  },
  momentWrapper: {
    flex: 1,
    width: '100%',
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: "hidden",
    backgroundColor: "transparent"
  },
  groupTag: {
    position: "absolute",
    top: spacing.md + 2,
    left: spacing.md + 2,
    zIndex: 5,
    backgroundColor: colors.opacityLight,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    borderWidth: 1,
    borderColor: colors.cardBorder
  },
  groupTagText: {
    color: colors.text,
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold
  },
  textMomentBg: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xxl,
    backgroundColor: colors.bg
  },
  quoteContainer: {
    width: "100%",
    alignItems: "center",
    gap: spacing.xxl
  },
  textMomentContent: {
    fontFamily: typography.family.bold,
    color: colors.text,
    textAlign: "center",
    letterSpacing: -0.5
  },
  momentOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.xl + 2,
    paddingBottom: spacing.xxl,
    paddingTop: 80,
  },
  detailsContainer: {
    width: "100%",
    gap: 9,
  },
  topInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  topLeftInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dayText: {
    color: colors.text,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.md,
    lineHeight: typography.size.md * 1.4,
  },
  timeText: {
    color: colors.textSecondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * 1.4,
  },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center"
  },
  pauseCircle: {
    width: 64,
    height: 64,
    borderRadius: radii.xl,
    backgroundColor: colors.opacityLight,
    justifyContent: "center",
    alignItems: "center"
  },
});
