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

      router.back();
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
        style={styles.input}
        placeholder="Nom du groupe"
        placeholderTextColor="#999"
        value={name}
        onChangeText={setName}
      />

      <TouchableOpacity style={styles.button} onPress={handleCreate} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Création..." : "Créer"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 32, paddingTop: 80, backgroundColor: "#fff" },
  title: { fontFamily: "Inter_700Bold", fontSize: 28, marginBottom: 24 },
  input: {
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: "#fafafa",
  },
  button: {
    backgroundColor: "#000",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  buttonText: { fontFamily: "Inter_600SemiBold", color: "#fff", fontSize: 16 },
});
