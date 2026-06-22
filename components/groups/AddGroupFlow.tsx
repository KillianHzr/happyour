import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { supabase } from "../../lib/supabase";
import { notifyGroupJoin } from "../../lib/notifications";
import { spacing, radii, textStyles, typography, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import BottomSheet from "../BottomSheet";
import Icon from "../Icon";
import { NamePill } from "../atoms/NamePill";

const NAME_MAX = 50;
const DOWNLOAD_LINK = "disclose.app/download";

type Step = "menu" | "create" | "join" | "createdSuccess" | "joinedSuccess" | "invite";

type Props = {
  visible: boolean;
  userId: string;
  onClose: () => void;
  /** Après création/adhésion en base (pour rafraîchir les données du parent). */
  onGroupsChanged: () => Promise<void> | void;
  /** Le flow est terminé → entrer dans la vue du groupe. */
  onEnterGroup: (groupId: string) => void;
};

export default function AddGroupFlow({ visible, userId, onClose, onGroupsChanged, onEnterGroup }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [step, setStep] = useState<Step>("menu");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [group, setGroup] = useState<{ id: string; name: string; invite_code: string } | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Réinitialise à chaque ouverture
  useEffect(() => {
    if (visible) {
      setStep("menu");
      setName(""); setCode(""); setJoinError(null);
      setGroup(null); setLoading(false); setCopied(null);
    }
  }, [visible]);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  const close = () => {
    if (loading) return;
    // Si le groupe est déjà créé/rejoint, fermer = entrer dedans
    if (group) { finish(); return; }
    onClose();
  };

  const handleCreate = async () => {
    if (!name.trim() || loading) return;
    setLoading(true);
    try {
      const { data: g, error } = await supabase
        .from("groups")
        .insert({ name: name.trim(), created_by: userId })
        .select("id, name, invite_code")
        .single();
      if (error) throw error;
      await supabase.from("group_members").insert({ group_id: g.id, user_id: userId, role: "admin" });
      let invite = g.invite_code;
      if (!invite) {
        const { data: g2 } = await supabase.from("groups").select("invite_code").eq("id", g.id).single();
        invite = g2?.invite_code ?? "";
      }
      setGroup({ id: g.id, name: g.name, invite_code: invite });
      await onGroupsChanged();
      setStep("createdSuccess");
    } catch {
      setJoinError("Impossible de créer le groupe. Réessaie.");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!code.trim() || loading) return;
    setLoading(true);
    setJoinError(null);
    try {
      const cleanCode = code.trim().toUpperCase();
      const { data: g, error } = await supabase
        .from("groups")
        .select("id, name, invite_code")
        .eq("invite_code", cleanCode)
        .maybeSingle();
      if (error) throw error;
      if (!g) { setJoinError("Code invalide ou groupe introuvable."); setLoading(false); return; }
      const { error: joinErr } = await supabase
        .from("group_members")
        .insert({ group_id: g.id, user_id: userId });
      if (joinErr) throw joinErr;
      notifyGroupJoin(g.id, g.name, userId).catch(() => {}); // notify existing members
      setGroup({ id: g.id, name: g.name, invite_code: g.invite_code });
      await onGroupsChanged();
      setStep("joinedSuccess");
    } catch {
      setJoinError("Impossible de rejoindre ce groupe. Réessaie.");
    } finally {
      setLoading(false);
    }
  };

  const finish = () => {
    const id = group?.id;
    onClose();
    if (id) onEnterGroup(id);
  };

  const doCopy = async (value: string, which: "code" | "link") => {
    await Clipboard.setStringAsync(value);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    setCopied(which);
    copyTimer.current = setTimeout(() => setCopied(null), 2000);
  };

  const shareInvite = () => {
    if (!group) return;
    Share.share({
      message: `Rejoins mon groupe sur Disclose avec le code ${group.invite_code} : ${DOWNLOAD_LINK}`,
    }).catch(() => {});
  };

  // ── Rendus réutilisables (fonctions, pas de composants internes → pas de remount) ──
  const renderPrimary = (label: string, onPress: () => void, disabled?: boolean) => (
    <TouchableOpacity
      style={[styles.btnPrimary, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? <ActivityIndicator color={colors.textBrandOnBrand} /> : <Text style={styles.btnPrimaryText}>{label}</Text>}
    </TouchableOpacity>
  );

  const renderNeutral = (label: string, onPress: () => void) => (
    <TouchableOpacity style={styles.btnNeutral} onPress={onPress} disabled={loading} activeOpacity={0.8}>
      <Text style={styles.btnNeutralText}>{label}</Text>
    </TouchableOpacity>
  );

  const renderCopyRow = (value: string, which: "code" | "link") => (
    <TouchableOpacity style={styles.listRow} activeOpacity={0.8} onPress={() => doCopy(value, which)}>
      <Text style={styles.codeText} numberOfLines={1}>{value}</Text>
      <View style={styles.copyBtn} pointerEvents="none">
        <Icon name={copied === which ? "check" : "copy"} size={20} color={colors.iconNeutral} />
      </View>
    </TouchableOpacity>
  );

  return (
    <BottomSheet visible={visible} onClose={close}>
      <View style={styles.content}>
        {step === "menu" && (
          <>
            <View style={styles.textBlock}>
              <Text style={styles.title}>Ajouter un groupe</Text>
            </View>
            <View style={styles.buttons}>
              {renderNeutral("Créer un groupe", () => { setJoinError(null); setStep("create"); })}
              {renderNeutral("Rejoindre un groupe", () => { setJoinError(null); setStep("join"); })}
            </View>
          </>
        )}

        {step === "create" && (
          <>
            <View style={styles.textBlock}>
              <Text style={styles.title}>Créer un groupe</Text>
            </View>
            <View style={styles.inputField}>
              <Text style={styles.fieldLabel}>Si tu devais nommer ton groupe, ce serait...</Text>
              <View style={[styles.input, { borderColor: focused ? colors.borderBrandSecondary : colors.cardBorder, backgroundColor: colors.bg }]}>
                <TextInput
                  style={styles.inputText}
                  value={name}
                  onChangeText={(t) => setName(t.slice(0, NAME_MAX))}
                  placeholder="ex. Source"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={NAME_MAX}
                  returnKeyType="done"
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onSubmitEditing={handleCreate}
                />
                <Text style={styles.counter}>{name.length}/{NAME_MAX}</Text>
              </View>
              {joinError && <Text style={styles.errorText}>{joinError}</Text>}
            </View>
            <View style={styles.buttons}>
              {renderPrimary("Créer", handleCreate, !name.trim())}
              {renderNeutral("Annuler", () => setStep("menu"))}
            </View>
          </>
        )}

        {step === "join" && (
          <>
            <View style={styles.textBlock}>
              <Text style={styles.title}>Rejoindre un groupe</Text>
            </View>
            <View style={styles.inputField}>
              <Text style={styles.fieldLabel}>Rentre le code d'accès</Text>
              <View style={[styles.input, { borderColor: focused ? colors.borderBrandSecondary : colors.cardBorder, backgroundColor: colors.bg }]}>
                <TextInput
                  style={styles.inputText}
                  value={code}
                  onChangeText={(t) => { setCode(t); if (joinError) setJoinError(null); }}
                  placeholder="ex. XXXX-XXXX"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="done"
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onSubmitEditing={handleJoin}
                />
              </View>
              {joinError && (
                <View style={styles.errorRow}>
                  <Icon name="x" size={16} color={colors.textDanger} />
                  <Text style={styles.errorText}>{joinError}</Text>
                </View>
              )}
            </View>
            <View style={styles.buttons}>
              {renderPrimary("Rejoindre", handleJoin, !code.trim())}
              {renderNeutral("Annuler", () => setStep("menu"))}
            </View>
          </>
        )}

        {(step === "createdSuccess" || step === "joinedSuccess") && (
          <>
            <View style={styles.bodyBlock}>
              <View style={styles.textBlock}>
                <Text style={styles.title}>
                  {step === "createdSuccess" ? "Félicitation, tu as créé le groupe" : "Félicitation, tu fais partie du groupe"}
                </Text>
              </View>
              <View style={styles.elementWrap}>
                <NamePill name={group?.name ?? ""} />
              </View>
            </View>
            <View style={styles.buttons}>
              {step === "createdSuccess"
                ? renderPrimary("Continuer", () => setStep("invite"))
                : renderPrimary("Démarrer", finish)}
            </View>
          </>
        )}

        {step === "invite" && (
          <>
            <View style={styles.textBlock}>
              <Text style={styles.title}>Invite tes proches</Text>
              <Text style={styles.subtitle}>En partageant les informations ci-dessous</Text>
            </View>
            <View style={styles.listButtons}>
              {renderCopyRow(group?.invite_code ?? "", "code")}
              {renderCopyRow(DOWNLOAD_LINK, "link")}
            </View>
            <View style={styles.buttons}>
              {renderPrimary("Partager", shareInvite)}
              {renderNeutral("Annuler", finish)}
            </View>
          </>
        )}
      </View>
    </BottomSheet>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  content: {
    flexDirection: "column",
    gap: spacing.xl3, // 48 entre le bloc texte/contenu et les boutons
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  bodyBlock: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: spacing.md,
  },
  textBlock: {
    flexDirection: "column",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    ...textStyles.subtitleStrong,
    color: colors.text,
    textAlign: "center",
    alignSelf: "stretch",
  },
  subtitle: {
    ...textStyles.bodyBase,
    color: colors.textSecondary,
    textAlign: "center",
    alignSelf: "stretch",
  },
  elementWrap: {
    alignItems: "center",
    alignSelf: "stretch",
  },
  // ── Champ (créer / rejoindre) ──
  inputField: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.sm, // space/200
    alignSelf: "stretch",
  },
  fieldLabel: {
    ...textStyles.bodyBase,
    color: colors.text,
  },
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
    flex: 1,
    fontFamily: textStyles.bodyBase.fontFamily,
    fontSize: typography.size.md,
    includeFontPadding: false,
    padding: 0,
    color: colors.text,
  },
  counter: {
    fontFamily: textStyles.bodyBase.fontFamily,
    fontSize: typography.size.md,
    includeFontPadding: false,
    color: colors.textSecondary,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  errorText: {
    ...textStyles.bodySmall,
    color: colors.textDanger,
  },
  // ── Invite : liste de boutons ──
  listButtons: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.md, // space/300
    alignSelf: "stretch",
  },
  listRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    alignSelf: "stretch",
  },
  codeText: {
    ...textStyles.bodyStrong,
    color: colors.text,
    flex: 1,
  },
  copyBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.card,
  },
  // ── Boutons ──
  buttons: {
    flexDirection: "column",
    gap: spacing.md,
    alignSelf: "stretch",
  },
  btnPrimary: {
    alignSelf: "stretch",
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.brand,
    justifyContent: "center",
    alignItems: "center",
  },
  btnPrimaryText: {
    ...textStyles.singleLineSubheadingStrong,
    lineHeight: typography.size.xl + 4,
    color: colors.textBrandOnBrand,
  },
  btnNeutral: {
    alignSelf: "stretch",
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.bgNeutralTertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  btnNeutralText: {
    ...textStyles.singleLineSubheadingStrong,
    lineHeight: typography.size.xl + 4,
    color: colors.textNeutral,
  },
});
