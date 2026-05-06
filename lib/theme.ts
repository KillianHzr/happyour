import { StyleSheet } from "react-native";
import tokens from "../design-tokens.json";

/**
 * Resolves a token value, following references if they exist.
 * Example: "{primitive.color.black}" -> "#000000"
 */
const token = (path: string): any => {
  const parts = path.split(".");
  let current: any = tokens;
  
  for (const part of parts) {
    if (current[part] === undefined) {
      console.warn(`Token not found: ${path}`);
      return undefined;
    }
    current = current[part];
  }

  const value = current.$value;

  // Resolve references if value is in curly braces: "{path.to.token}"
  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
    const referencePath = value.slice(1, -1);
    return token(referencePath);
  }

  return value;
};

// --- Semantic Mappings for backward compatibility and clean API ---

export const colors = {
  bg: token("semantic.color.bg"),
  card: token("semantic.color.card.bg"),
  cardBorder: token("semantic.color.card.border"),
  accent: token("semantic.color.accent.primary"),
  accentMuted: token("semantic.color.accent.muted"),
  text: token("semantic.color.text.primary"),
  textMuted: token("semantic.color.text.muted"),
  secondary: token("semantic.color.text.secondary"),
  muted: token("primitive.color.slate.600"),
  danger: token("semantic.color.status.danger"),
  gold: token("semantic.color.status.gold"),
  goldDark: token("primitive.color.gold.dark"),
  glass: token("primitive.color.glass.base"),
  glassMuted: token("primitive.color.glass.muted"),
  white: token("primitive.color.white"),
  black: token("primitive.color.black"),
} as const;

export const spacing = {
  none: token("primitive.spacing.0"),
  xs: token("semantic.spacing.xs"),
  sm: token("semantic.spacing.sm"),
  md: token("semantic.spacing.md"),
  lg: token("semantic.spacing.lg"),
  xl: token("semantic.spacing.xl"),
  xxl: token("semantic.spacing.xxl"),
} as const;

export const radii = {
  none: token("primitive.radii.none"),
  xs: token("primitive.radii.xs"),
  sm: token("primitive.radii.sm"),
  md: token("primitive.radii.md"),
  lg: token("primitive.radii.lg"),
  xl: token("primitive.radii.xl"),
  xxl: token("primitive.radii.xxl"),
  full: token("primitive.radii.full"),
  // Semantic aliases
  button: token("semantic.radii.button"),
  card: token("semantic.radii.card"),
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
    borderRadius: radii.card,
  },
  glassInput: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.button,
    padding: spacing.lg,
    fontFamily: typography.family.regular,
    fontSize: typography.size.lg,
    color: colors.text,
  },
  accentButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.button,
    padding: spacing.lg,
    alignItems: "center" as const,
  },
  accentButtonText: {
    fontFamily: typography.family.semibold,
    color: colors.black,
    fontSize: typography.size.lg,
    letterSpacing: -0.2,
  },
  outlineButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.button,
    padding: spacing.lg,
    alignItems: "center" as const,
  },
  outlineButtonText: {
    fontFamily: typography.family.semibold,
    color: colors.text,
    fontSize: typography.size.lg,
  },
  glassTabBar: {
    backgroundColor: "rgba(0,0,0,0.8)",
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
});
