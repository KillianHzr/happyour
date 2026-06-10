import { View, Text, StyleSheet, Modal, FlatList, TouchableOpacity, Alert } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radii, typography, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";

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
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);

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

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, paddingHorizontal: 24 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 32 },
  title: { fontFamily: typography.family.bold, fontSize: typography.size.xxl, color: colors.text },
  closeText: { color: colors.secondary, fontFamily: typography.family.semibold },
  avatarImg: { width: "100%", height: "100%" },
  memberItem: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16, backgroundColor: colors.card, padding: 14, borderRadius: radii.lg },
  memberAvatar: { width: 44, height: 44, borderRadius: radii.xl, backgroundColor: colors.accentMuted, justifyContent: "center", alignItems: "center", overflow: "hidden" },
  memberAvatarText: { color: colors.text, fontFamily: typography.family.bold },
  memberName: { color: colors.text, fontFamily: typography.family.semibold, fontSize: typography.size.md, flex: 1 },
  removeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.sm, backgroundColor: "rgba(255,60,60,0.15)" },
  removeText: { color: "#FF3C3C", fontFamily: typography.family.semibold, fontSize: typography.size.xs },
  footer: { marginTop: 24, marginBottom: 40 },
  inviteBtn: { marginBottom: 12 },
  leaveBtn: { paddingVertical: 15, alignItems: "center", borderRadius: radii.lg, borderWidth: 1, borderColor: "rgba(255,59,48,0.35)", backgroundColor: "rgba(255,59,48,0.08)" },
  leaveBtnText: { color: "#FF3B30", fontFamily: typography.family.semibold, fontSize: typography.size.md },
});
