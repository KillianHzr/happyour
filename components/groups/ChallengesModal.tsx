import { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  ScrollView, ActivityIndicator, SafeAreaView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Svg, { Path } from "react-native-svg";
import { supabase } from "../../lib/supabase";
import {
  getCurrentChallengePeriod, getChallengeWeekStart,
  fetchOrGenerateChallenge, getChallengePrompt,
  mapChallenge, CHALLENGE_SELECT, TARGET_CHALLENGE_PROMPT,
  type WeeklyChallenge, type ChallengeCapture, type ActiveChallenge,
} from "../../lib/challenges";

type GroupInfo = { id: string; name: string };

type GroupChallenge = {
  groupId: string;
  groupName: string;
  challenge: WeeklyChallenge | null;
  hasResponded: boolean;
  loading: boolean;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  allGroups: GroupInfo[];
  currentUserId: string;
  onSelectChallenge: (challenge: ActiveChallenge) => void;
};

function CaptureTypeIcon({ type }: { type: ChallengeCapture }) {
  const icons: Record<ChallengeCapture, React.ReactNode> = {
    PHOTO: (
      <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <Path d="M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
      </Svg>
    ),
    TEXTE: (
      <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M17 6H3" /><Path d="M21 12H3" /><Path d="M15 18H3" />
      </Svg>
    ),
    AUDIO: (
      <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <Path d="M19 10v2a7 7 0 0 1-14 0v-2" /><Path d="M12 19v4" /><Path d="M8 23h8" />
      </Svg>
    ),
    DESSIN: (
      <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 20h9" /><Path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </Svg>
    ),
    VIDEO: (
      <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M23 7l-7 5 7 5V7z" /><Path d="M1 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H1a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
      </Svg>
    ),
  };
  return <>{icons[type]}</>;
}

const CAPTURE_LABEL: Record<ChallengeCapture, string> = {
  PHOTO: "Photo",
  VIDEO: "Vidéo",
  TEXTE: "Texte",
  AUDIO: "Audio",
  DESSIN: "Dessin",
};

export default function ChallengesModal({ visible, onClose, allGroups, currentUserId, onSelectChallenge }: Props) {
  const insets = useSafeAreaInsets();
  const [groupChallenges, setGroupChallenges] = useState<GroupChallenge[]>([]);
  const [isGap, setIsGap] = useState(false);
  const [devPeriodOverride, setDevPeriodOverride] = useState<1 | 2 | "auto">("auto");

  useEffect(() => {
    if (!visible) return;
    const period = __DEV__ && devPeriodOverride !== "auto"
      ? devPeriodOverride
      : getCurrentChallengePeriod();
    setIsGap(__DEV__ && devPeriodOverride !== "auto" ? false : period === null);
    loadChallenges(period);
  }, [visible, allGroups, currentUserId, devPeriodOverride]);

  const loadChallenges = async (period: 1 | 2 | null) => {
    const effectivePeriod = period ?? 2; // during gap, show prev week period 2
    const weekStart = period === null
      ? getChallengeWeekStart(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
      : getChallengeWeekStart();

    setGroupChallenges(allGroups.map((g) => ({
      groupId: g.id,
      groupName: g.name,
      challenge: null,
      hasResponded: false,
      loading: true,
    })));

    await Promise.all(
      allGroups.map(async (g) => {
        try {
          // Fetch members for this group
          const { data: membersData } = await supabase
            .from("group_members")
            .select("user_id")
            .eq("group_id", g.id);
          const members = (membersData ?? []).map((m: any) => ({ user_id: m.user_id }));

          let challenge: WeeklyChallenge | null = null;
          if (period === null) {
            // Gap mode: just read, don't generate
            const { data } = await supabase
              .from("weekly_challenges")
              .select(CHALLENGE_SELECT)
              .eq("group_id", g.id)
              .eq("period", effectivePeriod)
              .eq("week_start", weekStart)
              .maybeSingle();
            if (data) challenge = mapChallenge(data);
          } else {
            // DEV: when forcing a period that hasn't started yet, simulate without
            // mutating the queue item status (no premature "active" marking).
            const isDevOverride = __DEV__ && devPeriodOverride !== "auto";
            let devNow: Date | undefined;
            if (isDevOverride && effectivePeriod === 2) {
              const d = new Date();
              const daysToThursday = (4 - d.getDay() + 7) % 7;
              if (daysToThursday > 0) {
                d.setDate(d.getDate() + daysToThursday);
                devNow = d;
              }
            }
            challenge = await fetchOrGenerateChallenge(
              g.id, effectivePeriod, weekStart, members,
              devNow ?? new Date(),
              isDevOverride,
            );
          }

          // Check if user already responded
          let hasResponded = false;
          if (challenge) {
            const { data: resp } = await supabase
              .from("challenge_responses")
              .select("id")
              .eq("challenge_id", challenge.id)
              .eq("user_id", currentUserId)
              .maybeSingle();
            hasResponded = !!resp;
          }

          setGroupChallenges((prev) =>
            prev.map((gc) =>
              gc.groupId === g.id ? { ...gc, challenge, hasResponded, loading: false } : gc
            )
          );
        } catch {
          setGroupChallenges((prev) =>
            prev.map((gc) => gc.groupId === g.id ? { ...gc, loading: false } : gc)
          );
        }
      })
    );
  };

  const handleSelect = (gc: GroupChallenge) => {
    if (!gc.challenge || gc.hasResponded || isGap) return;
    const isTarget = gc.challenge.target_user_id === currentUserId;
    const captureType: ChallengeCapture = isTarget ? "PHOTO" : gc.challenge.theme.capture_type;
    const promptText = isTarget
      ? TARGET_CHALLENGE_PROMPT
      : getChallengePrompt(gc.challenge.target_username, gc.challenge.theme.label);

    onSelectChallenge({
      challengeId: gc.challenge.id,
      captureType,
      promptText,
      groupId: gc.groupId,
      isTarget,
      proposedByUsername: gc.challenge.proposed_by_username ?? null,
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <Path d="M19 12H5M12 5l-7 7 7 7" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Défis</Text>
            {isGap ? (
              <Text style={styles.subtitle}>Défis terminés, prochain défi lundi</Text>
            ) : (
              <Text style={styles.subtitle}>
                {((__DEV__ && devPeriodOverride !== "auto") ? devPeriodOverride : getCurrentChallengePeriod()) === 1
                  ? "Défi 1 · Lundi → Mercredi"
                  : "Défi 2 · Jeudi → Dimanche"}
              </Text>
            )}
          </View>
        </View>
        {__DEV__ && (
          <View style={styles.devRow}>
            <Text style={styles.devLabel}>PÉRIODE (DEV)</Text>
            {(["auto", 1, 2] as const).map((v) => (
              <TouchableOpacity
                key={String(v)}
                style={[styles.devPill, devPeriodOverride === v && styles.devPillActive]}
                onPress={() => setDevPeriodOverride(v)}
              >
                <Text style={[styles.devPillText, devPeriodOverride === v && styles.devPillTextActive]}>
                  {v === "auto" ? "Auto" : `P${v}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {groupChallenges.map((gc) => (
            <View key={gc.groupId} style={styles.groupBlock}>
              <Text style={styles.groupName}>{gc.groupName}</Text>

              {gc.loading ? (
                <View style={styles.card}>
                  <ActivityIndicator color="rgba(255,255,255,0.5)" />
                </View>
              ) : !gc.challenge ? (
                <View style={[styles.card, styles.cardDisabled]}>
                  <Text style={styles.noThemeText}>Aucun thème configuré</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.card,
                    (gc.hasResponded || isGap) && styles.cardDisabled,
                  ]}
                  onPress={() => handleSelect(gc)}
                  activeOpacity={gc.hasResponded || isGap ? 1 : 0.75}
                  disabled={gc.hasResponded || isGap}
                >
                  {/* Target avatar */}
                  <View style={styles.cardRow}>
                    {gc.challenge.target_avatar_url ? (
                      <Image
                        source={{ uri: gc.challenge.target_avatar_url }}
                        style={styles.avatar}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback]}>
                        <Text style={styles.avatarLetter}>
                          {gc.challenge.target_username[0]?.toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.promptText} numberOfLines={3}>
                        {gc.challenge.target_user_id === currentUserId
                          ? TARGET_CHALLENGE_PROMPT
                          : getChallengePrompt(gc.challenge.target_username, gc.challenge.theme.label)}
                      </Text>
                      <View style={styles.badgeRow}>
                        <View style={styles.captureBadge}>
                          <CaptureTypeIcon type={gc.challenge.target_user_id === currentUserId ? "PHOTO" : gc.challenge.theme.capture_type} />
                          <Text style={styles.captureBadgeText}>
                            {gc.challenge.target_user_id === currentUserId ? "Photo" : CAPTURE_LABEL[gc.challenge.theme.capture_type]}
                          </Text>
                        </View>
                        {gc.challenge.proposed_by_username && (
                          <View style={styles.proposerBadge}>
                            <Text style={styles.proposerBadgeText}>✦ {gc.challenge.proposed_by_username}</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Status */}
                    {gc.hasResponded ? (
                      <View style={styles.doneTag}>
                        <Text style={styles.doneTagText}>✓</Text>
                      </View>
                    ) : isGap ? (
                      <View style={styles.gapTag}>
                        <Text style={styles.gapTagText}>Terminé</Text>
                      </View>
                    ) : (
                      <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <Path d="M9 18l6-6-6-6" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    )}
                  </View>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  backBtn: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  title: {
    color: "#FFF",
    fontFamily: "Inter_700Bold",
    fontSize: 22,
  },
  subtitle: {
    color: "rgba(255,255,255,0.45)",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginTop: 1,
  },
  scrollContent: {
    paddingTop: 20,
    paddingHorizontal: 20,
    gap: 24,
  },
  groupBlock: {
    gap: 8,
  },
  groupName: {
    color: "rgba(255,255,255,0.5)",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: 16,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLetter: {
    color: "#FFF",
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  promptText: {
    color: "#FFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    lineHeight: 21,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 8,
  },
  captureBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  captureBadgeText: {
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  doneTag: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(52,199,89,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  doneTagText: {
    color: "#34C759",
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  gapTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  gapTagText: {
    color: "rgba(255,255,255,0.4)",
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  proposerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,200,80,0.12)",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(255,200,80,0.25)",
  },
  proposerBadgeText: {
    color: "rgba(255,200,80,0.85)",
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  noThemeText: {
    color: "rgba(255,255,255,0.3)",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 4,
  },
  devRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,200,0,0.15)",
    backgroundColor: "rgba(255,200,0,0.04)",
  },
  devLabel: {
    color: "rgba(255,200,0,0.6)",
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.8,
    marginRight: 4,
  },
  devPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,200,0,0.3)",
  },
  devPillActive: {
    backgroundColor: "rgba(255,200,0,0.25)",
    borderColor: "rgba(255,200,0,0.7)",
  },
  devPillText: {
    color: "rgba(255,200,0,0.5)",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  devPillTextActive: {
    color: "#FFD700",
  },
});
