import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { radii, typography, type ThemeColors } from "../lib/theme";
import { useThemedStyles } from "../lib/theme-context";

export default function OfflineView() {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.container}>
      <View style={styles.logoMark} />
      <Text style={styles.title}>Hors connexion</Text>
      <Text style={styles.subtitle}>
        Une connexion internet est nécessaire pour se connecter ou s'inscrire.
        Vérifie tes réglages réseau.
      </Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    backgroundColor: colors.bg,
  },
  logoMark: {
    width: 32,
    height: 32,
    borderWidth: 2,
    borderColor: colors.text,
    borderRadius: radii.xs,
    marginBottom: 24,
    transform: [{ rotate: "45deg" }],
    opacity: 0.3,
  },
  title: {
    fontFamily: typography.family.bold,
    fontSize: typography.size.xxl,
    color: colors.text,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    color: colors.secondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
