import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../../lib/auth-context";
import { supabase } from "../../../lib/supabase";
import { colors, theme } from "../../../lib/theme";

export default function CreateGroupScreen() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return Alert.alert("Erreur", "Donne un nom au groupe.");
    if (!user) return;

    setLoading(true);
    try {
      const { data: group, error } = await supabase
        .from("groups")
        .insert({ name: name.trim(), created_by: user.id })
        .select()
        .single();

      if (error) throw error;

      await supabase
        .from("group_members")
        .insert({ group_id: group.id, user_id: user.id });

      router.replace(`/(app)/groups/${group.id}`);
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Nouveau groupe</Text>

      <TextInput
        style={[theme.glassInput, styles.input]}
        placeholder="Nom du groupe"
        placeholderTextColor={colors.muted}
        value={name}
        onChangeText={setName}
      />

      <TouchableOpacity style={theme.accentButton} onPress={handleCreate} disabled={loading}>
        <Text style={theme.accentButtonText}>{loading ? "Création..." : "Créer"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 32, paddingTop: 80, backgroundColor: colors.bg },
  title: { fontFamily: "Inter_700Bold", fontSize: 28, marginBottom: 24, color: colors.text },
  input: { marginBottom: 16 },
});
