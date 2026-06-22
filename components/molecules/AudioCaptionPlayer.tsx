import React, { useRef, useEffect } from "react";
import { View, StyleSheet, TouchableOpacity, PanResponder, Text } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { colors, radii, typography } from "../../lib/theme";
import Icon from "../Icon";
import { Waveform } from "../atoms/Waveform";

interface AudioCaptionPlayerProps {
  player: ReturnType<typeof useAudioPlayer>;
  status: ReturnType<typeof useAudioPlayerStatus>;
  onRemove?: () => void;
  showVocalLabel?: boolean;
  onScrollLock?: (locked: boolean) => void;
  waveform?: number[];
  /** Play/pause icon color. Defaults to white (designed to sit over a dark scrim). */
  iconColor?: string;
  /** Waveform bar color (played = full opacity, unplayed = faded). Defaults to bgNeutral. */
  waveColor?: string;
  /** Optional square-rounded background behind the play/pause button (e.g. opacityLight in the
   *  capture preview, to match the recording confirm button). Defaults to transparent. */
  playBtnBackgroundColor?: string;
}

export const AudioCaptionPlayer = ({ player, status, onRemove, showVocalLabel, onScrollLock, waveform, iconColor = colors.white, waveColor = colors.bgNeutral, playBtnBackgroundColor }: AudioCaptionPlayerProps) => {
  const waveWidthRef = useRef(1);
  const waveOriginXRef = useRef(0);
  const isDraggingRef = useRef(false);

  const playerRef = useRef(player);
  const durationRef = useRef(status.duration ?? 0);

  useEffect(() => { playerRef.current = player; }, [player]);
  useEffect(() => { durationRef.current = status.duration ?? 0; }, [status.duration]);

  const togglePlay = () => {
    if (status.playing) {
      player.pause();
    } else {
      if ((status.duration ?? 0) > 0 && (status.currentTime ?? 0) >= (status.duration ?? 0) - 0.1) {
        player.seekTo(0);
      }
      player.play();
    }
  };

  const seekPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        isDraggingRef.current = true;
        onScrollLock?.(true);
        // PageX (absolute) - LocationX (relative to target) = Target's absolute Left
        waveOriginXRef.current = evt.nativeEvent.pageX - evt.nativeEvent.locationX;
        const ratio = Math.max(0, Math.min(1, evt.nativeEvent.locationX / waveWidthRef.current));
        playerRef.current.seekTo(ratio * durationRef.current);
      },
      onPanResponderMove: (evt) => {
        const relX = evt.nativeEvent.pageX - waveOriginXRef.current;
        const ratio = Math.max(0, Math.min(1, relX / waveWidthRef.current));
        playerRef.current.seekTo(ratio * durationRef.current);
      },
      onPanResponderRelease: () => {
        isDraggingRef.current = false;
        onScrollLock?.(false);
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        onScrollLock?.(false);
      },
    })
  ).current;

  const progress = (status.duration ?? 0) > 0 ? (status.currentTime ?? 0) / status.duration : 0;

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={togglePlay} style={[styles.playBtn, playBtnBackgroundColor ? { backgroundColor: playBtnBackgroundColor } : null]}>
        {status.playing ? (
          <Icon name="pause" size={18} color={iconColor} />
        ) : (
          <Icon name="play" size={18} color={iconColor} />
        )}
      </TouchableOpacity>
      
      <View 
        style={styles.waveHitArea} 
        onLayout={(e) => { 
          if (e.nativeEvent.layout.width > 0) waveWidthRef.current = e.nativeEvent.layout.width; 
        }}
        {...seekPan.panHandlers}
      >
        <Waveform
          data={waveform ?? []}
          progress={progress}
          color={waveColor}
          heightScale={80 / 3}
          barWidth={2}
          minHeight={1}
        />
      </View>

      {onRemove && (
        <TouchableOpacity onPress={onRemove} style={styles.trashBtn}>
          <Icon name="x" size={20} color={colors.white} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    height: 22,
  },
  playBtn: {
    width: 20,
    height: 20,
    borderRadius: radii.sm, // var(--sds-size-radius-200) -> 8
    justifyContent: "center",
    alignItems: "center",
  },
  waveHitArea: {
    flex: 1,
    height: "100%",
    justifyContent: "center",
    paddingVertical: 10,
  },
  trashBtn: {
    padding: 6,
  },
});
