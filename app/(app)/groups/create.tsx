import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../../lib/auth-context";
import { useToast } from "../../../lib/toast-context";
import { translateError } from "../../../lib/error-messages";
import { supabase } from "../../../lib/supabase";
import { colors, theme } from "../../../lib/theme";

const MAX_GROUPS = 3;

export default function CreateGroupScreen() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return showToast("Erreur", "Donne un nom au groupe.");
    if (!user) return;

    setLoading(true);
    try {
      const { count } = await supabase
        .from("group_members")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      if ((count ?? 0) >= MAX_GROUPS) {
        showToast("Limite atteinte", `Tu peux appartenir à ${MAX_GROUPS} groupes maximum.`, "info");
        return;
      }

      const { data: group, error } = await supabase
        .from("groups")
        .insert({ name: name.trim(), created_by: user.id })
        .select()
        .single();

      if (error) throw error;

      await supabase
        .from("group_members")
        .insert({ group_id: group.id, user_id: user.id, role: "admin" });

      router.replace(`/(app)/groups/${group.id}?onboarding=true`);
    } catch (e: any) {
      showToast("Erreur", translateError(e.message));
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
        maxLength={25}
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
