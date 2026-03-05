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

const { width, height: SCREEN_HEIGHT } = Dimensions.get("window");

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
  reactions: Reaction[];
};

type FeedItem =
  | { type: "photo"; data: PhotoEntry }
  | { type: "separator"; date: string; label: string }
  | { type: "end" };

type Props = {
  photos: PhotoEntry[];
  onPhotoPress?: (photo: PhotoEntry) => void;
  onReactPress?: (photoId: string) => void;
  onReactionPhotoPress?: (url: string) => void;
};

const ReactIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#FFFFFF" />
  </Svg>
);

function formatDayLabel(dateStr: string): { date: string; label: string } {
  const d = new Date(dateStr);
  const day = d.toLocaleDateString("fr-FR", { weekday: "long" }).toUpperCase();
  const full = d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return { date: dateStr.slice(0, 10), label: `${day}\n${full}` };
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function PhotoFeed({
  photos,
  onPhotoPress,
  onReactPress,
  onReactionPhotoPress,
}: Props) {
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
      result.push({ type: "photo", data: photo });
    }
    
    // Ajouter l'élément final
    result.push({ type: "end" });
    
    return result;
  }, [photos]);

  if (photos.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Aucun moment cette semaine.</Text>
      </View>
    );
  }

  const getItemLayout = (_: any, index: number) => ({
    length: SCREEN_HEIGHT,
    offset: SCREEN_HEIGHT * index,
    index,
  });

  const renderItem = ({ item }: { item: FeedItem }) => {
    if (item.type === "separator") {
      const lines = item.label.split("\n");
      return (
        <View style={styles.separatorContainer}>
          <Text style={styles.separatorDay}>{lines[0]}</Text>
          <Text style={styles.separatorDate}>{lines[1]}</Text>
        </View>
      );
    }

    if (item.type === "end") {
      return (
        <View style={styles.endContainer}>
          <LinearGradient
            colors={["rgba(255,255,255,0.05)", "transparent"]}
            style={styles.endGlow}
          />
          <View style={styles.endLogoMark} />
          <Text style={styles.endTitle}>Semaine terminée.</Text>
          <Text style={styles.endSubtitle}>
            Tous les moments de votre groupe ont été dévoilés.
          </Text>
          <View style={styles.endDivider} />
          <TouchableOpacity 
            style={[theme.accentButton, styles.newWeekBtn]}
            onPress={() => router.back()}
          >
            <Text style={theme.accentButtonText}>Nouvelle semaine</Text>
          </TouchableOpacity>
          <Text style={styles.endFooter}>[noname]</Text>
        </View>
      );
    }

    const photo = item.data;
    const initial = photo.username?.charAt(0).toUpperCase() ?? "?";
    const time = formatTime(photo.created_at);
    const reactions = photo.reactions ?? [];

    return (
      <View style={styles.photoContainer}>
        <Image
          source={{ uri: photo.url }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          transition={300}
        />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.85)"]}
          style={styles.overlay}
        >
          {reactions.length > 0 && (
            <View style={styles.reactionsRow}>
              {reactions.map((r) =>
                r.type === "emoji" ? (
                  <View key={r.id} style={styles.reactionTextBadge}>
                    <Text style={styles.reactionText}>{r.emoji}</Text>
                  </View>
                ) : r.image_url ? (
                  <Pressable
                    key={r.id}
                    onPress={() => onReactionPhotoPress?.(r.image_url!)}
                  >
                    <Image
                      source={{ uri: r.image_url }}
                      style={styles.reactionSelfie}
                    />
                  </Pressable>
                ) : null
              )}
            </View>
          )}
          <View style={styles.authorRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View>
              <Text style={styles.username}>{photo.username}</Text>
              <Text style={styles.time}>{time}</Text>
            </View>
          </View>
          {photo.note ? (
            <Text style={styles.note} numberOfLines={2}>
              {photo.note}
            </Text>
          ) : null}
        </LinearGradient>

        <Pressable
          style={styles.reactButton}
          onPress={() => onReactPress?.(photo.id)}
        >
          <ReactIcon />
        </Pressable>
      </View>
    );
  };

  return (
    <FlatList
      data={items}
      keyExtractor={(item, i) => {
        if (item.type === "separator") return `sep-${item.date}`;
        if (item.type === "end") return "feed-end";
        return `photo-${item.data.id}`;
      }}
      renderItem={renderItem}
      getItemLayout={getItemLayout}
      pagingEnabled
      snapToInterval={SCREEN_HEIGHT}
      snapToAlignment="start"
      decelerationRate="fast"
      disableIntervalMomentum={true}
      showsVerticalScrollIndicator={false}
      style={styles.list}
      removeClippedSubviews={true}
      maxToRenderPerBatch={3}
      windowSize={5}
      initialNumToRender={2}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.bg },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  emptyText: { fontFamily: "Inter_400Regular", color: colors.secondary, fontSize: 16 },

  separatorContainer: {
    height: SCREEN_HEIGHT,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  separatorDay: {
    fontFamily: "Inter_700Bold",
    fontSize: 48,
    color: colors.text,
    textAlign: "center",
    letterSpacing: -1,
  },
  separatorDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: colors.secondary,
    marginTop: 8,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  photoContainer: {
    height: SCREEN_HEIGHT,
    width,
    backgroundColor: colors.bg,
  },
  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 80,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: colors.text,
  },
  username: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: colors.text,
  },
  time: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: colors.secondary,
  },
  note: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: colors.text,
    marginTop: 12,
    lineHeight: 20,
  },

  reactionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  reactionTextBadge: {
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  reactionText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: colors.text,
    textTransform: "uppercase",
  },
  reactionSelfie: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },

  reactButton: {
    position: "absolute",
    bottom: 140,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },

  // Final screen
  endContainer: {
    height: SCREEN_HEIGHT,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  endGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  endLogoMark: {
    width: 32,
    height: 32,
    borderWidth: 2,
    borderColor: "#fff",
    borderRadius: 6,
    marginBottom: 32,
    transform: [{ rotate: "45deg" }],
    opacity: 0.8,
  },
  endTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 32,
    color: colors.text,
    textAlign: "center",
    letterSpacing: -1,
  },
  endSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: colors.secondary,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 22,
  },
  endDivider: {
    width: 40,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginVertical: 40,
  },
  newWeekBtn: {
    width: "100%",
    maxWidth: 240,
  },
  endFooter: {
    position: "absolute",
    bottom: 60,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: colors.secondary,
    opacity: 0.3,
    letterSpacing: 2,
  },
});
