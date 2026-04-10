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
import Accelerometer from "expo-sensors/build/Accelerometer";
import Svg, { Path } from "react-native-svg";

// ─── shake detection tunables ─────────────────────────────────────────────────
// Strategy: count X-axis direction reversals (left→right or right→left).
// Picking up / changing grip = sustained movement in one direction → no reversal → no trigger.
// Left-right shake = rapid alternation → many reversals → triggers.
const ACCEL_INTERVAL_MS  = 25;   // ~40 Hz for better reversal resolution
const SHAKE_X_THRESHOLD  = 0.45; // X-axis g value to register a direction
const SHAKE_MIN_REVERSALS = 5;   // number of L↔R reversals needed to fire
const SHAKE_WINDOW_MS    = 1200; // rolling window for reversals
const WAVE_COOLDOWN_MS   = 6000; // min ms between two waves

// ─── HandSvg ─────────────────────────────────────────────────────────────────
// Wrist at the bottom; rotate the container around its bottom-center to wave.

function HandSvg({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#FFD166"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M29.404 3.11a2 2 0 0 0 .901 2.681c2.917 1.449 5.531 5.003 6.233 8.396a2 2 0 1 0 3.917-.81c-.926-4.479-4.25-9.122-8.37-11.168a2 2 0 0 0-2.68.901m11.846-.488a2 2 0 0 0-.391 2.801c1.376 1.823 2.024 4.503 1.731 6.246a2 2 0 1 0 3.945.662c.494-2.942-.519-6.716-2.484-9.318a2 2 0 0 0-2.801-.39M5.203 22.11a2 2 0 0 1 2.064 1.934c.106 3.255 2.252 7.11 5.047 9.158a2 2 0 1 1-2.365 3.226c-3.688-2.703-6.53-7.656-6.68-12.254a2 2 0 0 1 1.934-2.064M1.726 33.675a2 2 0 0 1 2.735.723c1.148 1.974 3.369 3.608 5.09 4.012a2 2 0 1 1-.915 3.894c-2.905-.682-5.993-3.076-7.633-5.895a2 2 0 0 1 .723-2.734m29.735-23.18c-.86-1.49-2.664-2.566-4.416-1.759a6 6 0 0 0-.494.255a8 8 0 0 0-.813.534c-1.383 1.029-1.284 2.834-.534 4.132l3.695 6.399a1.247 1.247 0 0 1-2.164 1.24a1657 1657 0 0 0-4.584-7.96c-.606-1.04-1.776-1.951-3.15-1.53a6.7 6.7 0 0 0-1.376.607q-.51.295-.902.588c-1.34.986-1.344 2.708-.61 4a707 707 0 0 0 4.79 8.236c.35.596.149 1.363-.45 1.708a1.24 1.24 0 0 1-1.694-.454l-2.915-5.05c-.598-1.035-1.773-1.957-3.14-1.452a7.4 7.4 0 0 0-1.139.541c-.34.197-.645.403-.915.608c-1.419 1.078-1.356 2.96-.566 4.327l4.923 8.528c1.434 2.494 3.616 5.507 5.854 8.03c3.14 3.537 8.077 4.016 12.192 1.84a74 74 0 0 0 2.392-1.324c2.378-1.373 4.068-2.509 5.22-3.356c1.496-1.1 2.614-2.602 3.303-4.312c1.94-4.818 2.895-10.203 3.293-12.986c.19-1.326-.037-2.806-1.068-3.84a8.7 8.7 0 0 0-1.473-1.18c-.934-.596-1.969-.598-2.853-.2c-.873.395-1.595 1.174-1.977 2.144a122 122 0 0 0-1.14 3.021a1.25 1.25 0 0 1-.265.74l-.02.056l-.01-.019a1.24 1.24 0 0 1-.607.393c-3.085.895-5.763 3.851-4.945 7.529a1.25 1.25 0 0 1-2.44.542c-1.197-5.38 2.791-9.342 6.69-10.472q.062-.018.125-.03z"
      />
    </Svg>
  );
}

// ─── WavingHand ───────────────────────────────────────────────────────────────
// Rotates around the bottom-center (wrist). Trigger increments start a new wave.

// SWING_DURATION = sum of all swing steps = 1230ms
const SWING_DURATION = 140 + 190 + 190 + 190 + 190 + 190 + 140;

function WavingHand({
  size,
  trigger,
  ownOpacity = true,
}: {
  size: number;
  trigger: number;
  ownOpacity?: boolean;
}) {
  const rotation = useRef(new Animated.Value(0)).current;
  const opacity  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (trigger === 0) return;
    rotation.setValue(0);
    if (ownOpacity) opacity.setValue(1);

    const swing = (toValue: number, dur: number) =>
      Animated.timing(rotation, { toValue, duration: dur, useNativeDriver: true });

    const swings = Animated.sequence([
      swing(25, 140),
      swing(-20, 190),
      swing(25, 190),
      swing(-20, 190),
      swing(25, 190),
      swing(-20, 190),
      swing(0,  140),
    ]);

    if (ownOpacity) {
      Animated.sequence([
        swings,
        Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]).start();
    } else {
      swings.start();
    }
  }, [trigger]);

  const rotate = rotation.interpolate({
    inputRange: [-25, 25],
    outputRange: ["-25deg", "25deg"],
  });

  const pivot = size / 2;
  return (
    <Animated.View
      style={{
        ...(ownOpacity ? { opacity } : {}),
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
  const scale   = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (trigger === 0) return;
    scale.setValue(0.6);
    opacity.setValue(0);

    // Fade in → hold for the full swing → fade out together with hand
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale,   { toValue: 1, useNativeDriver: true, tension: 90, friction: 7 }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]),
      Animated.delay(SWING_DURATION - 180),
      Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }),
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
        <WavingHand size={100} trigger={trigger} ownOpacity={false} />
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
  const lastWaveRef       = useRef(0);
  const reversalsRef      = useRef<number[]>([]); // timestamps of X-axis direction reversals
  const lastXDirectionRef = useRef<0 | 1 | -1>(0); // last committed X direction

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

  // ── presence + wave broadcast channel lifecycle ───────────────────────────
  useEffect(() => {
    // We want the channel to stay alive as long as the component is mounted for this groupId.
    // Toggling isVisible will only track/untrack, not destroy/recreate the channel,
    // avoiding the Supabase error "cannot add callbacks after subscribe()".
    const ch = supabase.channel(`reveal:${groupId}`, {
      config: { presence: { key: currentUserId } },
    });
    channelRef.current = ch;

    ch.on("presence", { event: "sync" }, () => {
        const state = ch.presenceState<{
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
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
      pRef.current.clear();
      setParticipants(new Map());
      setWaveTriggers(new Map());
    };
  }, [groupId, currentUserId]); 

  // ── presence tracking lifecycle ───────────────────────────────────────────
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch || !isVisible) return;

    // Track presence when visible
    ch.track({ userId: currentUserId, username: currentUsername, avatarUrl: currentAvatarUrl })
      .catch(() => {});

    const handleAppState = async (nextState: AppStateStatus) => {
      if (nextState === "background" || nextState === "inactive") {
        await ch.untrack().catch(() => {});
      } else if (nextState === "active") {
        await ch.track({ userId: currentUserId, username: currentUsername, avatarUrl: currentAvatarUrl })
          .catch(() => {});
      }
    };
    const appStateSub = AppState.addEventListener("change", handleAppState);

    return () => {
      appStateSub.remove();
      // Untrack when not visible or unmounting
      ch.untrack().catch(() => {});
    };
  }, [isVisible, currentUserId, currentUsername, currentAvatarUrl]);

  // ── shake detection ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isVisible) return;

    Accelerometer.setUpdateInterval(ACCEL_INTERVAL_MS);

    const sub = Accelerometer.addListener(({ x }) => {
      // Determine current X direction (ignore values in the dead-zone)
      const dir: 1 | -1 | 0 = x > SHAKE_X_THRESHOLD ? 1 : x < -SHAKE_X_THRESHOLD ? -1 : 0;
      if (dir === 0) return;

      // Register a reversal only when direction actually flips
      if (dir !== lastXDirectionRef.current && lastXDirectionRef.current !== 0) {
        const now = Date.now();
        reversalsRef.current.push(now);
        // Trim outside window
        reversalsRef.current = reversalsRef.current.filter((t) => now - t < SHAKE_WINDOW_MS);

        if (reversalsRef.current.length >= SHAKE_MIN_REVERSALS) {
          reversalsRef.current = [];
          lastXDirectionRef.current = 0;
          sendWave();
        }
      }

      lastXDirectionRef.current = dir;
    });

    return () => {
      sub.remove();
      reversalsRef.current = [];
      lastXDirectionRef.current = 0;
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
