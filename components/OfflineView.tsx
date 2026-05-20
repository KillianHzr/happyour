import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, radii, typography } from "../lib/theme";

export default function OfflineView() {
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

const styles = StyleSheet.create({
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
    borderColor: colors.white,
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
