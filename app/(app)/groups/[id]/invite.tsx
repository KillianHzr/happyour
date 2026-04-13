import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Share,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, router } from "expo-router";
import { supabase } from "../../../../lib/supabase";
import { useAuth } from "../../../../lib/auth-context";
import { colors, theme } from "../../../../lib/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Loader from "../../../../components/Loader";
import Svg, { Path } from "react-native-svg";

const CopyIcon = () => (
  <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <Path d="M20 9H11C9.89543 9 9 9.89543 9 11V20C9 21.1046 9.89543 22 11 22H20C21.1046 22 22 21.1046 22 20V11C22 9.89543 21.1046 9 20 9Z" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <Path d="M5 15H4C3.46957 15 2.96086 14.7893 2.58579 14.4142C2.21071 14.0391 2 13.5304 2 13V4C2 3.46957 2.21071 2.96086 2.58579 2.58579C2.96086 2.21071 3.46957 2 4 2H13C13.5304 2 14.0391 2.21071 14.4142 2.58579C14.7893 2.96086 15 3.46957 15 4V5" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

const ShareIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path d="M4 12V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V12M16 6L12 2M12 2L8 6M12 2V15" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

const RefreshIcon = () => (
  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <Path d="M23 4V10H17" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <Path d="M1 20V14H7" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <Path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

function generateCode(length = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [inviteCode, setInviteCode] = useState("");
  const [targetUsername, setTargetUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase.from("groups").select("invite_code").eq("id", id).single().then(({ data }) => {
      if (data) setInviteCode(data.invite_code);
    });
    if (user?.id) {
      supabase.from("group_members").select("role").eq("group_id", id).eq("user_id", user.id).single().then(({ data }) => {
        setIsAdmin(data?.role === "admin");
      });
    }
  }, [id, user?.id]);

  const handleRegenerateCode = async () => {
    setRegenerating(true);
    setShowConfirm(false);
    try {
      const newCode = generateCode();
      const { error } = await supabase.from("groups").update({ invite_code: newCode }).eq("id", id);
      if (error) throw error;
      setInviteCode(newCode);
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setRegenerating(false);
    }
  };

  const handleInviteByUsername = async () => {
    if (!targetUsername.trim()) return;
    setLoading(true);
    try {
      const { data: targetProfile, error: profileErr } = await supabase
        .from("profiles")
        .select("id, username")
        .eq("username", targetUsername.trim())
        .single();

      if (profileErr || !targetProfile) {
        Alert.alert("Utilisateur introuvable", `Aucun compte avec le pseudo "${targetUsername}".`);
        return;
      }

      const { error: joinErr } = await supabase
        .from("group_members")
        .insert({ group_id: id, user_id: targetProfile.id });

      if (joinErr) {
        if (joinErr.message.includes("unique")) {
          Alert.alert("Déjà membre", `${targetProfile.username} fait déjà partie de ce groupe.`);
        } else {
          throw joinErr;
        }
      } else {
        Alert.alert("Succès", `${targetProfile.username} a été ajouté au groupe !`);
        setTargetUsername("");
      }
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = async () => {
    try {
      await Clipboard.setStringAsync(inviteCode);
      Alert.alert("Copié", "Code d'invitation copié.");
    } catch (e) {
      console.error(e);
    }
  };

  const handleShareCode = async () => {
    try {
      const message = `Rejoins mon cercle privé sur HappyOur !\n\nCode d'invitation : ${inviteCode}\n\nTélécharge l'app ici : https://happyour.killianherzer.fr/`;
      await Share.share({ message });
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.content, { paddingTop: insets.top + 20 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Retour</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Inviter</Text>
        
        {/* Section "Par pseudo" temporairement désactivée */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Partager le code</Text>
          <Text style={styles.sectionDesc}>Envoie un lien magique à tes amis sur n'importe quelle plateforme.</Text>
          
          <View style={[theme.glassCard, styles.codeCard]}>
            <Text style={styles.codeLabel}>TON CODE D'INVITATION</Text>
            <View style={styles.codeRow}>
              <Text style={styles.codeValue}>{inviteCode}</Text>
              <TouchableOpacity style={styles.copyBtn} onPress={handleCopyCode}>
                <CopyIcon />
              </TouchableOpacity>
              {isAdmin && (
                <TouchableOpacity style={styles.copyBtn} onPress={() => setShowConfirm(true)} disabled={regenerating}>
                  {regenerating ? <ActivityIndicator color="#FFF" size="small" /> : <RefreshIcon />}
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Modal visible={showConfirm} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={styles.modalBox}>
                <Text style={styles.modalTitle}>Changer le code ?</Text>
                <Text style={styles.modalDesc}>
                  L'ancien code ne fonctionnera plus. Les membres actuels ne sont pas affectés.
                </Text>
                <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleRegenerateCode}>
                  <Text style={styles.modalConfirmText}>Changer le code</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowConfirm(false)}>
                  <Text style={styles.modalCancelText}>Annuler</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <TouchableOpacity style={styles.shareBtn} onPress={handleShareCode}>
            <ShareIcon />
            <Text style={styles.shareBtnText}>Partager le lien d'invitation</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, paddingHorizontal: 24 },
  backBtn: { marginBottom: 32 },
  backText: { color: colors.secondary, fontFamily: "Inter_600SemiBold", fontSize: 16 },
  title: { fontFamily: "Inter_700Bold", fontSize: 32, color: "#FFF", marginBottom: 40, letterSpacing: -1 },
  
  section: { marginBottom: 32 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: "#FFF", marginBottom: 8 },
  sectionDesc: { fontFamily: "Inter_400Regular", fontSize: 14, color: colors.secondary, marginBottom: 20, lineHeight: 20 },
  
  row: { flexDirection: "row", gap: 12 },
  input: { flex: 1, height: 56, paddingVertical: 0 },
  addBtn: { width: 100, height: 56, justifyContent: "center" },
  addBtnText: { color: "#000", fontFamily: "Inter_700Bold", fontSize: 14 },
  
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.1)", marginVertical: 12, marginBottom: 40 },
  
  codeCard: { padding: 32, alignItems: "center", backgroundColor: "rgba(255,255,255,0.03)", marginBottom: 24 },
  codeLabel: { fontSize: 10, fontFamily: "Inter_700Bold", color: colors.secondary, letterSpacing: 2, marginBottom: 12 },
  codeRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  codeValue: { fontSize: 32, fontFamily: "Inter_700Bold", color: "#FFF", letterSpacing: 4 },
  copyBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center" },
  
  shareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "rgba(255,255,255,0.1)", padding: 20, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  shareBtnText: { color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 16 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalBox: { backgroundColor: "#1A1A1A", borderRadius: 20, padding: 28, width: "100%", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFF", marginBottom: 12 },
  modalDesc: { fontFamily: "Inter_400Regular", fontSize: 14, color: colors.secondary, lineHeight: 20, marginBottom: 28 },
  modalConfirmBtn: { backgroundColor: "#E53E3E", padding: 16, borderRadius: 14, alignItems: "center", marginBottom: 10 },
  modalConfirmText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFF" },
  modalCancelBtn: { padding: 16, borderRadius: 14, alignItems: "center" },
  modalCancelText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: colors.secondary },
});
