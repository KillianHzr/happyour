import { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  AppState,
  type AppStateStatus,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { Accelerometer } from "expo-sensors/build/Accelerometer";
import Svg, { Rect, G } from "react-native-svg";

// ─── shake detection tunables ─────────────────────────────────────────────────
const ACCEL_INTERVAL_MS = 33;   // ~30 Hz
const SHAKE_THRESHOLD   = 0.85; // delta-g per sample to count as a "hit"
const SHAKE_WINDOW_MS   = 2000; // rolling window
const SHAKE_MIN_HITS    = 10;   // hits needed in window to fire
const WAVE_COOLDOWN_MS  = 6000; // min ms between two waves
const WAVE_DURATION_MS  = 2400; // total duration of wave animation

// ─── HandSvg ─────────────────────────────────────────────────────────────────
// Wrist at the bottom; rotate the container around its bottom-center to wave.

function HandSvg({ size }: { size: number }) {
  const c = "#FFD166";
  const s = "#E8A820";
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80">
      {/* Pinky */}
      <Rect x="8"  y="20" width="11" height="28" rx="5.5" fill={c} stroke={s} strokeWidth="1" />
      {/* Ring */}
      <Rect x="22" y="14" width="11" height="34" rx="5.5" fill={c} stroke={s} strokeWidth="1" />
      {/* Middle */}
      <Rect x="36" y="10" width="11" height="38" rx="5.5" fill={c} stroke={s} strokeWidth="1" />
      {/* Index */}
      <Rect x="50" y="14" width="11" height="34" rx="5.5" fill={c} stroke={s} strokeWidth="1" />
      {/* Thumb — angled away */}
      <G transform="rotate(-38, 70, 40)">
        <Rect x="60" y="27" width="11" height="24" rx="5.5" fill={c} stroke={s} strokeWidth="1" />
      </G>
      {/* Palm */}
      <Rect x="8" y="38" width="54" height="30" rx="8" fill={c} stroke={s} strokeWidth="1" />
    </Svg>
  );
}

// ─── WavingHand ───────────────────────────────────────────────────────────────
// Rotates around the bottom-center (wrist). Trigger increments start a new wave.

function WavingHand({ size, trigger }: { size: number; trigger: number }) {
  const rotation = useRef(new Animated.Value(0)).current;
  const opacity  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (trigger === 0) return;
    rotation.setValue(0);
    opacity.setValue(1);

    const swing = (toValue: number, dur: number) =>
      Animated.timing(rotation, { toValue, duration: dur, useNativeDriver: true });

    Animated.sequence([
      swing(25, 140),
      swing(-20, 190),
      swing(25, 190),
      swing(-20, 190),
      swing(25, 190),
      swing(-20, 190),
      swing(0,  140),
      Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, [trigger]);

  const rotate = rotation.interpolate({
    inputRange: [-25, 25],
    outputRange: ["-25deg", "25deg"],
  });

  // Simulate transform-origin at bottom-center (wrist)
  const pivot = size / 2;
  return (
    <Animated.View
      style={{
        opacity,
        transform: [
          { translateY: pivot },
          { rotate },
          { translateY: -pivot },
        ],
      }}
    >
      <HandSvg size={size} />
    </Animated.View>
  );
}

// ─── BigWave — centred overlay shown on the waving user's own screen ──────────

function BigWave({ trigger }: { trigger: number }) {
  const scale   = useRef(new Animated.Value(0.5)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (trigger === 0) return;
    scale.setValue(0.6);
    opacity.setValue(0);

    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale,   { toValue: 1, useNativeDriver: true, tension: 90, friction: 7 }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]),
      Animated.delay(WAVE_DURATION_MS - 180 - 450),
      Animated.timing(opacity, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();
  }, [trigger]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        styles.bigWaveContainer,
        { opacity, transform: [{ scale }] },
      ]}
    >
      <View style={styles.bigWaveCard}>
        <WavingHand size={100} trigger={trigger} />
        <Text style={styles.bigWaveLabel}>Coucou !</Text>
      </View>
    </Animated.View>
  );
}

// ─── types ────────────────────────────────────────────────────────────────────

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

// ─── LiveReactions ────────────────────────────────────────────────────────────

export default function LiveReactions({
  groupId,
  currentUserId,
  currentUsername,
  currentAvatarUrl,
  isVisible,
}: Props) {
  const insets = useSafeAreaInsets();
  const [participants, setParticipants] = useState<Map<string, Participant>>(new Map());
  // Per-user monotonically-increasing wave trigger
  const [waveTriggers, setWaveTriggers] = useState<Map<string, number>>(new Map());
  const [myWaveTrigger, setMyWaveTrigger] = useState(0);

  const channelRef   = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pRef         = useRef<Map<string, Participant>>(new Map());
  const lastWaveRef  = useRef(0);
  const shakeHitsRef = useRef<number[]>([]);
  const prevAccelRef = useRef<{ x: number; y: number; z: number } | null>(null);

  const sync = () => setParticipants(new Map(pRef.current));

  const makeParticipant = (
    userId: string,
    username: string,
    avatarUrl: string | null,
  ): Participant => ({
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

  // ── send wave ──────────────────────────────────────────────────────────────
  const sendWave = useCallback(async () => {
    const now = Date.now();
    if (now - lastWaveRef.current < WAVE_COOLDOWN_MS) return;
    lastWaveRef.current = now;

    // Show big wave locally (broadcast doesn't echo back to self by default)
    setMyWaveTrigger((t) => t + 1);

    try {
      await channelRef.current?.send({
        type: "broadcast",
        event: "wave",
        payload: { userId: currentUserId },
      });
    } catch {
      // silently ignore — wave just doesn't propagate
    }
  }, [currentUserId]);

  // ── presence + wave broadcast channel ─────────────────────────────────────
  useEffect(() => {
    if (!isVisible) return;

    const channel = supabase.channel(`reveal:${groupId}`, {
      config: { presence: { key: currentUserId } },
    });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{
          userId: string;
          username: string;
          avatarUrl: string | null;
        }>();
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
      .on("broadcast", { event: "wave" }, ({ payload }) => {
        const { userId } = payload as { userId: string };
        setWaveTriggers((prev) => {
          const next = new Map(prev);
          next.set(userId, (next.get(userId) ?? 0) + 1);
          return next;
        });
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel
            .track({ userId: currentUserId, username: currentUsername, avatarUrl: currentAvatarUrl })
            .catch(() => {});
        }
      });

    const handleAppState = async (nextState: AppStateStatus) => {
      const ch = channelRef.current;
      if (!ch) return;
      if (nextState === "background" || nextState === "inactive") {
        await ch.untrack().catch(() => {});
      } else if (nextState === "active") {
        await ch
          .track({ userId: currentUserId, username: currentUsername, avatarUrl: currentAvatarUrl })
          .catch(() => {});
      }
    };
    const appStateSub = AppState.addEventListener("change", handleAppState);

    return () => {
      appStateSub.remove();
      const ch = channelRef.current;
      channelRef.current = null;
      pRef.current.clear();
      setParticipants(new Map());
      setWaveTriggers(new Map());
      if (ch) {
        ch.untrack()
          .catch(() => {})
          .finally(() => supabase.removeChannel(ch));
      }
    };
  }, [isVisible, groupId, currentUserId, currentUsername, currentAvatarUrl]);

  // ── shake detection ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isVisible) return;

    Accelerometer.setUpdateInterval(ACCEL_INTERVAL_MS);

    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const prev = prevAccelRef.current;
      prevAccelRef.current = { x, y, z };
      if (!prev) return;

      const delta = Math.sqrt(
        (x - prev.x) ** 2 + (y - prev.y) ** 2 + (z - prev.z) ** 2,
      );

      const now = Date.now();
      if (delta > SHAKE_THRESHOLD) shakeHitsRef.current.push(now);

      // Trim hits outside the rolling window
      shakeHitsRef.current = shakeHitsRef.current.filter((t) => now - t < SHAKE_WINDOW_MS);

      if (shakeHitsRef.current.length >= SHAKE_MIN_HITS) {
        shakeHitsRef.current = [];
        prevAccelRef.current = null;
        sendWave();
      }
    });

    return () => {
      sub.remove();
      prevAccelRef.current = null;
      shakeHitsRef.current = [];
    };
  }, [isVisible, sendWave]);

  // ── render ─────────────────────────────────────────────────────────────────
  const list = Array.from(participants.values());
  if (list.length === 0) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">

      {/* Avatar column — top right */}
      <View style={[styles.avatarsCol, { top: insets.top + 8 }]}>
        {list.map((p) => (
          <Animated.View
            key={p.userId}
            style={{ transform: [{ scale: p.avatarScale }] }}
          >
            <View style={styles.avatarRow}>
              {/* Small waving hand to the left of the avatar */}
              <WavingHand size={26} trigger={waveTriggers.get(p.userId) ?? 0} />
              {p.avatarUrl ? (
                <Image source={{ uri: p.avatarUrl }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitial}>
                    {p.username[0]?.toUpperCase() ?? "?"}
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>
        ))}
      </View>

      {/* Big centred wave — shown on the waving user's own screen */}
      <BigWave trigger={myWaveTrigger} />

    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  avatarsCol: {
    position: "absolute",
    right: 14,
    gap: 8,
    alignItems: "flex-end",
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
  bigWaveContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  bigWaveCard: {
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 28,
    paddingHorizontal: 32,
    paddingVertical: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  bigWaveLabel: {
    color: "#FFF",
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
});
