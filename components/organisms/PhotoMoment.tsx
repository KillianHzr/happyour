import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

import { PhotoImage } from "../atoms/PhotoImage";
import { DownloadButton } from "../atoms/DownloadButton";
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
}

const NAVBAR_HEIGHT = 100;

export const PhotoMoment = ({
  moment,
  currentUserId,
  crownWinnerId,
  onOpenPicker,
  onOpenComments,
  isVisible,
  isShrunken = false
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

  const animatedUiStyle = useAnimatedStyle(() => ({
    opacity: isShrunken ? 0 : uiOpacity.value,
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

  const paddingTopBottom = Math.round((Math.max(insets.top, 12) + 24 + NAVBAR_HEIGHT + 12) / 2);

  return (
    <View style={[styles.fullscreenPage, { paddingTop: paddingTopBottom, paddingBottom: paddingTopBottom }]}>
      <View style={styles.momentWrapper}>
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
            {!isTextOnly && !isEffectiveAudio && (
              <Reanimated.View style={[styles.downloadBtnContainer, animatedUiStyle]}>
                <DownloadButton url={effectiveUrl} filename={moment.id} />
              </Reanimated.View>
            )}
            <Reanimated.View style={[styles.momentOverlay, animatedUiStyle]} pointerEvents="box-none">
              <LinearGradient
                colors={["transparent", scrimColor]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <AuthorInfo
                avatar_url={moment.avatar_url}
                username={moment.username}
                created_at={moment.created_at}
                note={!isTextOnly ? effectiveNote : null}
                isCrown={crownWinnerId === moment.user_id}
                isOwn={isOwn}
                hasNewComments={moment.hasNewComments}
                onOpenComments={() => onOpenComments?.(moment.id, moment.user_id)}
                onOpenPicker={() => onOpenPicker?.(moment.id)}
              />
              <ReactionsRow
                reactions={moment.reactions}
                currentUserId={currentUserId}
                photoId={moment.id}
                crownWinnerId={crownWinnerId}
                onOpenPicker={isOwn ? undefined : onOpenPicker}
              />
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
    paddingHorizontal: spacing.md
  },
  momentWrapper: {
    flex: 1,
    width: '100%',
    borderRadius: spacing.xxl,
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
    gap: spacing.md + 2
  },
  downloadBtnContainer: {
    position: "absolute",
    top: spacing.md + 2,
    right: spacing.md + 2,
    zIndex: 10,
  },
});
