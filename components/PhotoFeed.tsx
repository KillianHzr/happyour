import { useMemo, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Modal,
  Pressable,
  ViewToken,
} from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { STICKERS, type StickerId } from "./stickers";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export type Reaction = {
  id: string;
  user_id: string;
  username: string;
  avatar_url?: string | null;
  sticker_id: StickerId;
};

export type PhotoEntry = {
  id: string;
  url: string;
  created_at: string;
  note: string | null;
  username: string;
  avatar_url?: string | null;
  image_path: string;
  reactions: Reaction[];
};

type FeedItem =
  | { type: "moment"; data: PhotoEntry }
  | { type: "separator"; date: string; label: string }
  | { type: "end" };

type Props = {
  photos: PhotoEntry[];
  onReact?: (photoId: string, stickerId: StickerId) => void;
  currentUserId?: string;
  nextUnlockDate: Date;
};

// --- Icône "réagir" (bulle + éclair, pas un cœur) ---
const ReactIcon = () => (
  <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <Path
      d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
      fill="rgba(255,255,255,0.9)"
    />
  </Svg>
);

// --- Avatar générique : photo ou initiale ---
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

// --- Bulles de réactions groupées par sticker ---
function ReactionsRow({ reactions, currentUserId, onReact, photoId }: {
  reactions: Reaction[];
  currentUserId?: string;
  onReact?: (photoId: string, stickerId: StickerId) => void;
  photoId: string;
}) {
  if (reactions.length === 0) return null;

  // Grouper par sticker
  const groups = STICKERS
    .map(({ id, Component }) => ({
      id,
      Component,
      users: reactions.filter((r) => r.sticker_id === id),
    }))
    .filter((g) => g.users.length > 0);

  return (
    <View style={styles.reactionsRow}>
      {groups.map(({ id, Component, users }) => {
        const iMine = users.some((r) => r.user_id === currentUserId);
        return (
          <TouchableOpacity
            key={id}
            style={[styles.reactionBubble, iMine && styles.reactionBubbleMine]}
            onPress={() => onReact?.(photoId, id as StickerId)}
            activeOpacity={0.75}
          >
            {/* Avatars empilés (max 2) */}
            <View style={styles.reactionAvatarStack}>
              {users.slice(0, 2).map((r, i) => (
                <View key={r.id} style={[styles.reactionAvatarWrap, { zIndex: 2 - i, marginLeft: i === 0 ? 0 : -8 }]}>
                  <UserAvatar avatar_url={r.avatar_url} username={r.username} size={20} />
                </View>
              ))}
            </View>
            {/* Sticker SVG */}
            <View style={styles.reactionStickerWrap}>
              <Component width={32} height={12} />
            </View>
            {/* Compte si > 2 */}
            {users.length > 2 && (
              <Text style={styles.reactionCount}>+{users.length - 2}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// --- Picker de stickers ---
function StickerPicker({ visible, onClose, onSelect, myReaction }: {
  visible: boolean;
  onClose: () => void;
  onSelect: (id: StickerId) => void;
  myReaction?: StickerId | null;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.pickerBackdrop} onPress={onClose}>
        <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.pickerHandle} />
          <Text style={styles.pickerTitle}>Réagir</Text>
          <View style={styles.pickerGrid}>
            {STICKERS.map(({ id, Component, label }) => {
              const isActive = myReaction === id;
              return (
                <TouchableOpacity
                  key={id}
                  style={[styles.pickerItem, isActive && styles.pickerItemActive]}
                  onPress={() => { onSelect(id as StickerId); onClose(); }}
                  activeOpacity={0.7}
                >
                  <Component width={52} height={20} />
                  <Text style={styles.pickerLabel}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// --- Countdown ---
function EndCountdown({ targetDate }: { targetDate: Date }) {
  const [timeLeft, setTimeLeft] = useState("");
  useEffect(() => {
    const timer = setInterval(() => {
      const distance = targetDate.getTime() - Date.now();
      if (distance < 0) { setTimeLeft("00:00:00"); return; }
      const d = Math.floor(distance / 86400000);
      const h = Math.floor((distance % 86400000) / 3600000);
      const m = Math.floor((distance % 3600000) / 60000);
      const s = Math.floor((distance % 60000) / 1000);
      setTimeLeft(`${d > 0 ? d + "j " : ""}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);
  return <Text style={styles.countdownText}>{timeLeft}</Text>;
}

function formatDayLabel(dateStr: string) {
  const d = new Date(dateStr);
  const day = d.toLocaleDateString("fr-FR", { weekday: "long" }).toUpperCase();
  const full = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  return { date: dateStr.slice(0, 10), label: `${day}\n${full}` };
}

// --- Moment vidéo ---
function VideoMoment({ moment, isVisible, onReact, currentUserId }: {
  moment: PhotoEntry;
  isVisible: boolean;
  onReact?: (photoId: string, stickerId: StickerId) => void;
  currentUserId?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const player = useVideoPlayer(moment.url, (p) => { p.loop = true; p.muted = false; });
  const myReaction = moment.reactions.find((r) => r.user_id === currentUserId)?.sticker_id ?? null;

  useEffect(() => {
    if (isVisible) player.play(); else player.pause();
  }, [isVisible, player]);

  return (
    <View style={styles.fullscreenPage}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={styles.momentOverlay}>
        <View style={styles.authorInfo}>
          <UserAvatar avatar_url={moment.avatar_url} username={moment.username} size={40} />
          <View>
            <Text style={styles.username}>{moment.username}</Text>
            {moment.note && <Text style={styles.momentNote} numberOfLines={3}>{moment.note}</Text>}
          </View>
        </View>
        <ReactionsRow reactions={moment.reactions} currentUserId={currentUserId} onReact={onReact} photoId={moment.id} />
      </LinearGradient>
      <TouchableOpacity style={styles.reactBtn} onPress={() => setPickerOpen(true)}>
        <ReactIcon />
      </TouchableOpacity>
      <StickerPicker visible={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={(sid) => onReact?.(moment.id, sid)} myReaction={myReaction} />
    </View>
  );
}

// --- Feed principal ---
export default function PhotoFeed({ photos, onReact, currentUserId, nextUnlockDate }: Props) {
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setVisibleIndex(viewableItems[0].index);
    }
  }, []);
  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 50 }), []);

  const items = useMemo<FeedItem[]>(() => {
    if (photos.length === 0) return [];
    const result: FeedItem[] = [];
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
  }, [photos]);

  const renderItem = ({ item, index }: { item: FeedItem; index: number }) => {
    if (item.type === "separator") {
      const [day, date] = item.label.split("\n");
      return (
        <View style={styles.fullscreenPage}>
          <Text style={styles.separatorDay}>{day}</Text>
          <Text style={styles.separatorDate}>{date}</Text>
        </View>
      );
    }

    if (item.type === "end") {
      return (
        <View style={styles.fullscreenPage}>
          <View style={styles.endLogoMark} />
          <Text style={styles.endTitle}>Semaine terminée.</Text>
          <Text style={styles.endSubtitle}>Prochain rewind dans :</Text>
          <EndCountdown targetDate={nextUnlockDate} />
        </View>
      );
    }

    const moment = item.data;
    const isTextOnly = moment.image_path === "text_mode";
    const isVideo = moment.image_path.endsWith(".mp4");
    const textLen = moment.note?.length ?? 0;
    const fontSize = textLen <= 40 ? 32 : textLen <= 100 ? 26 : textLen <= 200 ? 21 : textLen <= 300 ? 17 : 15;
    const myReaction = moment.reactions.find((r) => r.user_id === currentUserId)?.sticker_id ?? null;

    if (isVideo) {
      return <VideoMoment moment={moment} isVisible={index === visibleIndex} onReact={onReact} currentUserId={currentUserId} />;
    }

    return (
      <View style={styles.fullscreenPage}>
        {isTextOnly ? (
          <View style={styles.textMomentBg}>
            <View style={styles.quoteContainer}>
              <Text style={[styles.textMomentContent, { fontSize, lineHeight: Math.round(fontSize * 1.4) }]}>{moment.note}</Text>
              <View style={styles.citationFooter}>
                <View style={styles.citationAvatar}>
                  <UserAvatar avatar_url={moment.avatar_url} username={moment.username} size={32} />
                </View>
                <Text style={styles.citationUsername}>{moment.username}</Text>
              </View>
            </View>
          </View>
        ) : (
          <Image source={{ uri: moment.url }} style={StyleSheet.absoluteFill} contentFit="cover" />
        )}

        <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={styles.momentOverlay}>
          <View style={styles.authorInfo}>
            <UserAvatar avatar_url={moment.avatar_url} username={moment.username} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={styles.username}>{moment.username}</Text>
              {moment.note && !isTextOnly && <Text style={styles.momentNote} numberOfLines={2}>{moment.note}</Text>}
            </View>
          </View>
          <ReactionsRow reactions={moment.reactions} currentUserId={currentUserId} onReact={onReact} photoId={moment.id} />
        </LinearGradient>

        <TouchableOpacity style={styles.reactBtn} onPress={() => setOpenPickerId(moment.id)}>
          <ReactIcon />
        </TouchableOpacity>

        <StickerPicker
          visible={openPickerId === moment.id}
          onClose={() => setOpenPickerId(null)}
          onSelect={(sid) => { onReact?.(moment.id, sid); setOpenPickerId(null); }}
          myReaction={myReaction}
        />
      </View>
    );
  };

  return (
    <FlatList
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
      style={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: "#000" },
  fullscreenPage: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, justifyContent: "center", alignItems: "center", backgroundColor: "#000" },
  separatorDay: { fontFamily: "Inter_700Bold", fontSize: 48, color: "#FFF", textAlign: "center", letterSpacing: -2 },
  separatorDate: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginTop: 8 },
  textMomentBg: { flex: 1, width: "100%", justifyContent: "center", alignItems: "center", padding: 32, backgroundColor: "#050505" },
  quoteContainer: { width: "100%", alignItems: "center", gap: 32 },
  textMomentContent: { fontFamily: "Inter_700Bold", color: "#FFF", textAlign: "center", letterSpacing: -0.5 },
  citationFooter: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 20 },
  citationAvatar: { borderRadius: 16, overflow: "hidden" },
  citationUsername: { color: "rgba(255,255,255,0.5)", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  momentOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 24, paddingBottom: 110, paddingTop: 80, gap: 14 },
  authorInfo: { flexDirection: "row", alignItems: "center", gap: 12 },
  username: { color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 16 },
  momentNote: { color: "rgba(255,255,255,0.75)", fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 3 },
  // Reactions
  reactionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reactionBubble: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  reactionBubbleMine: { backgroundColor: "rgba(255,255,255,0.28)", borderColor: "rgba(255,255,255,0.4)" },
  reactionAvatarStack: { flexDirection: "row" },
  reactionAvatarWrap: { borderRadius: 10, overflow: "hidden", borderWidth: 1.5, borderColor: "rgba(0,0,0,0.3)" },
  reactionStickerWrap: { marginLeft: 2 },
  reactionCount: { color: "rgba(255,255,255,0.7)", fontFamily: "Inter_700Bold", fontSize: 11, marginLeft: 2 },
  // React button
  reactBtn: { position: "absolute", right: 20, bottom: 160, width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.18)", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  // Sticker picker
  pickerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  pickerSheet: { backgroundColor: "#1A1A1A", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 40, paddingTop: 12, paddingHorizontal: 20 },
  pickerHandle: { width: 36, height: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2, alignSelf: "center", marginBottom: 20 },
  pickerTitle: { color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 18, marginBottom: 20 },
  pickerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  pickerItem: { flex: 1, minWidth: "28%", alignItems: "center", gap: 8, paddingVertical: 16, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  pickerItemActive: { backgroundColor: "rgba(255,255,255,0.18)", borderColor: "rgba(255,255,255,0.35)" },
  pickerLabel: { color: "rgba(255,255,255,0.5)", fontFamily: "Inter_600SemiBold", fontSize: 11 },
  // End screen
  endLogoMark: { width: 32, height: 32, borderWidth: 2, borderColor: "#FFF", borderRadius: 6, marginBottom: 24, transform: [{ rotate: "45deg" }] },
  endTitle: { fontFamily: "Inter_700Bold", fontSize: 24, color: "#FFF" },
  endSubtitle: { fontFamily: "Inter_400Regular", fontSize: 14, color: "rgba(255,255,255,0.4)", marginTop: 8 },
  countdownText: { fontFamily: "Inter_700Bold", fontSize: 32, color: "#FFF", marginTop: 12, letterSpacing: 2 },
});
