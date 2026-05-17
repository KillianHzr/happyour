import { StyleSheet } from "react-native";
// @ts-ignore
import tokens from "../design-tokens.json";

/**
 * 1. FONCTION DE BASE : Résout un token (Primitives ou -> Color / -> Size)
 */
const resolveToken = (path: string, mode: "Light" | "Dark" | "Value" = "Light"): any => {
  if (!path) return undefined;

  const firstSlashIndex = path.indexOf("/");
  if (firstSlashIndex === -1) return undefined;

  const collection = path.substring(0, firstSlashIndex);
  const variableName = path.substring(firstSlashIndex + 1);

  // @ts-ignore
  const variable = tokens[collection]?.[variableName];
  if (!variable) return undefined;

  let value = variable.values[mode];
  if (value === undefined) value = variable.values["Value"];
  if (value === undefined) value = variable.values["Mode 1"];
  if (value === undefined) value = variable.values["Light"];

  // Résolution récursive si c'est un alias (ex: "{Primitives/color/black}")
  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
    return resolveToken(value.slice(1, -1), mode);
  }

  if (variable.type === "FLOAT" && typeof value === "string" && value.endsWith("px")) {
    return parseFloat(value);
  }

  return value;
};

/**
 * 2. HELPER POUR LES OMBRES : Lit directement le "Effect Style" de Figma
 */
const resolveShadow = (effectStyleName: string, mode: "Light" | "Dark" = "Light") => {
  // @ts-ignore
  const effect = tokens.Styles?.["Effect styles"]?.[effectStyleName];
  if (!effect) return {};

  // Résolution dynamique de la couleur de l'ombre (qu'elle soit liée à une variable ou en dur)
  let shadowColor = effect.color;
  if (typeof shadowColor === "string" && shadowColor.startsWith("{")) {
    shadowColor = resolveToken(shadowColor.slice(1, -1), mode);
  }

  // Conversion des valeurs Figma en format React Native
  return {
    shadowColor: shadowColor || "#000000",
    shadowOffset: { width: effect.x || 0, height: effect.y || 0 },
    shadowOpacity: effect.opacity ?? 1,
    shadowRadius: effect.blur || 0,
    elevation: effect.blur ? Math.round(effect.blur / 2) : 0, // Approx pour Android
  };
};

/**
 * 3. HELPER POUR LES TEXTES : Lit directement le "Text Style" de Figma
 */
const resolveTextStyle = (textStyleName: string, mode: "Light" | "Dark" = "Light") => {
  // @ts-ignore
  const style = tokens.Styles?.["Text styles"]?.[textStyleName];
  if (!style) return {};

  // Fonction interne pour lire la valeur (alias ou brut)
  const getVal = (raw: any) => {
    if (typeof raw === "string" && raw.startsWith("{")) return resolveToken(raw.slice(1, -1), mode);
    return raw;
  };

  const fontSize = getVal(style.fontSize);
  const lineHeightObj = getVal(style.lineHeight);
  let lineHeight = undefined;

  // React Native a besoin d'un nombre pour le lineHeight, Figma donne un pourcentage
  if (lineHeightObj?.unit === "PERCENT" && fontSize) {
    lineHeight = (lineHeightObj.value / 100) * fontSize;
  } else if (lineHeightObj?.unit === "PIXELS") {
    lineHeight = lineHeightObj.value;
  }

  return {
    fontSize,
    lineHeight,
    fontWeight: getVal(style.fontWeight) ? String(getVal(style.fontWeight)) as any : undefined,
    // Note: React Native gère mal les fontFamily dynamiques sur Android (nécessite souvent de lier le weight au nom de la font).
    // Tu peux l'activer ici si ton setup Expo/React Native le supporte :
    // fontFamily: getVal(style.fontFamily)
  };
};

// --- Mode Actuel ---
const activeMode = "Light";

// --- EXPORT DES VALEURS (100% Dynamiques) ---

export const colors = {
  bg: resolveToken("-> Color/background/default/default", activeMode),
  card: resolveToken("-> Color/background/neutral/secondary", activeMode),
  cardBorder: resolveToken("-> Color/border/default/default", activeMode),
  accent: resolveToken("-> Color/background/brand/default", activeMode),
  accentMuted: resolveToken("-> Color/background/brand/secondary", activeMode),
  text: resolveToken("-> Color/text/default/default", activeMode),
  textMuted: resolveToken("-> Color/text/default/secondary", activeMode),
  secondary: resolveToken("-> Color/text/neutral/secondary", activeMode),
  danger: resolveToken("-> Color/background/danger/default", activeMode),

  glass: resolveToken("-> Color/background/utilities/overlay", activeMode),
  white: resolveToken("Primitives/color/white/100", activeMode),
  black: resolveToken("Primitives/color/black/100", activeMode),
} as const;

export const spacing = {
  xs: resolveToken("-> Size/spacing/xs", activeMode),
  sm: resolveToken("-> Size/spacing/sm", activeMode),
  md: resolveToken("-> Size/spacing/md", activeMode),
  lg: resolveToken("-> Size/spacing/lg", activeMode),
  xl: resolveToken("-> Size/spacing/xl", activeMode),
  xxl: resolveToken("-> Size/spacing/xxl", activeMode),
} as const;

export const radii = {
  xs: resolveToken("Primitives/radii/xs", activeMode),
  md: resolveToken("Primitives/radii/md", activeMode),
  lg: resolveToken("Primitives/radii/xl", activeMode),
  full: resolveToken("Primitives/radii/full", activeMode),
  card: resolveToken("-> Size/radii/card", activeMode),
  button: resolveToken("-> Size/radii/button", activeMode),
} as const;

export const typography = {
  family: {
    regular: "Inter_400Regular",
    semibold: "Inter_600SemiBold",
    bold: "Inter_700Bold",
    extrabold: "Inter_800ExtraBold",
  },
  size: {
    xs: resolveToken("Primitives/typography/scale-01", activeMode) as number,
    sm: resolveToken("Primitives/typography/scale-02", activeMode) as number,
    md: resolveToken("Primitives/typography/scale-03", activeMode) as number,
    lg: 17,
    xl: resolveToken("Primitives/typography/scale-04", activeMode) as number,
    xxl: resolveToken("Primitives/typography/scale-05", activeMode) as number,
  },
} as const;

// 🔮 On lit maintenant DIRECTEMENT les ombres de Figma !
export const shadows = {
  sm: resolveShadow("Drop Shadow/sm", activeMode),
  md: resolveShadow("Drop Shadow/md", activeMode),
  lg: resolveShadow("Drop Shadow/lg", activeMode),
} as const;

// 🔮 Et on peut même lire DIRECTEMENT les styles de texte de Figma !
export const textStyles = {
  bodyBase: resolveTextStyle("Body Base", activeMode),
  bodyStrong: resolveTextStyle("Body Strong", activeMode),
  heading: resolveTextStyle("Heading", activeMode),
  titlePage: resolveTextStyle("Title Page", activeMode),
} as const;

// --- STYLES COMPOSÉS ---
export const theme = StyleSheet.create({
  glassCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    ...shadows.sm, // La magie opère ici !
  },
  accentButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.button,
    padding: spacing.lg,
    alignItems: "center",
    ...shadows.md,
  },
});