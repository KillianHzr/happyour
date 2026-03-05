import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../lib/auth-context";
import { colors } from "../../../lib/theme";

export default function ProfileRedirect() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    // Redirige vers le premier groupe de l'utilisateur (le Pager gère le reste)
    supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", user.id)
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) {
          router.replace(`/(app)/groups/${data.group_id}`);
        } else {
          router.replace("/(app)/groups");
        }
      });
  }, [user]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator color="#FFF" />
    </View>
  );
}
