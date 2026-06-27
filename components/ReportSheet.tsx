import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import BottomSheet from "./BottomSheet";
import { useAuth } from "../lib/auth-context";
import { useToast } from "../lib/toast-context";
import { supabase } from "../lib/supabase";
import { radii, spacing, textStyles, type ThemeColors } from "../lib/theme";
import { useTheme, useThemedStyles, ForceTheme } from "../lib/theme-context";

const REASONS = [
  "Contenu inapproprié",
  "Harcèlement ou intimidation",
  "Spam ou publicité",
  "Usurpation d'identité",
  "Autre",
];

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Utilisateur signalé. */
  reportedUserId: string;
  reportedUsername?: string;
  /** Contexte : commentaire signalé (si signalement d'un commentaire). */
  commentId?: string;
  /** Contexte : groupe (si signalement d'un membre). */
  groupId?: string;
};

/**
 * Bottom sheet de signalement (utilisateur / commentaire). Enregistre une ligne
 * dans `public.signalements` : qui signale, qui est signalé, la raison, et le
 * contexte (commentaire ou groupe).
 */
export default function ReportSheet({ visible, onClose, reportedUserId, reportedUsername, commentId, groupId }: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ForceTheme mode="Light">
        <ReportSheetBody
          onClose={onClose}
          reportedUserId={reportedUserId}
          reportedUsername={reportedUsername}
          commentId={commentId}
          groupId={groupId}
        />
      </ForceTheme>
    </BottomSheet>
  );
}

function ReportSheetBody({ onClose, reportedUserId, reportedUsername, commentId, groupId }: Omit<Props, "visible">) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const { showToast } = useToast();

  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = !!reason && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;
    setSubmitting(true);
    try {
      const fullReason = reason === "Autre" && details.trim() ? details.trim() : reason!;
      const { error } = await supabase.from("signalements").insert({
        reporter_id: user.id,
        reported_user_id: reportedUserId,
        reason: fullReason,
        comment_id: commentId ?? null,
        group_id: groupId ?? null,
      });
      if (error) throw error;
      showToast("Signalement envoyé. Merci.", undefined, "success");
      onClose();
    } catch (e: any) {
      showToast("Impossible d'envoyer le signalement.", undefined, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Signaler{reportedUsername ? ` ${reportedUsername}` : ""}</Text>
      <Text style={styles.subtitle}>Choisis une raison. Les signalements sont confidentiels.</Text>

      <View style={styles.reasons}>
        {REASONS.map((r) => {
          const selected = reason === r;
          return (
            <TouchableOpacity
              key={r}
              style={[styles.reasonRow, selected && { borderColor: colors.borderBrandSecondary }]}
              onPress={() => setReason(r)}
              activeOpacity={0.8}
            >
              <Text style={[styles.reasonText, selected && { color: colors.text }]}>{r}</Text>
              <View style={[styles.radio, selected && { borderColor: colors.brand }]}>
                {selected && <View style={[styles.radioDot, { backgroundColor: colors.brand }]} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {reason === "Autre" && (
        <TextInput
          style={styles.input}
          placeholder="Précise la raison (facultatif)"
          placeholderTextColor={colors.textTertiary}
          value={details}
          onChangeText={setDetails}
          multiline
          maxLength={300}
        />
      )}

      <TouchableOpacity
        style={[styles.submitBtn, { backgroundColor: canSubmit ? colors.bgDanger : colors.bgNeutralTertiary }]}
        onPress={handleSubmit}
        disabled={!canSubmit}
        activeOpacity={0.85}
      >
        {submitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={[styles.submitText, { color: canSubmit ? "#FFFFFF" : colors.textNeutral }]}>Signaler</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
        <Text style={styles.cancelText}>Annuler</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.lg,
      gap: spacing.md,
    },
    title: {
      ...textStyles.subheading,
      color: colors.text,
    },
    subtitle: {
      ...textStyles.bodySmall,
      color: colors.textSecondary,
    },
    reasons: {
      gap: spacing.xs2,
    },
    reasonRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.bg,
    },
    reasonText: {
      ...textStyles.bodyBase,
      color: colors.textSecondary,
      flex: 1,
    },
    radio: {
      width: 22,
      height: 22,
      borderRadius: radii.full,
      borderWidth: 2,
      borderColor: colors.cardBorder,
      justifyContent: "center",
      alignItems: "center",
    },
    radioDot: {
      width: 12,
      height: 12,
      borderRadius: radii.full,
    },
    input: {
      ...textStyles.bodyBase,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radii.sm,
      padding: spacing.md,
      minHeight: 72,
      textAlignVertical: "top",
      backgroundColor: colors.bg,
    },
    submitBtn: {
      height: 56,
      borderRadius: radii.lg,
      justifyContent: "center",
      alignItems: "center",
      marginTop: spacing.xs,
    },
    submitText: {
      ...textStyles.singleLineSubheadingStrong,
      lineHeight: undefined,
    },
    cancelBtn: {
      height: 48,
      justifyContent: "center",
      alignItems: "center",
    },
    cancelText: {
      ...textStyles.singleLineBodyBaseStrong,
      color: colors.textSecondary,
    },
  });
