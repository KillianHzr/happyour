import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { spacing, textStyles, type ThemeColors } from "../../lib/theme";
import Icon from "../Icon";
import { useSettingsNav } from "../SettingsSheet";
import AccountAboutPage from "./AccountAboutPage";
import TermsPage from "./TermsPage";
import EURegulationPage from "./EURegulationPage";

export default function AboutSettingsPage() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { push } = useSettingsNav();

  const items = [
    {
      label: "À propos de votre compte",
      onPress: () => push({ title: "Votre compte", content: <AccountAboutPage /> }),
    },
    {
      label: "Conditions d'utilisation",
      onPress: () => push({ title: "Conditions d'utilisation", content: <TermsPage /> }),
    },
    {
      label: "Règlement UE",
      onPress: () => push({ title: "Règlement UE", content: <EURegulationPage /> }),
    },
  ];

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      showsVerticalScrollIndicator={false}
      alwaysBounceVertical={false}
    >
      <View style={styles.itemsList}>
        {items.map((item, i) => (
          <TouchableOpacity key={i} style={styles.item} onPress={item.onPress} activeOpacity={0.7}>
            <Text style={[styles.itemLabel, { color: colors.text }]}>{item.label}</Text>
            <View style={styles.iconBtn}>
              <Icon name="chevron-right" size={20} color={colors.icon} />
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const makeStyles = (_colors: ThemeColors) => StyleSheet.create({
  content: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xxl,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xxl,
  },
  itemsList: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xs2,
    alignSelf: "stretch",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
    paddingVertical: spacing.xs2,
  },
  itemLabel: {
    ...textStyles.bodyBase,
    flex: 1,
  },
  iconBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
});
