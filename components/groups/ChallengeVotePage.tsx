import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getChallengePrompt, getWinnerResponseIds, type ChallengeWithData } from "../../lib/challenges";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function ChallengeVotePage({
  challenge,
  period,
  currentUserId,
  onVote,
}: {
  challenge: ChallengeWithData;
  period: 1 | 2;
  currentUserId?: string;
  onVote: (challengeId: string, responseId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const isTarget = challenge.target_user_id === currentUserId;
  const myVote = challenge.votes.find((v) => v.voter_id === currentUserId);
  const nonTargetResponses = challenge.responses.filter((r) => !r.is_target_response);
  const targetResponse = challenge.responses.find((r) => r.is_target_response);
  const winnerIds = getWinnerResponseIds(challenge.responses, challenge.votes);
  const periodLabel = period === 1 ? "LUNDI → MERCREDI" : "JEUDI → DIMANCHE";
  const prompt = isTarget
    ? "Tu étais la cible !"
    : getChallengePrompt(challenge.target_username, challenge.theme.label);

  return (
    <View style={[cvStyles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      {/* Header */}
      <View style={cvStyles.header}>
        <View style={cvStyles.defiPill}>
          <Text style={cvStyles.defiPillText}>DÉFI {period}</Text>
        </View>
        <Text style={cvStyles.periodLabel}>{periodLabel}</Text>
      </View>

      {/* Prompt */}
      <Text style={cvStyles.prompt} numberOfLines={3}>{prompt}</Text>

      {/* Target row */}
      <View style={cvStyles.targetRow}>
        {challenge.target_avatar_url ? (
          <Image source={{ uri: challenge.target_avatar_url }} style={cvStyles.targetAvatar} contentFit="cover" />
        ) : (
          <View style={[cvStyles.targetAvatar, cvStyles.avatarFallback]}>
            <Text style={cvStyles.avatarLetter}>{challenge.target_username[0]?.toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={cvStyles.targetLabel}>La cible</Text>
          <Text style={cvStyles.targetName}>{challenge.target_username}</Text>
        </View>
        {targetResponse && targetResponse.image_path !== "text_mode" && (
          <View style={cvStyles.targetThumb}>
            <Image source={{ uri: targetResponse.url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
          </View>
        )}
      </View>

      {/* Responses */}
      <Text style={cvStyles.responsesLabel}>
        {nonTargetResponses.length === 0 ? "Aucune proposition" : "Les propositions"}
      </Text>
      {nonTargetResponses.length > 0 && (
        <View style={cvStyles.responseGrid}>
          {nonTargetResponses.map((r) => {
            const isVoted = myVote?.response_id === r.id;
            const isWinner = winnerIds.includes(r.id);
            const voteCount = challenge.votes.filter((v) => v.response_id === r.id).length;
            const canVote = !isTarget;
            return (
              <TouchableOpacity
                key={r.id}
                style={[cvStyles.responseCard, isVoted && cvStyles.responseCardVoted, isWinner && cvStyles.responseCardWinner]}
                onPress={() => canVote && onVote(challenge.id, r.id)}
                activeOpacity={canVote ? 0.8 : 1}
                disabled={!canVote}
              >
                <View style={cvStyles.responseThumb}>
                  {r.image_path === "text_mode" ? (
                    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "#1A1A1A", justifyContent: "center", alignItems: "center", padding: 8 }]}>
                      <Text style={{ color: "#FFF", fontSize: 11, textAlign: "center", fontFamily: "Inter_600SemiBold" }} numberOfLines={5}>
                        {r.note}
                      </Text>
                    </View>
                  ) : (
                    <Image source={{ uri: r.url }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                  )}
                  {isVoted && (
                    <View style={cvStyles.votedOverlay}>
                      <Text style={{ color: "#34C759", fontSize: 24 }}>✓</Text>
                    </View>
                  )}
                  {isWinner && challenge.votes.length > 0 && (
                    <View style={cvStyles.winnerBadge}>
                      <Text style={cvStyles.winnerBadgeText}>🏆</Text>
                    </View>
                  )}
                </View>
                <View style={cvStyles.responseInfo}>
                  <Text style={cvStyles.responseUsername} numberOfLines={1}>{r.username}</Text>
                  {voteCount > 0 && (
                    <View style={cvStyles.voteCountBadge}>
                      <Text style={cvStyles.voteCountText}>{voteCount}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Footer */}
      <Text style={cvStyles.hint}>
        {isTarget
          ? "Tu étais la cible, tu ne peux pas voter"
          : myVote
          ? "Vote enregistré 👍"
          : "Appuie sur une proposition pour voter"}
      </Text>
    </View>
  );
}

const cvStyles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: "#0A0A0A",
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  defiPill: {
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  defiPillText: {
    color: "#FFF",
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 0.8,
  },
  periodLabel: {
    color: "rgba(255,255,255,0.4)",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  prompt: {
    color: "#FFF",
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    lineHeight: 27,
    marginBottom: 16,
  },
  targetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: 12,
    marginBottom: 20,
  },
  targetAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLetter: {
    color: "#FFF",
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  targetLabel: {
    color: "rgba(255,255,255,0.4)",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  targetName: {
    color: "#FFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  targetThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#1A1A1A",
  },
  responsesLabel: {
    color: "rgba(255,255,255,0.4)",
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  responseGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    flex: 1,
  },
  responseCard: {
    width: (SCREEN_WIDTH - 40 - 10) / 2,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#1A1A1A",
    borderWidth: 2,
    borderColor: "transparent",
  },
  responseCardVoted: {
    borderColor: "#34C759",
  },
  responseCardWinner: {
    borderColor: "#FFD700",
  },
  responseThumb: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#1A1A1A",
  },
  votedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  winnerBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  winnerBadgeText: {
    fontSize: 14,
  },
  responseInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  responseUsername: {
    color: "#FFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    flex: 1,
  },
  voteCountBadge: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  voteCountText: {
    color: "#FFF",
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },
  hint: {
    color: "rgba(255,255,255,0.35)",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    textAlign: "center",
    marginTop: 12,
  },
});
