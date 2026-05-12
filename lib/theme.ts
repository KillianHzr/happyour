import { StyleSheet } from "react-native";
import tokens from "../design-tokens.json";

/**
 * Résout un token depuis le format plat généré par Figma.
 * Gère automatiquement la résolution des alias {Collection/Chemin_de_la_variable}.
 */
const resolveToken = (path: string, mode: "Light" | "Dark" | "Value" = "Light"): any => {
  // On sépare la collection (avant le 1er slash) du nom de la variable (après le 1er slash)
  const firstSlashIndex = path.indexOf("/");
  if (firstSlashIndex === -1) {
    console.warn(`Format de chemin invalide: ${path}`);
    return undefined;
  }

  const collection = path.substring(0, firstSlashIndex); // Ex: "Primitives"
  const variableName = path.substring(firstSlashIndex + 1); // Ex: "color/slate/100"

  // @ts-ignore
  const variable = tokens[collection]?.[variableName];

  if (!variable) {
    console.warn(`Token introuvable: ${path}`);
    return undefined;
  }

  // On récupère la valeur selon le mode demandé
  let value = variable.values[mode];

  // Fallbacks automatiques (si on demande Light sur une Primitive qui n'a que Value)
  if (value === undefined) value = variable.values["Value"];
  if (value === undefined) value = variable.values["Light"];

  // Résolution récursive des alias (ex: "{Primitives/color/black}")
  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
    const referencePath = value.slice(1, -1);
    return resolveToken(referencePath, mode);
  }

  // Sécurité React Native : Convertit les "16px" en nombres pour les variables FLOAT
  if (variable.type === "FLOAT" && typeof value === "string" && value.endsWith("px")) {
    return parseFloat(value);
  }

  return value;
};

// --- Mode Actuel ---
// Pour tester, tu peux changer en "Dark" ici, ou lier ça à un Context React plus tard !
const activeMode = "Light";

// --- Semantic Mappings ---
export const colors = {
  bg: resolveToken("Semantics/color/bg", activeMode),
  card: resolveToken("Semantics/color/card/bg", activeMode),
  cardBorder: resolveToken("Semantics/color/card/border", activeMode),
  accent: resolveToken("Semantics/color/accent/primary", activeMode),
  accentMuted: resolveToken("Semantics/color/accent/muted", activeMode),
  text: resolveToken("Semantics/color/text/primary", activeMode),
  textMuted: resolveToken("Semantics/color/text/muted", activeMode),
  secondary: resolveToken("Semantics/color/text/secondary", activeMode),
  muted: resolveToken("Primitives/color/slate/600", activeMode),
  danger: resolveToken("Semantics/color/status/danger", activeMode),
  gold: resolveToken("Semantics/color/status/gold", activeMode),
  goldDark: resolveToken("Primitives/color/gold/dark", activeMode),
  glass: resolveToken("Primitives/color/glass/base", activeMode),
  glassMuted: resolveToken("Primitives/color/glass/muted", activeMode),
  white: resolveToken("Primitives/color/white", activeMode),
  black: resolveToken("Primitives/color/black", activeMode),
} as const;

export const spacing = {
  none: resolveToken("Primitives/spacing/0", activeMode),
  xs: resolveToken("Semantics/spacing/xs", activeMode),
  sm: resolveToken("Semantics/spacing/sm", activeMode),
  md: resolveToken("Semantics/spacing/md", activeMode),
  lg: resolveToken("Semantics/spacing/lg", activeMode),
  xl: resolveToken("Semantics/spacing/xl", activeMode),
  xxl: resolveToken("Semantics/spacing/xxl", activeMode),
} as const;

export const radii = {
  none: resolveToken("Primitives/radii/none", activeMode),
  xs: resolveToken("Primitives/radii/xs", activeMode),
  sm: resolveToken("Primitives/radii/sm", activeMode),
  md: resolveToken("Primitives/radii/md", activeMode),
  lg: resolveToken("Primitives/radii/lg", activeMode),
  xl: resolveToken("Primitives/radii/xl", activeMode),
  xxl: resolveToken("Primitives/radii/xxl", activeMode),
  full: resolveToken("Primitives/radii/full", activeMode),
  button: resolveToken("Semantics/radii/button", activeMode),
  card: resolveToken("Semantics/radii/card", activeMode),
  input: resolveToken("Semantics/radii/input", activeMode),
} as const;

export const typography = {
  family: {
    regular: "Inter_400Regular",
    semibold: "Inter_600SemiBold",
    bold: "Inter_700Bold",
    extrabold: "Inter_800ExtraBold",
  },
  size: {
    xs: resolveToken("Primitives/typography/scale-01", activeMode) as number,   // 12
    sm: resolveToken("Primitives/typography/scale-02", activeMode) as number,   // 14
    md: resolveToken("Primitives/typography/scale-03", activeMode) as number,   // 16
    lg: 17,
    xl: resolveToken("Primitives/typography/scale-04", activeMode) as number,   // 20
    xxl: resolveToken("Primitives/typography/scale-05", activeMode) as number,  // 24
    xxxl: resolveToken("Primitives/typography/scale-06", activeMode) as number, // 32
  },
} as const;

export const shadows = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.4,
    shadowRadius: 32,
    elevation: 16,
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
    color: colors.text,
  },
  accentButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.button,
    padding: spacing.lg,
    alignItems: "center",
  },
  accentButtonText: {
    color: colors.black,
    letterSpacing: -0.2,
  },
  outlineButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.button,
    padding: spacing.lg,
    alignItems: "center",
  },
  outlineButtonText: {
    color: colors.text,
  },
  glassTabBar: {
    backgroundColor: "rgba(0,0,0,0.8)",
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
});