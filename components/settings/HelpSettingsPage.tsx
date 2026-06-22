import { useState } from "react";
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import Svg, { Circle, Mask, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { radii, spacing, textStyles, typography, type ThemeColors } from "../../lib/theme";
import BottomSheet from "../BottomSheet";
import { useSettingsNav } from "../SettingsSheet";

// ─── SVG atoms ────────────────────────────────────────────────────────────────

function ChevronDownIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path d="M5 7.5L10 12.5L15 7.5" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const RADIO_BORDER = "M12 24V22.5C6.20101 22.5 1.5 17.799 1.5 12H0H-1.5C-1.5 19.4558 4.54416 25.5 12 25.5V24ZM24 12H22.5C22.5 17.799 17.799 22.5 12 22.5V24V25.5C19.4558 25.5 25.5 19.4558 25.5 12H24ZM12 0V1.5C17.799 1.5 22.5 6.20101 22.5 12H24H25.5C25.5 4.54416 19.4558 -1.5 12 -1.5V0ZM12 0V-1.5C4.54416 -1.5 -1.5 4.54416 -1.5 12H0H1.5C1.5 6.20101 6.20101 1.5 12 1.5V0Z";
const RADIO_FILL  = "M0 12C0 5.37258 5.37258 0 12 0C18.6274 0 24 5.37258 24 12C24 18.6274 18.6274 24 12 24C5.37258 24 0 18.6274 0 12Z";

function RadioIcon({ checked, color }: { checked: boolean; color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Mask id="help-radio-mask" fill="white">
        <Path d={RADIO_FILL} />
      </Mask>
      <Path d={RADIO_FILL} fill="white" fillOpacity={0} />
      <Path d={RADIO_BORDER} fill={color} mask="url(#help-radio-mask)" />
      {checked && <Circle cx={12} cy={12} r={7.5} fill={color} />}
    </Svg>
  );
}

// ─── Subject options ──────────────────────────────────────────────────────────

const SUBJECTS = ["Problème", "Question", "Partenariat"];

// ─── Subject modal ────────────────────────────────────────────────────────────

function SubjectModal({
  visible,
  current,
  onSelect,
  onClose,
}: {
  visible: boolean;
  current: string;
  onSelect: (s: string) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={[styles.modalContent, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.subjectList}>
          {SUBJECTS.map(s => (
            <TouchableOpacity
              key={s}
              style={styles.subjectRow}
              onPress={() => { onSelect(s); onClose(); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.subjectLabel, { color: colors.text }]}>{s}</Text>
              <RadioIcon checked={current === s} color={colors.iconBrandTertiary} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </BottomSheet>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HelpSettingsPage() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { showToast } = useSettingsNav();

  const [subject, setSubject]         = useState("");
  const [title, setTitle]             = useState("");
  const [description, setDescription] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [sending, setSending]         = useState(false);

  const isComplete = subject !== "" && title.trim() !== "" && description.trim() !== "";

  const borderFor = (field: string) =>
    focusedField === field ? colors.borderBrandSecondary : colors.cardBorder;

  const handleSend = async () => {
    if (!isComplete || !user) return;
    setSending(true);
    try {
      const { error } = await supabase.from("support_requests").insert({
        user_id: user.id,
        email: user.email,
        subject,
        title: title.trim(),
        description: description.trim(),
      });
      if (error) throw error;
      showToast("Message envoyé", "success");
      setSubject("");
      setTitle("");
      setDescription("");
    } catch (e: any) {
      showToast(e.message ?? "Impossible d'envoyer", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }]}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Sujet (select) ── */}
        <View style={styles.inputField}>
          <View style={styles.fieldText}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Sujet</Text>
          </View>
          <TouchableOpacity
            style={[styles.input, { borderColor: colors.cardBorder, backgroundColor: colors.bg }]}
            onPress={() => setShowSubjectModal(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.inputText, { color: subject ? colors.text : colors.textSecondary, flex: 1 }]}>
              {subject || "Sélectionner"}
            </Text>
            <ChevronDownIcon color={colors.icon} />
          </TouchableOpacity>
        </View>

        {/* ── Titre ── */}
        <View style={styles.inputField}>
          <View style={styles.fieldText}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Titre</Text>
          </View>
          <View style={[styles.input, { borderColor: borderFor("title"), backgroundColor: colors.bg }]}>
            <TextInput
              style={[styles.inputText, { color: colors.text, flex: 1 }]}
              value={title}
              onChangeText={setTitle}
              placeholder="Intitulé"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="next"
              onFocus={() => setFocusedField("title")}
              onBlur={() => setFocusedField(null)}
            />
          </View>
        </View>

        {/* ── Description (textarea) ── */}
        <View style={styles.inputField}>
          <View style={styles.fieldText}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Description</Text>
          </View>
          <View style={[styles.textarea, { borderColor: borderFor("description"), backgroundColor: colors.bg }]}>
            <TextInput
              style={[styles.inputText, { color: colors.text, flex: 1, alignSelf: "stretch" }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Informations"
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
              onFocus={() => setFocusedField("description")}
              onBlur={() => setFocusedField(null)}
            />
          </View>
        </View>

        {/* Spacer — pousse le bloc submit en bas */}
        <View style={{ flex: 1 }} />

        {/* ── Submit ── */}
        <View style={styles.submitBlock}>
          <Text style={[styles.legalText, { color: colors.textSecondary }]}>
            En envoyant ce formulaire, tu acceptes de nous partager ces informations.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.submitBtn,
              isComplete
                ? pressed ? { backgroundColor: colors.brandHover } : { backgroundColor: colors.brand }
                : { backgroundColor: colors.bgDisabled },
            ]}
            onPress={handleSend}
            disabled={!isComplete || sending}
          >
            {sending
              ? <ActivityIndicator color={colors.textBrandOnBrand} />
              : <Text style={[styles.submitText, { color: isComplete ? colors.textBrandOnBrand : colors.textOnDisabled }]}>
                  Envoyer
                </Text>
            }
          </Pressable>
        </View>
      </ScrollView>

      <SubjectModal
        visible={showSubjectModal}
        current={subject}
        onSelect={setSubject}
        onClose={() => setShowSubjectModal(false)}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  content: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xl,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xxl,
  },

  // ── Field wrapper
  inputField: {
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "stretch",
  },
  fieldText: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xs,
    alignSelf: "stretch",
  },
  fieldLabel: {
    ...textStyles.bodyBase,
  },

  // ── Single-line input / select
  input: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    alignSelf: "stretch",
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  inputText: {
    fontFamily: textStyles.bodyBase.fontFamily,
    fontSize: typography.size.md,
    includeFontPadding: false,
    padding: 0,
  },

  // ── Multiline textarea
  textarea: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignSelf: "stretch",
    borderRadius: radii.sm,
    borderWidth: 1,
    minHeight: 120,
  },

  // ── Submit block
  submitBlock: {
    flexDirection: "column",
    alignSelf: "stretch",
    gap: spacing.md,
  },
  legalText: {
    ...textStyles.bodySmall,
    textAlign: "center",
    alignSelf: "stretch",
  },
  submitBtn: {
    alignSelf: "stretch",
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  submitText: {
    ...textStyles.singleLineSubheadingStrong,
    lineHeight: typography.size.xl + 4,
  },

  // ── Subject modal
  modalContent: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  subjectList: {
    flexDirection: "column",
    gap: spacing.xs2,
  },
  subjectRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs2,
  },
  subjectLabel: {
    ...textStyles.bodyBase,
    flex: 1,
  },
});
