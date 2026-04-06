import { View, Text, StyleSheet, Modal, FlatList, TouchableOpacity, Alert } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, theme } from "../../lib/theme";

type Member = {
  user_id: string;
  username: string;
  avatar_url?: string | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  members: Member[];
  isAdmin: boolean;
  userId: string;
  groupId: string;
  onRemoveMember: (memberId: string) => void;
  onLeave: () => void;
};

export default function MembersModal({ visible, onClose, members, isAdmin, userId, groupId, onRemoveMember, onLeave }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.content, { paddingTop: insets.top + 40 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Membres</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeText}>Fermer</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={members}
            keyExtractor={(_, i) => i.toString()}
            renderItem={({ item }) => (
              <View style={styles.memberItem}>
                <View style={styles.memberAvatar}>
                  {item.avatar_url
                    ? <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} />
                    : <Text style={styles.memberAvatarText}>{item.username[0]?.toUpperCase()}</Text>}
                </View>
                <Text style={styles.memberName}>{item.username}</Text>
                {isAdmin && item.user_id !== userId && (
                  <TouchableOpacity
                    onPress={() => Alert.alert("Supprimer", `Retirer ${item.username} du groupe ?`, [
                      { text: "Annuler", style: "cancel" },
                      { text: "Supprimer", style: "destructive", onPress: () => onRemoveMember(item.user_id) },
                    ])}
                    style={styles.removeBtn}
                  >
                    <Text style={styles.removeText}>Retirer</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            ListFooterComponent={() => (
              <View style={styles.footer}>
                {isAdmin && (
                  <TouchableOpacity
                    style={[theme.outlineButton, styles.inviteBtn]}
                    onPress={() => { onClose(); router.push(`/(app)/groups/${groupId}/invite`); }}
                  >
                    <Text style={theme.outlineButtonText}>Ajouter un membre</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.leaveBtn} onPress={onLeave}>
                  <Text style={styles.leaveBtnText}>Quitter le groupe</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#000" },
  content: { flex: 1, paddingHorizontal: 24 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 32 },
  title: { fontFamily: "Inter_700Bold", fontSize: 24, color: "#FFF" },
  closeText: { color: colors.secondary, fontFamily: "Inter_600SemiBold" },
  avatarImg: { width: "100%", height: "100%" },
  memberItem: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16, backgroundColor: "rgba(255,255,255,0.08)", padding: 14, borderRadius: 18 },
  memberAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center", overflow: "hidden" },
  memberAvatarText: { color: "#FFF", fontFamily: "Inter_700Bold" },
  memberName: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 16, flex: 1 },
  removeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(255,60,60,0.15)" },
  removeText: { color: "#FF3C3C", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  footer: { marginTop: 24, marginBottom: 40 },
  inviteBtn: { marginBottom: 12 },
  leaveBtn: { paddingVertical: 15, alignItems: "center", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,59,48,0.35)", backgroundColor: "rgba(255,59,48,0.08)" },
  leaveBtnText: { color: "#FF3B30", fontFamily: "Inter_600SemiBold", fontSize: 16 },
});
