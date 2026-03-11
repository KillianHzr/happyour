import { useMemo, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ViewToken,
} from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export type Reaction = {
  id: string;
  user_id: string;
  username: string;
  type: "emoji" | "photo";
  emoji?: string;
  image_url?: string;
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
  onReactPress?: (photoId: string) => void;
  nextUnlockDate: Date;
};

const ReactIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#FFFFFF" />
  </Svg>
);

const QuoteIcon = () => (
  <Svg width="40" height="40" viewBox="0 0 24 24" fill="none" opacity={0.2}>
    <Path d="M3 21c3 0 7-1 7-8V5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h4c0 3.5-3.5 4.5-3.5 4.5L3 21zM14 3h4c1.1 0 2 .9 2 2v6c0 1.1-.9 2-2 2h-4c0 3.5 3.5 4.5 3.5 4.5L14 21c3 0 7-1 7-8V5c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2z" fill="#FFF" />
  </Svg>
);

function formatDayLabel(dateStr: string): { date: string; label: string } {
  const d = new Date(dateStr);
  const day = d.toLocaleDateString("fr-FR", { weekday: "long" }).toUpperCase();
  const full = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  return { date: dateStr.slice(0, 10), label: `${day}\n${full}` };
}

function EndCountdown({ targetDate }: { targetDate: Date }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const distance = targetDate.getTime() - now;

      if (distance < 0) {
        setTimeLeft("00:00:00");
        return;
      }

      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      setTimeLeft(`${days > 0 ? days + 'j ' : ''}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  return <Text style={styles.countdownText}>{timeLeft}</Text>;
}

function VideoMoment({ moment, isVisible, onReactPress }: { moment: PhotoEntry; isVisible: boolean; onReactPress?: (id: string) => void }) {
  const player = useVideoPlayer(moment.url, (p) => {
    p.loop = true;
    p.muted = false;
  });

  useEffect(() => {
    if (isVisible) {
      player.play();
    } else {
      player.pause();
    }
  }, [isVisible, player]);

  return (
    <View style={styles.fullscreenPage}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.8)"]} style={styles.momentOverlay}>
        <View style={styles.authorInfo}>
          <View style={styles.avatar}>
            {moment.avatar_url ? (
              <Image source={{ uri: moment.avatar_url }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>{moment.username[0].toUpperCase()}</Text>
            )}
          </View>
          <View>
            <Text style={styles.username}>{moment.username}</Text>
            {moment.note && <Text style={styles.momentNote} numberOfLines={3}>{moment.note}</Text>}
          </View>
        </View>
      </LinearGradient>
      <TouchableOpacity style={styles.reactBtn} onPress={() => onReactPress?.(moment.id)}>
        <ReactIcon />
      </TouchableOpacity>
    </View>
  );
}

export default function PhotoFeed({ photos, onReactPress, nextUnlockDate }: Props) {
  const [visibleIndex, setVisibleIndex] = useState(0);

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
      const photoDate = photo.created_at.slice(0, 10);
      if (photoDate !== lastDate) {
        const { date, label } = formatDayLabel(photo.created_at);
        result.push({ type: "separator", date, label });
        lastDate = photoDate;
      }
      result.push({ type: "moment", data: photo });
    }
    result.push({ type: "end" });
    return result;
  }, [photos]);

  const renderItem = ({ item, index }: { item: FeedItem; index: number }) => {
    if (item.type === "separator") {
      const lines = item.label.split("\n");
      return (
        <View style={styles.fullscreenPage}>
          <Text style={styles.separatorDay}>{lines[0]}</Text>
          <Text style={styles.separatorDate}>{lines[1]}</Text>
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
    const adaptiveFontSize = textLen <= 40 ? 32 : textLen <= 100 ? 26 : textLen <= 200 ? 21 : textLen <= 300 ? 17 : 15;
    const adaptiveLineHeight = Math.round(adaptiveFontSize * 1.4);

    if (isVideo) {
      return <VideoMoment moment={moment} isVisible={index === visibleIndex} onReactPress={onReactPress} />;
    }

    return (
      <View style={styles.fullscreenPage}>
        {isTextOnly ? (
          <View style={styles.textMomentBg}>
            <View style={styles.quoteContainer}>
              <Text style={[styles.textMomentContent, { fontSize: adaptiveFontSize, lineHeight: adaptiveLineHeight }]}>{moment.note}</Text>
              <View style={styles.citationFooter}>
                <View style={styles.citationAvatar}>
                  {moment.avatar_url ? (
                    <Image source={{ uri: moment.avatar_url }} style={styles.avatarImg} />
                  ) : (
                    <Text style={styles.avatarText}>{moment.username[0].toUpperCase()}</Text>
                  )}
                </View>
                <Text style={styles.citationUsername}>{moment.username}</Text>
              </View>
            </View>
          </View>
        ) : (
          <>
            <Image source={{ uri: moment.url }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <LinearGradient colors={["transparent", "rgba(0,0,0,0.8)"]} style={styles.momentOverlay}>
              <View style={styles.authorInfo}>
                <View style={styles.avatar}>
                  {moment.avatar_url ? (
                    <Image source={{ uri: moment.avatar_url }} style={styles.avatarImg} />
                  ) : (
                    <Text style={styles.avatarText}>{moment.username[0].toUpperCase()}</Text>
                  )}
                </View>
                <View>
                  <Text style={styles.username}>{moment.username}</Text>
                  {moment.note && <Text style={styles.momentNote} numberOfLines={3}>{moment.note}</Text>}
                </View>
              </View>
            </LinearGradient>
          </>
        )}

        <TouchableOpacity style={styles.reactBtn} onPress={() => onReactPress?.(moment.id)}>
          <ReactIcon />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <FlatList
      data={items}
      renderItem={renderItem}
      keyExtractor={(item, i) => i.toString()}
      pagingEnabled
      snapToInterval={SCREEN_HEIGHT}
      snapToAlignment="start"
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      getItemLayout={(_, index) => ({ length: SCREEN_HEIGHT, offset: SCREEN_HEIGHT * index, index })}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      style={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: "#000" },
  fullscreenPage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  separatorDay: { fontFamily: "Inter_700Bold", fontSize: 48, color: "#FFF", textAlign: "center", letterSpacing: -2 },
  separatorDate: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginTop: 8 },
  
  textMomentBg: { flex: 1, width: "100%", justifyContent: "center", alignItems: "center", padding: 32, backgroundColor: "#050505" },
  quoteContainer: { width: "100%", alignItems: "center", gap: 32 },
  quoteHeader: { width: "100%", alignItems: "flex-start", marginBottom: -10 },
  textMomentContent: { fontFamily: "Inter_700Bold", fontSize: 32, color: "#FFF", textAlign: "center", lineHeight: 44, letterSpacing: -0.5 },
  
  citationFooter: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 20 },
  citationAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center", overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  citationAvatarImg: { width: "100%", height: "100%" },
  avatarImg: { width: "100%", height: "100%" },
  avatarText: { color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 16 },
  citationUsername: { color: "rgba(255,255,255,0.5)", fontFamily: "Inter_600SemiBold", fontSize: 15 },

  momentOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 24, paddingBottom: 120, paddingTop: 60 },
  authorInfo: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center", overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  username: { color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 16 },
  momentNote: { color: "rgba(255,255,255,0.8)", fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 4, maxWidth: SCREEN_WIDTH - 100 },
  
  reactBtn: { position: "absolute", right: 20, bottom: 160, width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  
  endLogoMark: { width: 32, height: 32, borderWidth: 2, borderColor: "#FFF", borderRadius: 6, marginBottom: 24, transform: [{ rotate: "45deg" }] },
  endTitle: { fontFamily: "Inter_700Bold", fontSize: 24, color: "#FFF" },
  endSubtitle: { fontFamily: "Inter_400Regular", fontSize: 14, color: "rgba(255,255,255,0.4)", marginTop: 8 },
  countdownText: { fontFamily: "Inter_700Bold", fontSize: 32, color: "#FFF", marginTop: 12, letterSpacing: 2 },
});
