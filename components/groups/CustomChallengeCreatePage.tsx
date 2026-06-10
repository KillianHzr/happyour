import { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  ScrollView, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { radii, typography, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import {
  addCustomChallenge, getQueuePendingCount,
  type ChallengeCapture,
} from "../../lib/challenges";

type MemberInfo = { user_id: string; username: string; avatar_url?: string | null };

type Props = {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  currentUserId: string;
  members: MemberInfo[];
  onAdded: () => void;
};

const CAPTURE_OPTIONS: { type: ChallengeCapture; label: string; icon: string }[] = [
  { type: "PHOTO", label: "Photo", icon: "📷" },
  { type: "VIDEO", label: "Vidéo", icon: "🎥" },
  { type: "AUDIO", label: "Audio", icon: "🎙" },
  { type: "DESSIN", label: "Dessin", icon: "✏️" },
  { type: "TEXTE", label: "Texte", icon: "📝" },
];

const OPTION_CARDS: { opt: 1 | 2 | 3; title: string; desc: string; icon: string }[] = [
  { opt: 1, title: "Cibler un membre", desc: "Tu choisis qui est la cible", icon: "🎯" },
  { opt: 2, title: "Imposer un thème", desc: "Tu choisis le thème et le type de capture", icon: "🎨" },
  { opt: 3, title: "Les deux", desc: "Tu choisis la cible et le thème", icon: "⚡" },
];

export default function CustomChallengeCreatePage({
  visible, onClose, groupId, currentUserId, members, onAdded,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const [option, setOption] = useState<1 | 2 | 3 | null>(null);
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [customTheme, setCustomTheme] = useState("");
  const [captureType, setCaptureType] = useState<ChallengeCapture | null>(null);
  const [queueCount, setQueueCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCount, setLoadingCount] = useState(false);

  const otherMembers = members.filter((m) => m.user_id !== currentUserId);

  useEffect(() => {
    if (!visible) {
      setOption(null);
      setTargetUserId(null);
      setCustomTheme("");
      setCaptureType(null);
      setQueueCount(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !groupId) return;
    setLoadingCount(true);
    getQueuePendingCount(groupId)
      .then((n) => setQueueCount(n))
      .catch(() => setQueueCount(null))
      .finally(() => setLoadingCount(false));
  }, [visible, groupId]);

  const needsTarget = option === 1 || option === 3;
  const needsTheme = option === 2 || option === 3;

  const isValid = (() => {
    if (!option) return false;
    if (needsTarget && !targetUserId) return false;
    if (needsTheme && (!customTheme.trim() || !captureType)) return false;
    return true;
  })();

  const positionText = (() => {
    if (loadingCount || queueCount === null) return null;
    return queueCount === 0 ? "Ce sera le prochain défi 🚀" : `Dans ${queueCount + 1} défi${queueCount + 1 > 1 ? "s" : ""} ⏳`;
  })();

  const handleConfirm = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      await addCustomChallenge(groupId, currentUserId, {
        targetUserId: needsTarget ? targetUserId : null,
        customTheme: needsTheme ? customTheme.trim() : null,
        captureType: needsTheme ? captureType : null,
      });
      onAdded();
      onClose();
    } catch (e: any) {
      console.error("[CustomChallenge] addCustomChallenge error:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.bg }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[s.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={s.backBtn} onPress={onClose}>
            <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <Path d="M18 6L6 18M6 6l12 12" stroke={colors.text} strokeWidth="2.5" strokeLinecap="round" />
            </Svg>
          </TouchableOpacity>
          <Text style={s.title}>Défi custom</Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Step 1: Option */}
          <Text style={s.sectionTitle}>Que veux-tu imposer ?</Text>
          <View style={s.optionGrid}>
            {OPTION_CARDS.map(({ opt, title, desc, icon }) => (
              <TouchableOpacity
                key={opt}
                style={[s.optionCard, option === opt && s.optionCardActive]}
                onPress={() => { setOption(opt); setTargetUserId(null); setCustomTheme(""); setCaptureType(null); }}
                activeOpacity={0.8}
              >
                <Text style={s.optionIcon}>{icon}</Text>
                <Text style={[s.optionTitle, option === opt && s.optionTitleActive]}>{title}</Text>
                <Text style={s.optionDesc}>{desc}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Step 2: Target picker */}
          {needsTarget && (
            <>
              <Text style={s.sectionTitle}>Qui est la cible ?</Text>
              {otherMembers.length === 0 ? (
                <Text style={s.emptyText}>Aucun autre membre dans ce groupe</Text>
              ) : (
                <View style={s.memberList}>
                  {otherMembers.map((m) => (
                    <TouchableOpacity
                      key={m.user_id}
                      style={[s.memberRow, targetUserId === m.user_id && s.memberRowActive]}
                      onPress={() => setTargetUserId(m.user_id)}
                      activeOpacity={0.8}
                    >
                      {m.avatar_url ? (
                        <Image source={{ uri: m.avatar_url }} style={s.memberAvatar} contentFit="cover" />
                      ) : (
                        <View style={[s.memberAvatar, s.avatarFallback]}>
                          <Text style={s.avatarLetter}>{m.username[0]?.toUpperCase()}</Text>
                        </View>
                      )}
                      <Text style={[s.memberName, targetUserId === m.user_id && s.memberNameActive]}>
                        {m.username}
                      </Text>
                      {targetUserId === m.user_id && (
                        <View style={s.checkmark}>
                          <Svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <Path d="M20 6L9 17l-5-5" stroke={colors.bg} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                          </Svg>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Step 3: Theme + capture type */}
          {needsTheme && (
            <>
              <Text style={s.sectionTitle}>Quel thème ?</Text>
              <TextInput
                style={s.themeInput}
                placeholder="Ex: voiture, cuisine, enfance..."
                placeholderTextColor={colors.textTertiary}
                value={customTheme}
                onChangeText={setCustomTheme}
                maxLength={60}
                returnKeyType="done"
              />

              <Text style={s.sectionTitle}>Type de capture</Text>
              <View style={s.captureGrid}>
                {CAPTURE_OPTIONS.map(({ type, label, icon }) => (
                  <TouchableOpacity
                    key={type}
                    style={[s.capturePill, captureType === type && s.capturePillActive]}
                    onPress={() => setCaptureType(type)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.captureIcon}>{icon}</Text>
                    <Text style={[s.captureLabel, captureType === type && s.captureLabelActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Position preview */}
          {isValid && (
            <View style={s.positionBox}>
              {loadingCount ? (
                <ActivityIndicator color={colors.textSecondary} size="small" />
              ) : positionText ? (
                <Text style={s.positionText}>{positionText}</Text>
              ) : null}
            </View>
          )}

          {/* Confirm */}
          <TouchableOpacity
            style={[s.confirmBtn, (!isValid || loading) && s.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!isValid || loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={colors.bg} size="small" />
            ) : (
              <Text style={s.confirmBtnText}>Ajouter à la file</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    color: colors.text,
    fontFamily: typography.family.bold,
    fontSize: typography.size.xl,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 8,
  },
  sectionTitle: {
    color: colors.secondary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 20,
    marginBottom: 10,
  },
  optionGrid: {
    gap: 10,
  },
  optionCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    gap: 4,
  },
  optionCardActive: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.borderSecondary,
  },
  optionIcon: { fontSize: typography.size.xl },
  optionTitle: {
    color: colors.secondary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.sm,
  },
  optionTitleActive: { color: colors.text },
  optionDesc: {
    color: colors.textTertiary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
  },
  memberList: {
    gap: 8,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  memberRowActive: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.borderSecondary,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: radii.lg,
  },
  avatarFallback: {
    backgroundColor: colors.accentMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLetter: {
    color: colors.text,
    fontFamily: typography.family.bold,
    fontSize: typography.size.sm,
  },
  memberName: {
    flex: 1,
    color: colors.secondary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
  },
  memberNameActive: { color: colors.text },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: radii.md,
    backgroundColor: colors.text,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: colors.textTertiary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    textAlign: "center",
    paddingVertical: 8,
  },
  themeInput: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.text,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.md,
  },
  captureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  capturePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  capturePillActive: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.borderSecondary,
  },
  captureIcon: { fontSize: typography.size.md },
  captureLabel: {
    color: colors.secondary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
  },
  captureLabelActive: { color: colors.text },
  positionBox: {
    marginTop: 20,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  positionText: {
    color: colors.text,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
    textAlign: "center",
  },
  confirmBtn: {
    marginTop: 24,
    backgroundColor: colors.text,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnDisabled: { opacity: 0.35 },
  confirmBtnText: {
    color: colors.bg,
    fontFamily: typography.family.bold,
    fontSize: typography.size.md,
  },
});
