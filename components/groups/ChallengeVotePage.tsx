import { useState } from "react";
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Modal } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getChallengePrompt, type ChallengeWithData, type ChallengeResponse } from "../../lib/challenges";
import Svg, { Path } from "react-native-svg";
import { r2Storage } from "../../lib/r2";
import ChallengeAudioPlayer from "./ChallengeAudioPlayer";
import { typography } from "../../lib/theme";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const COLS = 3;
const GRID_GAP = 8;
const CARD_SIZE = (SCREEN_WIDTH - 40 - GRID_GAP * (COLS - 1)) / COLS;

// Audio waveform bars for thumbnails
const MINI_WAVE = [6, 10, 8, 14, 10, 12, 7];

function getSecondUrl(r: ChallengeResponse): string | null {
  if (!r.second_image_path || r.second_image_path === "text_mode") return null;
  return r2Storage.getPublicUrl(r.second_image_path);
}

function mediaType(path: string | null): "text" | "audio" | "drawing" | "photo" {
  if (!path || path === "text_mode") return "text";
  if (path.endsWith(".m4a")) return "audio";
  if (path.includes("_draw")) return "drawing";
  return "photo";
}

// Inline thumbnail renderer for grid cards
function ResponseThumb({ r }: { r: ChallengeResponse }) {
  const type = mediaType(r.image_path);
  if (type === "text") {
    return (
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "#1A1A1A", justifyContent: "center", alignItems: "center", padding: 6 }]}>
        <Text style={{ color: "#FFF", fontSize: 9, fontFamily: typography.family.semibold, textAlign: "center" }} numberOfLines={4}>
          {r.note}
        </Text>
      </View>
    );
  }
  if (type === "audio") {
    return (
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "#111", justifyContent: "center", alignItems: "center", gap: 5 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          {MINI_WAVE.map((h, i) => (
            <View key={i} style={{ width: 2.5, height: h, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.55)" }} />
          ))}
        </View>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center" }}>
          <Svg width="9" height="9" viewBox="0 0 24 24" fill="#FFF">
            <Path d="M8 5v14l11-7z" />
          </Svg>
        </View>
      </View>
    );
  }
  // drawing or photo — both render as image with cover (thumbnail context)
  return <Image source={{ uri: r.url }} style={StyleSheet.absoluteFillObject} contentFit="cover" />;
}

// Modal media renderer — respects exact same ratios as PhotoFeed
function ModalMedia({ imagePath, url, note }: { imagePath: string | null; url: string | null; note: string | null }) {
  const type = mediaType(imagePath);
  if (type === "text") {
    return (
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "#111", justifyContent: "center", alignItems: "center", padding: 28 }]}>
        <Text style={{ color: "#FFF", fontFamily: typography.family.semibold, fontSize: 20, textAlign: "center", lineHeight: 28 }}>
          {note ?? ""}
        </Text>
      </View>
    );
  }
  if (type === "audio") {
    if (!url) return null;
    return <ChallengeAudioPlayer key={url} url={url} />;
  }
  if (type === "drawing") {
    return (
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "#111", justifyContent: "center", alignItems: "center" }]}>
        <Image
          source={{ uri: url ?? "" }}
          style={{ width: "100%", aspectRatio: 3 / 4 }}
          contentFit="fill"
        />
      </View>
    );
  }
  // Regular photo — cover + top-aligned, same as PhotoFeed
  return (
    <Image
      source={{ uri: url ?? "" }}
      style={StyleSheet.absoluteFillObject}
      contentFit="cover"
      contentPosition={{ top: 0, left: "50%" }}
    />
  );
}

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
  const [selected, setSelected] = useState<ChallengeResponse | null>(null);
  const [swapped, setSwapped] = useState(false);

  const isTarget = challenge.target_user_id === currentUserId;
  const myVote = challenge.votes.find((v) => v.voter_id === currentUserId);
  const nonTargetResponses = challenge.responses.filter((r) => !r.is_target_response);
  const targetResponse = challenge.responses.find((r) => r.is_target_response);
  const canVote = !isTarget;
  const periodLabel = period === 1 ? "LUNDI → MERCREDI" : "JEUDI → DIMANCHE";
  const prompt = isTarget
    ? "Tu étais la cible !"
    : getChallengePrompt(challenge.target_username, challenge.theme.label);

  const openResponse = (r: ChallengeResponse) => {
    setSelected(r);
    setSwapped(false);
  };

  const handleVote = (responseId: string) => {
    onVote(challenge.id, responseId);
    setSelected(null);
  };

  // Derive modal display from swap state
  const modalImagePath = selected
    ? swapped ? (selected.second_image_path ?? selected.image_path) : selected.image_path
    : null;
  const modalUrl = selected
    ? swapped ? (getSecondUrl(selected) ?? selected.url) : selected.url
    : null;
  const modalNote = selected
    ? swapped ? (selected.second_note ?? null) : selected.note
    : null;
  const hasSecond = selected ? !!(selected.second_image_path) : false;
  const modalType = mediaType(modalImagePath);

  return (
    <View style={[cvStyles.container, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 16 }]}>
      {/* Header */}
      <View style={cvStyles.header}>
        <View style={cvStyles.defiPill}>
          <Text style={cvStyles.defiPillText}>DÉFI {period}</Text>
        </View>
        <Text style={cvStyles.periodLabel}>{periodLabel}</Text>
      </View>

      {/* Prompt */}
      <Text style={cvStyles.prompt} numberOfLines={3}>{prompt}</Text>
      {challenge.proposed_by_username && (
        <View style={cvStyles.proposerChip}>
          <Text style={cvStyles.proposerChipText}>✦ Proposé par {challenge.proposed_by_username}</Text>
        </View>
      )}

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
          <TouchableOpacity style={cvStyles.targetThumb} onPress={() => openResponse(targetResponse)} activeOpacity={0.8}>
            <ResponseThumb r={targetResponse} />
          </TouchableOpacity>
        )}
      </View>

      {/* Responses grid */}
      <Text style={cvStyles.responsesLabel}>
        {nonTargetResponses.length === 0 ? "Aucune proposition" : "Les propositions"}
      </Text>
      {nonTargetResponses.length > 0 && (
        <View style={cvStyles.responseGrid}>
          {nonTargetResponses.map((r) => {
            const isVoted = myVote?.response_id === r.id;
            return (
              <TouchableOpacity
                key={r.id}
                style={[cvStyles.responseCard, isVoted && cvStyles.responseCardVoted]}
                onPress={() => openResponse(r)}
                activeOpacity={0.8}
              >
                <View style={cvStyles.responseThumb}>
                  <ResponseThumb r={r} />
                  {isVoted && (
                    <View style={cvStyles.votedBadge}>
                      <Text style={cvStyles.votedBadgeText}>✓</Text>
                    </View>
                  )}
                  {r.second_image_path && (
                    <View style={cvStyles.dualCaptureDot} />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Footer hint */}
      <Text style={cvStyles.hint}>
        {isTarget
          ? "Tu étais la cible, tu ne peux pas voter"
          : myVote
          ? "Vote enregistré 👍"
          : "Appuie sur une proposition pour voter"}
      </Text>

      {/* Response detail modal */}
      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        {selected && (
          <View style={cvStyles.modalOverlay}>
            <View style={[cvStyles.modalContainer, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
              {/* Top bar */}
              <View style={cvStyles.modalTopBar}>
                <TouchableOpacity style={cvStyles.modalCloseBtn} onPress={() => setSelected(null)} activeOpacity={0.7}>
                  <Svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <Path d="M18 6L6 18M6 6l12 12" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" />
                  </Svg>
                </TouchableOpacity>
                {hasSecond && (
                  <TouchableOpacity style={cvStyles.swapBtn} onPress={() => setSwapped(v => !v)} activeOpacity={0.7}>
                    <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M7 16V4m0 0L3 8m4-4l4 4" /><Path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
                    </Svg>
                    <Text style={cvStyles.swapBtnText}>{swapped ? "Voir 1ère capture" : "Voir 2ème capture"}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Media — full height */}
              <View style={cvStyles.modalMedia}>
                <ModalMedia imagePath={modalImagePath} url={modalUrl} note={modalNote} />
              </View>

              {/* Caption — only for image/drawing/audio (not when text_mode already shows the text) */}
              {modalType !== "text" && modalNote ? (
                <View style={cvStyles.noteBox}>
                  <Text style={cvStyles.noteText}>{modalNote}</Text>
                </View>
              ) : null}

              {/* Vote button */}
              {canVote && (
                myVote?.response_id === selected.id ? (
                  <View style={cvStyles.voteBtnVoted}>
                    <Text style={cvStyles.voteBtnVotedText}>✓ Tu as voté pour cette réponse</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={cvStyles.voteBtn} onPress={() => handleVote(selected.id)} activeOpacity={0.85}>
                    <Text style={cvStyles.voteBtnText}>
                      {myVote ? "Changer mon vote pour cette réponse" : "Voter pour cette réponse"}
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </View>
          </View>
        )}
      </Modal>
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
    fontFamily: typography.family.bold,
    fontSize: 12,
    letterSpacing: 0.8,
  },
  proposerChip: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,200,80,0.12)",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,200,80,0.25)",
  },
  proposerChipText: {
    color: "rgba(255,200,80,0.85)",
    fontFamily: typography.family.semibold,
    fontSize: 11,
  },
  periodLabel: {
    color: "rgba(255,255,255,0.4)",
    fontFamily: typography.family.regular,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  prompt: {
    color: "#FFF",
    fontFamily: typography.family.bold,
    fontSize: 18,
    lineHeight: 24,
    marginBottom: 14,
  },
  targetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: 12,
    marginBottom: 18,
  },
  targetAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLetter: {
    color: "#FFF",
    fontFamily: typography.family.bold,
    fontSize: 14,
  },
  targetLabel: {
    color: "rgba(255,255,255,0.4)",
    fontFamily: typography.family.regular,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  targetName: {
    color: "#FFF",
    fontFamily: typography.family.semibold,
    fontSize: 14,
  },
  targetThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#1A1A1A",
  },
  responsesLabel: {
    color: "rgba(255,255,255,0.4)",
    fontFamily: typography.family.semibold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  responseGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
  },
  responseCard: {
    width: CARD_SIZE,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#1A1A1A",
    borderWidth: 2,
    borderColor: "transparent",
  },
  responseCardVoted: {
    borderColor: "#34C759",
  },
  responseThumb: {
    width: CARD_SIZE - 4,
    height: CARD_SIZE - 4,
    backgroundColor: "#1A1A1A",
  },
  votedBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(52,199,89,0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  votedBadgeText: {
    color: "#FFF",
    fontFamily: typography.family.bold,
    fontSize: 11,
  },
  dualCaptureDot: {
    position: "absolute",
    bottom: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  hint: {
    color: "rgba(255,255,255,0.35)",
    fontFamily: typography.family.regular,
    fontSize: 12,
    textAlign: "center",
    marginTop: 14,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
  },
  modalContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  modalTopBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  swapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  swapBtnText: {
    color: "rgba(255,255,255,0.8)",
    fontFamily: typography.family.semibold,
    fontSize: 12,
  },
  modalMedia: {
    flex: 1,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#111",
    marginBottom: 12,
  },
  noteBox: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  noteText: {
    color: "rgba(255,255,255,0.75)",
    fontFamily: typography.family.regular,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  voteBtn: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
  },
  voteBtnText: {
    color: "#000",
    fontFamily: typography.family.bold,
    fontSize: 15,
  },
  voteBtnVoted: {
    backgroundColor: "rgba(52,199,89,0.15)",
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(52,199,89,0.4)",
  },
  voteBtnVotedText: {
    color: "#34C759",
    fontFamily: typography.family.bold,
    fontSize: 15,
  },
});
