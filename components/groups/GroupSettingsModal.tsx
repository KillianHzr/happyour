import { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import BottomSheet from "../BottomSheet";

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

export default function GroupSettingsModal({
  visible, onClose, groupName, isAdmin, members, userId,
  onRename, onLeave, onDelete, onTransferAdmin,
}: Props) {
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
    try { await onRename(trimmed); } catch {} finally { setLoading(false); }
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

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      {subView === null && (
        <>
          <Text style={styles.title}>
            {isAdmin ? "Paramètres du groupe" : "Quitter le groupe"}
          </Text>

          {isAdmin && (
            <>
              <View style={styles.renameRow}>
                <TextInput
                  style={styles.renameInput}
                  value={editedName}
                  onChangeText={setEditedName}
                  maxLength={25}
                  returnKeyType="done"
                  onSubmitEditing={handleRename}
                  onBlur={handleRename}
                  placeholder="Nom du groupe"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                />
                {loading && <ActivityIndicator size="small" color="#FFF" />}
              </View>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.menuItem} onPress={() => setSubView("transfer")}>
                <Text style={styles.menuItemText}>Transférer la gestion</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => setSubView("delete")}>
                <Text style={[styles.menuItemText, styles.dangerText]}>Supprimer le groupe</Text>
              </TouchableOpacity>
              <View style={styles.divider} />
            </>
          )}

          {!isAdmin && (
            <Text style={styles.leaveBody}>
              Tu ne pourras plus accéder aux moments de ce groupe.
            </Text>
          )}

          <TouchableOpacity style={styles.menuItem} onPress={() => setSubView("leave")}>
            <Text style={[styles.menuItemText, styles.dangerText]}>Quitter le groupe</Text>
          </TouchableOpacity>
        </>
      )}

      {subView === "leave" && (
        <>
          <Text style={styles.title}>Quitter le groupe</Text>
          <Text style={styles.confirmBody}>
            Tu ne pourras plus accéder aux moments de ce groupe.
          </Text>
          <TouchableOpacity style={styles.confirmBtn} onPress={handleLeave} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#FFF" />
              : <Text style={styles.confirmBtnText}>Quitter</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSubView(null)} style={styles.cancelWrap}>
            <Text style={styles.cancelText}>Annuler</Text>
          </TouchableOpacity>
        </>
      )}

      {subView === "delete" && (
        <>
          <Text style={styles.title}>Supprimer le groupe</Text>
          <Text style={styles.confirmBody}>
            Cette action est irréversible. Tous les membres seront exclus et les moments perdus.
          </Text>
          <TouchableOpacity style={styles.confirmBtn} onPress={handleDelete} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#FFF" />
              : <Text style={styles.confirmBtnText}>Supprimer définitivement</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSubView(null)} style={styles.cancelWrap}>
            <Text style={styles.cancelText}>Annuler</Text>
          </TouchableOpacity>
        </>
      )}

      {subView === "transfer" && (
        <>
          <Text style={styles.title}>Transférer la gestion</Text>
          <Text style={styles.confirmBody}>Choisir le nouveau responsable du groupe :</Text>
          {otherMembers.length === 0 ? (
            <Text style={styles.emptyText}>Aucun autre membre dans ce groupe.</Text>
          ) : (
            otherMembers.map((m) => (
              <TouchableOpacity
                key={m.user_id}
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
                {transferringId === m.user_id && <ActivityIndicator size="small" color="#FFF" />}
              </TouchableOpacity>
            ))
          )}
          <TouchableOpacity onPress={() => setSubView(null)} style={[styles.cancelWrap, { marginTop: 16 }]}>
            <Text style={styles.cancelText}>Annuler</Text>
          </TouchableOpacity>
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#FFF", marginBottom: 20 },
  leaveBody: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", marginBottom: 16, lineHeight: 20 },
  renameRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  renameInput: {
    flex: 1, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, color: "#FFF",
    fontFamily: "Inter_600SemiBold", fontSize: 16,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.1)", marginVertical: 16 },
  menuItem: { paddingVertical: 14 },
  menuItemText: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 16 },
  dangerText: { color: "#FF3B30" },
  confirmBody: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.55)", marginBottom: 20, lineHeight: 20 },
  confirmBtn: { backgroundColor: "#FF3B30", borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 10 },
  confirmBtnText: { color: "#FFF", fontSize: 15, fontFamily: "Inter_700Bold" },
  cancelWrap: { alignItems: "center" },
  cancelText: { color: "rgba(255,255,255,0.4)", fontFamily: "Inter_600SemiBold", fontSize: 15, paddingVertical: 6 },
  emptyText: { color: "rgba(255,255,255,0.4)", fontFamily: "Inter_400Regular", fontSize: 14, marginBottom: 12 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  memberAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center", overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%" },
  memberInitial: { color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 16 },
  memberName: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 15, flex: 1 },
});
