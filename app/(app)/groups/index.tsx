import { useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { router, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../lib/auth-context";
import { colors } from "../../../lib/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Loader from "../../../components/Loader";
import Svg, { Path } from "react-native-svg";

const LogoutIcon = () => (
  <Svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FF3B30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <Path d="M16 17l5-5-5-5" />
    <Path d="M21 12H9" />
  </Svg>
);

const PlusIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path d="M12 5V19M5 12H19" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const GroupIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7Z" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export default function GroupsHomeScreen() {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    if (!user) return;
    (async () => {
      setLoading(true);

      // Fetch all groups the user belongs to
      const { data: memberships } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id);

      if (!memberships || memberships.length === 0) {
        setLoading(false);
        return;
      }

      const memberGroupIds = new Set(memberships.map((m: any) => m.group_id));

      // Try to restore last active group
      const lastGroupId = await AsyncStorage.getItem("lastGroupId");
      if (lastGroupId && memberGroupIds.has(lastGroupId)) {
        router.replace(`/(app)/groups/${lastGroupId}`);
        return;
      }

      // Fall back to first group
      router.replace(`/(app)/groups/${memberships[0].group_id}`);
    })();
  }, [user]));

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Loader size={48} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.centered}>
        <View style={styles.logoMark} />
        <Text style={styles.title}>Prêt pour votre premier cercle ?</Text>
        <Text style={styles.subtitle}>
          Créez un groupe pour vous et vos amis, ou rejoignez un cercle existant avec un code.
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push("/(app)/groups/create")}>
            <View style={styles.btnIcon}>
              <PlusIcon />
            </View>
            <Text style={styles.primaryBtnText}>Créer un groupe</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push("/(app)/groups/join")}>
            <View style={[styles.btnIcon, styles.btnIconDark]}>
              <GroupIcon />
            </View>
            <Text style={styles.secondaryBtnText}>Rejoindre</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ flex: 1 }} />

      <View style={styles.logoutCard}>
        <TouchableOpacity style={styles.logoutRow} onPress={() => logout().catch(() => {})}>
          <View style={styles.logoutIconWrap}>
            <LogoutIcon />
          </View>
          <Text style={styles.logoutLabel}>Se déconnecter</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  centered: { alignItems: "center" },
  logoMark: {
    width: 40, height: 40, borderWidth: 3, borderColor: "#FFF",
    borderRadius: 8, transform: [{ rotate: "45deg" }], marginBottom: 32,
  },
  title: { color: "#FFF", fontSize: 24, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 12 },
  subtitle: {
    color: colors.secondary, fontSize: 15, fontFamily: "Inter_400Regular",
    textAlign: "center", lineHeight: 22, paddingHorizontal: 16, marginBottom: 48,
  },
  actions: { width: "100%", gap: 16 },
  primaryBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", padding: 20, borderRadius: 20, gap: 16 },
  secondaryBtn: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)", padding: 20, borderRadius: 20, gap: 16,
  },
  btnIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.05)", justifyContent: "center", alignItems: "center" },
  btnIconDark: { backgroundColor: "rgba(255,255,255,0.1)" },
  primaryBtnText: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#000" },
  secondaryBtnText: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#FFF" },
  logoutCard: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 20, overflow: "hidden" },
  logoutRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  logoutIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,59,48,0.12)", justifyContent: "center", alignItems: "center" },
  logoutLabel: { fontSize: 16, color: "#FF3B30", fontFamily: "Inter_600SemiBold" },
});
