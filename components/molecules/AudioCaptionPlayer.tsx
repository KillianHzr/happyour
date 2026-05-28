import React, { useRef, useEffect } from "react";
import { View, StyleSheet, TouchableOpacity, PanResponder, Text } from "react-native";
import { Svg, Path } from "react-native-svg";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { colors, radii, typography } from "../../lib/theme";

interface AudioCaptionPlayerProps {
  player: ReturnType<typeof useAudioPlayer>;
  status: ReturnType<typeof useAudioPlayerStatus>;
  onRemove?: () => void;
  showVocalLabel?: boolean;
  onScrollLock?: (locked: boolean) => void;
  waveform?: number[];
}

const WAVE_BARS = [10, 14, 22, 30, 38, 34, 26, 20, 14, 18, 28, 36, 44, 40, 32, 24, 16, 12, 20, 30, 38, 42, 34, 26, 18, 14, 22, 32, 40, 36, 28, 20, 14, 10, 18, 28, 36, 40, 32, 24, 18, 14, 20, 28, 36, 32, 24, 18, 12, 8];

const TrashIcon = () => (
  <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Svg>
);

function compressWaveform(data: number[], maxBars: number): number[] {
  if (!data || data.length === 0) return [];
  if (data.length <= maxBars) return data;
  const result: number[] = [];
  const chunkSize = data.length / maxBars;
  for (let i = 0; i < maxBars; i++) {
    const start = Math.floor(i * chunkSize);
    const end = Math.floor((i + 1) * chunkSize);
    const slice = data.slice(start, end);
    const avg = slice.reduce((sum, val) => sum + val, 0) / (slice.length || 1);
    result.push(avg);
  }
  return result;
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

  // Use provided waveform or fallback to hardcoded
  const bars = waveform && waveform.length > 0 
    ? compressWaveform(waveform, 40).map(v => v * 36) 
    : WAVE_BARS;

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={togglePlay} style={styles.playBtn}>
        <Svg width="14" height="14" viewBox="0 0 24 24" fill={colors.white}>
          {status.playing ? <Path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /> : <Path d="M8 5v14l11-7z" />}
        </Svg>
      </TouchableOpacity>
      
      <View 
        style={styles.waveHitArea} 
        onLayout={(e) => { 
          if (e.nativeEvent.layout.width > 0) waveWidthRef.current = e.nativeEvent.layout.width; 
        }}
        {...seekPan.panHandlers}
      >
        <View style={styles.waveContainer} pointerEvents="none">
          {bars.map((h, i) => (
            <View
              key={i}
              style={[
                styles.waveBar,
                {
                  height: Math.max(3, h / 2.2),
                  opacity: progress > i / bars.length ? 1 : 0.25,
                },
              ]}
            />
          ))}
        </View>
      </View>

      {showVocalLabel && <Text style={styles.vocalLabel}>Vocal</Text>}
      {onRemove && (
        <TouchableOpacity onPress={onRemove} style={styles.trashBtn}>
          <TrashIcon />
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
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  waveHitArea: {
    flex: 1,
    height: "100%",
    justifyContent: "center",
    paddingVertical: 10,
  },
  waveContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 1.5,
  },
  waveBar: {
    width: 2,
    backgroundColor: colors.white,
    borderRadius: 1,
  },
  vocalLabel: {
    color: colors.white,
    fontSize: 10,
    fontFamily: typography.family.bold,
    textTransform: "uppercase",
    opacity: 0.8,
  },
  trashBtn: {
    padding: 6,
  },
});
