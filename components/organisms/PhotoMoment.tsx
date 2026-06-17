import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

import { PhotoImage } from "../atoms/PhotoImage";
import { SecondCaptureThumbnail } from "../molecules/SecondCaptureThumbnail";
import { AuthorInfo } from "../molecules/AuthorInfo";
import { ReactionsRow } from "../molecules/ReactionsRow";
import { AudioPlayerView } from "../molecules/AudioPlayerView";
import { r2Storage } from "../../lib/r2";
import { radii, spacing, typography, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";

import { PhotoEntry, Reaction } from "../../lib/feed-types";

interface PhotoMomentProps {
  moment: PhotoEntry;
  currentUserId?: string;
  crownWinnerId?: string | null;
  onOpenPicker?: (photoId: string) => void;
  onOpenComments?: (photoId: string, ownerId: string) => void;
  isVisible?: boolean;
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

export const PhotoMoment = ({
  moment,
  currentUserId,
  crownWinnerId,
  onOpenPicker,
  onOpenComments,
  isVisible,
  isShrunken = false,
  postCountText,
}: PhotoMomentProps) => {
  const insets = useSafeAreaInsets();
  const { mode } = useTheme();
  const styles = useThemedStyles(makeStyles);
  // Scrim gradient over media: flips so the (themed) author text stays readable.
  const scrimColor = mode === "Dark" ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.85)";
  const [swapped, setSwapped] = useState(false);
  const isOwn = moment.user_id === currentUserId;

  const uiOpacity = useSharedValue(1);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fade the in-preview UI (author, description, gradient, badges) in/out when
  // entering/exiting comments instead of hard-toggling it.
  const shrinkProgress = useSharedValue(isShrunken ? 1 : 0);
  useEffect(() => {
    shrinkProgress.value = withTiming(isShrunken ? 1 : 0, { duration: 250 });
  }, [isShrunken]);

  const animatedUiStyle = useAnimatedStyle(() => ({
    opacity: uiOpacity.value * (1 - shrinkProgress.value),
  }));

  const hasSecond = !!moment.second_image_path;
  const effectivePath = swapped && hasSecond ? moment.second_image_path! : moment.image_path;
  const effectiveNote = swapped && hasSecond ? moment.second_note : moment.note;
  const effectiveUrl = swapped && hasSecond
    ? (moment.second_image_path === "text_mode" ? "" : r2Storage.getPublicUrl(moment.second_image_path!))
    : moment.url;

  const thumbnailPath = hasSecond ? (swapped ? moment.image_path : moment.second_image_path!) : null;
  const thumbnailNote = swapped ? moment.note : moment.second_note;

  const swapFade = useRef(new Animated.Value(1)).current;
  const handleSwap = () => {
    Animated.timing(swapFade, { toValue: 0, duration: 80, useNativeDriver: true }).start(() => {
      setSwapped(v => !v);
      Animated.timing(swapFade, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    });
  };

  const isTextOnly = effectivePath === "text_mode";
  const isDrawing = effectivePath.includes("_draw");
  const isEffectiveAudio = effectivePath.endsWith(".m4a");
  const isEffectiveVideo = effectivePath.endsWith(".mp4");

  const textLen = effectiveNote?.length ?? 0;
  const fontSize = textLen <= 40 ? 32 : textLen <= 100 ? 26 : textLen <= 200 ? 21 : textLen <= 300 ? 17 : 15;

  // Audio player for swapped audio second capture
  const audioPlayer = useAudioPlayer(isEffectiveAudio ? effectiveUrl : "");
  const audioStatus = useAudioPlayerStatus(audioPlayer);

  useEffect(() => {
    if (!isEffectiveAudio || isVisible === false) audioPlayer.pause();
  }, [isEffectiveAudio, isVisible]);

  // Video player for swapped video second capture
  const videoPlayer = useVideoPlayer(isEffectiveVideo ? effectiveUrl : null, (p) => {
    p.loop = true;
  });

  useEffect(() => {
    if (isEffectiveVideo && isVisible) videoPlayer.play();
    else videoPlayer.pause();
  }, [isEffectiveVideo, isVisible]);

  const renderMainContent = () => {
    if (isTextOnly) {
      return (
        <View style={styles.textMomentBg}>
          <View style={styles.quoteContainer}>
            <Text style={[styles.textMomentContent, { fontSize, lineHeight: Math.round(fontSize * 1.4) }]}>
              {effectiveNote}
            </Text>
          </View>
        </View>
      );
    }
    if (isEffectiveAudio) {
      return <AudioPlayerView player={audioPlayer} status={audioStatus} />;
    }
    if (isEffectiveVideo) {
      return (
        <VideoView
          player={videoPlayer}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
        />
      );
    }
    return (
      <PhotoImage
        url={effectiveUrl}
        fallback_url={swapped ? undefined : moment.fallback_url}
        isDrawing={isDrawing}
      />
    );
  };

  const handlePressIn = () => {
    if (!isTextOnly) {
      holdTimer.current = setTimeout(() => {
        uiOpacity.value = withTiming(0, { duration: 200 });
      }, 300);
    }
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
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: swapFade }]}>
          {renderMainContent()}
        </Animated.View>

        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={StyleSheet.absoluteFill}
        >
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
                  {postCountText ? (
                    <View style={styles.postCountBadge}>
                      <Text style={styles.postCountText}>{postCountText}</Text>
                    </View>
                  ) : null}
                </View>
                <AuthorInfo
                  avatar_url={moment.avatar_url}
                  username={moment.username}
                  created_at={moment.created_at}
                  note={!isTextOnly ? effectiveNote : null}
                  isCrown={false}
                  isOwn={isOwn}
                  hasNewComments={moment.hasNewComments}
                  onOpenComments={() => onOpenComments?.(moment.id, moment.user_id)}
                  onOpenPicker={() => onOpenPicker?.(moment.id)}
                />
              </View>
            </Reanimated.View>
            {thumbnailPath && (
              <Reanimated.View style={[StyleSheet.absoluteFill, animatedUiStyle]} pointerEvents="box-none">
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: swapFade }]} pointerEvents="box-none">
                  <SecondCaptureThumbnail
                    secondPath={thumbnailPath}
                    secondNote={thumbnailNote}
                    onPress={handleSwap}
                  />
                </Animated.View>
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
  postCountBadge: {
    backgroundColor: colors.opacityLight,
    borderRadius: radii.md,
    paddingTop: spacing.xs,
    paddingRight: spacing.sm,
    paddingBottom: spacing.xs,
    paddingLeft: spacing.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  postCountText: {
    color: colors.text,
    fontFamily: typography.family.bold,
    fontSize: typography.size.xxs,
    lineHeight: typography.size.xxs,
  },
});
