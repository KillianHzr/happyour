import { useEffect, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../../../lib/auth-context";
import { supabase } from "../../../lib/supabase";
import { colors } from "../../../lib/theme";

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

  useEffect(() => {
    if (loading) return;
    if (groups.length > 0) {
      router.replace(`/(app)/groups/${groups[0].id}`);
    } else {
      router.replace("/(app)/groups/create");
    }
  }, [loading, groups]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#fff" style={{ marginTop: 80 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
});
