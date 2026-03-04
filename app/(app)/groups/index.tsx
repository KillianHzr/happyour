import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../../../lib/auth-context";
import { supabase } from "../../../lib/supabase";

type Group = { id: string; name: string; created_at: string };

export default function GroupsListScreen() {
  const { user, logout } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGroups = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("group_members")
      .select("group_id, groups(id, name, created_at)")
      .eq("user_id", user.id);

    if (!error && data) {
      const mapped = data
        .map((row: any) => row.groups)
        .filter(Boolean) as Group[];
      setGroups(mapped);
    }
    setLoading(false);
  };

  useFocusEffect(useCallback(() => { fetchGroups(); }, [user]));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Mes Groupes</Text>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logoutText}>Déconnexion</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#000" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>Aucun groupe. Crées-en un !</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/(app)/groups/${item.id}`)}
            >
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.arrow}>→</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/(app)/groups/create")}
      >
        <Text style={styles.fabText}>+ Nouveau groupe</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 16,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 28 },
  logoutText: { fontFamily: "Inter_400Regular", color: "#999", fontSize: 14 },
  list: { paddingHorizontal: 24, paddingTop: 8 },
  empty: { fontFamily: "Inter_400Regular", color: "#999", textAlign: "center", marginTop: 40 },
  card: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
  },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 18 },
  arrow: { fontSize: 20, color: "#999" },
  fab: {
    position: "absolute",
    bottom: 40,
    left: 24,
    right: 24,
    backgroundColor: "#000",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  fabText: { fontFamily: "Inter_600SemiBold", color: "#fff", fontSize: 16 },
});
