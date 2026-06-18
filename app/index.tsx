import { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useRouter, Redirect } from "expo-router";
import { useAuth } from "../lib/auth-context";
import { supabase } from "../lib/supabase";
import Loader from "../components/Loader";
import { type ThemeColors } from "../lib/theme";
import { useThemedStyles } from "../lib/theme-context";

export default function Index() {
  const { session, loading: authLoading, profileComplete } = useAuth();
  const styles = useThemedStyles(makeStyles);
  const [checkingGroup, setCheckingGroup] = useState(true);
  const [targetGroupId, setTargetGroupId] = useState<string | null>(null);

  useEffect(() => {
    async function checkUserGroups() {
      if (!session?.user) {
        setCheckingGroup(false);
        return;
      }

      try {
        // On récupère le premier groupe de l'utilisateur
        const { data, error } = await supabase
          .from("group_members")
          .select("group_id")
          .eq("user_id", session.user.id)
          .limit(1)
          .single();

        if (data?.group_id) {
          setTargetGroupId(data.group_id);
        }
      } catch (e) {
        // Pas de groupe trouvé ou erreur, on reste sur null
      } finally {
        setCheckingGroup(false);
      }
    }

    if (!authLoading) {
      checkUserGroups();
    }
  }, [session, authLoading]);

  if (authLoading || checkingGroup || profileComplete === null) {
    return (
      <View style={styles.container}>
        <Loader size={40} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/intro" />;
  }

  if (profileComplete === false) {
    return <Redirect href="/(onboarding)/intro" />;
  }

  // Si on a trouvé un groupe, on y va direct
  if (targetGroupId) {
    return <Redirect href={`/(app)/groups/${targetGroupId}`} />;
  }

  // Sinon, on va sur l'écran de création/rejoindre
  return <Redirect href="/(app)/groups" />;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
  },
});
