import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Pressable,
  ViewToken,
  Platform,
  PanResponder,
  Animated,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import { useVideoPlayer, VideoView } from "expo-video";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Svg, Path, Circle, Text as SvgText } from "react-native-svg";
import { r2Storage } from "../lib/r2";
import CommentModal from "./CommentModal";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const NAVBAR_HEIGHT = 100;

export const isEmoji = (str: string) => {
  const regexExp = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/gi;
  return regexExp.test(str);
};

export function TextSticker({ text, fontSize = 42 }: { text: string; fontSize?: number }) {
  const displayValue = (text || "—").toUpperCase();
  const scale = fontSize / 42;
  const height = scale * 80;
  const width = (displayValue.length * fontSize * 0.85) + (20 * scale);
  const y = scale * 55;
  const strokeWidth = 5;

  return (
    <View style={{ height, width, justifyContent: 'center', alignItems: 'center' }}>
      <Svg height={height} width={width}>
        <SvgText
          fill="none"
          stroke="#FFF065"
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          fontSize={fontSize}
          fontWeight="bold"
          fontFamily="Inter_700Bold"
          x="50%"
          y={y}
          textAnchor="middle"
        >
          {displayValue}
        </SvgText>
        <SvgText
          fill="black"
          fontSize={fontSize}
          fontWeight="bold"
          fontFamily="Inter_700Bold"
          x="50%"
          y={y}
          textAnchor="middle"
        >
          {displayValue}
        </SvgText>
      </Svg>
    </View>
  );
}

export type Reaction = {
  id: string;
  user_id: string;
  username: string;
  avatar_url?: string | null;
  sticker_id: string; // Now used for both emojis and custom text strings
};

export type PhotoEntry = {
  id: string;
  url: string;
  fallback_url?: string;
  created_at: string;
  note: string | null;
  username: string;
  avatar_url?: string | null;
  image_path: string;
  second_image_path?: string | null;
  second_note?: string | null;
  user_id: string;
  reactions: Reaction[];
  hasNewComments?: boolean;
};

type FeedItem =
  | { type: "intro" }
  | { type: "crown" }
  | { type: "moment"; data: PhotoEntry }
  | { type: "separator"; date: string; label: string }
  | { type: "end" };

type Props = {
  photos: PhotoEntry[];
  currentUserId?: string;
  nextUnlockDate: Date;
  revealEndDate?: Date;
  crownWinnerId?: string | null;
  crownDurationMs?: number;
  groupName?: string;
  onScrollLock?: (locked: boolean) => void;
  onActiveIndexChange?: (index: number) => void;
  onOpenPicker?: (photoId: string) => void;
  onOpenComments?: (photoId: string, ownerId: string) => void;
};

const PlusIcon = ({ size = 22, color = "rgba(255,255,255,0.9)" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 5v14M5 12h14" />
  </Svg>
);

const CommentIcon = ({ size = 20, color = "rgba(255,255,255,0.9)", hasBadge = false }) => (
  <View>
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </Svg>
    {hasBadge && (
      <View style={{
        position: 'absolute',
        top: -1,
        right: -1,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#FF3B30',
        borderWidth: 1.5,
        borderColor: '#000'
      }} />
    )}
  </View>
);

function ExpandableNote({ text, maxLines }: { text: string; maxLines: number }) {
  const [expanded, setExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);

  return (
    <TouchableOpacity onPress={() => isTruncated && setExpanded(v => !v)} activeOpacity={0.8}>
      <View style={{ height: 0, overflow: 'hidden' }}>
        <Text
          style={styles.momentNote}
          onTextLayout={(e) => setIsTruncated(e.nativeEvent.lines.length > maxLines)}
        >
          {text}
        </Text>
      </View>
      <Text style={styles.momentNote} numberOfLines={expanded ? undefined : maxLines}>
        {text}
      </Text>
      {!expanded && isTruncated && (
        <Text style={styles.noteExpand}>voir plus</Text>
      )}
    </TouchableOpacity>
  );
}

function PhotoImage({ url, fallback_url, isDrawing }: { url: string; fallback_url?: string; isDrawing?: boolean }) {
  const [useFallback, setUseFallback] = useState(false);
  const prevUrlRef = useRef(url);
  if (prevUrlRef.current !== url) {
    prevUrlRef.current = url;
    if (useFallback) setUseFallback(false);
  }
  const src = useFallback && fallback_url ? fallback_url : url;
  if (isDrawing) {
    return (
      <View style={[StyleSheet.absoluteFill, { justifyContent: "center", alignItems: "center" }]}>
        <Image
          source={{ uri: src }}
          style={{ width: "100%", aspectRatio: 3 / 4, borderRadius: 24, backgroundColor: "#FFF" }}
          contentFit="fill"
          onError={() => { if (fallback_url) setUseFallback(true); }}
        />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: src }}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      contentPosition={{ top: 0, left: "50%" }}
      onError={() => { if (fallback_url && !useFallback) setUseFallback(true); }}
    />
  );
}

function SecondCaptureThumbnail({ secondPath, secondNote, onPress }: {
  secondPath: string; secondNote?: string | null; onPress: () => void;
}) {
  const isText = secondPath === "text_mode";
  const isAudio = secondPath.endsWith(".m4a");
  const isVideo = secondPath.endsWith(".mp4");
  const isDrawing = secondPath.includes("_draw");

  const renderContent = () => {
    if (isText) {
      return (
        <View style={[styles.secondThumbBg, { backgroundColor: "#111", justifyContent: "center", padding: 6 }]}>
          <Text style={styles.secondThumbText} numberOfLines={5}>{secondNote ?? ""}</Text>
        </View>
      );
    }
    if (isAudio) {
      return (
        <View style={[styles.secondThumbBg, { backgroundColor: "#111", gap: 5 }]}>
          {/* Mini waveform */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            {[8, 14, 10, 18, 12, 16, 9].map((h, i) => (
              <View key={i} style={{ width: 2.5, height: h, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.55)" }} />
            ))}
          </View>
          {/* Play icon */}
          <View style={styles.secondThumbPlayBadge}>
            <Svg width="8" height="8" viewBox="0 0 24 24" fill="#FFF">
              <Path d="M8 5v14l11-7z" />
            </Svg>
          </View>
        </View>
      );
    }
    if (isVideo) {
      return (
        <View style={[styles.secondThumbBg, { backgroundColor: "#000" }]}>
          <Image
            source={{ uri: r2Storage.getPublicUrl(secondPath) }}
            style={styles.secondThumbImage}
            contentFit="cover"
          />
          {/* Play badge over video */}
          <View style={[StyleSheet.absoluteFill, { justifyContent: "center", alignItems: "center" }]}>
            <View style={styles.secondThumbPlayCircle}>
              <Svg width="10" height="10" viewBox="0 0 24 24" fill="#FFF">
                <Path d="M8 5v14l11-7z" />
              </Svg>
            </View>
          </View>
        </View>
      );
    }
    if (isDrawing) {
      return (
        <Image
          source={{ uri: r2Storage.getPublicUrl(secondPath) }}
          style={styles.secondThumbImage}
          contentFit="contain"
        />
      );
    }
    // Regular photo
    return (
      <Image
        source={{ uri: r2Storage.getPublicUrl(secondPath) }}
        style={styles.secondThumbImage}
        contentFit="cover"
      />
    );
  };

  // Drawing uses 3:4 ratio (same as in the reveal), others use 9:16 portrait
  const thumbStyle = isDrawing
    ? [styles.secondThumb, { width: 48, height: 64 }]
    : styles.secondThumb;

  return (
    <TouchableOpacity onPress={onPress} style={thumbStyle} activeOpacity={0.8}>
      {renderContent()}
      {/* Swap indicator */}
      <View style={styles.secondThumbOverlay}>
        <Svg width="8" height="8" viewBox="0 0 20 18" fill="none">
          <Path d="M1 13L5 17M5 17L9 13M5 17L5 1M19 5L15 1M15 1L11 5M15 1L15 17" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
    </TouchableOpacity>
  );
}

function PhotoMomentPage({ moment, currentUserId, crownWinnerId, onOpenPicker, onOpenComments, isVisible }: {
  moment: PhotoEntry;
  currentUserId?: string;
  crownWinnerId?: string | null;
  onOpenPicker?: (photoId: string) => void;
  onOpenComments?: (photoId: string, ownerId: string) => void;
  isVisible?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [swapped, setSwapped] = useState(false);
  const isOwn = moment.user_id === currentUserId;

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
  useEffect(() => { if (!isEffectiveAudio || isVisible === false) audioPlayer.pause(); }, [isEffectiveAudio, isVisible]);

  // Video player for swapped video second capture
  const videoPlayer = useVideoPlayer(isEffectiveVideo ? effectiveUrl : null, (p) => { p.loop = true; });
  useEffect(() => {
    if (isEffectiveVideo) videoPlayer.play();
    else videoPlayer.pause();
  }, [isEffectiveVideo]);

  const renderMainContent = () => {
    if (isTextOnly) {
      return (
        <View style={styles.textMomentBg}>
          <View style={styles.quoteContainer}>
            <Text style={[styles.textMomentContent, { fontSize, lineHeight: Math.round(fontSize * 1.4) }]}>{effectiveNote}</Text>
            <View style={styles.citationFooter}>
              <View style={styles.citationAvatar}><CrownedAvatar avatar_url={moment.avatar_url} username={moment.username} size={32} isCrown={crownWinnerId === moment.user_id} /></View>
              <View style={{ flex: 1 }}><Text style={styles.citationUsername}>{moment.username}</Text><Text style={styles.citationTime}>{formatTime(moment.created_at)}</Text></View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity style={styles.reactBtnInline} onPress={() => onOpenComments?.(moment.id, moment.user_id)}>
                  <CommentIcon hasBadge={moment.hasNewComments} />
                </TouchableOpacity>
                {!isOwn && <TouchableOpacity style={styles.reactBtnInline} onPress={() => onOpenPicker?.(moment.id)}><PlusIcon /></TouchableOpacity>}
              </View>
            </View>
          </View>
        </View>
      );
    }
    if (isEffectiveAudio) {
      return <AudioPlayerView player={audioPlayer} status={audioStatus} />;
    }
    if (isEffectiveVideo) {
      return (
        <VideoView player={videoPlayer} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      );
    }
    return <PhotoImage url={effectiveUrl} fallback_url={swapped ? undefined : moment.fallback_url} isDrawing={isDrawing} />;
  };

  return (
    <View style={[styles.fullscreenPage, { paddingTop: Math.max(insets.top, 12) + 12, paddingBottom: NAVBAR_HEIGHT + 12 }]}>
      <View style={styles.momentWrapper}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: swapFade }]}>
          {renderMainContent()}
        </Animated.View>
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={styles.momentOverlay}>
            {!isTextOnly && (
              <View style={styles.authorInfo}>
                <CrownedAvatar avatar_url={moment.avatar_url} username={moment.username} size={36} isCrown={crownWinnerId === moment.user_id} />
                <View style={{ flex: 1 }}>
                  <View style={styles.usernameLine}><Text style={styles.username}>{moment.username}</Text><Text style={styles.momentTime}>{formatTime(moment.created_at)}</Text></View>
                  {effectiveNote && <ExpandableNote text={effectiveNote} maxLines={2} />}
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity style={styles.reactBtnInline} onPress={() => onOpenComments?.(moment.id, moment.user_id)}>
                    <CommentIcon hasBadge={moment.hasNewComments} />
                  </TouchableOpacity>
                  {!isOwn && <TouchableOpacity style={styles.reactBtnInline} onPress={() => onOpenPicker?.(moment.id)}><PlusIcon /></TouchableOpacity>}
                </View>
              </View>
            )}
            <ReactionsRow reactions={moment.reactions} currentUserId={currentUserId} photoId={moment.id} crownWinnerId={crownWinnerId} onOpenPicker={isOwn ? undefined : onOpenPicker} />
          </LinearGradient>
          {thumbnailPath && (
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: swapFade }]} pointerEvents="box-none">
              <SecondCaptureThumbnail secondPath={thumbnailPath} secondNote={thumbnailNote} onPress={handleSwap} />
            </Animated.View>
          )}
        </View>
      </View>
    </View>
  );
}

function UserAvatar({ avatar_url, username, size = 28 }: { avatar_url?: string | null; username: string; size?: number }) {
  const borderRadius = size / 2;
  if (avatar_url) {
    return <Image source={{ uri: avatar_url }} style={{ width: size, height: size, borderRadius }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius, backgroundColor: "#FFF", justifyContent: "center", alignItems: "center" }}>
      <Text style={{ color: "#000", fontFamily: "Inter_700Bold", fontSize: Math.round(size * 0.42) }}>
        {username[0]?.toUpperCase() ?? "?"}
      </Text>
    </View>
  );
}

function CrownedAvatar({ avatar_url, username, size = 36, isCrown }: { avatar_url?: string | null; username: string; size?: number; isCrown: boolean }) {
  const crownSize = Math.round(size * 0.6);
  return (
    <View style={{ width: size, height: size + (isCrown ? crownSize * 0.6 : 0), alignItems: "center", justifyContent: "flex-end" }}>
      {isCrown && (
        <View style={{ position: "absolute", top: 0, zIndex: 10 }}>
          <Svg width={crownSize} height={crownSize} viewBox="0 0 24 24">
            <Path d="M2 19l2-9 4.5 4L12 5l3.5 9L20 10l2 9H2z" fill="#FFD700" stroke="#B8860B" strokeWidth="1" strokeLinejoin="round" />
          </Svg>
        </View>
      )}
      <View style={isCrown ? { borderWidth: 2, borderColor: "#FFD700", borderRadius: size / 2 } : undefined}>
        <UserAvatar avatar_url={avatar_url} username={username} size={size} />
      </View>
    </View>
  );
}

function ReactionsRow({ reactions, currentUserId, photoId, crownWinnerId, onOpenPicker }: {
  reactions: Reaction[];
  currentUserId?: string;
  photoId: string;
  crownWinnerId?: string | null;
  onOpenPicker?: (photoId: string) => void;
}) {
  if (reactions.length === 0) return null;

  // Group by text content (emoji or custom text)
  const stickerIdsInReactions = Array.from(new Set(reactions.map((r) => r.sticker_id)));
  const groups = stickerIdsInReactions.map((sid) => ({
    id: sid,
    text: sid,
    users: reactions.filter((r) => r.sticker_id === sid),
  }));

  return (
    <View style={styles.reactionsRow}>
      {groups.map(({ id, text, users }) => {
        const iMine = users.some((r) => r.user_id === currentUserId);
        const isCrownReaction = crownWinnerId != null && users.some((r) => r.user_id === crownWinnerId);
        const emojiDetected = isEmoji(text);

        return (
          <TouchableOpacity
            key={id}
            style={[styles.reactionBubble, iMine && styles.reactionBubbleMine, isCrownReaction && styles.reactionBubbleCrown]}
            onPress={() => onOpenPicker?.(photoId)}
            activeOpacity={0.75}
          >
            <View style={styles.reactionAvatarStack}>
              {users.slice(0, 2).map((r, i) => (
                <View key={r.id} style={[styles.reactionAvatarWrap, { zIndex: 2 - i, marginLeft: i === 0 ? 0 : -8 }]}>
                  <UserAvatar avatar_url={r.avatar_url} username={r.username} size={20} />
                </View>
              ))}
            </View>
            <View style={styles.reactionStickerWrap}>
              {emojiDetected ? (
                <Text style={{ fontSize: 14 }}>{text}</Text>
              ) : (
                <TextSticker text={text} fontSize={12} />
              )}
            </View>
            {users.length > 2 && (
              <Text style={styles.reactionCount}>+{users.length - 2}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function formatDayLabel(dateStr: string) {
  const d = new Date(dateStr);
  const day = d.toLocaleDateString("fr-FR", { weekday: "long" }).toUpperCase();
  const full = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  return { date: dateStr.slice(0, 10), label: `${day}\n${full}` };
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const day = d.toLocaleDateString("fr-FR", { weekday: "long" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

const WAVE_HEIGHTS = [18, 32, 48, 36, 60, 80, 52, 68, 42, 62, 88, 72, 50, 38, 68, 82, 58, 44, 28, 52, 72, 56, 78, 46, 36, 62, 50, 66, 42, 28];

function fmtAudio(s: number) {
  if (!isFinite(s) || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// --- Shared audio player UI (used by AudioMoment and PhotoMomentPage swapped-audio) ---
function AudioPlayerView({ player, status, onScrollLock }: {
  player: ReturnType<typeof useAudioPlayer>;
  status: ReturnType<typeof useAudioPlayerStatus>;
  onScrollLock?: (locked: boolean) => void;
}) {
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
        if (now - lastSeekTimeRef.current > 100) { lastSeekTimeRef.current = now; playerRef.current.seekTo(ratio * durationRef.current); }
      },
      onPanResponderRelease: () => {
        isDraggingRef.current = false;
        playerRef.current.seekTo(dragRatioRef.current * durationRef.current);
        onScrollLock?.(false);
      },
      onPanResponderTerminate: () => { isDraggingRef.current = false; onScrollLock?.(false); },
    })
  ).current;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0A0A0A", justifyContent: "center", alignItems: "center", gap: 24, paddingHorizontal: 16 }]}>
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
}

// --- Moment audio ---
function AudioMoment({ moment, isVisible, currentUserId, crownWinnerId, onScrollLock, onOpenPicker, onOpenComments }: {
  moment: PhotoEntry;
  isVisible: boolean;
  currentUserId?: string;
  crownWinnerId?: string | null;
  onScrollLock?: (locked: boolean) => void;
  onOpenPicker?: (photoId: string) => void;
  onOpenComments?: (photoId: string, ownerId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [swapped, setSwapped] = useState(false);

  const hasSecond = !!moment.second_image_path;
  const player = useAudioPlayer(!swapped ? moment.url : "");
  const status = useAudioPlayerStatus(player);
  const isOwn = moment.user_id === currentUserId;

  useEffect(() => { if (!isVisible) player.pause(); }, [isVisible]);

  const renderContent = () => {
    if (swapped && hasSecond) {
      const secondPath = moment.second_image_path!;
      const secondIsText = secondPath === "text_mode";
      const secondIsDrawing = secondPath.includes("_draw");
      const secondUrl = secondIsText ? "" : r2Storage.getPublicUrl(secondPath);
      const secondNote = moment.second_note;
      const textLen = secondNote?.length ?? 0;
      const fontSize = textLen <= 40 ? 32 : textLen <= 100 ? 26 : textLen <= 200 ? 21 : textLen <= 300 ? 17 : 15;
      if (secondIsText) {
        return (
          <View style={styles.textMomentBg}>
            <View style={styles.quoteContainer}>
              <Text style={[styles.textMomentContent, { fontSize, lineHeight: Math.round(fontSize * 1.4) }]}>{secondNote}</Text>
              <View style={styles.citationFooter}>
                <View style={styles.citationAvatar}><CrownedAvatar avatar_url={moment.avatar_url} username={moment.username} size={32} isCrown={crownWinnerId === moment.user_id} /></View>
                <View style={{ flex: 1 }}><Text style={styles.citationUsername}>{moment.username}</Text><Text style={styles.citationTime}>{formatTime(moment.created_at)}</Text></View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity style={styles.reactBtnInline} onPress={() => onOpenComments?.(moment.id, moment.user_id)}>
                    <CommentIcon hasBadge={moment.hasNewComments} />
                  </TouchableOpacity>
                  {!isOwn && <TouchableOpacity style={styles.reactBtnInline} onPress={() => onOpenPicker?.(moment.id)}><PlusIcon /></TouchableOpacity>}
                </View>
              </View>
            </View>
          </View>
        );
      }
      return <PhotoImage url={secondUrl} isDrawing={secondIsDrawing} />;
    }
    return <AudioPlayerView player={player} status={status} onScrollLock={onScrollLock} />;
  };

  const overlayNote = swapped && hasSecond ? moment.second_note : moment.note;
  const overlayIsText = swapped && hasSecond ? moment.second_image_path === "text_mode" : false;

  return (
    <View style={[styles.fullscreenPage, { paddingTop: Math.max(insets.top, 12) + 12, paddingBottom: NAVBAR_HEIGHT + 12 }]}>
      <View style={styles.momentWrapper}>
        {renderContent()}
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.92)"]} style={styles.momentOverlay}>
            {!overlayIsText && (
              <View style={styles.authorInfo}>
                <CrownedAvatar avatar_url={moment.avatar_url} username={moment.username} size={36} isCrown={crownWinnerId === moment.user_id} />
                <View style={{ flex: 1 }}>
                  <View style={styles.usernameLine}><Text style={styles.username}>{moment.username}</Text><Text style={styles.momentTime}>{formatTime(moment.created_at)}</Text></View>
                  {overlayNote && <ExpandableNote text={overlayNote} maxLines={3} />}
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity style={styles.reactBtnInline} onPress={() => onOpenComments?.(moment.id, moment.user_id)}>
                    <CommentIcon hasBadge={moment.hasNewComments} />
                  </TouchableOpacity>
                  {!isOwn && <TouchableOpacity style={styles.reactBtnInline} onPress={() => onOpenPicker?.(moment.id)}><PlusIcon /></TouchableOpacity>}
                </View>
              </View>
            )}
            <ReactionsRow reactions={moment.reactions} currentUserId={currentUserId} photoId={moment.id} crownWinnerId={crownWinnerId} onOpenPicker={onOpenPicker} />
          </LinearGradient>
          {hasSecond && (
            <SecondCaptureThumbnail
              secondPath={swapped ? moment.image_path : moment.second_image_path!}
              secondNote={swapped ? moment.note : moment.second_note}
              onPress={() => setSwapped(v => !v)}
            />
          )}
        </View>
      </View>
    </View>
  );
}

// --- Moment vidéo ---
function VideoMoment({ moment, isVisible, cachedUrl, currentUserId, crownWinnerId, onOpenPicker, onOpenComments }: {
  moment: PhotoEntry;
  isVisible: boolean;
  cachedUrl: string;
  currentUserId?: string;
  crownWinnerId?: string | null;
  onOpenPicker?: (photoId: string) => void;
  onOpenComments?: (photoId: string, ownerId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [isPaused, setIsPaused] = useState(false);
  const [swapped, setSwapped] = useState(false);

  const hasSecond = !!moment.second_image_path;
  const player = useVideoPlayer((!swapped && cachedUrl) ? cachedUrl : null, (p) => {
    p.loop = true;
    p.muted = false;
  });

  const isOwn = moment.user_id === currentUserId;

  useEffect(() => {
    if (!player) return;
    if (isVisible && !isPaused) { player.play(); } else { player.pause(); }
  }, [isVisible, isPaused, player]);

  useEffect(() => {
    if (!isVisible) setIsPaused(false);
  }, [isVisible]);

  if (swapped && hasSecond) {
    const secondPath = moment.second_image_path!;
    const secondIsText = secondPath === "text_mode";
    const secondIsDrawing = secondPath.includes("_draw");
    const secondUrl = secondIsText ? "" : r2Storage.getPublicUrl(secondPath);
    const secondNote = moment.second_note;
    const textLen = secondNote?.length ?? 0;
    const fontSize = textLen <= 40 ? 32 : textLen <= 100 ? 26 : textLen <= 200 ? 21 : textLen <= 300 ? 17 : 15;
    return (
      <View style={[styles.fullscreenPage, { paddingTop: Math.max(insets.top, 12) + 12, paddingBottom: NAVBAR_HEIGHT + 12 }]}>
        <View style={styles.momentWrapper}>
          {secondIsText ? (
            <View style={styles.textMomentBg}>
              <View style={styles.quoteContainer}>
                <Text style={[styles.textMomentContent, { fontSize, lineHeight: Math.round(fontSize * 1.4) }]}>{secondNote}</Text>
                <View style={styles.citationFooter}>
                  <View style={styles.citationAvatar}><CrownedAvatar avatar_url={moment.avatar_url} username={moment.username} size={32} isCrown={crownWinnerId === moment.user_id} /></View>
                  <View style={{ flex: 1 }}><Text style={styles.citationUsername}>{moment.username}</Text><Text style={styles.citationTime}>{formatTime(moment.created_at)}</Text></View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity style={styles.reactBtnInline} onPress={() => onOpenComments?.(moment.id, moment.user_id)}>
                      <CommentIcon hasBadge={moment.hasNewComments} />
                    </TouchableOpacity>
                    {!isOwn && <TouchableOpacity style={styles.reactBtnInline} onPress={() => onOpenPicker?.(moment.id)}><PlusIcon /></TouchableOpacity>}
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <PhotoImage url={secondUrl} isDrawing={secondIsDrawing} />
          )}
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={styles.momentOverlay}>
              {!secondIsText && (
                <View style={styles.authorInfo}>
                  <CrownedAvatar avatar_url={moment.avatar_url} username={moment.username} size={36} isCrown={crownWinnerId === moment.user_id} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.usernameLine}><Text style={styles.username}>{moment.username}</Text><Text style={styles.momentTime}>{formatTime(moment.created_at)}</Text></View>
                    {secondNote && <ExpandableNote text={secondNote} maxLines={2} />}
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity style={styles.reactBtnInline} onPress={() => onOpenComments?.(moment.id, moment.user_id)}>
                      <CommentIcon hasBadge={moment.hasNewComments} />
                    </TouchableOpacity>
                    {!isOwn && <TouchableOpacity style={styles.reactBtnInline} onPress={() => onOpenPicker?.(moment.id)}><PlusIcon /></TouchableOpacity>}
                  </View>
                </View>
              )}
              <ReactionsRow reactions={moment.reactions} currentUserId={currentUserId} photoId={moment.id} crownWinnerId={crownWinnerId} onOpenPicker={onOpenPicker} />
            </LinearGradient>
            <SecondCaptureThumbnail secondPath={moment.image_path} secondNote={moment.note} onPress={() => setSwapped(false)} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.fullscreenPage, { paddingTop: Math.max(insets.top, 12) + 12, paddingBottom: NAVBAR_HEIGHT + 12 }]}>
      <View style={styles.momentWrapper}>
        <View style={[StyleSheet.absoluteFill, { justifyContent: "center", alignItems: "center" }]} pointerEvents="none">
          <ActivityIndicator size="large" color="rgba(255,255,255,0.5)" />
        </View>
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsPaused((v) => !v)}>
          {isVisible && isPaused && (
            <View style={styles.pauseOverlay} pointerEvents="none">
              <View style={styles.pauseCircle}>
                <Svg width="24" height="24" viewBox="0 0 24 24" fill="#FFF"><Path d="M8 5v14l11-7z" /></Svg>
              </View>
            </View>
          )}
        </Pressable>
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={styles.momentOverlay}>
            <View style={styles.authorInfo}>
              <CrownedAvatar avatar_url={moment.avatar_url} username={moment.username} size={36} isCrown={crownWinnerId === moment.user_id} />
              <View style={{ flex: 1 }}>
                <View style={styles.usernameLine}>
                  <Text style={styles.username}>{moment.username}</Text>
                  <Text style={styles.momentTime}>{formatTime(moment.created_at)}</Text>
                </View>
                {moment.note && <ExpandableNote text={moment.note} maxLines={3} />}
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity style={styles.reactBtnInline} onPress={() => onOpenComments?.(moment.id, moment.user_id)}>
                  <CommentIcon hasBadge={moment.hasNewComments} />
                </TouchableOpacity>
                {!isOwn && (
                  <TouchableOpacity style={styles.reactBtnInline} onPress={() => onOpenPicker?.(moment.id)}>
                    <PlusIcon />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <ReactionsRow reactions={moment.reactions} currentUserId={currentUserId} photoId={moment.id} crownWinnerId={crownWinnerId} onOpenPicker={onOpenPicker} />
          </LinearGradient>
          {hasSecond && (
            <SecondCaptureThumbnail secondPath={moment.second_image_path!} secondNote={moment.second_note} onPress={() => setSwapped(true)} />
          )}
        </View>
      </View>
    </View>
  );
}

function RevealIntroPage({ groupName, isVisible }: { groupName?: string; isVisible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  const hintOpacity = useRef(new Animated.Value(0)).current;
  const hintY = useRef(new Animated.Value(0)).current;
  const hasPlayed = useRef(false);

  useEffect(() => {
    if (!isVisible || hasPlayed.current) return;
    hasPlayed.current = true;
    opacity.setValue(0);
    scale.setValue(0.9);
    hintOpacity.setValue(0);
    hintY.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, tension: 55, friction: 9, useNativeDriver: true }),
      ]),
      Animated.delay(300),
      Animated.timing(hintOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(hintY, { toValue: 8, duration: 600, useNativeDriver: true }),
          Animated.timing(hintY, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    });
  }, [isVisible]);

  return (
    <View style={styles.fullscreenPage}>
      <Animated.View style={{ alignItems: "center", opacity, transform: [{ scale }] }}>
        <Text style={styles.revealIntroEyebrow}>cette semaine</Text>
        <Text style={styles.revealIntroTitle}>Le Reveal</Text>
        {groupName ? <Text style={styles.revealIntroGroup}>{groupName}</Text> : null}
      </Animated.View>
      <Animated.View style={[styles.revealIntroHint, { opacity: hintOpacity, transform: [{ translateY: hintY }] }]}>
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Path d="M12 5v14M5 12l7 7 7-7" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        <Text style={styles.revealIntroHintText}>Scroll</Text>
      </Animated.View>
    </View>
  );
}

function formatCrownDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}j`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}min`);
  return parts.join(" ");
}

function CrownRevealPage({ winner, durationMs }: { winner: PhotoEntry; durationMs: number }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fullscreenPage, { paddingTop: Math.max(insets.top, 12) + 12, paddingBottom: NAVBAR_HEIGHT + 24, backgroundColor: "#0A0A0A", alignItems: "center", justifyContent: "center" }]}>
      <View style={styles.crownRevealInner}>
        <Svg width={64} height={64} viewBox="0 0 24 24" style={{ marginBottom: 4 }}>
          <Path d="M2 19l2-9 4.5 4L12 5l3.5 9L20 10l2 9H2z" fill="#FFD700" stroke="#B8860B" strokeWidth="0.8" strokeLinejoin="round" />
        </Svg>
        <Text style={styles.crownRevealTitle}>Couronne de la semaine</Text>
        <View style={styles.crownRevealAvatarWrap}>
          <View style={{ borderWidth: 3, borderColor: "#FFD700", borderRadius: 44 }}>
            <UserAvatar avatar_url={winner.avatar_url} username={winner.username} size={80} />
          </View>
        </View>
        <Text style={styles.crownRevealUsername}>{winner.username}</Text>
        <Text style={styles.crownRevealDurationLabel}>a tenu la couronne pendant</Text>
        <Text style={styles.crownRevealDuration}>{formatCrownDuration(durationMs)}</Text>
      </View>
    </View>
  );
}

export default function PhotoFeed({ photos, currentUserId, nextUnlockDate, revealEndDate, crownWinnerId, crownDurationMs = 0, groupName, onScrollLock, onActiveIndexChange, onOpenPicker, onOpenComments }: Props) {
  const insets = useSafeAreaInsets();
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [countdownText, setCountdownText] = useState("");
  const [revealTimeLeft, setRevealTimeLeft] = useState("");
  const [revealMsLeft, setRevealMsLeft] = useState(Infinity);
  const flatListRef = useRef<FlatList>(null);
  const [videoCache, setVideoCache] = useState<Record<string, string>>({});
  
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const [activePhotoOwnerId, setActivePhotoOwnerId] = useState<string | null>(null);

  const openComments = (photoId: string, ownerId: string) => {
    setActivePhotoId(photoId);
    setActivePhotoOwnerId(ownerId);
    setCommentModalVisible(true);
  };

  useEffect(() => {
    // Videos that are already local (served from mediaCache) don't need downloading again.
    // For any video whose URL is still a remote URL, download it for this session.
    const videos = photos.filter((p) => p.url && p.image_path.endsWith(".mp4") && p.url.startsWith("http"));
    let cancelled = false;
    (async () => {
      const entries: Record<string, string> = {};
      await Promise.all(videos.map(async (p) => {
        const filename = "reveal_" + p.image_path.replace(/\//g, "_");
        const localUri = `${FileSystem.cacheDirectory}${filename}`;
        try {
          const info = await FileSystem.getInfoAsync(localUri);
          if (!info.exists) await FileSystem.downloadAsync(p.url!, localUri);
          entries[p.url!] = localUri;
        } catch { entries[p.url!] = p.url!; }
      }));
      if (!cancelled) setVideoCache(entries);
    })();
    return () => { cancelled = true; };
  }, [photos]);

  useEffect(() => {
    const tick = () => {
      const distance = nextUnlockDate.getTime() - Date.now();
      if (distance < 0) { setCountdownText("00:00:00"); return; }
      const d = Math.floor(distance / 86400000);
      const h = Math.floor((distance % 86400000) / 3600000);
      const m = Math.floor((distance % 3600000) / 60000);
      const s = Math.floor((distance % 60000) / 1000);
      setCountdownText(`${d > 0 ? d + "j " : ""}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [nextUnlockDate]);

  useEffect(() => {
    if (!revealEndDate) return;
    const tick = () => {
      const ms = revealEndDate.getTime() - Date.now();
      if (ms <= 0) { setRevealTimeLeft("Expiré"); setRevealMsLeft(0); return; }
      setRevealMsLeft(ms);
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setRevealTimeLeft(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [revealEndDate]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      const idx = viewableItems[0].index;
      setVisibleIndex(idx);
      onActiveIndexChange?.(idx);
    }
  }, [onActiveIndexChange]);
  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 50 }), []);

  const items = useMemo<FeedItem[]>(() => {
    if (photos.length === 0) return [];
    const result: FeedItem[] = [];
    result.push({ type: "intro" });
    if (crownWinnerId) result.push({ type: "crown" });
    let lastDate = "";
    for (const photo of photos) {
      const d = photo.created_at.slice(0, 10);
      if (d !== lastDate) {
        result.push({ type: "separator", ...formatDayLabel(photo.created_at) });
        lastDate = d;
      }
      result.push({ type: "moment", data: photo });
    }
    result.push({ type: "end" });
    return result;
  }, [photos, crownWinnerId]);

  const renderItem = ({ item, index }: { item: FeedItem; index: number }) => {
    if (item.type === "intro") { return <RevealIntroPage groupName={groupName} isVisible={index === visibleIndex} />; }
    if (item.type === "crown") {
      const winner = photos.find((p) => p.user_id === crownWinnerId);
      if (!winner) return null;
      return <CrownRevealPage winner={winner} durationMs={crownDurationMs} />;
    }
    if (item.type === "separator") {
      const [day, date] = item.label.split("\n");
      return ( <View style={styles.fullscreenPage}><Text style={styles.separatorDay}>{day}</Text><Text style={styles.separatorDate}>{date}</Text></View> );
    }
    if (item.type === "end") {
      return ( <View style={styles.fullscreenPage}><View style={styles.endLogoMark} /><Text style={styles.endTitle}>Reveal terminé.</Text><Text style={styles.endSubtitle}>Prochain rewind dans :</Text><Text style={styles.countdownText}>{countdownText}</Text></View> );
    }

    const moment = item.data;
    const isTextOnly = moment.image_path === "text_mode";
    const isAudio = moment.image_path.endsWith(".m4a");
    const isVideo = moment.image_path.endsWith(".mp4");
    const isDrawing = moment.image_path.includes("_draw");
    const isOwn = moment.user_id === currentUserId;
    const textLen = moment.note?.length ?? 0;
    const fontSize = textLen <= 40 ? 32 : textLen <= 100 ? 26 : textLen <= 200 ? 21 : textLen <= 300 ? 17 : 15;

    if (isAudio) {
      return <AudioMoment moment={moment} isVisible={index === visibleIndex} currentUserId={currentUserId} crownWinnerId={crownWinnerId} onScrollLock={(locked) => { flatListRef.current?.setNativeProps({ scrollEnabled: !locked }); onScrollLock?.(locked); }} onOpenPicker={onOpenPicker} onOpenComments={openComments} />;
    }
    if (isVideo) {
      return <VideoMoment moment={moment} isVisible={index === visibleIndex} currentUserId={currentUserId} crownWinnerId={crownWinnerId} cachedUrl={videoCache[moment.url] ?? moment.url} onOpenPicker={onOpenPicker} onOpenComments={openComments} />;
    }

    return <PhotoMomentPage moment={moment} currentUserId={currentUserId} crownWinnerId={crownWinnerId} onOpenPicker={onOpenPicker} onOpenComments={openComments} isVisible={index === visibleIndex} />;
  };

  return (
    <View style={styles.list}>
      <FlatList
        ref={flatListRef}
        data={items}
        renderItem={renderItem}
        keyExtractor={(_, i) => i.toString()}
        pagingEnabled
        snapToInterval={SCREEN_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, i) => ({ length: SCREEN_HEIGHT, offset: SCREEN_HEIGHT * i, index: i })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        windowSize={21}
        maxToRenderPerBatch={3}
        initialNumToRender={3}
        removeClippedSubviews={Platform.OS === "android"}
        style={styles.list}
      />
      {revealEndDate && revealTimeLeft !== "" && (
        <View style={[styles.revealCountdownBar, { top: insets.top + 8 }]} pointerEvents="none">
          <View style={[styles.revealCountdownPill, revealMsLeft < 4 * 3600000 && styles.revealCountdownPillRed]}>
            <Svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginRight: 5 }}>
              <Path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke={revealMsLeft < 4 * 3600000 ? "#FFF" : "rgba(255,255,255,0.7)"} strokeWidth="2" strokeLinecap="round" />
            </Svg>
            <Text style={[styles.revealCountdownText, revealMsLeft < 4 * 3600000 && styles.revealCountdownTextRed]}>
              {revealTimeLeft}
            </Text>
          </View>
        </View>
      )}
      
      {activePhotoId && activePhotoOwnerId && (
        <CommentModal
          visible={commentModalVisible}
          onClose={() => setCommentModalVisible(false)}
          onSeen={onOpenComments}
          photoId={activePhotoId}
          photoOwnerId={activePhotoOwnerId}
        />
      )}
    </View>
  );
}


const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: "#000" },
  revealCountdownBar: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 10 },
  revealCountdownPill: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  revealCountdownPillRed: { backgroundColor: "rgba(200,30,30,0.75)", borderColor: "rgba(255,100,100,0.4)" },
  revealCountdownText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "rgba(255,255,255,0.85)", letterSpacing: 0.5 },
  revealCountdownTextRed: { color: "#FFF" },
  fullscreenPage: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, justifyContent: "center", alignItems: "center", backgroundColor: "#000", paddingHorizontal: 12 },
  momentWrapper: { flex: 1, width: '100%', borderRadius: 32, overflow: "hidden", backgroundColor: "#1A1A1A" },
  separatorDay: { fontFamily: "Inter_700Bold", fontSize: 48, color: "#FFF", textAlign: "center", letterSpacing: -2 },
  separatorDate: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginTop: 8 },
  textMomentBg: { flex: 1, width: "100%", justifyContent: "center", alignItems: "center", padding: 32, backgroundColor: "#050505" },
  quoteContainer: { width: "100%", alignItems: "center", gap: 32 },
  textMomentContent: { fontFamily: "Inter_700Bold", color: "#FFF", textAlign: "center", letterSpacing: -0.5 },
  citationFooter: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 20 },
  citationAvatar: { borderRadius: 16 },
  citationUsername: { color: "rgba(255,255,255,0.5)", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  citationTime: { color: "rgba(255,255,255,0.6)", fontFamily: "Inter_600SemiBold", fontSize: 13, marginTop: 3 },
  momentTime: { color: "rgba(255,255,255,0.55)", fontFamily: "Inter_600SemiBold", fontSize: 12 },
  momentOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 24, paddingBottom: 32, paddingTop: 80, gap: 14 },
  authorInfo: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  usernameLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  username: { color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 14 },
  momentNote: { color: "rgba(255,255,255,0.75)", fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 3 },
  noteExpand: { color: "rgba(255,255,255,0.45)", fontFamily: "Inter_600SemiBold", fontSize: 12, marginTop: 2 },
  reactionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reactionBubble: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  reactionBubbleMine: { backgroundColor: "rgba(255,255,255,0.28)", borderColor: "rgba(255,255,255,0.4)" },
  reactionBubbleCrown: { borderColor: "#FFF065", borderWidth: 1.5 },
  reactionAvatarStack: { flexDirection: "row" },
  reactionAvatarWrap: { borderRadius: 10, overflow: "hidden", borderWidth: 1.5, borderColor: "rgba(0,0,0,0.3)" },
  reactionStickerWrap: { marginLeft: 2 },
  reactionText: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 12 },
  reactionCount: { color: "rgba(255,255,255,0.7)", fontFamily: "Inter_700Bold", fontSize: 11, marginLeft: 2 },
  reactBtnInline: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  revealIntroEyebrow: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.4)", letterSpacing: 4, textTransform: "uppercase", marginBottom: 10 },
  revealIntroTitle: { fontFamily: "Inter_700Bold", fontSize: 58, color: "#FFF", letterSpacing: -1.5, lineHeight: 62 },
  revealIntroGroup: { fontFamily: "Inter_400Regular", fontSize: 18, color: "rgba(255,255,255,0.4)", marginTop: 10, textAlign: "center" },
  revealIntroHint: { position: "absolute", bottom: NAVBAR_HEIGHT + 24, alignItems: "center", gap: 6 },
  revealIntroHintText: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: 2, textTransform: "uppercase" },
  crownRevealInner: { alignItems: "center", paddingHorizontal: 32 },
  crownRevealTitle: { fontFamily: "Inter_700Bold", fontSize: 13, color: "#FFD700", letterSpacing: 2, textTransform: "uppercase", marginBottom: 28, marginTop: 8 },
  crownRevealAvatarWrap: { marginBottom: 20 },
  crownRevealUsername: { fontFamily: "Inter_700Bold", fontSize: 28, color: "#FFF", marginBottom: 12, textAlign: "center" },
  crownRevealDurationLabel: { fontFamily: "Inter_400Regular", fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 6 },
  crownRevealDuration: { fontFamily: "Inter_700Bold", fontSize: 38, color: "#FFD700", letterSpacing: 1 },
  endLogoMark: { width: 32, height: 32, borderWidth: 2, borderColor: "#FFF", borderRadius: 6, marginBottom: 24, transform: [{ rotate: "45deg" }] },
  endTitle: { fontFamily: "Inter_700Bold", fontSize: 24, color: "#FFF" },
  endSubtitle: { fontFamily: "Inter_400Regular", fontSize: 14, color: "rgba(255,255,255,0.4)", marginTop: 8 },
  countdownText: { fontFamily: "Inter_700Bold", fontSize: 32, color: "#FFF", marginTop: 12, letterSpacing: 2 },
  pauseOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
  pauseCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  audioWaveContainer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 },
  audioWaveBar: { width: 3, borderRadius: 2, backgroundColor: "#FFF" },
  audioPlayerRow: { flexDirection: "row", alignItems: "center", gap: 14, alignSelf: "stretch" },
  audioPlayBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center" },
  audioSpeedBtn: { width: 40, height: 28, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center" },
  audioSpeedText: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 12 },
  audioProgressWrapper: { flex: 1, gap: 4 },
  audioSeekHitArea: { paddingVertical: 14, justifyContent: "center" },
  audioSeekTrack: { height: 3, backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 2 },
  audioSeekFill: { height: 3, backgroundColor: "#FFF", borderRadius: 2 },
  audioSeekThumb: { position: "absolute", width: 13, height: 13, borderRadius: 7, backgroundColor: "#FFF", marginLeft: -6, top: 14 - 5 },
  audioTimesRow: { flexDirection: "row", justifyContent: "space-between" },
  audioTimeText: { fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "Inter_400Regular" },
  // Second capture thumbnail (bottom-right of momentWrapper)
  secondThumb: { position: "absolute", bottom: 72, right: 14, width: 48, height: 85, borderRadius: 8, overflow: "hidden", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.25)" },
  secondThumbBg: { flex: 1, backgroundColor: "#1A1A1A", justifyContent: "center", alignItems: "center" },
  secondThumbText: { color: "rgba(255,255,255,0.85)", fontFamily: "Inter_600SemiBold", fontSize: 7.5, textAlign: "center", lineHeight: 11 },
  secondThumbImage: { width: "100%", height: "100%" },
  secondThumbOverlay: { position: "absolute", bottom: 4, right: 4, width: 14, height: 14, borderRadius: 3, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" },
  secondThumbPlayBadge: { width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: "center", alignItems: "center", paddingLeft: 1 },
  secondThumbPlayCircle: { width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", paddingLeft: 2 },
});