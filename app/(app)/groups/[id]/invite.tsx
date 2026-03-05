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
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { supabase } from "../../../../lib/supabase";
import { colors, theme } from "../../../../lib/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Loader from "../../../../components/Loader";
import Svg, { Path } from "react-native-svg";

const ShareIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path d="M4 12V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V12M16 6L12 2M12 2L8 6M12 2V15" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [inviteCode, setInviteCode] = useState("");
  const [targetUsername, setTargetUsername] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("groups").select("invite_code").eq("id", id).single().then(({ data }) => {
      if (data) setInviteCode(data.invite_code);
    });
  }, [id]);

  const handleInviteByUsername = async () => {
    if (!targetUsername.trim()) return;
    setLoading(true);
    try {
      // 1. Trouver l'utilisateur par son pseudo
      const { data: targetProfile, error: profileErr } = await supabase
        .from("profiles")
        .select("id, username")
        .eq("username", targetUsername.trim())
        .single();

      if (profileErr || !targetProfile) {
        Alert.alert("Utilisateur introuvable", `Aucun compte n'existe avec le pseudo "${targetUsername}".`);
        return;
      }

      // 2. Ajouter au groupe
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

  const handleShareCode = async () => {
    try {
      const message = `Rejoins mon cercle privé sur [noname] !\n\nCode d'invitation : ${inviteCode}\n\nTélécharge l'app ici : https://happyour-landing.vercel.app`;
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
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Par pseudo</Text>
          <Text style={styles.sectionDesc}>Ajoute un ami qui possède déjà un compte [noname].</Text>
          <View style={styles.row}>
            <TextInput
              style={[theme.glassInput, styles.input]}
              placeholder="Pseudo de l'ami"
              placeholderTextColor="rgba(255,255,255,0.3)"
              autoCapitalize="none"
              value={targetUsername}
              onChangeText={setTargetUsername}
            />
            <TouchableOpacity 
              style={[theme.accentButton, styles.addBtn]} 
              onPress={handleInviteByUsername}
              disabled={loading || !targetUsername.trim()}
            >
              {loading ? <Loader size={20} /> : <Text style={styles.addBtnText}>Ajouter</Text>}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Partager le code</Text>
          <Text style={styles.sectionDesc}>Envoie un lien magique à tes amis sur n'importe quelle plateforme.</Text>
          
          <View style={[theme.glassCard, styles.codeCard]}>
            <Text style={styles.codeLabel}>TON CODE D'INVITATION</Text>
            <Text style={styles.codeValue}>{inviteCode}</Text>
          </View>

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
  codeValue: { fontSize: 32, fontFamily: "Inter_700Bold", color: "#FFF", letterSpacing: 4 },
  
  shareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "rgba(255,255,255,0.1)", padding: 20, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  shareBtnText: { color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 16 },
});
