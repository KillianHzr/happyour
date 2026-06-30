import { useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { router, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../lib/auth-context";
import { spacing, radii, textStyles, typography, type ThemeColors } from "../../../lib/theme";
import { useTheme, useThemedStyles } from "../../../lib/theme-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LoadingScreen from "../../../components/LoadingScreen";
import Icon from "../../../components/Icon";
import AddGroupFlow from "../../../components/groups/AddGroupFlow";

export default function GroupsHomeScreen() {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [loading, setLoading] = useState(true);
  // Ouvre le même bottom sheet créer/rejoindre que les vues liste / groupe.
  const [addStep, setAddStep] = useState<"create" | "join" | null>(null);

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
    return <LoadingScreen />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl3, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.hero}>
        <View style={styles.brandBadge}>
          <Icon name="plus" size={28} color={colors.iconBrandOnBrand} />
        </View>

        <View style={styles.heroText}>
          <Text style={styles.title}>Prêt pour votre premier cercle ?</Text>
          <Text style={styles.subtitle}>
            Créez un groupe pour vous et vos amis, ou rejoignez un cercle existant avec un code.
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.btnPrimary} activeOpacity={0.85} onPress={() => setAddStep("create")}>
            <Text style={styles.btnPrimaryText}>Créer un groupe</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnNeutral} activeOpacity={0.85} onPress={() => setAddStep("join")}>
            <Text style={styles.btnNeutralText}>Rejoindre un groupe</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ flex: 1 }} />

      <TouchableOpacity style={styles.logoutRow} activeOpacity={0.7} onPress={() => logout().catch(() => {})}>
        <View style={styles.logoutIconWrap}>
          <Icon name="log-out" size={18} color={colors.iconDanger} />
        </View>
        <Text style={styles.logoutLabel}>Se déconnecter</Text>
      </TouchableOpacity>

      <AddGroupFlow
        visible={addStep !== null}
        userId={user?.id ?? ""}
        initialStep={addStep ?? "menu"}
        onClose={() => setAddStep(null)}
        onGroupsChanged={() => {}}
        onEnterGroup={(id) => { setAddStep(null); router.replace(`/(app)/groups/${id}`); }}
      />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
  },
  hero: {
    alignItems: "center",
    gap: spacing.xl3,
  },
  brandBadge: {
    width: 64,
    height: 64,
    borderRadius: radii.xl,
    backgroundColor: colors.brand,
    justifyContent: "center",
    alignItems: "center",
  },
  heroText: {
    alignItems: "center",
    gap: spacing.md,
  },
  title: {
    ...textStyles.subtitleStrong,
    color: colors.text,
    textAlign: "center",
  },
  subtitle: {
    ...textStyles.bodyBase,
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  // ── Boutons (mêmes styles que le bottom sheet AddGroupFlow) ──
  actions: {
    alignSelf: "stretch",
    gap: spacing.md,
  },
  btnPrimary: {
    alignSelf: "stretch",
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.brand,
    justifyContent: "center",
    alignItems: "center",
  },
  btnPrimaryText: {
    ...textStyles.singleLineSubheadingStrong,
    lineHeight: typography.size.xl + 4,
    color: colors.textBrandOnBrand,
  },
  btnNeutral: {
    alignSelf: "stretch",
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.bgNeutralTertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  btnNeutralText: {
    ...textStyles.singleLineSubheadingStrong,
    lineHeight: typography.size.xl + 4,
    color: colors.textNeutral,
  },
  // ── Déconnexion ──
  logoutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.card,
  },
  logoutIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.bgDangerTertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  logoutLabel: {
    ...textStyles.bodyStrong,
    color: colors.textDanger,
  },
});
