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

// ─── Palettes primitives ─────────────────────────────────────────────────────
export const palette = {
  slate: {
    100:  resolveToken("Primitives/color/slate/100",  "Value") as string,   // #F3F3F3
    200:  resolveToken("Primitives/color/slate/200",  "Value") as string,   // #E3E3E3
    300:  resolveToken("Primitives/color/slate/300",  "Value") as string,   // #CDCDCD
    400:  resolveToken("Primitives/color/slate/400",  "Value") as string,   // #B2B2B2
    500:  resolveToken("Primitives/color/slate/500",  "Value") as string,   // #949494
    600:  resolveToken("Primitives/color/slate/600",  "Value") as string,   // #767676
    700:  resolveToken("Primitives/color/slate/700",  "Value") as string,   // #5A5A5A
    800:  resolveToken("Primitives/color/slate/800",  "Value") as string,   // #434343
    900:  resolveToken("Primitives/color/slate/900",  "Value") as string,   // #303030
    1000: resolveToken("Primitives/color/slate/1000", "Value") as string,   // #242424
  },
  brand: {
    100:  resolveToken("Primitives/color/brand/100",  "Value") as string,   // #FFE5EF
    200:  resolveToken("Primitives/color/brand/200",  "Value") as string,   // #FFB2D0
    300:  resolveToken("Primitives/color/brand/300",  "Value") as string,   // #FF80B1
    400:  resolveToken("Primitives/color/brand/400",  "Value") as string,   // #FF4D91
    500:  resolveToken("Primitives/color/brand/500",  "Value") as string,   // #FF1A72
    600:  resolveToken("Primitives/color/brand/600",  "Value") as string,   // #E50058
    700:  resolveToken("Primitives/color/brand/700",  "Value") as string,   // #B20045
    800:  resolveToken("Primitives/color/brand/800",  "Value") as string,   // #800031
    900:  resolveToken("Primitives/color/brand/900",  "Value") as string,   // #4D001D
    1000: resolveToken("Primitives/color/brand/1000", "Value") as string,   // #1A000A
  },
  red: {
    100:  resolveToken("Primitives/color/red/100",  "Value") as string,     // #FEE9E7
    200:  resolveToken("Primitives/color/red/200",  "Value") as string,     // #FDD3D0
    300:  resolveToken("Primitives/color/red/300",  "Value") as string,     // #FCB3AD
    400:  resolveToken("Primitives/color/red/400",  "Value") as string,     // #F4776A
    500:  resolveToken("Primitives/color/red/500",  "Value") as string,     // #EC221F
    600:  resolveToken("Primitives/color/red/600",  "Value") as string,     // #C00F0C
    700:  resolveToken("Primitives/color/red/700",  "Value") as string,     // #900B09
    800:  resolveToken("Primitives/color/red/800",  "Value") as string,     // #690807
    900:  resolveToken("Primitives/color/red/900",  "Value") as string,     // #4D0B0A
    1000: resolveToken("Primitives/color/red/1000", "Value") as string,     // #300603
  },
  yellow: {
    100:  resolveToken("Primitives/color/yellow/100",  "Value") as string,  // #FFFBEB
    200:  resolveToken("Primitives/color/yellow/200",  "Value") as string,  // #FFF1C2
    300:  resolveToken("Primitives/color/yellow/300",  "Value") as string,  // #FFE8A3
    400:  resolveToken("Primitives/color/yellow/400",  "Value") as string,  // #E8B931
    500:  resolveToken("Primitives/color/yellow/500",  "Value") as string,  // #E5A000
    600:  resolveToken("Primitives/color/yellow/600",  "Value") as string,  // #BF6A02
    700:  resolveToken("Primitives/color/yellow/700",  "Value") as string,  // #975102
    800:  resolveToken("Primitives/color/yellow/800",  "Value") as string,  // #682D03
    900:  resolveToken("Primitives/color/yellow/900",  "Value") as string,  // #522504
    1000: resolveToken("Primitives/color/yellow/1000", "Value") as string,  // #401B01
  },
  green: {
    100:  resolveToken("Primitives/color/green/100",  "Value") as string,   // #EBFFEE
    200:  resolveToken("Primitives/color/green/200",  "Value") as string,   // #CFF7D3
    300:  resolveToken("Primitives/color/green/300",  "Value") as string,   // #AFF4C6
    400:  resolveToken("Primitives/color/green/400",  "Value") as string,   // #85E0A3
    500:  resolveToken("Primitives/color/green/500",  "Value") as string,   // #14AE5C
    600:  resolveToken("Primitives/color/green/600",  "Value") as string,   // #009951
    700:  resolveToken("Primitives/color/green/700",  "Value") as string,   // #008043
    800:  resolveToken("Primitives/color/green/800",  "Value") as string,   // #02542D
    900:  resolveToken("Primitives/color/green/900",  "Value") as string,   // #024023
    1000: resolveToken("Primitives/color/green/1000", "Value") as string,   // #062D1B
  },
  pink: {
    100:  resolveToken("Primitives/color/pink/100",  "Value") as string,    // #FCF1FD
    200:  resolveToken("Primitives/color/pink/200",  "Value") as string,    // #FAE1FA
    300:  resolveToken("Primitives/color/pink/300",  "Value") as string,    // #F5C0EF
    400:  resolveToken("Primitives/color/pink/400",  "Value") as string,    // #F19EDC
    500:  resolveToken("Primitives/color/pink/500",  "Value") as string,    // #EA3FB8
    600:  resolveToken("Primitives/color/pink/600",  "Value") as string,    // #D732A8
    700:  resolveToken("Primitives/color/pink/700",  "Value") as string,    // #BA2A92
    800:  resolveToken("Primitives/color/pink/800",  "Value") as string,    // #8A226F
    900:  resolveToken("Primitives/color/pink/900",  "Value") as string,    // #57184A
    1000: resolveToken("Primitives/color/pink/1000", "Value") as string,    // #3F1536
  },
  gray: {
    100:  resolveToken("Primitives/color/gray/100",  "Value") as string,    // #F5F5F5
    200:  resolveToken("Primitives/color/gray/200",  "Value") as string,    // #E6E6E6
    300:  resolveToken("Primitives/color/gray/300",  "Value") as string,    // #D9D9D9
    400:  resolveToken("Primitives/color/gray/400",  "Value") as string,    // #B3B3B3
    500:  resolveToken("Primitives/color/gray/500",  "Value") as string,    // #757575
    600:  resolveToken("Primitives/color/gray/600",  "Value") as string,    // #444444
    700:  resolveToken("Primitives/color/gray/700",  "Value") as string,    // #383838
    800:  resolveToken("Primitives/color/gray/800",  "Value") as string,    // #2C2C2C
    900:  resolveToken("Primitives/color/gray/900",  "Value") as string,    // #1E1E1E
    1000: resolveToken("Primitives/color/gray/1000", "Value") as string,    // #111111
  },
  blue: {
    100:  resolveToken("Primitives/color/blue/100",  "Value") as string,    // #F1F6FD
    200:  resolveToken("Primitives/color/blue/200",  "Value") as string,    // #E1EBFA
    300:  resolveToken("Primitives/color/blue/300",  "Value") as string,    // #C0D4F5
    400:  resolveToken("Primitives/color/blue/400",  "Value") as string,    // #9EBEF1
    500:  resolveToken("Primitives/color/blue/500",  "Value") as string,    // #3F81EA
    600:  resolveToken("Primitives/color/blue/600",  "Value") as string,    // #3271D7
    700:  resolveToken("Primitives/color/blue/700",  "Value") as string,    // #2A61BA
    800:  resolveToken("Primitives/color/blue/800",  "Value") as string,    // #224A8A
    900:  resolveToken("Primitives/color/blue/900",  "Value") as string,    // #183057
    1000: resolveToken("Primitives/color/blue/1000", "Value") as string,    // #15253F
  },
  // white/black : rendus comme rgba(opacité) — ex: white[500] = rgba(255,255,255,0.5)
  white: {
    100:  resolveToken("Primitives/color/white/100",  activeMode) as string,
    200:  resolveToken("Primitives/color/white/200",  activeMode) as string,
    300:  resolveToken("Primitives/color/white/300",  activeMode) as string,
    400:  resolveToken("Primitives/color/white/400",  activeMode) as string,
    500:  resolveToken("Primitives/color/white/500",  activeMode) as string,
    600:  resolveToken("Primitives/color/white/600",  activeMode) as string,
    700:  resolveToken("Primitives/color/white/700",  activeMode) as string,
    800:  resolveToken("Primitives/color/white/800",  activeMode) as string,
    900:  resolveToken("Primitives/color/white/900",  activeMode) as string,
    1000: resolveToken("Primitives/color/white/1000", activeMode) as string,
  },
  black: {
    100:  resolveToken("Primitives/color/black/100",  activeMode) as string,
    200:  resolveToken("Primitives/color/black/200",  activeMode) as string,
    300:  resolveToken("Primitives/color/black/300",  activeMode) as string,
    400:  resolveToken("Primitives/color/black/400",  activeMode) as string,
    500:  resolveToken("Primitives/color/black/500",  activeMode) as string,
    600:  resolveToken("Primitives/color/black/600",  activeMode) as string,
    700:  resolveToken("Primitives/color/black/700",  activeMode) as string,
    800:  resolveToken("Primitives/color/black/800",  activeMode) as string,
    900:  resolveToken("Primitives/color/black/900",  activeMode) as string,
    1000: resolveToken("Primitives/color/black/1000", activeMode) as string,
  },
} as const;

// ─── Couleurs sémantiques ────────────────────────────────────────────────────
export const colors = {

  // ── Background / Fond par défaut ─────────────────────────────────────────
  bg:                    resolveToken("-> Color/background/default/default",          activeMode), // #1E1E1E
  bgHover:               resolveToken("-> Color/background/default/default-hover",    activeMode), // #383838
  card:                  resolveToken("-> Color/background/default/secondary",        activeMode), // #2C2C2C
  cardHover:             resolveToken("-> Color/background/default/secondary-hover",  activeMode), // #1E1E1E
  accentMuted:           resolveToken("-> Color/background/default/tertiary",         activeMode), // #444444
  bgTertiaryHover:       resolveToken("-> Color/background/default/tertiary-hover",   activeMode), // #383838
  opacityLight:          resolveToken("-> Color/background/default/opacity-light",    activeMode), // rgba(12,12,13,0.4)
  opacityDark:           resolveToken("-> Color/background/default/opacity-dark",     activeMode), // rgba(255,255,255,0.3)

  // ── Background / Fond neutre ──────────────────────────────────────────────
  bgNeutral:                resolveToken("-> Color/background/neutral/default",             activeMode),
  bgNeutralHover:           resolveToken("-> Color/background/neutral/default-hover",       activeMode),
  bgNeutralSecondary:       resolveToken("-> Color/background/neutral/secondary",           activeMode),
  bgNeutralSecondaryHover:  resolveToken("-> Color/background/neutral/secondary-hover",     activeMode),
  bgNeutralTertiary:        resolveToken("-> Color/background/neutral/tertiary",            activeMode),
  bgNeutralTertiaryHover:   resolveToken("-> Color/background/neutral/tertiary-hover",      activeMode),

  // ── Background / Fond brand ───────────────────────────────────────────────
  brand:                 resolveToken("-> Color/background/brand/default",            activeMode), // #FF4D91
  brandHover:            resolveToken("-> Color/background/brand/default-hover",      activeMode), // #FF80B1
  brandSecondary:        resolveToken("-> Color/background/brand/secondary",          activeMode), // #E50058
  brandSecondaryHover:   resolveToken("-> Color/background/brand/secondary-hover",    activeMode),
  brandTertiary:         resolveToken("-> Color/background/brand/tertiary",           activeMode),
  brandTertiaryHover:    resolveToken("-> Color/background/brand/tertiary-hover",     activeMode),

  // ── Background / Fond positif (vert) ─────────────────────────────────────
  bgPositive:                resolveToken("-> Color/background/positive/default",           activeMode),
  bgPositiveHover:           resolveToken("-> Color/background/positive/default-hover",     activeMode),
  bgPositiveSecondary:       resolveToken("-> Color/background/positive/secondary",         activeMode),
  bgPositiveSecondaryHover:  resolveToken("-> Color/background/positive/secondary-hover",   activeMode),
  bgPositiveTertiary:        resolveToken("-> Color/background/positive/tertiary",          activeMode),
  bgPositiveTertiaryHover:   resolveToken("-> Color/background/positive/tertiary-hover",    activeMode),

  // ── Background / Fond warning (jaune) ────────────────────────────────────
  bgWarning:                resolveToken("-> Color/background/warning/default",             activeMode),
  bgWarningHover:           resolveToken("-> Color/background/warning/default-hover",       activeMode),
  bgWarningSecondary:       resolveToken("-> Color/background/warning/secondary",           activeMode),
  bgWarningSecondaryHover:  resolveToken("-> Color/background/warning/secondary-hover",     activeMode),
  bgWarningTertiary:        resolveToken("-> Color/background/warning/tertiary",            activeMode),
  bgWarningTertiaryHover:   resolveToken("-> Color/background/warning/tertiary-hover",      activeMode),

  // ── Background / Fond danger (rouge) ─────────────────────────────────────
  bgDanger:                resolveToken("-> Color/background/danger/default",               activeMode),
  bgDangerHover:           resolveToken("-> Color/background/danger/default-hover",         activeMode),
  bgDangerSecondary:       resolveToken("-> Color/background/danger/secondary",             activeMode),
  bgDangerSecondaryHover:  resolveToken("-> Color/background/danger/secondary-hover",       activeMode),
  bgDangerTertiary:        resolveToken("-> Color/background/danger/tertiary",              activeMode),
  bgDangerTertiaryHover:   resolveToken("-> Color/background/danger/tertiary-hover",        activeMode),

  // ── Background / Désactivé & utilitaires ─────────────────────────────────
  bgDisabled:     resolveToken("-> Color/background/disabled/default",                activeMode),
  scrim:          resolveToken("-> Color/background/utilities/scrim",                 activeMode), // #000000
  blanket:        resolveToken("-> Color/background/utilities/blanket",               activeMode), // #000000
  bgOverlay:      resolveToken("-> Color/background/utilities/overlay",               activeMode), // #000000
  bgMeasurement:  resolveToken("-> Color/background/utilities/measurement",           activeMode),

  // ── Texte par défaut ──────────────────────────────────────────────────────
  text:           resolveToken("-> Color/text/default/default",    activeMode),  // #FFFFFF
  textSecondary:  resolveToken("-> Color/text/default/secondary",  activeMode),  // rgba(255,255,255,0.5)
  textTertiary:   resolveToken("-> Color/text/default/tertiary",   activeMode),  // rgba(255,255,255,0.4)

  // ── Texte neutre ──────────────────────────────────────────────────────────
  textNeutral:           resolveToken("-> Color/text/neutral/default",             activeMode),
  secondary:             resolveToken("-> Color/text/neutral/secondary",           activeMode),  // #CDCDCD
  textNeutralSecondary:  resolveToken("-> Color/text/neutral/secondary",           activeMode),  // alias
  muted:                 resolveToken("-> Color/text/neutral/tertiary",            activeMode),  // #B2B2B2
  textMuted:             resolveToken("-> Color/text/neutral/tertiary",            activeMode),  // alias
  textNeutralTertiary:   resolveToken("-> Color/text/neutral/tertiary",            activeMode),  // alias
  textNeutralOnBrand:    resolveToken("-> Color/text/neutral/on-neutral-brand",    activeMode),
  textNeutralOnSecondary: resolveToken("-> Color/text/neutral/on-neutral-secondary", activeMode),
  textNeutralOnTertiary:  resolveToken("-> Color/text/neutral/on-neutral-tertiary",  activeMode),

  // ── Texte brand ───────────────────────────────────────────────────────────
  brandText:               resolveToken("-> Color/text/brand/default",          activeMode),
  textBrandSecondary:      resolveToken("-> Color/text/brand/secondary",        activeMode),
  textBrandTertiary:       resolveToken("-> Color/text/brand/tertiary",         activeMode),
  textBrandOnBrand:        resolveToken("-> Color/text/brand/on-brand-default", activeMode),
  textBrandOnBrandSecondary: resolveToken("-> Color/text/brand/on-brand-secondary", activeMode),
  textBrandOnBrandTertiary:  resolveToken("-> Color/text/brand/on-brand-tertiary",  activeMode),

  // ── Texte positif ─────────────────────────────────────────────────────────
  textPositive:                    resolveToken("-> Color/text/positive/default",               activeMode),
  textPositiveSecondary:           resolveToken("-> Color/text/positive/secondary",             activeMode),
  textPositiveTertiary:            resolveToken("-> Color/text/positive/tertiary",              activeMode),
  textPositiveOnPositive:          resolveToken("-> Color/text/positive/on-positive-default",   activeMode),
  textPositiveOnPositiveSecondary: resolveToken("-> Color/text/positive/on-positive-secondary", activeMode),
  textPositiveOnPositiveTertiary:  resolveToken("-> Color/text/positive/on-positive-tertiary",  activeMode),

  // ── Texte warning ─────────────────────────────────────────────────────────
  textWarning:                   resolveToken("-> Color/text/warning/default",              activeMode),
  textWarningSecondary:          resolveToken("-> Color/text/warning/secondary",            activeMode),
  textWarningTertiary:           resolveToken("-> Color/text/warning/tertiary",             activeMode),
  textWarningOnWarning:          resolveToken("-> Color/text/warning/on-warning-default",   activeMode),
  textWarningOnWarningSecondary: resolveToken("-> Color/text/warning/on-warning-secondary", activeMode),
  textWarningOnWarningTertiary:  resolveToken("-> Color/text/warning/on-warning-tertiary",  activeMode),

  // ── Texte danger ──────────────────────────────────────────────────────────
  textDanger:                  resolveToken("-> Color/text/danger/default",             activeMode),
  danger:                      resolveToken("-> Color/text/danger/secondary",           activeMode),  // #F4776A
  textDangerTertiary:          resolveToken("-> Color/text/danger/tertiary",            activeMode),
  textDangerOnDanger:          resolveToken("-> Color/text/danger/on-danger-default",   activeMode),
  textDangerOnDangerSecondary: resolveToken("-> Color/text/danger/on-danger-secondary", activeMode),
  textDangerOnDangerTertiary:  resolveToken("-> Color/text/danger/on-danger-tertiary",  activeMode),

  // ── Texte désactivé & utilitaires ────────────────────────────────────────
  textDisabled:      resolveToken("-> Color/text/disabled/default",              activeMode),
  textOnDisabled:    resolveToken("-> Color/text/disabled/on-disabled",          activeMode),
  textOnOverlay:     resolveToken("-> Color/text/utilities/text-on-overlay",     activeMode),
  textOnMeasurement: resolveToken("-> Color/text/utilities/text-on-measurement", activeMode),

  // ── Accent (compatibilité) ────────────────────────────────────────────────
  accent: resolveToken("-> Color/text/default/default", activeMode),  // rgba(255,255,255,1)

  // ── Bordures par défaut ───────────────────────────────────────────────────
  cardBorder:      resolveToken("-> Color/border/default/default",   activeMode),  // #444444
  borderSecondary: resolveToken("-> Color/border/default/secondary", activeMode),
  borderTertiary:  resolveToken("-> Color/border/default/tertiary",  activeMode),

  // ── Bordures neutres ──────────────────────────────────────────────────────
  borderNeutral:          resolveToken("-> Color/border/neutral/sefault",   activeMode),
  borderNeutralSecondary: resolveToken("-> Color/border/neutral/secondary", activeMode),
  borderNeutralTertiary:  resolveToken("-> Color/border/neutral/tertiary",  activeMode),

  // ── Bordures brand ────────────────────────────────────────────────────────
  borderBrand:          resolveToken("-> Color/border/brand/default",   activeMode),
  borderBrandSecondary: resolveToken("-> Color/border/brand/secondary", activeMode),
  borderBrandTertiary:  resolveToken("-> Color/border/brand/tertiary",  activeMode),

  // ── Bordures positives ────────────────────────────────────────────────────
  borderPositive:          resolveToken("-> Color/border/positive/default",   activeMode),
  borderPositiveSecondary: resolveToken("-> Color/border/positive/secondary", activeMode),
  borderPositiveTertiary:  resolveToken("-> Color/border/positive/tertiary",  activeMode),

  // ── Bordures warning ──────────────────────────────────────────────────────
  borderWarning:          resolveToken("-> Color/border/warning/default",   activeMode),
  borderWarningSecondary: resolveToken("-> Color/border/warning/secondary", activeMode),
  borderWarningTertiary:  resolveToken("-> Color/border/warning/tertiary",  activeMode),

  // ── Bordures danger ───────────────────────────────────────────────────────
  borderDanger:          resolveToken("-> Color/border/danger/default",   activeMode),
  borderDangerSecondary: resolveToken("-> Color/border/danger/secondary", activeMode),
  borderDangerTertiary:  resolveToken("-> Color/border/danger/tertiary",  activeMode),

  // ── Bordures désactivées & utilitaires ───────────────────────────────────
  borderDisabled:    resolveToken("-> Color/border/disables/default",         activeMode),
  borderMeasurement: resolveToken("-> Color/border/utilities/measurement",    activeMode),
  borderSwatch:      resolveToken("-> Color/border/utilities/swatch",         activeMode),

  // ── Icônes par défaut ─────────────────────────────────────────────────────
  icon:          resolveToken("-> Color/icon/default/default",   activeMode),
  iconSecondary: resolveToken("-> Color/icon/default/secondary", activeMode),
  iconTertiary:  resolveToken("-> Color/icon/default/tertiary",  activeMode),

  // ── Icônes neutres ────────────────────────────────────────────────────────
  iconNeutral:              resolveToken("-> Color/icon/neutral/default",             activeMode),
  iconNeutralSecondary:     resolveToken("-> Color/icon/neutral/secondary",           activeMode),
  iconNeutralTertiary:      resolveToken("-> Color/icon/neutral/tertiary",            activeMode),
  iconNeutralOnNeutral:     resolveToken("-> Color/icon/neutral/on-neutral-default",  activeMode),
  iconNeutralOnNeutralSecondary: resolveToken("-> Color/icon/neutral/on-neutral-secondary", activeMode),
  iconNeutralOnNeutralTertiary:  resolveToken("-> Color/icon/neutral/on-neutral-tertiary",  activeMode),

  // ── Icônes brand ──────────────────────────────────────────────────────────
  iconBrand:                resolveToken("-> Color/icon/brand/default",          activeMode),
  iconBrandSecondary:       resolveToken("-> Color/icon/brand/secondary",        activeMode),
  iconBrandTertiary:        resolveToken("-> Color/icon/brand/tertiary",         activeMode),
  iconBrandOnBrand:         resolveToken("-> Color/icon/brand/on-brand-default", activeMode),
  iconBrandOnBrandSecondary: resolveToken("-> Color/icon/brand/on-brand-secondary", activeMode),
  iconBrandOnBrandTertiary:  resolveToken("-> Color/icon/brand/on-brand-tertiary",  activeMode),

  // ── Icônes positives ──────────────────────────────────────────────────────
  iconPositive:                    resolveToken("-> Color/icon/positive/default",               activeMode),
  iconPositiveSecondary:           resolveToken("-> Color/icon/positive/secondary",             activeMode),
  iconPositiveTertiary:            resolveToken("-> Color/icon/positive/tertiary",              activeMode),
  iconPositiveOnPositive:          resolveToken("-> Color/icon/positive/on-positive-default",   activeMode),
  iconPositiveOnPositiveSecondary: resolveToken("-> Color/icon/positive/on-positive-secondary", activeMode),
  iconPositiveOnPositiveTertiary:  resolveToken("-> Color/icon/positive/on-positive-tertiary",  activeMode),

  // ── Icônes warning ────────────────────────────────────────────────────────
  iconWarning:                   resolveToken("-> Color/icon/warning/default",              activeMode),
  iconWarningSecondary:          resolveToken("-> Color/icon/warning/secondary",            activeMode),
  iconWarningTertiary:           resolveToken("-> Color/icon/warning/tertiary",             activeMode),
  iconWarningOnWarning:          resolveToken("-> Color/icon/warning/on-warning-default",   activeMode),
  iconWarningOnWarningSecondary: resolveToken("-> Color/icon/warning/on-warning-secondary", activeMode),
  iconWarningOnWarningTertiary:  resolveToken("-> Color/icon/warning/on-warning-tertiary",  activeMode),

  // ── Icônes danger ─────────────────────────────────────────────────────────
  iconDanger:                  resolveToken("-> Color/icon/danger/default",             activeMode),
  iconDangerSecondary:         resolveToken("-> Color/icon/danger/secondary",           activeMode),
  iconDangerTertiary:          resolveToken("-> Color/icon/danger/tertiary",            activeMode),
  iconDangerOnDanger:          resolveToken("-> Color/icon/danger/on-danger-default",   activeMode),
  iconDangerOnDangerSecondary: resolveToken("-> Color/icon/danger/on-danger-secondary", activeMode),
  iconDangerOnDangerTertiary:  resolveToken("-> Color/icon/danger/on-danger-tertiary",  activeMode),

  // ── Icônes désactivées & utilitaires ─────────────────────────────────────
  iconDisabled:      resolveToken("-> Color/icon/disabled/default",              activeMode),
  iconOnDisabled:    resolveToken("-> Color/icon/disabled/on-disabled",          activeMode),
  iconMeasurement:   resolveToken("-> Color/icon/utilities/icon",                activeMode),
  iconOnMeasurement: resolveToken("-> Color/icon/utilities/icon-on-measurement", activeMode),

  // ── Statuts hors-tokens (alias compatibilité) ─────────────────────────────
  gold:     resolveToken("Primitives/color/yellow/400", activeMode),  // #E8B931
  goldDark: resolveToken("Primitives/color/yellow/600", activeMode),  // #BF6A02

  // ── Utilitaires fixes ────────────────────────────────────────────────────
  overlay:    resolveToken("-> Color/background/default/secondary", activeMode), // #2C2C2C
  white:      "#FFFFFF" as string,
  black:      "#0C0C0D" as string,
  glass:      "rgba(0, 0, 0, 0.5)" as string,
  glassMuted: "rgba(255, 255, 255, 0.07)" as string,
  glassBorder:"rgba(255, 255, 255, 0.12)" as string,

} as const;

// ─── Espacements ─────────────────────────────────────────────────────────────
export const spacing = {
  xxs:   resolveToken("-> Size/space/050",  activeMode) as number,   // 2
  xs:    resolveToken("-> Size/space/100",  activeMode) as number,   // 4
  xs2:   resolveToken("-> Size/space/150",  activeMode) as number,   // 6
  sm:    resolveToken("-> Size/space/200",  activeMode) as number,   // 8
  md:    resolveToken("-> Size/space/300",  activeMode) as number,   // 12
  lg:    resolveToken("-> Size/space/400",  activeMode) as number,   // 16
  xl:    resolveToken("-> Size/space/600",  activeMode) as number,   // 24
  xxl:   resolveToken("-> Size/space/800",  activeMode) as number,   // 32
  xl3:   resolveToken("-> Size/space/1200", activeMode) as number,   // 48
  xl4:   resolveToken("-> Size/space/1600", activeMode) as number,   // 64
  xl6:   resolveToken("-> Size/space/2400", activeMode) as number,   // 96
  xl10:  resolveToken("-> Size/space/4000", activeMode) as number,   // 160
  // Négatifs
  negXxs: resolveToken("-> Size/space/neg-25",  activeMode) as number,  // -1
  negXs:  resolveToken("-> Size/space/neg-100", activeMode) as number,  // -4
  negSm:  resolveToken("-> Size/space/neg-200", activeMode) as number,  // -8
  negMd:  resolveToken("-> Size/space/neg-300", activeMode) as number,  // -12
  negLg:  resolveToken("-> Size/space/neg-400", activeMode) as number,  // -16
  negXl:  resolveToken("-> Size/space/neg-600", activeMode) as number,  // -24
} as const;

// ─── Rayons de bordure ───────────────────────────────────────────────────────
export const radii = {
  none:   resolveToken("-> Size/radius/empty", activeMode) as number,  // 0
  xs:     resolveToken("-> Size/radius/100",   activeMode) as number,  // 4
  sm:     resolveToken("-> Size/radius/200",   activeMode) as number,  // 8
  md:     resolveToken("-> Size/radius/300",   activeMode) as number,  // 12
  lg:     resolveToken("-> Size/radius/400",   activeMode) as number,  // 16
  xl:     resolveToken("-> Size/radius/600",   activeMode) as number,  // 24
  xxl:    resolveToken("-> Size/radius/800",   activeMode) as number,  // 32
  xl3:    resolveToken("-> Size/radius/1000",  activeMode) as number,  // 40
  full:   resolveToken("-> Size/radius/full",  activeMode) as number,  // 999
  card:   resolveToken("-> Size/radius/400",   activeMode) as number,  // 16 (alias)
  button: resolveToken("-> Size/radius/200",   activeMode) as number,  // 8  (alias)
} as const;

// ─── Profondeur / Z-index ────────────────────────────────────────────────────
export const depth = {
  none:   resolveToken("-> Size/depth/empty",    activeMode) as number,   // 0
  xxs:    resolveToken("-> Size/depth/025",       activeMode) as number,   // 1
  xs:     resolveToken("-> Size/depth/100",       activeMode) as number,   // 4
  sm:     resolveToken("-> Size/depth/200",       activeMode) as number,   // 8
  md:     resolveToken("-> Size/depth/400",       activeMode) as number,   // 16
  lg:     resolveToken("-> Size/depth/800",       activeMode) as number,   // 32
  xl:     resolveToken("-> Size/depth/1200",      activeMode) as number,   // 48
  negXxs: resolveToken("-> Size/depth/neg-025",   activeMode) as number,   // -1
  negXs:  resolveToken("-> Size/depth/neg-100",   activeMode) as number,   // -4
  negSm:  resolveToken("-> Size/depth/neg-200",   activeMode) as number,   // -8
  negMd:  resolveToken("-> Size/depth/neg-400",   activeMode) as number,   // -16
  negLg:  resolveToken("-> Size/depth/neg-800",   activeMode) as number,   // -32
  negXl:  resolveToken("-> Size/depth/neg-1200",  activeMode) as number,   // -48
} as const;

// ─── Flou ────────────────────────────────────────────────────────────────────
export const blur = {
  sm: resolveToken("-> Size/blur/100",  activeMode) as number,  // 4
  md: resolveToken("-> Size/blur/400",  activeMode) as number,  // 16
  lg: resolveToken("-> Size/blur/1200", activeMode) as number,  // 48
} as const;

// ─── Épaisseurs de trait ─────────────────────────────────────────────────────
export const stroke = {
  sm: resolveToken("-> Size/stroke/025", activeMode) as number,  // 1
  md: resolveToken("-> Size/stroke/050", activeMode) as number,  // 2
} as const;

// ─── Tailles d'icônes ────────────────────────────────────────────────────────
export const iconSize = {
  sm: resolveToken("-> Size/icon/small",  activeMode) as number,  // 24
  md: resolveToken("-> Size/icon/medium", activeMode) as number,  // 32
  lg: resolveToken("-> Size/icon/large",  activeMode) as number,  // 40
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
    xxs:          resolveToken("-> Typography/body/size-extra-small",  activeMode) as number,  // 10
    xs:           resolveToken("Primitives/typography/scale-01",       activeMode) as number,  // 12
    sm:           resolveToken("-> Typography/body/size-small",        activeMode) as number,  // 14
    md:           resolveToken("-> Typography/body/size-medium",       activeMode) as number,  // 16
    lg:           17 as number,                                                                // custom (entre md et xl)
    xl:           resolveToken("-> Typography/body/size-large",        activeMode) as number,  // 20
    xxl:          resolveToken("-> Typography/heading/size-base",      activeMode) as number,  // 24
    headingSm:    resolveToken("-> Typography/heading/size-small",     activeMode) as number,  // 20
    headingLg:    resolveToken("-> Typography/heading/size-large",     activeMode) as number,  // 32
    subheadingSm: resolveToken("-> Typography/subheading/size-small",  activeMode) as number,  // 16
    subheadingMd: resolveToken("-> Typography/subheading/size-medium", activeMode) as number,  // 20
    subheadingLg: resolveToken("-> Typography/subheading/size-large",  activeMode) as number,  // 24
    subtitleSm:   resolveToken("-> Typography/subtitle/size-small",    activeMode) as number,  // 24
    subtitle:     resolveToken("-> Typography/subtitle/size-base",     activeMode) as number,  // 32
    subtitleLg:   resolveToken("-> Typography/subtitle/size-large",    activeMode) as number,  // 40
    titleSm:      resolveToken("-> Typography/title-page/size-small",  activeMode) as number,  // 40
    title:        resolveToken("-> Typography/title-page/size-base",   activeMode) as number,  // 48
    titleLg:      resolveToken("-> Typography/title-page/size-large",  activeMode) as number,  // 64
    hero:         resolveToken("-> Typography/title-hero/size",        activeMode) as number,  // 72
  },
  weight: {
    thin:       resolveToken("Primitives/typography/weight-thin",        activeMode) as number,  // 100
    extraLight: resolveToken("Primitives/typography/weight-extra-light", activeMode) as number,  // 200
    light:      resolveToken("Primitives/typography/weight-light",       activeMode) as number,  // 300
    regular:    resolveToken("Primitives/typography/weight-regular",     activeMode) as number,  // 400
    medium:     resolveToken("Primitives/typography/weight-medium",      activeMode) as number,  // 500
    semibold:   resolveToken("Primitives/typography/weight-semibold",    activeMode) as number,  // 600
    bold:       resolveToken("Primitives/typography/weight-bold",        activeMode) as number,  // 700
    extraBold:  resolveToken("Primitives/typography/weight-extra-bold",  activeMode) as number,  // 800
    black:      resolveToken("Primitives/typography/weight-black",       activeMode) as number,  // 900
  },
} as const;

// ─── Ombres ──────────────────────────────────────────────────────────────────
export const shadows = {
  sm:        resolveShadow("drop-shadow/100", activeMode),  // alias
  md:        resolveShadow("drop-shadow/300", activeMode),  // alias
  lg:        resolveShadow("drop-shadow/600", activeMode),  // alias
  shadow100: resolveShadow("drop-shadow/100", activeMode),
  shadow200: resolveShadow("drop-shadow/200", activeMode),
  shadow300: resolveShadow("drop-shadow/300", activeMode),
  shadow400: resolveShadow("drop-shadow/400", activeMode),
  shadow500: resolveShadow("drop-shadow/500", activeMode),
  shadow600: resolveShadow("drop-shadow/600", activeMode),
} as const;

// ─── Styles de texte (Figma Text Styles) ────────────────────────────────────
export const textStyles = {
  bodyBase:        resolveTextStyle("body-base",        activeMode),
  bodyStrong:      resolveTextStyle("body-strong",      activeMode),
  bodyEmphasis:    resolveTextStyle("body-emphasis",    activeMode),
  bodySmall:       resolveTextStyle("body-small",       activeMode),
  bodySmallStrong: resolveTextStyle("body-small-strong", activeMode),
  subheading:      resolveTextStyle("subheading",       activeMode),
  heading:         resolveTextStyle("heading",          activeMode),
  subtitle:        resolveTextStyle("subtitle",         activeMode),
  subtitleStrong:  resolveTextStyle("subtitle-strong",  activeMode),
  titlePage:       resolveTextStyle("title-page",       activeMode),
  titleHero:       resolveTextStyle("title-hero",       activeMode),
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
