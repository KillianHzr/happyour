import { useEffect, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput,
  ActivityIndicator, Share, Modal, Pressable, Animated,
} from "react-native";
import { Image } from "expo-image";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSettingsNav } from "../SettingsSheet";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { spacing, radii, stroke, textStyles, typography, glassBlurIntensity, type ThemeColors } from "../../lib/theme";
import Icon from "../Icon";
import BlurView from "../atoms/BlurView";
import BottomSheet from "../BottomSheet";
import ConfirmModal from "../ConfirmModal";
import { NamePill } from "../atoms/NamePill";
import ProfilePage from "./ProfilePage";

const NAME_MAX = 50;
const DOWNLOAD_LINK = "disclose.app/download";

type Member = { user_id: string; username: string; avatar_url?: string | null; role?: string };

type Props = {
  groupName: string;
  inviteCode: string;
  isAdmin: boolean;
  userId: string;
  members: Member[];
  revealConfig: { day: number; hour: number };
  activeGroupId: string;
  onRename: (name: string) => Promise<void>;
  onLeave: () => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  onTransferAdmin: (memberId: string) => Promise<void> | void;
  onRemoveMember: (memberId: string) => Promise<void> | void;
};

export default function GroupSettingsContent({
  groupName, inviteCode, isAdmin, userId, members, revealConfig, activeGroupId,
  onRename, onLeave, onDelete, onTransferAdmin, onRemoveMember,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { push } = useSettingsNav();
  const insets = useSafeAreaInsets();

  // ── Modals ──
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState(groupName);
  const [renameFocused, setRenameFocused] = useState(false);
  const [renameSaving, setRenameSaving] = useState(false);

  const [showInvite, setShowInvite] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showReveal, setShowReveal] = useState(false);

  const [showLeave, setShowLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [showDeleteStep1, setShowDeleteStep1] = useState(false);
  const [showDeleteStep2, setShowDeleteStep2] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Tooltip "appui long" sur un proche (admin → transférer / retirer) ──
  const itemRefs = useRef<Record<string, View | null>>({});
  const [tooltip, setTooltip] = useState<{ member: Member; top: number; left: number } | null>(null);
  const tooltipAnim = useRef(new Animated.Value(0)).current;
  const [transferTarget, setTransferTarget] = useState<Member | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  // Anim "pop" du tooltip à l'ouverture (scale + opacité)
  useEffect(() => {
    if (tooltip) {
      tooltipAnim.setValue(0);
      Animated.spring(tooltipAnim, { toValue: 1, useNativeDriver: true, tension: 140, friction: 11 }).start();
    }
  }, [tooltip]); // eslint-disable-line react-hooks/exhaustive-deps

  const openTooltip = (m: Member) => {
    const node = itemRefs.current[m.user_id];
    if (!node) return;
    node.measureInWindow((x, y, w, h) => {
      setTooltip({ member: m, top: y + h + spacing.sm, left: x });
    });
  };

  const handleTransfer = async () => {
    if (!transferTarget || transferring) return;
    setTransferring(true);
    try { await onTransferAdmin(transferTarget.user_id); setTransferTarget(null); }
    catch { /* erreur gérée côté parent */ }
    finally { setTransferring(false); }
  };

  const handleRemove = async () => {
    if (!removeTarget || removing) return;
    setRemoving(true);
    try { await onRemoveMember(removeTarget.user_id); setRemoveTarget(null); }
    catch { /* erreur gérée côté parent */ }
    finally { setRemoving(false); }
  };

  const memberAvatarNode = (m: Member | null) => m ? (
    <View style={styles.modalAvatar}>
      {m.avatar_url
        ? <Image source={{ uri: m.avatar_url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        : <Text style={styles.modalAvatarInitial}>{(m.username?.[0] ?? "?").toUpperCase()}</Text>}
    </View>
  ) : null;

  // ── Rename ──
  const openRename = () => { setRenameValue(groupName); setShowRename(true); };
  const renameDirty = renameValue.trim().length > 0 && renameValue.trim() !== groupName;
  const handleRename = async () => {
    if (!renameDirty || renameSaving) return;
    setRenameSaving(true);
    try {
      await onRename(renameValue.trim());
      setShowRename(false);
    } catch {
      // l'erreur est gérée (toast) côté parent
    } finally {
      setRenameSaving(false);
    }
  };

  // ── Invite ──
  const doCopy = async (value: string, which: "code" | "link") => {
    await Clipboard.setStringAsync(value);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    setCopied(which);
    copyTimer.current = setTimeout(() => setCopied(null), 2000);
  };
  const shareInvite = () => {
    Share.share({
      message: `Rejoins mon groupe sur Disclose avec le code ${inviteCode} : ${DOWNLOAD_LINK}`,
    }).catch(() => {});
  };

  // ── Leave / Delete ──
  const handleLeave = async () => {
    if (leaving) return;
    setLeaving(true);
    try { await onLeave(); } finally { setLeaving(false); setShowLeave(false); }
  };
  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try { await onDelete(); } finally { setDeleting(false); setShowDeleteStep2(false); }
  };

  // ── Member profile ──
  const openMember = (m: Member) => {
    push({
      title: m.username,
      content: (
        <ProfilePage
          variant="member"
          userId={m.user_id}
          username={m.username}
          avatarUrl={m.avatar_url ?? null}
          email=""
          groupName={groupName}
          allGroups={[{ id: activeGroupId, name: groupName }]}
          revealConfig={revealConfig}
          onAvatarUpdate={() => {}}
          onUsernameUpdate={() => {}}
          onStreakUpdate={() => {}}
          isActive
        />
      ),
    });
  };

  const renderCopyRow = (value: string, which: "code" | "link") => (
    <TouchableOpacity style={styles.copyRow} activeOpacity={0.8} onPress={() => doCopy(value, which)}>
      <Text style={styles.copyValue} numberOfLines={1}>{value}</Text>
      <View style={styles.copyBtn} pointerEvents="none">
        <Icon name={copied === which ? "check" : "copy"} size={20} color={colors.iconNeutral} />
      </View>
    </TouchableOpacity>
  );

  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Nom groupe ── */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitleText}>Nom groupe</Text>
            {isAdmin && (
              <TouchableOpacity style={styles.titleBtn} onPress={openRename} activeOpacity={0.7}>
                <Text style={styles.titleBtnText}>Modifier</Text>
                <Icon name="edit" size={16} color={colors.icon} />
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.groupNameValue}>{groupName}</Text>
        </View>

        {/* ── Proches ── */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitleText}>Proches</Text>
            <TouchableOpacity style={styles.titleBtn} onPress={() => setShowInvite(true)} activeOpacity={0.7}>
              <Text style={styles.titleBtnText}>Inviter</Text>
              <Icon name="plus" size={16} color={colors.icon} />
            </TouchableOpacity>
          </View>
          <View style={styles.prochesList}>
            {members.map((m) => {
              const admin = m.role === "admin";
              const canManage = isAdmin && m.user_id !== userId;
              return (
                <TouchableOpacity
                  key={m.user_id}
                  ref={(r) => { itemRefs.current[m.user_id] = r as unknown as View | null; }}
                  style={styles.avatarBlock}
                  onPress={() => openMember(m)}
                  onLongPress={canManage ? () => openTooltip(m) : undefined}
                  delayLongPress={300}
                  activeOpacity={0.7}
                >
                  <View style={[styles.proAvatar, admin && { borderWidth: stroke.md, borderColor: colors.borderBrandSecondary }]}>
                    {m.avatar_url
                      ? <Image source={{ uri: m.avatar_url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                      : <Text style={styles.proAvatarInitial}>{(m.username?.[0] ?? "?").toUpperCase()}</Text>}
                  </View>
                  <Text
                    style={[styles.proName, admin && { color: colors.textBrandSecondary }]}
                    numberOfLines={1}
                  >
                    {m.username}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Temporalité reveal (admin) + Quitter / Supprimer (même section) ── */}
        <View style={styles.lastSection}>
          {isAdmin && (
            <TouchableOpacity style={styles.linkRow} onPress={() => setShowReveal(true)} activeOpacity={0.7}>
              <View style={styles.linkLeft}>
                <Text style={styles.linkText}>Temporalité reveal</Text>
                <View style={styles.lockBtn}>
                  <Icon name="lock" size={16} color={colors.iconBrandOnBrand} />
                </View>
              </View>
              <Icon name="chevron-right" size={20} color={colors.icon} />
            </TouchableOpacity>
          )}

          <View style={styles.dangerList}>
            <TouchableOpacity style={styles.dangerItem} onPress={() => setShowLeave(true)} activeOpacity={0.7}>
              <View style={styles.dangerItemText}>
                <Icon name="log-out" size={20} color={colors.iconDangerTertiary} />
                <Text style={styles.dangerItemLabel}>Quitter le groupe</Text>
              </View>
              <Icon name="chevron-right" size={20} color={colors.iconDangerTertiary} />
            </TouchableOpacity>
            {isAdmin && (
              <TouchableOpacity style={styles.dangerItem} onPress={() => setShowDeleteStep1(true)} activeOpacity={0.7}>
                <View style={styles.dangerItemText}>
                  <Icon name="trash" size={20} color={colors.iconDangerTertiary} />
                  <Text style={styles.dangerItemLabel}>Supprimer le groupe</Text>
                </View>
                <Icon name="chevron-right" size={20} color={colors.iconDangerTertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>

      {/* ── Modal : renommer le groupe ── */}
      <BottomSheet visible={showRename} onClose={() => !renameSaving && setShowRename(false)}>
        <View style={styles.renameContent}>
          <View style={styles.renameTop}>
            <View style={styles.renameHeader}>
              <Text style={styles.renameTitle}>Nom du groupe</Text>
            </View>
            <View style={styles.inputField}>
              <Text style={styles.inputLabel}>Si tu devais nommer ton groupe, ce serait...</Text>
              <View style={[styles.input, { borderColor: renameFocused ? colors.borderBrandSecondary : colors.cardBorder, backgroundColor: colors.bg }]}>
                <TextInput
                  style={styles.inputText}
                  value={renameValue}
                  onChangeText={(t) => setRenameValue(t.slice(0, NAME_MAX))}
                  placeholder="ex. Source"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={NAME_MAX}
                  returnKeyType="done"
                  onFocus={() => setRenameFocused(true)}
                  onBlur={() => setRenameFocused(false)}
                  onSubmitEditing={handleRename}
                />
                <Text style={styles.counter}>{renameValue.length}/{NAME_MAX}</Text>
              </View>
            </View>
          </View>
          <View style={styles.renameButtons}>
            <TouchableOpacity
              style={[styles.validateBtn, { backgroundColor: renameDirty ? colors.brand : colors.bgDisabled }]}
              onPress={handleRename}
              disabled={!renameDirty || renameSaving}
              activeOpacity={0.8}
            >
              {renameSaving
                ? <ActivityIndicator color={colors.textBrandOnBrand} />
                : <Text style={[styles.validateText, { color: renameDirty ? colors.textBrandOnBrand : colors.textOnDisabled }]}>Valider</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.textBtn} onPress={() => setShowRename(false)} disabled={renameSaving} activeOpacity={0.7}>
              <Text style={styles.textBtnLabel}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheet>

      {/* ── Modal : inviter (partage) ── */}
      <BottomSheet visible={showInvite} onClose={() => setShowInvite(false)}>
        <View style={styles.inviteContent}>
          <View style={styles.inviteTextBlock}>
            <Text style={styles.inviteTitle}>Invite tes proches</Text>
            <Text style={styles.inviteSubtitle}>En partageant les informations ci-dessous</Text>
          </View>
          <View style={styles.copyList}>
            {renderCopyRow(inviteCode, "code")}
            {renderCopyRow(DOWNLOAD_LINK, "link")}
          </View>
          <View style={styles.inviteButtons}>
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.brand }]} onPress={shareInvite} activeOpacity={0.8}>
              <Text style={[styles.primaryBtnText, { color: colors.textBrandOnBrand }]}>Partager</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.neutralBtn, { backgroundColor: colors.bgNeutralTertiary }]} onPress={() => setShowInvite(false)} activeOpacity={0.8}>
              <Text style={[styles.neutralBtnText, { color: colors.textNeutral }]}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheet>

      {/* ── Modal : temporalité reveal (bientôt disponible) ── */}
      <BottomSheet visible={showReveal} onClose={() => setShowReveal(false)}>
        <View style={styles.comingContent}>
          <View style={styles.comingTextBlock}>
            <View style={[styles.comingIconWrap, { backgroundColor: colors.brandTertiary }]}>
              <Icon name="lock" size={28} color={colors.brand} />
            </View>
            <Text style={styles.comingTitle}>Bientôt disponible</Text>
            <Text style={styles.comingSubtitle}>
              La personnalisation de la temporalité du reveal arrivera avec l'abonnement. Tu seras notifié dès son lancement.
            </Text>
          </View>
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.brand }]} onPress={() => setShowReveal(false)} activeOpacity={0.8}>
            <Text style={[styles.primaryBtnText, { color: colors.textBrandOnBrand }]}>OK, j'attends !</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* ── Modal : quitter le groupe ── */}
      <ConfirmModal
        visible={showLeave}
        onClose={() => setShowLeave(false)}
        title="Quitter le groupe"
        element={<NamePill name={groupName} />}
        confirmLabel="Oui, quitter"
        cancelLabel="Non, rester"
        confirmVariant="brand"
        onConfirm={handleLeave}
        loading={leaving}
      />

      {/* ── Modal : supprimer le groupe — étape 1 ── */}
      <ConfirmModal
        visible={showDeleteStep1}
        onClose={() => setShowDeleteStep1(false)}
        title="Supprimer le groupe"
        element={<NamePill name={groupName} />}
        confirmLabel="Oui, supprimer"
        cancelLabel="Non, garder"
        confirmVariant="danger"
        onConfirm={() => {
          setShowDeleteStep1(false);
          setTimeout(() => setShowDeleteStep2(true), 350);
        }}
      />

      {/* ── Modal : supprimer le groupe — étape 2 ── */}
      <ConfirmModal
        visible={showDeleteStep2}
        onClose={() => setShowDeleteStep2(false)}
        title="Attention toute suppression est définitive"
        subtitle="L'ensemble des moments et des archives seront supprimées. Es-tu vraiment sûr ?"
        confirmLabel="Oui, supprimer définitivement"
        cancelLabel="Non, garder"
        confirmVariant="danger"
        onConfirm={handleDelete}
        loading={deleting}
      />

      {/* ── Tooltip appui long sur un proche ── */}
      <Modal visible={!!tooltip} transparent animationType="none" statusBarTranslucent onRequestClose={() => setTooltip(null)}>
        <Animated.View style={[styles.tooltipOverlay, { opacity: tooltipAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setTooltip(null)} />
          {tooltip && (
            <Animated.View
              style={[
                styles.tooltip,
                {
                  top: tooltip.top,
                  left: tooltip.left,
                  opacity: tooltipAnim,
                  transform: [
                    { translateY: tooltipAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
                    { scale: tooltipAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
                  ],
                },
              ]}
            >
              <BlurView intensity={glassBlurIntensity} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.opacityLight }]} pointerEvents="none" />
              <TouchableOpacity
                style={styles.tooltipBtn}
                activeOpacity={0.7}
                onPress={() => { const m = tooltip.member; setTooltip(null); setTransferTarget(m); }}
              >
                <Icon name="award" size={20} color={colors.iconFix} />
                <Text style={[styles.tooltipBtnText, { color: colors.textFix }]}>Passer admin</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.tooltipBtn}
                activeOpacity={0.7}
                onPress={() => { const m = tooltip.member; setTooltip(null); setRemoveTarget(m); }}
              >
                <Icon name="trash" size={20} color={colors.iconDangerTertiary} />
                <Text style={[styles.tooltipBtnText, { color: colors.textDangerTertiary }]}>Retirer</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </Animated.View>
      </Modal>

      {/* ── Modal : passer admin ── */}
      <ConfirmModal
        visible={!!transferTarget}
        onClose={() => setTransferTarget(null)}
        avatar={memberAvatarNode(transferTarget)}
        title={`Passer ${transferTarget?.username ?? ""} en`}
        element={<NamePill name="admin" />}
        confirmLabel="Oui"
        cancelLabel="Non"
        confirmVariant="brand"
        onConfirm={handleTransfer}
        loading={transferring}
      />

      {/* ── Modal : retirer du groupe ── */}
      <ConfirmModal
        visible={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        avatar={memberAvatarNode(removeTarget)}
        title={`Retirer ${removeTarget?.username ?? ""} de`}
        element={<NamePill name={groupName} />}
        confirmLabel="Oui, virer"
        cancelLabel="Non, garder"
        confirmVariant="danger"
        onConfirm={handleRemove}
        loading={removing}
      />
    </>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  content: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xl2,            // space/1000 = 40px entre sections
    marginHorizontal: spacing.lg,
    marginTop: spacing.xxl,
  },

  // ── Section générique ──
  section: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.md,              // space/300 = 12px
    alignSelf: "stretch",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    alignSelf: "stretch",
  },
  sectionTitleText: {
    flex: 1,
    ...textStyles.bodyStrong,
    color: colors.textSecondary,
  },
  titleBtn: {
    flexDirection: "row",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs2,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xs2,
    borderRadius: radii.xs,
    backgroundColor: colors.bgNeutralTertiary,
  },
  titleBtnText: {
    ...textStyles.singleLineBodySmallStrong,
    color: colors.text,
  },

  // ── Nom groupe ──
  groupNameValue: {
    ...textStyles.heading,
    color: colors.text,
  },

  // ── Proches ──
  prochesList: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: spacing.lg,              // space/400 = 16px
    alignSelf: "stretch",
  },
  avatarBlock: {
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: spacing.xs2,             // space/150 = 6px
  },
  proAvatar: {
    width: 56,
    height: 56,
    borderRadius: radii.md,       // radius/300 = 12px
    overflow: "hidden",
    backgroundColor: colors.accentMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  proAvatarInitial: {
    ...textStyles.subtitleStrong,
    color: colors.text,
  },
  proName: {
    ...textStyles.bodySmall,
    color: colors.text,
  },

  // ── Dernière section : temporalité reveal + quitter/supprimer ──
  lastSection: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.lg,             // space/400 = 16px entre le lien et le groupe de boutons
    alignSelf: "stretch",
  },

  // ── Tooltip appui long ──
  tooltipOverlay: {
    flex: 1,
    backgroundColor: "rgba(12, 12, 13, 0.20)",
  },
  tooltip: {
    position: "absolute",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: spacing.sm,                 // space/200
    paddingVertical: spacing.sm,     // space/200
    paddingHorizontal: spacing.lg,   // space/400
    borderRadius: radii.md,          // radius/300
    borderWidth: stroke.sm,          // stroke/025
    borderColor: colors.cardBorder,
    overflow: "hidden",
  },
  tooltipBtn: {
    flexDirection: "row",
    padding: spacing.sm,             // space/200
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,                 // space/200
    borderRadius: radii.sm,          // radius/200
  },
  tooltipBtnText: {
    ...textStyles.singleLineBodyBaseStrong,
    color: colors.textSecondary,
  },

  // ── Avatar des modals (passer admin / retirer) ──
  modalAvatar: {
    width: 80,
    height: 80,
    aspectRatio: 1,
    borderRadius: radii.xl,          // radius/600
    overflow: "hidden",
    backgroundColor: colors.accentMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  modalAvatarInitial: {
    ...textStyles.subtitleStrong,
    color: colors.text,
  },

  // ── Lien temporalité reveal ──
  linkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    alignSelf: "stretch",
  },
  linkLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs2,             // 6px entre le texte et l'icon-button
  },
  linkText: {
    ...textStyles.bodyBase,
    color: colors.text,
  },
  lockBtn: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.brand,
  },

  // ── Danger (quitter / supprimer) ──
  dangerList: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xs2,
    alignSelf: "stretch",
  },
  dangerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    alignSelf: "stretch",
    paddingVertical: spacing.sm,  // space/200 0
  },
  dangerItemText: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs2,
    flex: 1,
  },
  dangerItemLabel: {
    ...textStyles.bodyBase,
    color: colors.textDangerTertiary,
  },

  // ── Modal renommer ──
  renameContent: {
    flexDirection: "column",
    gap: spacing.xl4,             // space/1600 = 64px entre le bloc haut (texte + input) et les boutons
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  renameTop: {
    flexDirection: "column",
    gap: spacing.xl,              // space/600 = 24px entre le titre et l'input
    alignSelf: "stretch",
  },
  renameHeader: {
    flexDirection: "column",
    alignItems: "center",
    gap: spacing.sm,
  },
  renameTitle: {
    ...textStyles.subtitleStrong,
    color: colors.text,
    textAlign: "center",
    alignSelf: "stretch",
  },
  inputField: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.sm,
    alignSelf: "stretch",
  },
  inputLabel: {
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
  renameButtons: {
    flexDirection: "column",
    gap: spacing.md,
    alignSelf: "stretch",
  },
  validateBtn: {
    alignSelf: "stretch",
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  validateText: {
    ...textStyles.singleLineSubheadingStrong,
    lineHeight: typography.size.xl + 4,
  },
  textBtn: {
    alignSelf: "stretch",
    paddingVertical: spacing.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  textBtnLabel: {
    ...textStyles.singleLineSubheadingStrong,
    lineHeight: typography.size.xl + 4,
    color: colors.textNeutral,
  },

  // ── Modal inviter ──
  inviteContent: {
    flexDirection: "column",
    gap: spacing.xl3,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  inviteTextBlock: {
    flexDirection: "column",
    alignItems: "center",
    gap: spacing.sm,
  },
  inviteTitle: {
    ...textStyles.subtitleStrong,
    color: colors.text,
    textAlign: "center",
    alignSelf: "stretch",
  },
  inviteSubtitle: {
    ...textStyles.bodyBase,
    color: colors.textSecondary,
    textAlign: "center",
    alignSelf: "stretch",
  },
  copyList: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.md,
    alignSelf: "stretch",
  },
  copyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    alignSelf: "stretch",
  },
  copyValue: {
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
  inviteButtons: {
    flexDirection: "column",
    gap: spacing.md,
    alignSelf: "stretch",
  },

  // ── Modal bientôt disponible ──
  comingContent: {
    flexDirection: "column",
    gap: spacing.xl3,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  comingTextBlock: {
    flexDirection: "column",
    alignItems: "center",
    gap: spacing.sm,
  },
  comingIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    justifyContent: "center",
    alignItems: "center",
  },
  comingTitle: {
    ...textStyles.subtitleStrong,
    color: colors.text,
    textAlign: "center",
  },
  comingSubtitle: {
    ...textStyles.bodyBase,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },

  // ── Boutons partagés ──
  primaryBtn: {
    alignSelf: "stretch",
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryBtnText: {
    ...textStyles.singleLineSubheadingStrong,
    lineHeight: typography.size.xl + 4,
  },
  neutralBtn: {
    alignSelf: "stretch",
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  neutralBtnText: {
    ...textStyles.singleLineSubheadingStrong,
    lineHeight: typography.size.xl + 4,
  },
});
