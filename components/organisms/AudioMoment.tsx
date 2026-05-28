import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useVideoPlayer, VideoView } from "expo-video";
import { colors, spacing, radii, typography } from "../../lib/theme";

import { PhotoImage } from "../atoms/PhotoImage";
import { DownloadButton } from "../atoms/DownloadButton";
import { SecondCaptureThumbnail } from "../molecules/SecondCaptureThumbnail";
import { AuthorInfo } from "../molecules/AuthorInfo";
import { ReactionsRow } from "../molecules/ReactionsRow";
import { AudioPlayerView } from "../molecules/AudioPlayerView";
import { r2Storage } from "../../lib/r2";
import { PhotoEntry } from "../../lib/feed-types";

const NAVBAR_HEIGHT = 100;

export const AudioMoment = ({
  moment,
  currentUserId,
  crownWinnerId,
  onOpenPicker,
  onOpenComments,
  isVisible,
  onScrollLock
}: AudioMomentProps) => {
  const insets = useSafeAreaInsets();
  const [swapped, setSwapped] = useState(false);
  const isOwn = moment.user_id === currentUserId;

  const uiOpacity = useSharedValue(1);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const animatedUiStyle = useAnimatedStyle(() => ({
    opacity: uiOpacity.value,
  }));

  const hasSecond = !!moment.second_image_path;
  
  // Players
  const primaryAudioUrl = moment.audio_note_path ? r2Storage.getPublicUrl(moment.audio_note_path) : moment.url;
  const secondaryUrl = hasSecond ? (moment.second_image_path === "text_mode" ? "" : r2Storage.getPublicUrl(moment.second_image_path!)) : "";
  
  const isPrimaryAudio = moment.image_path.endsWith(".m4a");
  const isSecondaryAudio = hasSecond && moment.second_image_path!.endsWith(".m4a");
  const isSecondaryVideo = hasSecond && moment.second_image_path!.endsWith(".mp4");
  const isPrimaryVideo = moment.image_path.endsWith(".mp4");

  const player = useAudioPlayer(!swapped ? primaryAudioUrl : (isSecondaryAudio ? secondaryUrl : ""));
  const status = useAudioPlayerStatus(player);

  const videoPlayer = useVideoPlayer((!swapped && isPrimaryVideo) ? moment.url : (swapped && isSecondaryVideo ? secondaryUrl : null), (p) => {
    p.loop = true;
  });

  useEffect(() => { 
    if (!isVisible) {
      player.pause();
      videoPlayer.pause();
    } else if (!swapped && isPrimaryVideo) {
      videoPlayer.play();
    } else if (swapped && isSecondaryVideo) {
      videoPlayer.play();
    }
  }, [isVisible, swapped, isPrimaryVideo, isSecondaryVideo]);

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

  const renderContent = () => {
    const path = swapped && hasSecond ? moment.second_image_path! : moment.image_path;
    const url = swapped && hasSecond ? secondaryUrl : moment.url;
    
    if (path === "text_mode") {
      const textLen = moment.second_note?.length ?? 0;
      const fontSize = textLen <= 40 ? 32 : textLen <= 100 ? 26 : textLen <= 200 ? 21 : textLen <= 300 ? 17 : 15;
      return (
        <View style={styles.textMomentBg}>
          <View style={styles.quoteContainer}>
            <Text style={[styles.textMomentContent, { fontSize, lineHeight: Math.round(fontSize * 1.4) }]}>
              {moment.second_note}
            </Text>
          </View>
        </View>
      );
    }

    const isAudio = path.endsWith(".m4a");
    const isVideo = path.endsWith(".mp4");
    const isDrawing = path.includes("_draw");

    if (isAudio) {
      return <AudioPlayerView player={player} status={status} onScrollLock={onScrollLock} waveform={moment.waveform || undefined} />;
    }

    if (isVideo) {
      return <VideoView player={videoPlayer} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
    }

    return <PhotoImage url={url} isDrawing={isDrawing} />;
  };

  const isAudioCaption = !!moment.audio_note_path;
  const showAudioPlayerInOverlay = (isPrimaryAudio || isAudioCaption) && !swapped;

  const overlayNote = swapped && hasSecond ? moment.second_note : moment.note;
  const paddingTopBottom = Math.round((Math.max(insets.top, 12) + 24 + NAVBAR_HEIGHT + 12) / 2);

  return (
    <View style={[styles.fullscreenPage, { paddingTop: paddingTopBottom, paddingBottom: paddingTopBottom }]}>
      <View style={styles.momentWrapper}>
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={StyleSheet.absoluteFill}
        >
          {renderContent()}
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {moment.groupName && (
              <Reanimated.View style={[styles.groupTag, animatedUiStyle]} pointerEvents="none">
                <Text style={styles.groupTagText}>{moment.groupName}</Text>
              </Reanimated.View>
            )}
            {swapped && hasSecond && moment.second_image_path !== "text_mode" && (
              <Reanimated.View style={[styles.downloadBtnContainer, animatedUiStyle]}>
                <DownloadButton url={secondaryUrl} filename={`${moment.id}_2`} />
              </Reanimated.View>
            )}
            <Reanimated.View style={[styles.momentOverlay, animatedUiStyle]} pointerEvents="box-none">
              <LinearGradient 
                colors={["transparent", "rgba(0,0,0,0.92)"]} 
                style={StyleSheet.absoluteFill} 
                pointerEvents="none" 
              />
              <AuthorInfo
                avatar_url={moment.avatar_url}
                username={moment.username}
                created_at={moment.created_at}
                note={overlayNote}
                audioPlayer={showAudioPlayerInOverlay ? player : undefined}
                audioStatus={showAudioPlayerInOverlay ? status : undefined}
                onScrollLock={showAudioPlayerInOverlay ? onScrollLock : undefined}
                captionWaveform={moment.caption_waveform || undefined}
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
                onOpenPicker={onOpenPicker} 
              />
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
      </View>
    </View>
  );
};

interface AudioMomentProps {
  moment: PhotoEntry;
  currentUserId?: string;
  crownWinnerId?: string | null;
  onOpenPicker?: (photoId: string) => void;
  onOpenComments?: (photoId: string, ownerId: string) => void;
  isVisible?: boolean;
  onScrollLock?: (locked: boolean) => void;
}

const styles = StyleSheet.create({
  fullscreenPage: { 
    width: "100%", 
    height: "100%", 
    justifyContent: "center", 
    alignItems: "center", 
    backgroundColor: colors.black, 
    paddingHorizontal: spacing.md 
  },
  momentWrapper: { 
    flex: 1, 
    width: '100%', 
    borderRadius: radii.xl, 
    overflow: "hidden", 
    backgroundColor: "transparent" 
  },
  groupTag: { 
    position: "absolute", 
    top: spacing.md, 
    left: spacing.md, 
    zIndex: 5, 
    backgroundColor: colors.overlay, 
    borderRadius: radii.md, 
    paddingHorizontal: 10, 
    paddingVertical: 5, 
    borderWidth: 1, 
    borderColor: colors.cardBorder 
  },
  groupTagText: { 
    color: colors.white, 
    fontSize: typography.size.xs, 
    fontFamily: typography.family.semibold 
  },
  textMomentBg: { 
    flex: 1, 
    width: "100%", 
    justifyContent: "center", 
    alignItems: "center", 
    padding: spacing.xxl, 
    backgroundColor: colors.black 
  },
  quoteContainer: { 
    width: "100%", 
    alignItems: "center", 
    gap: spacing.xxl 
  },
  textMomentContent: { 
    fontFamily: typography.family.bold, 
    color: colors.white, 
    textAlign: "center", 
    letterSpacing: -0.5 
  },
  momentOverlay: { 
    position: "absolute", 
    bottom: 0, 
    left: 0, 
    right: 0, 
    padding: spacing.xl, 
    paddingBottom: spacing.xxl, 
    paddingTop: 80, 
    gap: spacing.md 
  },
  downloadBtnContainer: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    zIndex: 10,
  },
});
