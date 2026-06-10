import { View, Text, StyleSheet, Modal, Pressable, TouchableOpacity, ActivityIndicator } from "react-native";
import { radii, typography, type ThemeColors } from "../../lib/theme";
import { useThemedStyles } from "../../lib/theme-context";

type Props = {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isAdmin: boolean;
  leaveNextAdmin: string | null;
  isLeaving: boolean;
};

export default function LeaveGroupModal({ visible, onClose, onConfirm, isAdmin, leaveNextAdmin, isLeaving }: Props) {
  const styles = useThemedStyles(makeStyles);
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
              ? <ActivityIndicator color="#FFFFFF" />
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

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.opacityLight, justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 24, paddingBottom: 44 },
  handle: { width: 36, height: 4, backgroundColor: colors.borderSecondary, borderRadius: radii.xs, alignSelf: "center", marginBottom: 24 },
  title: { fontSize: typography.size.xl, fontFamily: typography.family.bold, color: colors.text, marginBottom: 12 },
  body: { fontSize: typography.size.sm, fontFamily: typography.family.regular, color: colors.secondary, marginBottom: 28, lineHeight: 22 },
  confirmBtn: { backgroundColor: "#FF3B30", borderRadius: radii.lg, paddingVertical: 15, alignItems: "center", marginBottom: 10 },
  confirmText: { color: "#FFFFFF", fontSize: typography.size.md, fontFamily: typography.family.bold },
  cancelBtn: { paddingVertical: 12, alignItems: "center" },
  cancelText: { color: colors.textTertiary, fontSize: typography.size.sm, fontFamily: typography.family.semibold },
});
