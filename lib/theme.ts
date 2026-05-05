import { StyleSheet } from "react-native";
import tokens from "../design-tokens.json";

// Helper function to extract token values
const token = (path: string) => {
  const parts = path.split(".");
  let current: any = tokens;
  for (const part of parts) {
    current = current[part];
  }
  return current.$value;
};

export const colors = {
  bg: token("colors.bg"),
  card: token("colors.card"),
  cardBorder: token("colors.cardBorder"),
  accent: token("colors.accent"),
  accentMuted: token("colors.accentMuted"),
  text: token("colors.text"),
  textMuted: token("colors.textMuted"),
  secondary: token("colors.secondary"),
  muted: token("colors.muted"),
  danger: token("colors.danger"),
  dangerLight: token("colors.dangerLight"),
  error: token("colors.error"),
  surface: token("colors.surface"),
  overlay: token("colors.overlay"),
  white: token("colors.white"),
  black: token("colors.black"),
  gold: token("colors.gold"),
  goldDark: token("colors.goldDark"),
  glass: token("colors.glass"),
  glassMuted: token("colors.glassMuted"),
  glassBorder: token("colors.glassBorder"),
} as const;

export const spacing = {
  none: token("spacing.none"),
  xs: token("spacing.xs"),
  sm: token("spacing.sm"),
  md: token("spacing.md"),
  lg: token("spacing.lg"),
  xl: token("spacing.xl"),
  xxl: token("spacing.xxl"),
} as const;

export const radii = {
  none: token("radii.none"),
  xs: token("radii.xs"),
  sm: token("radii.sm"),
  md: token("radii.md"),
  lg: token("radii.lg"),
  xl: token("radii.xl"),
  full: token("radii.full"),
} as const;

export const typography = {
  size: {
    xs: token("typography.size.xs"),
    sm: token("typography.size.sm"),
    md: token("typography.size.md"),
    lg: token("typography.size.lg"),
    xl: token("typography.size.xl"),
    xxl: token("typography.size.xxl"),
  },
  family: {
    regular: token("typography.family.regular"),
    semibold: token("typography.family.semibold"),
    bold: token("typography.family.bold"),
  },
} as const;

export const theme = StyleSheet.create({
  glassCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: token("radii.xl"),
  },
  glassInput: {
    backgroundColor: token("colors.glass"),
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: token("radii.md"),
    padding: token("spacing.lg"),
    fontFamily: token("typography.family.regular"),
    fontSize: token("typography.size.lg"),
    color: colors.text,
  },
  accentButton: {
    backgroundColor: colors.accent,
    borderRadius: token("radii.md"),
    padding: token("spacing.lg"),
    alignItems: "center" as const,
  },
  accentButtonText: {
    fontFamily: token("typography.family.semibold"),
    color: token("colors.black"),
    fontSize: token("typography.size.lg"),
    letterSpacing: -0.2,
  },
  outlineButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: token("radii.md"),
    padding: token("spacing.lg"),
    alignItems: "center" as const,
  },
  outlineButtonText: {
    fontFamily: token("typography.family.semibold"),
    color: colors.text,
    fontSize: token("typography.size.lg"),
  },
  glassTabBar: {
    backgroundColor: "rgba(0,0,0,0.8)",
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
});
