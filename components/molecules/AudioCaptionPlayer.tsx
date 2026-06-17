import React, { useRef, useEffect } from "react";
import { View, StyleSheet, TouchableOpacity, PanResponder, Text } from "react-native";
import { Svg, Path } from "react-native-svg";
import BlurView from "../atoms/BlurView";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { colors, radii, typography, blur } from "../../lib/theme";
import Icon from "../Icon";
import { Waveform } from "../atoms/Waveform";

interface AudioCaptionPlayerProps {
  player: ReturnType<typeof useAudioPlayer>;
  status: ReturnType<typeof useAudioPlayerStatus>;
  onRemove?: () => void;
  showVocalLabel?: boolean;
  onScrollLock?: (locked: boolean) => void;
  waveform?: number[];
}

export const AudioCaptionPlayer = ({ player, status, onRemove, showVocalLabel, onScrollLock, waveform }: AudioCaptionPlayerProps) => {
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
      <TouchableOpacity onPress={togglePlay} style={styles.playBtn}>
        <BlurView intensity={blur.md} tint="dark" style={StyleSheet.absoluteFillObject} />
        {status.playing ? (
          <Svg width="18" height="18" viewBox="0 0 24 24" fill={colors.white}>
            <Path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </Svg>
        ) : (
          <Icon name="play" size={18} color={colors.white} />
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
          color={colors.bgNeutral}
          heightScale={80 / 3}
          barWidth={2}
          minHeight={2}
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
    gap: 10,
    flex: 1,
    height: 32,
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.sm, // var(--sds-size-radius-200) -> 8
    backgroundColor: colors.opacityLight, // var(--background-default-default-opacity)
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden", // blur/glass effect approximation
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
