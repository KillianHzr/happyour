import { useRef, useState, useEffect } from "react";
import { View, Text, TouchableOpacity, PanResponder, StyleSheet } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import Svg, { Path } from "react-native-svg";
import { colors, radii, typography } from "../../lib/theme";

interface ChallengeAudioPlayerProps {
  url: string;
  waveform?: number[];
}

const WAVE_HEIGHTS = [18, 32, 48, 36, 60, 80, 52, 68, 42, 62, 88, 72, 50, 38, 68, 82, 58, 44, 28, 52, 72, 56, 78, 46, 36, 62, 50, 66, 42, 28];
const SPEEDS = [0.5, 1, 1.5, 2];

function fmtAudio(s: number): string {
  if (!s || isNaN(s) || !isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

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

export default function ChallengeAudioPlayer({ url, waveform }: ChallengeAudioPlayerProps) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  useEffect(() => {
    return () => {
      try { playerRef.current.pause(); } catch (_) {}
    };
  }, []);

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
    if (status.playing) {
      player.pause();
    } else {
      if ((status.duration ?? 0) > 0 && (status.currentTime ?? 0) >= (status.duration ?? 0) - 0.1) {
        player.seekTo(0);
      }
      player.play();
    }
  };

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
        thumbRef.current?.setNativeProps({ style: { left: `${Math.min(ratio * 100, 100)}%` } });
        const now = Date.now();
        if (durationRef.current > 0 && now - lastSeekTimeRef.current > 100) {
          lastSeekTimeRef.current = now;
          playerRef.current.seekTo(ratio * durationRef.current);
        }
      },
      onPanResponderRelease: () => {
        isDraggingRef.current = false;
        if (durationRef.current > 0) {
          playerRef.current.seekTo(dragRatioRef.current * durationRef.current);
        }
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
      },
    })
  ).current;

  // Use provided waveform or fallback to hardcoded
  const bars = waveform && waveform.length > 0 
    ? compressWaveform(waveform, 40).map(v => Math.max(4, v * 80)) 
    : WAVE_HEIGHTS;

  return (
    <View style={styles.card}>
      <View style={styles.waveRow}>
        {bars.map((h, i) => (
          <View key={i} style={[styles.bar, { height: h, opacity: progress > i / bars.length ? 0.9 : 0.25 }]} />
        ))}
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.playBtn} onPress={togglePlay} activeOpacity={0.8}>
          <Svg width="20" height="20" viewBox="0 0 24 24" fill={colors.white}>
            {status.playing ? <Path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /> : <Path d="M8 5v14l11-7z" />}
          </Svg>
        </TouchableOpacity>

        <View style={styles.sliderContainer}>
          <View
            style={styles.seekHitArea}
            onLayout={(e) => { seekWidthRef.current = e.nativeEvent.layout.width || 1; }}
            {...seekPan.panHandlers}
          >
            <View style={styles.track}>
              <View ref={fillRef} style={[styles.fill, { width: `${progress * 100}%` }]} />
            </View>
            <View ref={thumbRef} style={[styles.thumb, { left: `${Math.min(progress * 100, 100)}%` }]} pointerEvents="none" />
          </View>
        </View>

        <TouchableOpacity style={styles.speedBtn} onPress={cycleSpeed}>
          <Text style={styles.speedText}>{playbackSpeed}x</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.times}>
        <Text style={styles.timeText}>{fmtAudio(status.currentTime)}</Text>
        <Text style={styles.timeText}>{fmtAudio(status.duration)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: radii.xl, padding: 16, gap: 12 },
  waveRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3.5, height: 90 },
  bar: { width: 3.5, borderRadius: radii.xs, backgroundColor: colors.white },
  controls: { flexDirection: "row", alignItems: "center", gap: 12 },
  playBtn: { width: 40, height: 40, borderRadius: radii.full, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center" },
  sliderContainer: { flex: 1 },
  seekHitArea: { paddingVertical: 14, justifyContent: "center" },
  track: { height: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: radii.xs, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.white, borderRadius: radii.xs },
  thumb: { position: "absolute", width: 14, height: 14, borderRadius: radii.full, backgroundColor: colors.white, marginLeft: -7 },
  speedBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.sm, backgroundColor: "rgba(255,255,255,0.1)" },
  speedText: { color: colors.white, fontSize: typography.size.xs, fontFamily: typography.family.bold },
  times: { flexDirection: "row", justifyContent: "space-between" },
  timeText: { fontSize: typography.size.xs, color: colors.textMuted, fontFamily: typography.family.regular },
});
