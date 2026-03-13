import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../lib/auth-context";
import { useToast } from "../../../lib/toast-context";
import { colors, theme } from "../../../lib/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Loader from "../../../components/Loader";
import Svg, { Path } from "react-native-svg";

const PlusIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path d="M12 5V19M5 12H19" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

const GroupIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0178 6.12226 19.0382 7.02425C19.0587 7.92624 18.7927 8.81409 18.2772 9.56129C17.7617 10.3085 17.0212 10.8791 16.16 11.19M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7Z" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

export default function GroupsHomeScreen() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const [groups, setGroups] = useState<any[]>([]);
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserAndGroups = async () => {
    if (!user) return;
    try {
      const [profileRes, groupsRes] = await Promise.all([
        supabase.from("profiles").select("username, avatar_url").eq("id", user.id).single(),
        supabase.from("group_members")
          .select("groups(id, name, invite_code)")
          .eq("user_id", user.id)
      ]);

      if (profileRes.data) {
        setUsername(profileRes.data.username);
        setAvatarUrl(profileRes.data.avatar_url);
      }
      if (groupsRes.data) {
        setGroups(groupsRes.data.map((g: any) => g.groups));
      }
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchUserAndGroups(); }, [user]));

  // Auto-redirect vers le premier groupe si l'utilisateur en a un
  useEffect(() => {
    if (!loading && groups.length > 0) {
      router.replace(`/(app)/groups/${groups[0].id}`);
    }
  }, [loading, groups]);

  if (loading) return <View style={[styles.container, styles.center]}><Loader size={48} /></View>;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Bonjour,</Text>
          <Text style={styles.usernameText}>{username || "Ami"}</Text>
        </View>
        <TouchableOpacity onPress={() => groups.length > 0 ? router.push(`/(app)/groups/${groups[0].id}`) : showToast("Profil", "Rejoignez un groupe pour accéder au profil complet.", "info")}>
          <View style={styles.avatarCircle}>
            {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImg} /> : <Text style={styles.avatarInitial}>{username[0]?.toUpperCase()}</Text>}
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.mainContent}>
        {groups.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.logoMark} />
            <Text style={styles.emptyTitle}>Prêt pour votre premier cercle ?</Text>
            <Text style={styles.emptySubtitle}>Créez un groupe pour vous et vos amis ou rejoignez un cercle existant avec un code.</Text>
            
            <View style={styles.actionGrid}>
              <TouchableOpacity style={styles.mainActionBtn} onPress={() => router.push("/(app)/groups/create")}>
                <View style={styles.actionIconContainer}><PlusIcon /></View>
                <Text style={styles.actionText}>Créer un groupe</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.mainActionBtn, styles.secondaryActionBtn]} onPress={() => router.push("/(app)/groups/join")}>
                <View style={[styles.actionIconContainer, styles.secondaryIconContainer]}><GroupIcon /></View>
                <Text style={[styles.actionText, { color: "#FFF" }]}>Rejoindre</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <FlatList
            data={groups}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listPadding}
            renderItem={({ item }) => (
              <TouchableOpacity style={[theme.glassCard, styles.groupCard]} onPress={() => router.push(`/(app)/groups/${item.id}`)}>
                <Text style={styles.groupName}>{item.name}</Text>
                <Text style={styles.groupCode}>Code: {item.invite_code}</Text>
              </TouchableOpacity>
            )}
            ListFooterComponent={() => (
              <View style={styles.footerActions}>
                <TouchableOpacity style={styles.addBtn} onPress={() => router.push("/(app)/groups/create")}>
                  <Text style={styles.addBtnText}>+ Nouveau groupe</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.addBtn} onPress={() => router.push("/(app)/groups/join")}>
                  <Text style={styles.addBtnText}>Rejoindre avec un code</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  center: { justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 40 },
  welcomeText: { color: colors.secondary, fontSize: 16, fontFamily: "Inter_400Regular" },
  usernameText: { color: "#FFF", fontSize: 24, fontFamily: "Inter_700Bold" },
  avatarCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center", overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  avatarImg: { width: "100%", height: "100%" },
  avatarInitial: { color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 20 },
  
  mainContent: { flex: 1 },
  emptyState: { flex: 1, justifyContent: "center", alignItems: "center", paddingBottom: 100 },
  logoMark: { width: 40, height: 40, borderWidth: 3, borderColor: "#FFF", borderRadius: 8, transform: [{ rotate: "45deg" }], marginBottom: 32 },
  emptyTitle: { color: "#FFF", fontSize: 24, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 12 },
  emptySubtitle: { color: colors.secondary, fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22, paddingHorizontal: 20, marginBottom: 48 },
  
  actionGrid: { width: "100%", gap: 16 },
  mainActionBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", padding: 20, borderRadius: 20, gap: 16 },
  secondaryActionBtn: { backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  actionIconContainer: { width: 44, height: 44, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.05)", justifyContent: "center", alignItems: "center" },
  secondaryIconContainer: { backgroundColor: "rgba(255,255,255,0.1)" },
  actionText: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#000" },
  
  groupCard: { padding: 24, marginBottom: 16 },
  groupName: { color: "#FFF", fontSize: 18, fontFamily: "Inter_700Bold" },
  groupCode: { color: colors.secondary, fontSize: 12, marginTop: 4, textTransform: "uppercase" },
  listPadding: { paddingBottom: 100 },
  footerActions: { gap: 12, marginTop: 8 },
  addBtn: { padding: 16, alignItems: "center" },
  addBtnText: { color: colors.secondary, fontFamily: "Inter_600SemiBold" },
});
