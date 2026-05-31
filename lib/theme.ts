import { StyleSheet } from "react-native";
// @ts-ignore
import tokens from "../design-tokens.json";

export type ThemeMode = "Light" | "Dark";

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

// ─── Palettes primitives (mode-indépendantes) ────────────────────────────────
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
    100:  resolveToken("Primitives/color/brand/100",  "Value") as string,   // #FFECE5
    200:  resolveToken("Primitives/color/brand/200",  "Value") as string,   // #FFC7B2
    300:  resolveToken("Primitives/color/brand/300",  "Value") as string,   // #FFA180
    400:  resolveToken("Primitives/color/brand/400",  "Value") as string,   // #FF7B4D
    500:  resolveToken("Primitives/color/brand/500",  "Value") as string,   // #FF561A
    600:  resolveToken("Primitives/color/brand/600",  "Value") as string,   // #E53C00
    700:  resolveToken("Primitives/color/brand/700",  "Value") as string,   // #B22F00
    800:  resolveToken("Primitives/color/brand/800",  "Value") as string,   // #802100
    900:  resolveToken("Primitives/color/brand/900",  "Value") as string,   // #4D1400
    1000: resolveToken("Primitives/color/brand/1000", "Value") as string,   // #1A0700
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
  // white/black : rendus comme rgba(opacité) — mode-indépendants
  white: {
    100:  resolveToken("Primitives/color/white/100",  "Value") as string,
    200:  resolveToken("Primitives/color/white/200",  "Value") as string,
    300:  resolveToken("Primitives/color/white/300",  "Value") as string,
    400:  resolveToken("Primitives/color/white/400",  "Value") as string,
    500:  resolveToken("Primitives/color/white/500",  "Value") as string,
    600:  resolveToken("Primitives/color/white/600",  "Value") as string,
    700:  resolveToken("Primitives/color/white/700",  "Value") as string,
    800:  resolveToken("Primitives/color/white/800",  "Value") as string,
    900:  resolveToken("Primitives/color/white/900",  "Value") as string,
    1000: resolveToken("Primitives/color/white/1000", "Value") as string,
  },
  black: {
    100:  resolveToken("Primitives/color/black/100",  "Value") as string,
    200:  resolveToken("Primitives/color/black/200",  "Value") as string,
    300:  resolveToken("Primitives/color/black/300",  "Value") as string,
    400:  resolveToken("Primitives/color/black/400",  "Value") as string,
    500:  resolveToken("Primitives/color/black/500",  "Value") as string,
    600:  resolveToken("Primitives/color/black/600",  "Value") as string,
    700:  resolveToken("Primitives/color/black/700",  "Value") as string,
    800:  resolveToken("Primitives/color/black/800",  "Value") as string,
    900:  resolveToken("Primitives/color/black/900",  "Value") as string,
    1000: resolveToken("Primitives/color/black/1000", "Value") as string,
  },
} as const;

// ─── Couleurs sémantiques (fabrique par mode) ────────────────────────────────
export const buildColors = (mode: ThemeMode) => ({

  // ── Background / Fond par défaut ─────────────────────────────────────────
  bg:                    resolveToken("-> Color/background/default/default",          mode), // #1E1E1E
  bgHover:               resolveToken("-> Color/background/default/default-hover",    mode), // #383838
  card:                  resolveToken("-> Color/background/default/secondary",        mode), // #2C2C2C
  cardHover:             resolveToken("-> Color/background/default/secondary-hover",  mode), // #1E1E1E
  accentMuted:           resolveToken("-> Color/background/default/tertiary",         mode), // #444444
  bgTertiaryHover:       resolveToken("-> Color/background/default/tertiary-hover",   mode), // #383838
  opacityLight:          resolveToken("-> Color/background/default/default-opacity",   mode), // Dark: rgba(12,12,13,0.4)  (ex "opacity-light")
  opacityDark:           resolveToken("-> Color/background/default/secondary-opacity", mode), // Dark: rgba(12,12,13,0.1)  (ex "opacity-dark")
  bgInverse:             resolveToken("-> Color/background/default/default-inverse",   mode), // Dark: #FFFFFF / Light: #0C0C0D

  // ── Background / Fond neutre ──────────────────────────────────────────────
  bgNeutral:                resolveToken("-> Color/background/neutral/default",             mode),
  bgNeutralHover:           resolveToken("-> Color/background/neutral/default-hover",       mode),
  bgNeutralSecondary:       resolveToken("-> Color/background/neutral/secondary",           mode),
  bgNeutralSecondaryHover:  resolveToken("-> Color/background/neutral/secondary-hover",     mode),
  bgNeutralTertiary:        resolveToken("-> Color/background/neutral/tertiary",            mode),
  bgNeutralTertiaryHover:   resolveToken("-> Color/background/neutral/tertiary-hover",      mode),

  // ── Background / Fond brand ───────────────────────────────────────────────
  brand:                 resolveToken("-> Color/background/brand/default",            mode), // #FF561A (brand/500, Light+Dark)
  brandHover:            resolveToken("-> Color/background/brand/default-hover",      mode),
  brandSecondary:        resolveToken("-> Color/background/brand/secondary",          mode),
  brandSecondaryHover:   resolveToken("-> Color/background/brand/secondary-hover",    mode),
  brandTertiary:         resolveToken("-> Color/background/brand/tertiary",           mode),
  brandTertiaryHover:    resolveToken("-> Color/background/brand/tertiary-hover",     mode),

  // ── Background / Fond positif (vert) ─────────────────────────────────────
  bgPositive:                resolveToken("-> Color/background/positive/default",           mode),
  bgPositiveHover:           resolveToken("-> Color/background/positive/default-hover",     mode),
  bgPositiveSecondary:       resolveToken("-> Color/background/positive/secondary",         mode),
  bgPositiveSecondaryHover:  resolveToken("-> Color/background/positive/secondary-hover",   mode),
  bgPositiveTertiary:        resolveToken("-> Color/background/positive/tertiary",          mode),
  bgPositiveTertiaryHover:   resolveToken("-> Color/background/positive/tertiary-hover",    mode),

  // ── Background / Fond warning (jaune) ────────────────────────────────────
  bgWarning:                resolveToken("-> Color/background/warning/default",             mode),
  bgWarningHover:           resolveToken("-> Color/background/warning/default-hover",       mode),
  bgWarningSecondary:       resolveToken("-> Color/background/warning/secondary",           mode),
  bgWarningSecondaryHover:  resolveToken("-> Color/background/warning/secondary-hover",     mode),
  bgWarningTertiary:        resolveToken("-> Color/background/warning/tertiary",            mode),
  bgWarningTertiaryHover:   resolveToken("-> Color/background/warning/tertiary-hover",      mode),

  // ── Background / Fond danger (rouge) ─────────────────────────────────────
  bgDanger:                resolveToken("-> Color/background/danger/default",               mode),
  bgDangerHover:           resolveToken("-> Color/background/danger/default-hover",         mode),
  bgDangerSecondary:       resolveToken("-> Color/background/danger/secondary",             mode),
  bgDangerSecondaryHover:  resolveToken("-> Color/background/danger/secondary-hover",       mode),
  bgDangerTertiary:        resolveToken("-> Color/background/danger/tertiary",              mode),
  bgDangerTertiaryHover:   resolveToken("-> Color/background/danger/tertiary-hover",        mode),

  // ── Background / Désactivé & utilitaires ─────────────────────────────────
  bgDisabled:     resolveToken("-> Color/background/disabled/default",                mode),
  scrim:          resolveToken("-> Color/background/utilities/scrim",                 mode), // #000000
  blanket:        resolveToken("-> Color/background/utilities/blanket",               mode), // #000000
  bgOverlay:      resolveToken("-> Color/background/utilities/overlay",               mode), // #000000
  bgMeasurement:  resolveToken("-> Color/background/utilities/measurement",           mode),

  // ── Texte par défaut ──────────────────────────────────────────────────────
  text:           resolveToken("-> Color/text/default/default",    mode),  // #FFFFFF
  textSecondary:  resolveToken("-> Color/text/default/secondary",  mode),  // rgba(255,255,255,0.5)
  textTertiary:   resolveToken("-> Color/text/default/tertiary",   mode),  // rgba(255,255,255,0.4)

  // ── Texte neutre ──────────────────────────────────────────────────────────
  textNeutral:           resolveToken("-> Color/text/neutral/default",             mode),
  secondary:             resolveToken("-> Color/text/neutral/secondary",           mode),  // #CDCDCD
  textNeutralSecondary:  resolveToken("-> Color/text/neutral/secondary",           mode),  // alias
  muted:                 resolveToken("-> Color/text/neutral/tertiary",            mode),  // #B2B2B2
  textMuted:             resolveToken("-> Color/text/neutral/tertiary",            mode),  // alias
  textNeutralTertiary:   resolveToken("-> Color/text/neutral/tertiary",            mode),  // alias
  textNeutralOnBrand:    resolveToken("-> Color/text/neutral/on-neutral-brand",    mode),
  textNeutralOnSecondary: resolveToken("-> Color/text/neutral/on-neutral-secondary", mode),
  textNeutralOnTertiary:  resolveToken("-> Color/text/neutral/on-neutral-tertiary",  mode),

  // ── Texte brand ───────────────────────────────────────────────────────────
  brandText:               resolveToken("-> Color/text/brand/default",          mode),
  textBrandSecondary:      resolveToken("-> Color/text/brand/secondary",        mode),
  textBrandTertiary:       resolveToken("-> Color/text/brand/tertiary",         mode),
  textBrandOnBrand:        resolveToken("-> Color/text/brand/on-brand-default", mode),
  textBrandOnBrandSecondary: resolveToken("-> Color/text/brand/on-brand-secondary", mode),
  textBrandOnBrandTertiary:  resolveToken("-> Color/text/brand/on-brand-tertiary",  mode),

  // ── Texte positif ─────────────────────────────────────────────────────────
  textPositive:                    resolveToken("-> Color/text/positive/default",               mode),
  textPositiveSecondary:           resolveToken("-> Color/text/positive/secondary",             mode),
  textPositiveTertiary:            resolveToken("-> Color/text/positive/tertiary",              mode),
  textPositiveOnPositive:          resolveToken("-> Color/text/positive/on-positive-default",   mode),
  textPositiveOnPositiveSecondary: resolveToken("-> Color/text/positive/on-positive-secondary", mode),
  textPositiveOnPositiveTertiary:  resolveToken("-> Color/text/positive/on-positive-tertiary",  mode),

  // ── Texte warning ─────────────────────────────────────────────────────────
  textWarning:                   resolveToken("-> Color/text/warning/default",              mode),
  textWarningSecondary:          resolveToken("-> Color/text/warning/secondary",            mode),
  textWarningTertiary:           resolveToken("-> Color/text/warning/tertiary",             mode),
  textWarningOnWarning:          resolveToken("-> Color/text/warning/on-warning-default",   mode),
  textWarningOnWarningSecondary: resolveToken("-> Color/text/warning/on-warning-secondary", mode),
  textWarningOnWarningTertiary:  resolveToken("-> Color/text/warning/on-warning-tertiary",  mode),

  // ── Texte danger ──────────────────────────────────────────────────────────
  textDanger:                  resolveToken("-> Color/text/danger/default",             mode),
  danger:                      resolveToken("-> Color/text/danger/secondary",           mode),  // #F4776A
  textDangerTertiary:          resolveToken("-> Color/text/danger/tertiary",            mode),
  textDangerOnDanger:          resolveToken("-> Color/text/danger/on-danger-default",   mode),
  textDangerOnDangerSecondary: resolveToken("-> Color/text/danger/on-danger-secondary", mode),
  textDangerOnDangerTertiary:  resolveToken("-> Color/text/danger/on-danger-tertiary",  mode),

  // ── Texte désactivé & utilitaires ────────────────────────────────────────
  textDisabled:      resolveToken("-> Color/text/disabled/default",              mode),
  textOnDisabled:    resolveToken("-> Color/text/disabled/on-disabled",          mode),
  textOnOverlay:     resolveToken("-> Color/text/utilities/text-on-overlay",     mode),
  textOnMeasurement: resolveToken("-> Color/text/utilities/text-on-measurement", mode),

  // ── Accent (compatibilité) ────────────────────────────────────────────────
  accent: resolveToken("-> Color/text/default/default", mode),  // rgba(255,255,255,1)

  // ── Bordures par défaut ───────────────────────────────────────────────────
  cardBorder:      resolveToken("-> Color/border/default/default",   mode),  // #444444
  borderSecondary: resolveToken("-> Color/border/default/secondary", mode),
  borderTertiary:  resolveToken("-> Color/border/default/tertiary",  mode),

  // ── Bordures neutres ──────────────────────────────────────────────────────
  borderNeutral:          resolveToken("-> Color/border/neutral/sefault",   mode),
  borderNeutralSecondary: resolveToken("-> Color/border/neutral/secondary", mode),
  borderNeutralTertiary:  resolveToken("-> Color/border/neutral/tertiary",  mode),

  // ── Bordures brand ────────────────────────────────────────────────────────
  borderBrand:          resolveToken("-> Color/border/brand/default",   mode),
  borderBrandSecondary: resolveToken("-> Color/border/brand/secondary", mode),
  borderBrandTertiary:  resolveToken("-> Color/border/brand/tertiary",  mode),

  // ── Bordures positives ────────────────────────────────────────────────────
  borderPositive:          resolveToken("-> Color/border/positive/default",   mode),
  borderPositiveSecondary: resolveToken("-> Color/border/positive/secondary", mode),
  borderPositiveTertiary:  resolveToken("-> Color/border/positive/tertiary",  mode),

  // ── Bordures warning ──────────────────────────────────────────────────────
  borderWarning:          resolveToken("-> Color/border/warning/default",   mode),
  borderWarningSecondary: resolveToken("-> Color/border/warning/secondary", mode),
  borderWarningTertiary:  resolveToken("-> Color/border/warning/tertiary",  mode),

  // ── Bordures danger ───────────────────────────────────────────────────────
  borderDanger:          resolveToken("-> Color/border/danger/default",   mode),
  borderDangerSecondary: resolveToken("-> Color/border/danger/secondary", mode),
  borderDangerTertiary:  resolveToken("-> Color/border/danger/tertiary",  mode),

  // ── Bordures désactivées & utilitaires ───────────────────────────────────
  borderDisabled:    resolveToken("-> Color/border/disables/default",         mode),
  borderMeasurement: resolveToken("-> Color/border/utilities/measurement",    mode),
  borderSwatch:      resolveToken("-> Color/border/utilities/swatch",         mode),

  // ── Icônes par défaut ─────────────────────────────────────────────────────
  icon:          resolveToken("-> Color/icon/default/default",   mode),
  iconSecondary: resolveToken("-> Color/icon/default/secondary", mode),
  iconTertiary:  resolveToken("-> Color/icon/default/tertiary",  mode),

  // ── Icônes neutres ────────────────────────────────────────────────────────
  iconNeutral:              resolveToken("-> Color/icon/neutral/default",             mode),
  iconNeutralSecondary:     resolveToken("-> Color/icon/neutral/secondary",           mode),
  iconNeutralTertiary:      resolveToken("-> Color/icon/neutral/tertiary",            mode),
  iconNeutralOnNeutral:     resolveToken("-> Color/icon/neutral/on-neutral-default",  mode),
  iconNeutralOnNeutralSecondary: resolveToken("-> Color/icon/neutral/on-neutral-secondary", mode),
  iconNeutralOnNeutralTertiary:  resolveToken("-> Color/icon/neutral/on-neutral-tertiary",  mode),

  // ── Icônes brand ──────────────────────────────────────────────────────────
  iconBrand:                resolveToken("-> Color/icon/brand/default",          mode),
  iconBrandSecondary:       resolveToken("-> Color/icon/brand/secondary",        mode),
  iconBrandTertiary:        resolveToken("-> Color/icon/brand/tertiary",         mode),
  iconBrandOnBrand:         resolveToken("-> Color/icon/brand/on-brand-default", mode),
  iconBrandOnBrandSecondary: resolveToken("-> Color/icon/brand/on-brand-secondary", mode),
  iconBrandOnBrandTertiary:  resolveToken("-> Color/icon/brand/on-brand-tertiary",  mode),

  // ── Icônes positives ──────────────────────────────────────────────────────
  iconPositive:                    resolveToken("-> Color/icon/positive/default",               mode),
  iconPositiveSecondary:           resolveToken("-> Color/icon/positive/secondary",             mode),
  iconPositiveTertiary:            resolveToken("-> Color/icon/positive/tertiary",              mode),
  iconPositiveOnPositive:          resolveToken("-> Color/icon/positive/on-positive-default",   mode),
  iconPositiveOnPositiveSecondary: resolveToken("-> Color/icon/positive/on-positive-secondary", mode),
  iconPositiveOnPositiveTertiary:  resolveToken("-> Color/icon/positive/on-positive-tertiary",  mode),

  // ── Icônes warning ────────────────────────────────────────────────────────
  iconWarning:                   resolveToken("-> Color/icon/warning/default",              mode),
  iconWarningSecondary:          resolveToken("-> Color/icon/warning/secondary",            mode),
  iconWarningTertiary:           resolveToken("-> Color/icon/warning/tertiary",             mode),
  iconWarningOnWarning:          resolveToken("-> Color/icon/warning/on-warning-default",   mode),
  iconWarningOnWarningSecondary: resolveToken("-> Color/icon/warning/on-warning-secondary", mode),
  iconWarningOnWarningTertiary:  resolveToken("-> Color/icon/warning/on-warning-tertiary",  mode),

  // ── Icônes danger ─────────────────────────────────────────────────────────
  iconDanger:                  resolveToken("-> Color/icon/danger/default",             mode),
  iconDangerSecondary:         resolveToken("-> Color/icon/danger/secondary",           mode),
  iconDangerTertiary:          resolveToken("-> Color/icon/danger/tertiary",            mode),
  iconDangerOnDanger:          resolveToken("-> Color/icon/danger/on-danger-default",   mode),
  iconDangerOnDangerSecondary: resolveToken("-> Color/icon/danger/on-danger-secondary", mode),
  iconDangerOnDangerTertiary:  resolveToken("-> Color/icon/danger/on-danger-tertiary",  mode),

  // ── Icônes désactivées & utilitaires ─────────────────────────────────────
  iconDisabled:      resolveToken("-> Color/icon/disabled/default",              mode),
  iconOnDisabled:    resolveToken("-> Color/icon/disabled/on-disabled",          mode),
  iconMeasurement:   resolveToken("-> Color/icon/utilities/icon",                mode),
  iconOnMeasurement: resolveToken("-> Color/icon/utilities/icon-on-measurement", mode),

  // ── Statuts hors-tokens (alias compatibilité, mode-indépendants) ──────────
  gold:     resolveToken("Primitives/color/yellow/400", "Value"),  // #E8B931
  goldDark: resolveToken("Primitives/color/yellow/600", "Value"),  // #BF6A02

  // ── Utilitaires fixes ────────────────────────────────────────────────────
  overlay:    resolveToken("-> Color/background/default/secondary", mode), // #2C2C2C
  white:      "#FFFFFF" as string,
  black:      "#0C0C0D" as string,
  glass:      "rgba(0, 0, 0, 0.5)" as string,
  glassMuted: "rgba(255, 255, 255, 0.07)" as string,
  glassBorder:"rgba(255, 255, 255, 0.12)" as string,
});

export type ThemeColors = ReturnType<typeof buildColors>;

// ─── Espacements (mode-indépendants) ─────────────────────────────────────────
export const spacing = {
  xxs:   resolveToken("-> Size/space/050",  "Value") as number,   // 2
  xs:    resolveToken("-> Size/space/100",  "Value") as number,   // 4
  xs2:   resolveToken("-> Size/space/150",  "Value") as number,   // 6
  sm:    resolveToken("-> Size/space/200",  "Value") as number,   // 8
  md:    resolveToken("-> Size/space/300",  "Value") as number,   // 12
  lg:    resolveToken("-> Size/space/400",  "Value") as number,   // 16
  xl:    resolveToken("-> Size/space/600",  "Value") as number,   // 24
  xxl:   resolveToken("-> Size/space/800",  "Value") as number,   // 32
  xl3:   resolveToken("-> Size/space/1200", "Value") as number,   // 48
  xl4:   resolveToken("-> Size/space/1600", "Value") as number,   // 64
  xl6:   resolveToken("-> Size/space/2400", "Value") as number,   // 96
  xl10:  resolveToken("-> Size/space/4000", "Value") as number,   // 160
  // Négatifs
  negXxs: resolveToken("-> Size/space/neg-25",  "Value") as number,  // -1
  negXs:  resolveToken("-> Size/space/neg-100", "Value") as number,  // -4
  negSm:  resolveToken("-> Size/space/neg-200", "Value") as number,  // -8
  negMd:  resolveToken("-> Size/space/neg-300", "Value") as number,  // -12
  negLg:  resolveToken("-> Size/space/neg-400", "Value") as number,  // -16
  negXl:  resolveToken("-> Size/space/neg-600", "Value") as number,  // -24
} as const;

// ─── Rayons de bordure (mode-indépendants) ───────────────────────────────────
export const radii = {
  none:   resolveToken("-> Size/radius/empty", "Value") as number,  // 0
  xs:     resolveToken("-> Size/radius/100",   "Value") as number,  // 4
  sm:     resolveToken("-> Size/radius/200",   "Value") as number,  // 8
  md:     resolveToken("-> Size/radius/300",   "Value") as number,  // 12
  lg:     resolveToken("-> Size/radius/400",   "Value") as number,  // 16
  xl:     resolveToken("-> Size/radius/600",   "Value") as number,  // 24
  xxl:    resolveToken("-> Size/radius/800",   "Value") as number,  // 32
  xl3:    resolveToken("-> Size/radius/1000",  "Value") as number,  // 40
  full:   resolveToken("-> Size/radius/full",  "Value") as number,  // 999
  card:   resolveToken("-> Size/radius/400",   "Value") as number,  // 16 (alias)
  button: resolveToken("-> Size/radius/200",   "Value") as number,  // 8  (alias)
} as const;

// ─── Profondeur / Z-index (mode-indépendants) ────────────────────────────────
export const depth = {
  none:   resolveToken("-> Size/depth/empty",    "Value") as number,   // 0
  xxs:    resolveToken("-> Size/depth/025",       "Value") as number,   // 1
  xs:     resolveToken("-> Size/depth/100",       "Value") as number,   // 4
  sm:     resolveToken("-> Size/depth/200",       "Value") as number,   // 8
  md:     resolveToken("-> Size/depth/400",       "Value") as number,   // 16
  lg:     resolveToken("-> Size/depth/800",       "Value") as number,   // 32
  xl:     resolveToken("-> Size/depth/1200",      "Value") as number,   // 48
  negXxs: resolveToken("-> Size/depth/neg-025",   "Value") as number,   // -1
  negXs:  resolveToken("-> Size/depth/neg-100",   "Value") as number,   // -4
  negSm:  resolveToken("-> Size/depth/neg-200",   "Value") as number,   // -8
  negMd:  resolveToken("-> Size/depth/neg-400",   "Value") as number,   // -16
  negLg:  resolveToken("-> Size/depth/neg-800",   "Value") as number,   // -32
  negXl:  resolveToken("-> Size/depth/neg-1200",  "Value") as number,   // -48
} as const;

// ─── Flou (mode-indépendant) ──────────────────────────────────────────────────
export const blur = {
  sm: resolveToken("-> Size/blur/100",  "Value") as number,  // 4
  md: resolveToken("-> Size/blur/400",  "Value") as number,  // 16  (= effect style blur/glass)
  lg: resolveToken("-> Size/blur/1200", "Value") as number,  // 48  (= blur/overlay, blur/layer)
  xl: resolveToken("-> Size/blur/2400", "Value") as number,  // 96  (= blur/background-blur)
} as const;

/**
 * Conversion taille de flou (px, issue des design tokens) → `intensity` d'expo-blur (1–100).
 *
 * `expo-blur` n'accepte pas de rayon en px : sur iOS c'est un material système
 * réglé en intensité 0–100, sans rayon gaussien. On approxime donc linéairement.
 * IMPORTANT : tout est dérivé des tokens — si les designers changent `blur/*`,
 * l'intensité recalculée suit automatiquement (rien n'est codé en dur ailleurs).
 *
 * `BLUR_PX_TO_INTENSITY` est le seul facteur d'ajustement (calage visuel).
 */
const BLUR_PX_TO_INTENSITY = 3;
export const blurIntensity = (px: number): number =>
  Math.max(1, Math.min(100, Math.round(px * BLUR_PX_TO_INTENSITY)));

/** Intensité du flou "glass" (frosted), dérivée du token blur/glass (= blur.md). */
export const glassBlurIntensity = blurIntensity(blur.md);

// ─── Épaisseurs de trait (mode-indépendantes) ────────────────────────────────
export const stroke = {
  sm: resolveToken("-> Size/stroke/025", "Value") as number,  // 1
  md: resolveToken("-> Size/stroke/050", "Value") as number,  // 2
} as const;

// ─── Tailles d'icônes (mode-indépendantes) ───────────────────────────────────
export const iconSize = {
  sm: resolveToken("-> Size/icon/small",  "Value") as number,  // 24
  md: resolveToken("-> Size/icon/medium", "Value") as number,  // 32
  lg: resolveToken("-> Size/icon/large",  "Value") as number,  // 40
} as const;

// ─── Typographie (mode-indépendante) ─────────────────────────────────────────
export const typography = {
  family: {
    regular:   "Inter_400Regular",
    medium:    "Inter_500Medium",
    semibold:  "Inter_600SemiBold",
    bold:      "Inter_700Bold",
    extrabold: "Inter_800ExtraBold",
  },
  size: {
    xxs:          resolveToken("-> Typography/body/size-extra-small",  "Value") as number,  // 12 (ex 10)
    xs:           resolveToken("Primitives/typography/scale-01",       "Value") as number,  // 12
    sm:           resolveToken("-> Typography/body/size-small",        "Value") as number,  // 14
    md:           resolveToken("-> Typography/body/size-medium",       "Value") as number,  // 16
    lg:           17 as number,                                                             // custom (entre md et xl)
    xl:           resolveToken("-> Typography/body/size-large",        "Value") as number,  // 20
    xxl:          resolveToken("-> Typography/heading/size-base",      "Value") as number,  // 24
    headingSm:    resolveToken("-> Typography/heading/size-small",     "Value") as number,  // 20
    headingLg:    resolveToken("-> Typography/heading/size-large",     "Value") as number,  // 32
    subheadingSm: resolveToken("-> Typography/subheading/size-small",  "Value") as number,  // 16
    subheadingMd: resolveToken("-> Typography/subheading/size-medium", "Value") as number,  // 20
    subtitleSm:   resolveToken("-> Typography/subtitle/size-small",    "Value") as number,  // 24
    subtitle:     resolveToken("-> Typography/subtitle/size-base",     "Value") as number,  // 32
    subtitleLg:   resolveToken("-> Typography/subtitle/size-large",    "Value") as number,  // 40
    titleSm:      resolveToken("-> Typography/title-page/size-small",  "Value") as number,  // 40
    title:        resolveToken("-> Typography/title-page/size-base",   "Value") as number,  // 48
    titleLg:      resolveToken("-> Typography/title-page/size-large",  "Value") as number,  // 64
    hero:         resolveToken("-> Typography/title-hero/size",        "Value") as number,  // 72
  },
  weight: {
    thin:       resolveToken("Primitives/typography/weight-thin",        "Value") as number,  // 100
    extraLight: resolveToken("Primitives/typography/weight-extra-light", "Value") as number,  // 200
    light:      resolveToken("Primitives/typography/weight-light",       "Value") as number,  // 300
    regular:    resolveToken("Primitives/typography/weight-regular",     "Value") as number,  // 400
    medium:     resolveToken("Primitives/typography/weight-medium",      "Value") as number,  // 500
    semibold:   resolveToken("Primitives/typography/weight-semibold",    "Value") as number,  // 600
    bold:       resolveToken("Primitives/typography/weight-bold",        "Value") as number,  // 700
    extraBold:  resolveToken("Primitives/typography/weight-extra-bold",  "Value") as number,  // 800
    black:      resolveToken("Primitives/typography/weight-black",       "Value") as number,  // 900
  },
} as const;

// ─── Ombres (fabrique par mode) ──────────────────────────────────────────────
export const buildShadows = (mode: ThemeMode) => ({
  sm:        resolveShadow("drop-shadow/100", mode),  // alias
  md:        resolveShadow("drop-shadow/300", mode),  // alias
  lg:        resolveShadow("drop-shadow/600", mode),  // alias
  shadow100: resolveShadow("drop-shadow/100", mode),
  shadow200: resolveShadow("drop-shadow/200", mode),
  shadow300: resolveShadow("drop-shadow/300", mode),
  shadow400: resolveShadow("drop-shadow/400", mode),
  shadow500: resolveShadow("drop-shadow/500", mode),
  shadow600: resolveShadow("drop-shadow/600", mode),
});

export type ThemeShadows = ReturnType<typeof buildShadows>;

// ─── Styles de texte (Figma Text Styles, mode-indépendants) ──────────────────
export const textStyles = {
  bodyBase:        resolveTextStyle("body-base",        "Light"),
  bodyStrong:      resolveTextStyle("body-strong",      "Light"),
  bodyEmphasis:    resolveTextStyle("body-emphasis",    "Light"),
  bodySmall:       resolveTextStyle("body-small",       "Light"),
  bodySmallStrong: resolveTextStyle("body-small-strong", "Light"),
  bodyExtraSmall:       resolveTextStyle("body-extra-small",        "Light"),
  bodyExtraSmallStrong: resolveTextStyle("body-extra-small-strong", "Light"),
  bodyCode:        resolveTextStyle("body-code",        "Light"),
  subheading:      resolveTextStyle("subheading",       "Light"),
  heading:         resolveTextStyle("heading",          "Light"),
  subtitle:        resolveTextStyle("subtitle",         "Light"),
  subtitleStrong:  resolveTextStyle("subtitle-strong",  "Light"),
  titlePage:       resolveTextStyle("title-page",       "Light"),
  titleHero:       resolveTextStyle("title-hero",       "Light"),
} as const;

// ─── Styles composés (fabrique par mode) ─────────────────────────────────────
export const buildTheme = (colors: ThemeColors, shadows: ThemeShadows) =>
  StyleSheet.create({
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

export type ThemeStyles = ReturnType<typeof buildTheme>;

// ─── Exports statiques de rétro-compatibilité (mode Dark par défaut) ─────────
// Servent de fallback pour tout usage hors composant React et permettent une
// migration incrémentale fichier par fichier. Les composants migrés utilisent
// `useTheme()` (lib/theme-context) pour des couleurs réactives.
export const colors = buildColors("Dark");
export const shadows = buildShadows("Dark");
export const theme = buildTheme(colors, shadows);
