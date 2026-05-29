import { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, Dimensions, ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radii, typography, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { CloseIcon } from "./GroupIcons";
import Svg, { Path } from "react-native-svg";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type Member = { user_id: string; username: string; avatar_url?: string | null };
type SubView = null | "leave" | "delete" | "transfer";

type Props = {
  visible: boolean;
  onClose: () => void;
  groupName: string;
  isAdmin: boolean;
  members: Member[];
  userId: string;
  onRename: (name: string) => Promise<void>;
  onLeave: () => Promise<void>;
  onDelete: () => Promise<void>;
  onTransferAdmin: (newAdminId: string) => Promise<void>;
};

const ChevronRight = ({ color }: { color?: string }) => {
  const { colors } = useTheme();
  return (
    <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <Path d="M9 18l6-6-6-6" stroke={color ?? colors.textTertiary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
};

export default function GroupSettingsModal({
  visible, onClose, groupName, isAdmin, members, userId,
  onRename, onLeave, onDelete, onTransferAdmin,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [editedName, setEditedName] = useState(groupName);
  const [subView, setSubView] = useState<SubView>(null);
  const [loading, setLoading] = useState(false);
  const [transferringId, setTransferringId] = useState<string | null>(null);

  useEffect(() => {
    setEditedName(groupName);
    if (!visible) setSubView(null);
  }, [groupName, visible]);

  const otherMembers = members.filter((m) => m.user_id !== userId);

  const handleRename = async () => {
    const trimmed = editedName.trim();
    if (!trimmed || trimmed === groupName) return;
    setLoading(true);
    try {
      await onRename(trimmed);
    } catch (e) {
      setEditedName(groupName);
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = async () => {
    setLoading(true);
    try { await onLeave(); setSubView(null); onClose(); } catch {} finally { setLoading(false); }
  };

  const handleDelete = async () => {
    setLoading(true);
    try { await onDelete(); setSubView(null); onClose(); } catch {} finally { setLoading(false); }
  };

  const handleTransfer = async (newAdminId: string) => {
    setTransferringId(newAdminId);
    try { await onTransferAdmin(newAdminId); setSubView(null); onClose(); } catch {} finally { setTransferringId(null); }
  };

  const handleClose = () => {
    setSubView(null);
    onClose();
  };

  const renderMainContent = () => (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Paramètres du groupe</Text>
        <Text style={styles.groupNameDisplay}>{groupName}</Text>
      </View>

      {isAdmin && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Gestion</Text>
          <View style={styles.box}>
            <View style={styles.row}>
              <TextInput
                style={styles.input}
                value={editedName}
                onChangeText={setEditedName}
                maxLength={25}
                returnKeyType="done"
                onSubmitEditing={handleRename}
                onBlur={handleRename}
                placeholder="Nom du groupe"
                placeholderTextColor={colors.textTertiary}
              />
              {loading && <ActivityIndicator size="small" color={colors.text} style={{ marginLeft: 8 }} />}
            </View>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem} onPress={() => setSubView("transfer")}>
              <Text style={styles.menuItemText}>Transférer la gestion</Text>
              <ChevronRight />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem} onPress={() => setSubView("delete")}>
              <Text style={[styles.menuItemText, styles.dangerText]}>Supprimer le groupe</Text>
              <ChevronRight color="rgba(255, 59, 48, 0.4)" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Ma participation</Text>
        <View style={styles.box}>
          <TouchableOpacity style={styles.menuItem} onPress={() => setSubView("leave")}>
            <Text style={[styles.menuItemText, styles.dangerText]}>Quitter le groupe</Text>
            <ChevronRight color="rgba(255, 59, 48, 0.4)" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Membres ({members.length})</Text>
        <View style={styles.box}>
          {members.map((m, i) => (
            <View key={m.user_id}>
              <View style={styles.memberRow}>
                <View style={styles.memberAvatar}>
                  {m.avatar_url
                    ? <Image source={{ uri: m.avatar_url }} style={styles.avatarImg} />
                    : <Text style={styles.memberInitial}>{m.username[0]?.toUpperCase()}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{m.username}</Text>
                  {m.user_id === userId && <Text style={styles.meTag}>Moi</Text>}
                </View>
                {(m as any).role === 'admin' && (
                  <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>Admin</Text></View>
                )}
              </View>
              {i < members.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );

  const renderSubView = () => {
    let subTitle = "";
    let subBody = "";
    let btnText = "";
    let onConfirm = () => {};

    const isLastMember = members.length === 1;

    if (subView === "leave") {
      subTitle = isLastMember ? "Supprimer le groupe ?" : "Quitter le groupe";
      subBody = isLastMember
        ? "Tu es le dernier membre. En quittant ce groupe, il sera définitivement supprimé ainsi que tous ses moments."
        : "Tu ne pourras plus accéder aux moments de ce groupe.";
      btnText = isLastMember ? "Quitter et supprimer" : "Quitter";
      onConfirm = handleLeave;
    } else if (subView === "delete") {
      subTitle = "Supprimer le groupe";
      subBody = "Cette action est irréversible. Tous les membres seront exclus et les moments perdus.";
      btnText = "Supprimer définitivement";
      onConfirm = handleDelete;
    }

    if (subView === "transfer") {
      return (
        <View style={styles.subContainer}>
          <View style={[styles.content, { paddingTop: insets.top + 60 }]}>
            <Text style={styles.subTitle}>Transférer la gestion</Text>
            <Text style={styles.subDescription}>Choisir le nouveau responsable du groupe :</Text>

            <View style={styles.box}>
              {otherMembers.length === 0 ? (
                <Text style={styles.emptyText}>Aucun autre membre dans ce groupe.</Text>
              ) : (
                otherMembers.map((m, i) => (
                  <View key={m.user_id}>
                    <TouchableOpacity
                      style={styles.memberRow}
                      onPress={() => handleTransfer(m.user_id)}
                      disabled={transferringId !== null}
                    >
                      <View style={styles.memberAvatar}>
                        {m.avatar_url
                          ? <Image source={{ uri: m.avatar_url }} style={styles.avatarImg} />
                          : <Text style={styles.memberInitial}>{m.username[0]?.toUpperCase()}</Text>}
                      </View>
                      <Text style={styles.memberName}>{m.username}</Text>
                      {transferringId === m.user_id ? <ActivityIndicator size="small" color={colors.text} /> : <ChevronRight />}
                    </TouchableOpacity>
                    {i < otherMembers.length - 1 && <View style={styles.divider} />}
                  </View>
                ))
              )}
            </View>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setSubView(null)}>
              <Text style={styles.cancelBtnText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.subContainer}>
        <View style={[styles.content, { paddingTop: insets.top + 80 }]}>
          <Text style={styles.subTitle}>{subTitle}</Text>
          <Text style={styles.subDescription}>{subBody}</Text>

          <View style={{ flex: 1 }} />

          <TouchableOpacity style={[styles.confirmBtn, loading && { opacity: 0.7 }]} onPress={onConfirm} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.confirmBtnText}>{btnText}</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={() => setSubView(null)}>
            <Text style={styles.cancelBtnText}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.closeBtn, { top: insets.top + 20 }]}
          onPress={handleClose}
        >
          <CloseIcon />
        </TouchableOpacity>

        {subView ? renderSubView() : renderMainContent()}
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  closeBtn: {
    position: "absolute", right: 20, zIndex: 100,
    width: 44, height: 44, borderRadius: radii.xl,
    backgroundColor: colors.accentMuted,
    justifyContent: "center", alignItems: "center",
  },
  header: { paddingHorizontal: 20, marginBottom: 32, alignItems: "center" },
  title: { fontSize: typography.size.xxl, fontFamily: typography.family.bold, color: colors.text, textAlign: "center", marginBottom: 8 },
  groupNameDisplay: { fontSize: typography.size.md, fontFamily: typography.family.semibold, color: colors.textSecondary, textAlign: "center" },

  section: { marginHorizontal: 20, marginBottom: 24 },
  sectionLabel: { fontSize: typography.size.xs, fontFamily: typography.family.semibold, color: colors.textTertiary, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, paddingLeft: 4 },
  box: { backgroundColor: colors.card, borderRadius: radii.lg, overflow: "hidden", paddingHorizontal: 16 },

  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  input: { flex: 1, color: colors.text, fontFamily: typography.family.semibold, fontSize: typography.size.md, padding: 0 },

  menuItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14 },
  menuItemText: { color: colors.text, fontFamily: typography.family.semibold, fontSize: typography.size.md },
  dangerText: { color: "#FF3B30" },

  divider: { height: 1, backgroundColor: colors.cardBorder },

  memberRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  memberAvatar: { width: 36, height: 36, borderRadius: radii.lg, backgroundColor: colors.accentMuted, justifyContent: "center", alignItems: "center", overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%" },
  memberInitial: { color: colors.text, fontFamily: typography.family.bold, fontSize: typography.size.sm },
  memberName: { color: colors.text, fontFamily: typography.family.semibold, fontSize: typography.size.sm },
  meTag: { color: colors.textTertiary, fontSize: typography.size.xs, fontFamily: typography.family.regular },
  adminBadge: { backgroundColor: colors.accentMuted, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.xs },
  adminBadgeText: { color: colors.secondary, fontSize: typography.size.xs, fontFamily: typography.family.bold },

  // Subviews
  subContainer: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, paddingHorizontal: 20, alignItems: "center" },
  subTitle: { fontSize: typography.size.subtitle, fontFamily: typography.family.bold, color: colors.text, textAlign: "center", marginBottom: 16, letterSpacing: -1 },
  subDescription: { fontSize: typography.size.lg, fontFamily: typography.family.regular, color: colors.secondary, textAlign: "center", lineHeight: 26, marginBottom: 32 },
  confirmBtn: { width: "100%", height: 64, borderRadius: radii.lg, backgroundColor: "#FF3B30", justifyContent: "center", alignItems: "center", marginBottom: 12 },
  confirmBtnText: { color: "#FFFFFF", fontSize: typography.size.lg, fontFamily: typography.family.bold },
  cancelBtn: { width: "100%", height: 64, justifyContent: "center", alignItems: "center" },
  cancelBtnText: { color: colors.textTertiary, fontSize: typography.size.md, fontFamily: typography.family.semibold },
  emptyText: { color: colors.textTertiary, fontFamily: typography.family.regular, fontSize: typography.size.sm, paddingVertical: 20, textAlign: "center" },
});
