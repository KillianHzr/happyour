import { View, Text, StyleSheet, Modal, Pressable, TouchableOpacity, ActivityIndicator } from "react-native";

type Props = {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isAdmin: boolean;
  leaveNextAdmin: string | null;
  isLeaving: boolean;
};

export default function LeaveGroupModal({ visible, onClose, onConfirm, isAdmin, leaveNextAdmin, isLeaving }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>Quitter le groupe</Text>
          <Text style={styles.body}>
            {isAdmin && leaveNextAdmin
              ? `Tu es admin. Le rôle d'administrateur sera automatiquement transféré à ${leaveNextAdmin}.`
              : "Tu ne pourras plus accéder aux moments de ce groupe."}
          </Text>
          <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm} disabled={isLeaving}>
            {isLeaving
              ? <ActivityIndicator color="#FFF" />
              : <Text style={styles.confirmText}>Quitter le groupe</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Annuler</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#161616", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44 },
  handle: { width: 36, height: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2, alignSelf: "center", marginBottom: 24 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#FFF", marginBottom: 12 },
  body: { fontSize: 15, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.55)", marginBottom: 28, lineHeight: 22 },
  confirmBtn: { backgroundColor: "#FF3B30", borderRadius: 16, paddingVertical: 15, alignItems: "center", marginBottom: 10 },
  confirmText: { color: "#FFF", fontSize: 16, fontFamily: "Inter_700Bold" },
  cancelBtn: { paddingVertical: 12, alignItems: "center" },
  cancelText: { color: "rgba(255,255,255,0.35)", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
