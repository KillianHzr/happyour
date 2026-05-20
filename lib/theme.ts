import { StyleSheet } from "react-native";
// @ts-ignore
import tokens from "../design-tokens.json";

/**
 * Résout un token de design par chemin et mode.
 *
 * Règle spéciale : les primitives color/white/N et color/black/N sont interprétées
 * comme des valeurs rgba avec opacité N/1000 (ex: white/500 → rgba(255,255,255,0.5)).
 * Cette interprétation correspond à l'intention sémantique du design system.
 */
const resolveToken = (path: string, mode: "Light" | "Dark" | "Value" = "Light"): any => {
  if (!path) return undefined;

  const firstSlashIndex = path.indexOf("/");
  if (firstSlashIndex === -1) return undefined;

  const collection = path.substring(0, firstSlashIndex);
  const variableName = path.substring(firstSlashIndex + 1);

  if (collection === "Primitives") {
    const white = variableName.match(/^color\/white\/(\d+)$/);
    if (white) return `rgba(255, 255, 255, ${parseInt(white[1]) / 1000})`;
    const black = variableName.match(/^color\/black\/(\d+)$/);
    if (black) return `rgba(12, 12, 13, ${parseInt(black[1]) / 1000})`;
  }

  // @ts-ignore
  const variable = tokens[collection]?.[variableName];
  if (!variable) return undefined;

  let value = variable.values[mode];
  if (value === undefined) value = variable.values["Value"];
  if (value === undefined) value = variable.values["Mode 1"];
  if (value === undefined) value = variable.values["Light"];

  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
    return resolveToken(value.slice(1, -1), mode);
  }

  if (variable.type === "FLOAT" && typeof value === "string" && value.endsWith("px")) {
    return parseFloat(value);
  }

  return value;
};

/**
 * Résout un "Effect Style" de Figma (drop-shadow, inner-shadow) en style React Native.
 * Les couleurs de shadow utilisent le hex brut (pas l'interprétation opacité rgba).
 */
const resolveShadow = (effectStyleName: string, mode: "Light" | "Dark" = "Light") => {
  // @ts-ignore
  const effect = tokens.Styles?.["Effect styles"]?.[effectStyleName];
  if (!effect) return {};

  const resolveField = (raw: any): any => {
    if (typeof raw === "string" && raw.startsWith("{") && raw.endsWith("}"))
      return resolveToken(raw.slice(1, -1), mode);
    return raw;
  };

  // Pour les shadows, on veut un hex pur (pas de rgba avec opacité encodée)
  // si resolveToken retourne un rgba, on extrait la couleur de base
  const rawColor = resolveField(effect.color) || "#000000";
  const shadowColor =
    typeof rawColor === "string" && rawColor.startsWith("rgba(12, 12, 13,")
      ? "#0C0C0D"
      : typeof rawColor === "string" && rawColor.startsWith("rgba(255, 255, 255,")
      ? "#FFFFFF"
      : rawColor;

  const blur = resolveField(effect.blur) || 0;
  return {
    shadowColor,
    shadowOffset: { width: resolveField(effect.x) || 0, height: resolveField(effect.y) || 0 },
    shadowOpacity: effect.opacity ?? 1,
    shadowRadius: blur,
    elevation: blur ? Math.round(blur / 2) : 0,
  };
};

/**
 * Résout un "Text Style" de Figma en style React Native.
 */
const resolveTextStyle = (textStyleName: string, mode: "Light" | "Dark" = "Light") => {
  // @ts-ignore
  const style = tokens.Styles?.["Text styles"]?.[textStyleName];
  if (!style) return {};

  const getVal = (raw: any) => {
    if (typeof raw === "string" && raw.startsWith("{")) return resolveToken(raw.slice(1, -1), mode);
    return raw;
  };

  const fontSize = getVal(style.fontSize);
  const lineHeightObj = style.lineHeight;
  let lineHeight = undefined;

  if (lineHeightObj?.unit === "PERCENT" && fontSize) {
    lineHeight = (lineHeightObj.value / 100) * fontSize;
  } else if (lineHeightObj?.unit === "PIXELS") {
    lineHeight = lineHeightObj.value;
  }

  return {
    fontSize,
    lineHeight,
    fontWeight: getVal(style.fontWeight) ? (String(getVal(style.fontWeight)) as any) : undefined,
  };
};

// ─── Mode actif ──────────────────────────────────────────────────────────────
const activeMode = "Dark";

// ─── Couleurs ────────────────────────────────────────────────────────────────
export const colors = {
  // Fonds
  bg:         resolveToken("-> Color/background/default/default", activeMode),          // #1E1E1E
  card:       resolveToken("-> Color/background/default/secondary", activeMode),        // #2C2C2C
  cardBorder: resolveToken("-> Color/border/default/default", activeMode),              // #444444

  // Texte
  text:      resolveToken("-> Color/text/default/default", activeMode),                 // #FFFFFF (rgba 1.0)
  textMuted: resolveToken("-> Color/text/neutral/tertiary", activeMode),                // #B2B2B2
  secondary: resolveToken("-> Color/text/neutral/secondary", activeMode),               // #CDCDCD
  muted:     resolveToken("-> Color/text/neutral/tertiary", activeMode),                // #B2B2B2

  // Accent blanc (mode dark — couleur d'action principale)
  accent:      resolveToken("-> Color/text/default/default", activeMode),               // rgba(255,255,255,1)
  accentMuted: resolveToken("-> Color/background/default/tertiary", activeMode),        // #444444

  // Brand rose (prêt pour les maquettes, pas encore utilisé partout)
  brand:          resolveToken("-> Color/background/brand/default", activeMode),        // #FF4D91
  brandSecondary: resolveToken("-> Color/background/brand/secondary", activeMode),      // #E50058
  brandText:      resolveToken("-> Color/text/brand/default", activeMode),              // brand/100

  // Statuts
  danger:   resolveToken("-> Color/text/danger/secondary", activeMode),                 // #F4776A
  gold:     resolveToken("Primitives/color/yellow/400", activeMode),                    // #E8B931
  goldDark: resolveToken("Primitives/color/yellow/600", activeMode),                    // #BF6A02

  // Utilitaires
  overlay:   resolveToken("-> Color/background/default/secondary", activeMode),         // #2C2C2C (surface)
  white:     "#FFFFFF" as string,
  black:     "#0C0C0D" as string,

  // Glass (valeurs custom, effets translucides sur fond caméra)
  glass:       "rgba(0, 0, 0, 0.5)" as string,
  glassMuted:  "rgba(255, 255, 255, 0.07)" as string,
  glassBorder: "rgba(255, 255, 255, 0.12)" as string,
} as const;

// ─── Espacements ─────────────────────────────────────────────────────────────
export const spacing = {
  xs:  resolveToken("-> Size/space/100", activeMode) as number,   // 4
  sm:  resolveToken("-> Size/space/200", activeMode) as number,   // 8
  md:  resolveToken("-> Size/space/300", activeMode) as number,   // 12
  lg:  resolveToken("-> Size/space/400", activeMode) as number,   // 16
  xl:  resolveToken("-> Size/space/600", activeMode) as number,   // 24
  xxl: resolveToken("-> Size/space/800", activeMode) as number,   // 32
} as const;

// ─── Rayons de bordure ───────────────────────────────────────────────────────
export const radii = {
  xs:     resolveToken("-> Size/radius/100", activeMode) as number,   // 4
  sm:     resolveToken("-> Size/radius/200", activeMode) as number,   // 8
  md:     resolveToken("-> Size/radius/300", activeMode) as number,   // 12
  lg:     resolveToken("-> Size/radius/400", activeMode) as number,   // 16
  xl:     resolveToken("-> Size/radius/600", activeMode) as number,   // 24
  full:   resolveToken("-> Size/radius/full", activeMode) as number,  // 999
  card:   resolveToken("-> Size/radius/400", activeMode) as number,   // 16
  button: resolveToken("-> Size/radius/200", activeMode) as number,   // 8
} as const;

// ─── Typographie ─────────────────────────────────────────────────────────────
export const typography = {
  family: {
    regular:   "Inter_400Regular",
    medium:    "Inter_500Medium",
    semibold:  "Inter_600SemiBold",
    bold:      "Inter_700Bold",
    extrabold: "Inter_800ExtraBold",
  },
  size: {
    xs:       resolveToken("Primitives/typography/scale-01", activeMode) as number,     // 12
    sm:       resolveToken("-> Typography/body/size-small", activeMode) as number,      // 14
    md:       resolveToken("-> Typography/body/size-medium", activeMode) as number,     // 16
    lg:       17 as number,                                                              // custom
    xl:       resolveToken("-> Typography/body/size-large", activeMode) as number,      // 20
    xxl:      resolveToken("-> Typography/heading/size-base", activeMode) as number,    // 24
    subtitle: resolveToken("-> Typography/subtitle/size-base", activeMode) as number,   // 32
    title:    resolveToken("-> Typography/title-page/size-base", activeMode) as number, // 48
    hero:     resolveToken("-> Typography/title-hero/size", activeMode) as number,      // 72
  },
} as const;

// ─── Ombres ──────────────────────────────────────────────────────────────────
export const shadows = {
  sm: resolveShadow("drop-shadow/100", activeMode),
  md: resolveShadow("drop-shadow/300", activeMode),
  lg: resolveShadow("drop-shadow/600", activeMode),
} as const;

// ─── Styles de texte (Figma Text Styles) ────────────────────────────────────
export const textStyles = {
  bodyBase:   resolveTextStyle("body-base", activeMode),
  bodyStrong: resolveTextStyle("body-strong", activeMode),
  heading:    resolveTextStyle("heading", activeMode),
  titlePage:  resolveTextStyle("title-page", activeMode),
} as const;

// ─── Styles composés ─────────────────────────────────────────────────────────
export const theme = StyleSheet.create({
  glassCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    ...shadows.sm,
  },
  accentButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.button,
    padding: spacing.lg,
    alignItems: "center",
    ...shadows.md,
  },
  accentButtonText: {
    color: colors.bg,
    fontFamily: typography.family.bold,
    fontSize: typography.size.md,
    fontWeight: "700" as const,
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radii.button,
    padding: spacing.lg,
    alignItems: "center" as const,
  },
  outlineButtonText: {
    color: colors.accent,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.md,
    fontWeight: "600" as const,
  },
  glassInput: {
    backgroundColor: colors.glassMuted,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    fontFamily: typography.family.regular,
    fontSize: typography.size.md,
  },
});
