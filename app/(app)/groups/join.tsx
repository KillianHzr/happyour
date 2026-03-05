import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../lib/auth-context";
import { colors, theme } from "../../../lib/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Loader from "../../../components/Loader";

export default function JoinGroupScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    if (!code.trim() || !user) return;
    setLoading(true);
    try {
      const { data: group, error: groupErr } = await supabase
        .from("groups")
        .select("id, name")
        .eq("invite_code", code.trim().toUpperCase())
        .single();

      if (groupErr || !group) {
        Alert.alert("Erreur", "Code invalide ou groupe introuvable.");
        return;
      }

      const { error: joinErr } = await supabase
        .from("group_members")
        .insert({ group_id: group.id, user_id: user.id });

      if (joinErr) {
        if (joinErr.message.includes("unique")) {
          Alert.alert("Info", "Tu fais déjà partie de ce groupe.");
          router.replace(`/(app)/groups/${group.id}`);
        } else {
          throw joinErr;
        }
      } else {
        Alert.alert("Succès", `Tu as rejoint "${group.name}" !`);
        router.replace(`/(app)/groups/${group.id}`);
      }
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setLoading(false);
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

        <Text style={styles.title}>Rejoindre un cercle</Text>
        <Text style={styles.subtitle}>Entre le code d'invitation reçu de tes amis pour accéder au coffre.</Text>

        <TextInput
          style={[theme.glassInput, styles.input]}
          placeholder="CODE-1234"
          placeholderTextColor="rgba(255,255,255,0.3)"
          autoCapitalize="characters"
          value={code}
          onChangeText={setCode}
          autoFocus
        />

        <TouchableOpacity 
          style={[theme.accentButton, styles.button]} 
          onPress={handleJoin}
          disabled={loading || !code.trim()}
        >
          {loading ? <Loader size={24} /> : <Text style={theme.accentButtonText}>Rejoindre le groupe</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, paddingHorizontal: 24 },
  backBtn: { marginBottom: 32 },
  backText: { color: colors.secondary, fontFamily: "Inter_600SemiBold", fontSize: 16 },
  title: { fontFamily: "Inter_700Bold", fontSize: 32, color: "#FFF", marginBottom: 12, letterSpacing: -1 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 16, color: colors.secondary, lineHeight: 24, marginBottom: 40 },
  input: { fontSize: 24, fontFamily: "Inter_700Bold", textAlign: "center", letterSpacing: 2 },
  button: { marginTop: 24 },
});
