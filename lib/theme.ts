import { StyleSheet } from "react-native";

export const colors = {
  bg: "#000000",
  card: "rgba(255,255,255,0.08)",
  cardBorder: "rgba(255,255,255,0.18)",
  accent: "#FFFFFF",
  accentMuted: "#A0A0A0",
  text: "#FFFFFF",
  secondary: "#B0B0B0",
  muted: "#404040",
  overlay: "rgba(0,0,0,0.6)",
} as const;

export const theme = StyleSheet.create({
  glassCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 20,
  },
  glassInput: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 14,
    padding: 18,
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: colors.text,
  },
  accentButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    padding: 18,
    alignItems: "center" as const,
  },
  accentButtonText: {
    fontFamily: "Inter_600SemiBold",
    color: "#000000",
    fontSize: 16,
    letterSpacing: -0.2,
  },
  outlineButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 14,
    padding: 18,
    alignItems: "center" as const,
  },
  outlineButtonText: {
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
    fontSize: 16,
  },
  glassTabBar: {
    backgroundColor: "rgba(0,0,0,0.8)",
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
});
