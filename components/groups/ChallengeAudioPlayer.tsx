import { useRef, useState, useEffect } from "react";
import { View, Text, TouchableOpacity, PanResponder, StyleSheet } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import Svg, { Path } from "react-native-svg";
import { radii, typography, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { Waveform } from "../atoms/Waveform";

interface ChallengeAudioPlayerProps {
  url: string;
  waveform?: number[];
}

const SPEEDS = [0.5, 1, 1.5, 2];

function fmtAudio(s: number): string {
  if (!s || isNaN(s) || !isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function ChallengeAudioPlayer({ url, waveform }: ChallengeAudioPlayerProps) {
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
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

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", gap: 24, paddingHorizontal: 16 }]}>
      <Waveform
        data={waveform ?? []}
        progress={progress}
        color={colors.text}
        heightScale={32}
        activeOpacity={0.9}
        style={{ alignSelf: "stretch" }}
      />
      <View style={s.playerRow}>
        <TouchableOpacity onPress={togglePlay} style={s.playBtn} activeOpacity={0.8}>
          <Svg width="26" height="26" viewBox="0 0 24 24" fill={colors.text}>
            {status.playing
              ? <Path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              : <Path d="M8 5v14l11-7z" />
            }
          </Svg>
        </TouchableOpacity>

        <View style={s.progressWrapper}>
          <View
            style={s.seekHitArea}
            onLayout={(e) => { seekWidthRef.current = e.nativeEvent.layout.width || 1; }}
            {...seekPan.panHandlers}
          >
            <View style={s.seekTrack}>
              <View ref={fillRef} style={[s.seekFill, { width: `${progress * 100}%` }]} />
            </View>
            <View ref={thumbRef} style={[s.seekThumb, { left: `${Math.min(progress * 100, 100)}%` }]} pointerEvents="none" />
          </View>
          <View style={s.timesRow}>
            <Text style={s.timeText}>{fmtAudio(status.currentTime)}</Text>
            <Text style={s.timeText}>{fmtAudio(status.duration)}</Text>
          </View>
        </View>

        <TouchableOpacity style={s.speedBtn} onPress={cycleSpeed}>
          <Text style={s.speedText}>{playbackSpeed}x</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  playerRow: { flexDirection: "row", alignItems: "center", gap: 14, alignSelf: "stretch" },
  playBtn: { width: 52, height: 52, borderRadius: radii.full, backgroundColor: colors.accentMuted, justifyContent: "center", alignItems: "center" },
  speedBtn: { width: 40, height: 28, borderRadius: radii.sm, backgroundColor: colors.accentMuted, justifyContent: "center", alignItems: "center" },
  speedText: { color: colors.text, fontFamily: typography.family.semibold, fontSize: typography.size.xs },
  progressWrapper: { flex: 1, gap: 4 },
  seekHitArea: { paddingVertical: 14, justifyContent: "center" },
  seekTrack: { height: 3, backgroundColor: colors.accentMuted, borderRadius: radii.xs },
  seekFill: { height: 3, backgroundColor: colors.text, borderRadius: radii.xs },
  seekThumb: { position: "absolute", width: 13, height: 13, borderRadius: radii.sm, backgroundColor: colors.text, marginLeft: -6, top: 14 - 5 },
  timesRow: { flexDirection: "row", justifyContent: "space-between" },
  timeText: { fontSize: typography.size.xs, color: colors.textSecondary, fontFamily: typography.family.regular },
});
