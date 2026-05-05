import React, { useState, useRef, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, PanResponder } from "react-native";
import { Svg, Path } from "react-native-svg";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

interface AudioPlayerViewProps {
  player: ReturnType<typeof useAudioPlayer>;
  status: ReturnType<typeof useAudioPlayerStatus>;
  onScrollLock?: (locked: boolean) => void;
}

const WAVE_HEIGHTS = [18, 32, 48, 36, 60, 80, 52, 68, 42, 62, 88, 72, 50, 38, 68, 82, 58, 44, 28, 52, 72, 56, 78, 46, 36, 62, 50, 66, 42, 28];

function fmtAudio(s: number) {
  if (!isFinite(s) || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export const AudioPlayerView = ({ player, status, onScrollLock }: AudioPlayerViewProps) => {
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
      <View style={styles.audioWaveContainer} pointerEvents="none">
        {WAVE_HEIGHTS.map((h, i) => (
          <View key={i} style={[styles.audioWaveBar, { height: h, opacity: progress > i / WAVE_HEIGHTS.length ? 0.9 : 0.25 }]} />
        ))}
      </View>
      <View style={styles.audioPlayerRow}>
        <TouchableOpacity onPress={togglePlay} style={styles.audioPlayBtn}>
          <Svg width="26" height="26" viewBox="0 0 24 24" fill="#FFF">
            {status.playing ? <Path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /> : <Path d="M8 5v14l11-7z" />}
          </Svg>
        </TouchableOpacity>
        <TouchableOpacity onPress={cycleSpeed} style={styles.audioSpeedBtn}>
          <Text style={styles.audioSpeedText}>{playbackSpeed === 0.5 ? "×0.5" : playbackSpeed === 1 ? "×1" : playbackSpeed === 1.5 ? "×1.5" : "×2"}</Text>
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

const styles = StyleSheet.create({
  container: { 
    ...StyleSheet.absoluteFillObject, 
    backgroundColor: "#0A0A0A", 
    justifyContent: "center", 
    alignItems: "center", 
    gap: 24, 
    paddingHorizontal: 16 
  },
  audioWaveContainer: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "center", 
    gap: 3 
  },
  audioWaveBar: { 
    width: 3, 
    borderRadius: 2, 
    backgroundColor: "#FFF" 
  },
  audioPlayerRow: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 14, 
    alignSelf: "stretch" 
  },
  audioPlayBtn: { 
    width: 52, 
    height: 52, 
    borderRadius: 26, 
    backgroundColor: "rgba(255,255,255,0.15)", 
    justifyContent: "center", 
    alignItems: "center" 
  },
  audioSpeedBtn: { 
    width: 40, 
    height: 28, 
    borderRadius: 8, 
    backgroundColor: "rgba(255,255,255,0.15)", 
    justifyContent: "center", 
    alignItems: "center" 
  },
  audioSpeedText: { 
    color: "#FFF", 
    fontFamily: "Inter_600SemiBold", 
    fontSize: 12 
  },
  audioProgressWrapper: { 
    flex: 1, 
    gap: 4 
  },
  audioSeekHitArea: { 
    paddingVertical: 14, 
    justifyContent: "center" 
  },
  audioSeekTrack: { 
    height: 3, 
    backgroundColor: "rgba(255,255,255,0.22)", 
    borderRadius: 2 
  },
  audioSeekFill: { 
    height: 3, 
    backgroundColor: "#FFF", 
    borderRadius: 2 
  },
  audioSeekThumb: { 
    position: "absolute", 
    width: 13, 
    height: 13, 
    borderRadius: 7, 
    backgroundColor: "#FFF", 
    marginLeft: -6, 
    top: 14 - 5 
  },
  audioTimesRow: { 
    flexDirection: "row", 
    justifyContent: "space-between" 
  },
  audioTimeText: { 
    fontSize: 11, 
    color: "rgba(255,255,255,0.5)", 
    fontFamily: "Inter_400Regular" 
  },
});
