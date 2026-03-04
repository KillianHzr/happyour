import { useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Dimensions,
  Pressable,
  Platform,
} from "react-native";
import { Image } from "expo-image";

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
  | { type: "separator"; date: string; label: string };

type Props = {
  photos: PhotoEntry[];
  onPhotoPress?: (photo: PhotoEntry) => void;
  onReactPress?: (photoId: string) => void;
  onReactionPhotoPress?: (url: string) => void;
};

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

    const photo = item.data;
    const initial = photo.username?.charAt(0).toUpperCase() ?? "?";
    const time = formatTime(photo.created_at);
    const reactions = photo.reactions ?? [];

    return (
      <Pressable
        style={styles.photoContainer}
        onPress={() => onPhotoPress?.(photo)}
      >
        <Image
          source={{ uri: photo.url }}
          style={StyleSheet.absoluteFillObject}
          contentFit="contain"
          transition={300}
        />
        <View style={styles.overlay}>
          {reactions.length > 0 && (
            <View style={styles.reactionsRow}>
              {reactions.map((r) =>
                r.type === "emoji" ? (
                  <Text key={r.id} style={styles.reactionEmoji}>
                    {r.emoji}
                  </Text>
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
        </View>

        {/* React button */}
        <Pressable
          style={styles.reactButton}
          onPress={() => onReactPress?.(photo.id)}
        >
          <Text style={styles.reactButtonText}>😊</Text>
        </Pressable>
      </Pressable>
    );
  };

  return (
    <FlatList
      data={items}
      keyExtractor={(item, i) =>
        item.type === "separator" ? `sep-${item.date}` : `photo-${item.data.id}`
      }
      renderItem={renderItem}
      getItemLayout={getItemLayout}
      pagingEnabled
      snapToAlignment="start"
      decelerationRate="normal"
      showsVerticalScrollIndicator={false}
      style={styles.list}
      removeClippedSubviews={Platform.OS !== "web"}
      maxToRenderPerBatch={3}
      windowSize={3}
      initialNumToRender={2}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: "#000" },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  emptyText: { fontFamily: "Inter_400Regular", color: "#999", fontSize: 16 },

  // Separator
  separatorContainer: {
    height: SCREEN_HEIGHT,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  separatorDay: {
    fontFamily: "Inter_700Bold",
    fontSize: 40,
    color: "#fff",
    textAlign: "center",
  },
  separatorDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 18,
    color: "#aaa",
    marginTop: 8,
    textAlign: "center",
    textTransform: "capitalize",
  },

  // Photo card
  photoContainer: {
    height: SCREEN_HEIGHT,
    width,
    backgroundColor: "#000",
  },
  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: "#000",
  },
  username: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
  time: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#ccc",
  },
  note: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: "#fff",
    marginTop: 10,
  },

  // Reactions row
  reactionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  reactionEmoji: {
    fontSize: 28,
  },
  reactionSelfie: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#fff",
  },

  // React button
  reactButton: {
    position: "absolute",
    bottom: 140,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  reactButtonText: {
    fontSize: 22,
  },
});
