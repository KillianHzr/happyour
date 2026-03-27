import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../lib/theme";

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
    borderColor: "#fff",
    borderRadius: 6,
    marginBottom: 24,
    transform: [{ rotate: "45deg" }],
    opacity: 0.3,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: colors.text,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: colors.secondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
