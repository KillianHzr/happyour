import { useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Dimensions,
  Pressable,
  TouchableOpacity,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { colors, theme } from "../lib/theme";
import { router } from "expo-router";

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
};

const ReactIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#FFFFFF" />
  </Svg>
);

function formatDayLabel(dateStr: string): { date: string; label: string } {
  const d = new Date(dateStr);
  const day = d.toLocaleDateString("fr-FR", { weekday: "long" }).toUpperCase();
  const full = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  return { date: dateStr.slice(0, 10), label: `${day}\n${full}` };
}

export default function PhotoFeed({ photos, onReactPress }: Props) {
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

  const renderItem = ({ item }: { item: FeedItem }) => {
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
          <Text style={styles.endSubtitle}>Revenez demain pour de nouveaux moments.</Text>
        </View>
      );
    }

    const moment = item.data;
    const isTextOnly = moment.image_path === "text_mode";

    return (
      <View style={styles.fullscreenPage}>
        {isTextOnly ? (
          <View style={styles.textMomentBg}>
            <Text style={styles.textMomentContent}>{moment.note}</Text>
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
  
  textMomentBg: { flex: 1, width: "100%", justifyContent: "center", alignItems: "center", padding: 40, backgroundColor: "#0A0A0A" },
  textMomentContent: { fontFamily: "Inter_700Bold", fontSize: 32, color: "#FFF", textAlign: "center", lineHeight: 42 },
  
  momentOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 24, paddingBottom: 120, paddingTop: 60 },
  authorInfo: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center", overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  avatarImg: { width: "100%", height: "100%" },
  avatarText: { color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 16 },
  username: { color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 16 },
  momentNote: { color: "rgba(255,255,255,0.8)", fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 4, maxWidth: SCREEN_WIDTH - 100 },
  
  reactBtn: { position: "absolute", right: 20, bottom: 160, width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  
  endLogoMark: { width: 32, height: 32, borderWidth: 2, borderColor: "#FFF", borderRadius: 6, marginBottom: 24, transform: [{ rotate: "45deg" }] },
  endTitle: { fontFamily: "Inter_700Bold", fontSize: 24, color: "#FFF" },
  endSubtitle: { fontFamily: "Inter_400Regular", fontSize: 14, color: "rgba(255,255,255,0.4)", marginTop: 8 },
});
