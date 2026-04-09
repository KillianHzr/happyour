import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, AppState, type AppStateStatus } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

type Participant = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  avatarScale: Animated.Value;
};

type Props = {
  groupId: string;
  currentUserId: string;
  currentUsername: string;
  currentAvatarUrl: string | null;
  isVisible: boolean;
};

export default function LiveReactions({
  groupId,
  currentUserId,
  currentUsername,
  currentAvatarUrl,
  isVisible,
}: Props) {
  const insets = useSafeAreaInsets();
  const [participants, setParticipants] = useState<Map<string, Participant>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pRef = useRef<Map<string, Participant>>(new Map());

  const sync = () => setParticipants(new Map(pRef.current));

  const makeParticipant = (userId: string, username: string, avatarUrl: string | null): Participant => ({
    userId,
    username,
    avatarUrl,
    avatarScale: new Animated.Value(0),
  });

  const animateIn = (p: Participant) => {
    Animated.spring(p.avatarScale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 120,
      friction: 7,
    }).start();
  };

  useEffect(() => {
    if (!isVisible) return;

    const channel = supabase.channel(`reveal:${groupId}`, {
      config: { presence: { key: currentUserId } },
    });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ userId: string; username: string; avatarUrl: string | null }>();
        const next = new Map<string, Participant>();

        for (const [key, presences] of Object.entries(state)) {
          const data = presences[0];
          if (!data) continue;
          const existing = pRef.current.get(key);
          if (existing) {
            next.set(key, existing);
          } else {
            const p = makeParticipant(data.userId, data.username, data.avatarUrl);
            next.set(key, p);
            animateIn(p);
          }
        }

        pRef.current = next;
        sync();
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            userId: currentUserId,
            username: currentUsername,
            avatarUrl: currentAvatarUrl,
          }).catch(() => {});
        }
      });

    // Untrack when app goes to background or is closed — the effect cleanup
    // alone won't fire in time on iOS/Android when the OS kills the app.
    const handleAppState = async (nextState: AppStateStatus) => {
      const ch = channelRef.current;
      if (!ch) return;
      if (nextState === "background" || nextState === "inactive") {
        await ch.untrack().catch(() => {});
      } else if (nextState === "active") {
        await ch.track({
          userId: currentUserId,
          username: currentUsername,
          avatarUrl: currentAvatarUrl,
        }).catch(() => {});
      }
    };
    const appStateSub = AppState.addEventListener("change", handleAppState);

    return () => {
      appStateSub.remove();
      // untrack first so Supabase removes us from presence state,
      // then remove the channel (which closes the WS).
      const ch = channelRef.current;
      channelRef.current = null;
      pRef.current.clear();
      setParticipants(new Map());
      if (ch) {
        ch.untrack()
          .catch(() => {})
          .finally(() => supabase.removeChannel(ch));
      }
    };
  }, [isVisible, groupId, currentUserId, currentUsername, currentAvatarUrl]);

  const list = Array.from(participants.values());
  if (list.length === 0) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.avatarsCol, { top: insets.top + 8 }]}>
        {list.map((p) => (
          <Animated.View key={p.userId} style={[styles.avatarWrapper, { transform: [{ scale: p.avatarScale }] }]}>
            {p.avatarUrl ? (
              <Image source={{ uri: p.avatarUrl }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{p.username[0]?.toUpperCase() ?? "?"}</Text>
              </View>
            )}
          </Animated.View>
        ))}
      </View>
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
    width: 36,
    height: 36,
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
});
