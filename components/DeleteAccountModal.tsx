import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useAuth } from "../lib/auth-context";
import { useToast } from "../lib/toast-context";
import { supabase } from "../lib/supabase";
import { radii, typography, type ThemeColors } from "../lib/theme";
import { useThemedStyles } from "../lib/theme-context";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type Props = {
  visible: boolean;
  onClose: () => void;
};

const WarningIcon = ({ color = "#FF3B30" }) => (
  <Svg width="48" height="48" viewBox="0 0 24 24" fill="none">
    <Path
      d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export default function DeleteAccountModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { logout, user } = useAuth();
  const { showToast } = useToast();
  const styles = useThemedStyles(makeStyles);
  const [loading, setLoading] = useState(false);

  const handleDeleteAccount = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Appel de la fonction SQL SECURITY DEFINER
      const { error } = await supabase.rpc('delete_user_account');

      if (error) {
        console.error("Erreur suppression compte:", error);
        throw error;
      }

      showToast("Compte supprimé", "Ton compte et tes données ont été effacés.", "success");
      await logout();
      onClose();
    } catch (e) {
      showToast("Erreur", "Impossible de supprimer le compte. Réessaie plus tard.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleJustLogout = async () => {
    setLoading(true);
    try {
      await logout();
      onClose();
    } catch (e) {
      showToast("Erreur", "Échec de la déconnexion.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.container}>
        <View style={[styles.content, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}>
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <WarningIcon />
            </View>
            <Text style={styles.title}>Supprimer mon compte ?</Text>
            <Text style={styles.description}>
              Cette action est irréversible. Tu perdras l'accès à tous tes groupes et tes souvenirs.
            </Text>

            <View style={styles.warningBox}>
              <Text style={styles.warningBoxText}>
                ⚠️ <Text style={{ fontFamily: typography.family.bold }}>Important :</Text> Tous tes moments partagés seront définitivement supprimés pour tout le monde.
              </Text>
            </View>
          </View>

          <View style={{ flex: 1 }} />

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.deleteBtn]}
              onPress={handleDeleteAccount}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.deleteBtnText}>Supprimer définitivement</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.logoutBtn]}
              onPress={handleJustLogout}
              disabled={loading}
            >
              <Text style={styles.logoutBtnText}>Juste me déconnecter</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.cancelBtnText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    paddingHorizontal: 30,
    alignItems: "center",
  },
  header: {
    alignItems: "center",
    marginTop: 20,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: radii.xl,
    backgroundColor: "rgba(255, 59, 48, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: typography.size.subtitle,
    fontFamily: typography.family.bold,
    color: colors.text,
    textAlign: "center",
    marginBottom: 16,
    letterSpacing: -1,
  },
  description: {
    fontSize: typography.size.lg,
    fontFamily: typography.family.regular,
    color: colors.secondary,
    textAlign: "center",
    lineHeight: 26,
    paddingHorizontal: 10,
    marginBottom: 32,
  },
  warningBox: {
    backgroundColor: "rgba(255, 59, 48, 0.1)",
    borderRadius: radii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 59, 48, 0.2)",
    width: "100%",
  },
  warningBoxText: {
    color: "#FF453A",
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    textAlign: "center",
    lineHeight: 20,
  },
  actions: {
    width: "100%",
    gap: 12,
  },
  btn: {
    width: "100%",
    height: 64,
    borderRadius: radii.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteBtn: {
    backgroundColor: "#FF3B30",
  },
  deleteBtnText: {
    color: "#FFFFFF",
    fontSize: typography.size.lg,
    fontFamily: typography.family.bold,
  },
  logoutBtn: {
    backgroundColor: colors.accentMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  logoutBtnText: {
    color: colors.text,
    fontSize: typography.size.lg,
    fontFamily: typography.family.semibold,
  },
  cancelBtn: {
    width: "100%",
    height: 64,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelBtnText: {
    color: colors.textTertiary,
    fontSize: typography.size.md,
    fontFamily: typography.family.semibold,
  },
});
