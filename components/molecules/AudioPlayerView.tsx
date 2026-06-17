import React, { useState, useRef, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, PanResponder } from "react-native";
import { Svg, Path } from "react-native-svg";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { spacing, radii, typography, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { Waveform } from "../atoms/Waveform";

interface AudioPlayerViewProps {
  player: ReturnType<typeof useAudioPlayer>;
  status: ReturnType<typeof useAudioPlayerStatus>;
  onScrollLock?: (locked: boolean) => void;
  waveform?: number[];
}

function fmtAudio(s: number) {
  if (!isFinite(s) || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export const AudioPlayerView = ({ player, status, onScrollLock, waveform }: AudioPlayerViewProps) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const seekWidthRef = useRef(1);
  const seekOriginXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const dragRatioRef = useRef(0);
  const lastSeekTimeRef = useRef(0);
  const playerRef = useRef(player);
  const durationRef = useRef(0);
  const fillRef = useRef<View>(null);
  const thumbRef = useRef<View>(null);

  useEffect(() => { playerRef.current = player; }, [player]);
  useEffect(() => { durationRef.current = status.duration ?? 0; }, [status.duration]);

  const progress = status.duration > 0 ? (status.currentTime ?? 0) / status.duration : 0;

  useEffect(() => {
    if (isDraggingRef.current) return;
    fillRef.current?.setNativeProps({ style: { width: `${progress * 100}%` } });
    thumbRef.current?.setNativeProps({ style: { left: `${Math.min(progress * 100, 100)}%` } });
  }, [progress]);

  const togglePlay = () => {
    if (status.playing) { player.pause(); }
    else {
      if ((status.duration ?? 0) > 0 && (status.currentTime ?? 0) >= (status.duration ?? 0) - 0.1) player.seekTo(0);
      player.play();
    }
  };

  const SPEEDS = [0.5, 1, 1.5, 2];
  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(playbackSpeed) + 1) % SPEEDS.length];
    setPlaybackSpeed(next);
    player.setPlaybackRate(next);
  };

  const seekPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt) => {
        seekOriginXRef.current = evt.nativeEvent.pageX - evt.nativeEvent.locationX;
        isDraggingRef.current = true;
        onScrollLock?.(true);
        const ratio = Math.max(0, Math.min(1, evt.nativeEvent.locationX / seekWidthRef.current));
        dragRatioRef.current = ratio;
        fillRef.current?.setNativeProps({ style: { width: `${ratio * 100}%` } });
        thumbRef.current?.setNativeProps({ style: { left: `${Math.min(ratio * 100, 100)}%` } });
      },
      onPanResponderMove: (evt) => {
        const relX = evt.nativeEvent.pageX - seekOriginXRef.current;
        const ratio = Math.max(0, Math.min(1, relX / seekWidthRef.current));
        dragRatioRef.current = ratio;
        fillRef.current?.setNativeProps({ style: { width: `${ratio * 100}%` } });
        thumbRef.current?.setNativeProps({ left: `${Math.min(ratio * 100, 100)}%` });
        const now = Date.now();
        if (now - lastSeekTimeRef.current > 100) {
          lastSeekTimeRef.current = now;
          playerRef.current.seekTo(ratio * durationRef.current);
        }
      },
      onPanResponderRelease: () => {
        isDraggingRef.current = false;
        playerRef.current.seekTo(dragRatioRef.current * durationRef.current);
        onScrollLock?.(false);
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        onScrollLock?.(false);
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <Waveform
        data={waveform ?? []}
        progress={progress}
        color={colors.text}
        heightScale={80}
        style={{ alignSelf: "stretch" }}
      />
      <View style={styles.audioPlayerRow}>
        <TouchableOpacity onPress={togglePlay} style={styles.audioPlayBtn}>
          <Svg width="26" height="26" viewBox="0 0 24 24" fill={colors.text}>
            {status.playing ? <Path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /> : <Path d="M8 5v14l11-7z" />}
          </Svg>
        </TouchableOpacity>
        <TouchableOpacity onPress={cycleSpeed} style={styles.audioSpeedBtn}>
          <Text style={styles.audioSpeedText}>{playbackSpeed === 0.5 ? "x0.5" : playbackSpeed === 1 ? "x1" : playbackSpeed === 1.5 ? "x1.5" : "x2"}</Text>
        </TouchableOpacity>
        <View style={styles.audioProgressWrapper}>
          <View style={styles.audioSeekHitArea} onLayout={(e) => { seekWidthRef.current = e.nativeEvent.layout.width; }} {...seekPan.panHandlers}>
            <View style={styles.audioSeekTrack}>
              <View ref={fillRef} style={[styles.audioSeekFill, { width: `${progress * 100}%` as any }]} />
            </View>
            <View ref={thumbRef} style={[styles.audioSeekThumb, { left: `${Math.min(progress * 100, 100)}%` as any }]} pointerEvents="none" />
          </View>
          <View style={styles.audioTimesRow}>
            <Text style={styles.audioTimeText}>{fmtAudio(status.currentTime)}</Text>
            <Text style={styles.audioTimeText}>{fmtAudio(status.duration)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xl,
    paddingHorizontal: spacing.lg
  },
  audioPlayerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    alignSelf: "stretch"
  },
  audioPlayBtn: {
    width: 52,
    height: 52,
    borderRadius: radii.full,
    backgroundColor: colors.accentMuted,
    justifyContent: "center",
    alignItems: "center"
  },
  audioSpeedBtn: {
    width: 40,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: colors.accentMuted,
    justifyContent: "center",
    alignItems: "center"
  },
  audioSpeedText: {
    color: colors.text,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs
  },
  audioProgressWrapper: {
    flex: 1,
    gap: spacing.xs
  },
  audioSeekHitArea: {
    paddingVertical: 14,
    justifyContent: "center"
  },
  audioSeekTrack: {
    height: 3,
    backgroundColor: colors.accentMuted,
    borderRadius: radii.xs
  },
  audioSeekFill: {
    height: 3,
    backgroundColor: colors.text,
    borderRadius: radii.xs
  },
  audioSeekThumb: {
    position: "absolute",
    width: 13,
    height: 13,
    borderRadius: radii.sm,
    backgroundColor: colors.text,
    marginLeft: -6,
    top: 14 - 5
  },
  audioTimesRow: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  audioTimeText: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    fontFamily: typography.family.regular
  },
});
