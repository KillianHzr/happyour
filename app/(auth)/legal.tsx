import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { radii, textStyles, type ThemeColors } from "../../lib/theme";
import Icon from "../../components/Icon";
import TermsPage from "../../components/settings/TermsPage";
import PrivacySettingsPage from "../../components/settings/PrivacySettingsPage";

export default function LegalScreen() {
  const router = useRouter();
  const { page } = useLocalSearchParams<{ page?: string }>();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const isPrivacy = page === "privacy";
  const title = isPrivacy ? "Confidentialité" : "Conditions d'utilisation";

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Icon name="chevron-left" size={20} color={colors.iconNeutral} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <View style={styles.spacer} />
      </View>

      {isPrivacy ? <PrivacySettingsPage /> : <TermsPage />}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    height: 48,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    ...textStyles.singleLineBodyBaseStrong,
    color: colors.text,
    flex: 1,
    textAlign: "center",
  },
  spacer: {
    width: 40,
    height: 40,
  },
});
