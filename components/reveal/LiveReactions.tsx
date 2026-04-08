import { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Pressable,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

const EMOTES = [
  { id: "laugh", emoji: "😂" },
  { id: "wow",   emoji: "😮" },
  { id: "love",  emoji: "❤️" },
  { id: "fire",  emoji: "🔥" },
  { id: "dead",  emoji: "💀" },
  { id: "clap",  emoji: "👏" },
];

type Participant = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  currentEmote: string | null;
  emoteX: Animated.Value;
  emoteOpacity: Animated.Value;
  avatarScale: Animated.Value;
};

type Props = {
  groupId: string;
  currentUserId: string;
  currentUsername: string;
  currentAvatarUrl: string | null;
  isVisible: boolean;
  bottomOffset?: number;
};

export default function LiveReactions({
  groupId,
  currentUserId,
  currentUsername,
  currentAvatarUrl,
  isVisible,
  bottomOffset = 110,
}: Props) {
  const insets = useSafeAreaInsets();
  const [participants, setParticipants] = useState<Map<string, Participant>>(new Map());
  const [showEmoteWheel, setShowEmoteWheel] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Ref mirror so callbacks always see the latest participants without stale closure
  const pRef = useRef<Map<string, Participant>>(new Map());

  const sync = () => setParticipants(new Map(pRef.current));

  const makeParticipant = (userId: string, username: string, avatarUrl: string | null): Participant => ({
    userId,
    username,
    avatarUrl,
    currentEmote: null,
    emoteX: new Animated.Value(0),
    emoteOpacity: new Animated.Value(0),
    avatarScale: new Animated.Value(1),
  });

  const playEmote = (p: Participant, emoji: string) => {
    p.currentEmote = emoji;
    p.emoteX.setValue(0);
    p.emoteOpacity.setValue(1);

    Animated.parallel([
      // Emoji shoots left across the screen
      Animated.timing(p.emoteX, {
        toValue: -280,
        duration: 900,
        useNativeDriver: true,
      }),
      // Fade out in the second half
      Animated.sequence([
        Animated.delay(450),
        Animated.timing(p.emoteOpacity, {
          toValue: 0,
          duration: 450,
          useNativeDriver: true,
        }),
      ]),
      // Avatar bounces
      Animated.sequence([
        Animated.timing(p.avatarScale, { toValue: 1.35, duration: 120, useNativeDriver: true }),
        Animated.timing(p.avatarScale, { toValue: 0.9,  duration: 100, useNativeDriver: true }),
        Animated.timing(p.avatarScale, { toValue: 1.1,  duration: 80,  useNativeDriver: true }),
        Animated.timing(p.avatarScale, { toValue: 1,    duration: 80,  useNativeDriver: true }),
      ]),
    ]).start(() => sync());
  };

  useEffect(() => {
    if (!isVisible) {
      // Leaving the vault view — disconnect cleanly
      const ch = channelRef.current;
      if (ch) {
        ch.send({ type: "broadcast", event: "leave", payload: { userId: currentUserId } })
          .catch(() => {})
          .finally(() => {
            supabase.removeChannel(ch);
            channelRef.current = null;
          });
      }
      pRef.current.clear();
      setParticipants(new Map());
      setShowEmoteWheel(false);
      return;
    }

    // (Re)entering the vault view — connect
    setDisabled(false);
    const channel = supabase.channel(`reveal:${groupId}`, {
      config: { broadcast: { self: true } },
    });
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "join" }, ({ payload }) => {
        const { userId, username, avatarUrl } = payload as {
          userId: string; username: string; avatarUrl: string | null;
        };
        if (!pRef.current.has(userId)) {
          pRef.current.set(userId, makeParticipant(userId, username, avatarUrl));
          sync();
        }
      })
      .on("broadcast", { event: "leave" }, ({ payload }) => {
        pRef.current.delete((payload as { userId: string }).userId);
        sync();
      })
      .on("broadcast", { event: "emote" }, ({ payload }) => {
        const { userId, emoji } = payload as { userId: string; emoji: string };
        const p = pRef.current.get(userId);
        if (p) {
          playEmote(p, emoji);
          sync();
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          try {
            await channel.send({
              type: "broadcast",
              event: "join",
              payload: { userId: currentUserId, username: currentUsername, avatarUrl: currentAvatarUrl },
            });
          } catch {
            setDisabled(true);
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setDisabled(true);
        }
      });

    return () => {
      channel
        .send({ type: "broadcast", event: "leave", payload: { userId: currentUserId } })
        .catch(() => {})
        .finally(() => supabase.removeChannel(channel));
    };
  }, [isVisible, groupId, currentUserId, currentUsername, currentAvatarUrl]);

  const sendEmote = useCallback(async (emoji: string) => {
    setShowEmoteWheel(false);
    try {
      await channelRef.current?.send({
        type: "broadcast",
        event: "emote",
        payload: { userId: currentUserId, emoji },
      });
    } catch {
      // silently ignore — feature just stops working, no crash
    }
  }, [currentUserId]);

  const list = Array.from(participants.values());

  if (disabled) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">

      {/* Avatars — top right, vertical stack */}
      <View style={[styles.avatarsCol, { top: insets.top + 8 }]} pointerEvents="none">
        {list.map((p) => (
          <View key={p.userId} style={styles.avatarWrapper}>
            <Animated.Text
              style={[styles.floatingEmote, { transform: [{ translateX: p.emoteX }], opacity: p.emoteOpacity }]}
            >
              {p.currentEmote ?? ""}
            </Animated.Text>
            <Animated.View style={{ transform: [{ scale: p.avatarScale }] }}>
              {p.avatarUrl ? (
                <Image source={{ uri: p.avatarUrl }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitial}>{p.username[0]?.toUpperCase() ?? "?"}</Text>
                </View>
              )}
            </Animated.View>
          </View>
        ))}
      </View>

      {/* Emote wheel */}
      {showEmoteWheel && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowEmoteWheel(false)} pointerEvents="auto">
          <View style={[styles.wheelAnchor, { bottom: bottomOffset + 52 }]}>
            <View style={styles.wheel}>
              {EMOTES.map((e) => (
                <TouchableOpacity
                  key={e.id}
                  style={styles.wheelItem}
                  onPress={() => sendEmote(e.emoji)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.wheelEmoji}>{e.emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Pressable>
      )}

      {/* Emote trigger button — bottom right */}
      <TouchableOpacity
        style={[styles.emoteBtn, { bottom: bottomOffset }]}
        onPress={() => setShowEmoteWheel((v) => !v)}
        activeOpacity={0.8}
        pointerEvents="auto"
      >
        <Text style={styles.emoteBtnIcon}>😊</Text>
      </TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({
  avatarsCol: {
    position: "absolute",
    right: 14,
    gap: 8,
    alignItems: "center",
  },
  avatarWrapper: {
    alignItems: "center",
    width: 36,
  },
  floatingEmote: {
    fontSize: 22,
    position: "absolute",
    right: 0,
    top: 6,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.5)",
  },
  avatarFallback: {
    backgroundColor: "#6D28D9",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    color: "#FFF",
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  emoteBtn: {
    position: "absolute",
    left: 14,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  emoteBtnIcon: { fontSize: 20 },
  wheelAnchor: {
    position: "absolute",
    left: 14,
    alignItems: "flex-start",
  },
  wheel: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "rgba(20,20,20,0.92)",
    borderRadius: 20,
    padding: 10,
    gap: 6,
    width: 172,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  wheelItem: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  wheelEmoji: { fontSize: 26 },
});
