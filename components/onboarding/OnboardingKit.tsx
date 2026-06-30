import { ReactNode, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StyleProp,
  ViewStyle,
  TextStyle,
  Dimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { spacing, radii, typography, textStyles, type ThemeColors } from "../../lib/theme";
import Loader from "../Loader";
import Icon from "../Icon";

/**
 * Brique d'UI partagée par tous les écrans d'onboarding (mail, code, …) pour que
 * le sticker brand, les champs et les boutons restent strictement identiques
 * d'un écran à l'autre. On ne re-style plus rien écran par écran : on assemble
 * ces composants.
 */

// ─── Layout d'écran : header back + bloc centré (titre + formulaire) ──────────
export function OnboardingScreen({
  title,
  children,
  onBack,
  hideBack = false,
}: {
  title: ReactNode;
  children: ReactNode;
  onBack?: () => void;
  /** Masque le bouton retour (étapes d'onboarding sans retour possible). */
  hideBack?: boolean;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          {!hideBack && (
            <TouchableOpacity
              onPress={onBack ?? (() => router.back())}
              style={styles.backBtn}
              activeOpacity={0.7}
            >
              <Icon name="chevron-left" size={20} color={colors.iconNeutral} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.centerContainer}>
          <View style={styles.headerBlock}>{title}</View>
          <View style={styles.formBlock}>{children}</View>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

/**
 * Échelle responsive de l'onboarding. Référence ≈ iPhone moderne (800pt de haut).
 * Sur un écran plus court — surtout iPad en mode compatibilité iPhone où le canvas
 * est nettement plus court/carré — on réduit proportionnellement l'offset du titre
 * et la taille des illustrations pour éviter que le titre et l'illustration ne se
 * chevauchent. 1 sur les iPhone ≥ 800pt (aucun changement sur les appareils
 * supportés normaux).
 */
const ONBOARDING_SCREEN_HEIGHT = Dimensions.get("window").height;
export const ONBOARDING_SCALE = Math.min(1, Math.max(0.58, ONBOARDING_SCREEN_HEIGHT / 800));

// Vrai uniquement sur un canvas très court (iPad en mode compatibilité iPhone) —
// pas sur les iPhone normaux ni les petits iPhone (SE ~667pt). Sur ces écrans on
// simplifie l'onboarding : illustrations qui chevauchent le texte masquées, et
// contenu centré verticalement plutôt que calé à un offset figé (seuil ≈ 600pt).
export const ONBOARDING_SHORT = ONBOARDING_SCALE < 0.75;

/**
 * Layout des écrans « slide » de l'onboarding (slider de bienvenue + photo de
 * profil) : le contenu haut commence à 160px du haut de l'écran (réduit sur écran
 * court via ONBOARDING_SCALE), et le footer (boutons / pagination) est collé en
 * bas. Pas de SafeArea en haut : l'offset > encoche, donc le texte est toujours
 * sous la status bar.
 */
export const ONBOARDING_TOP_OFFSET = Math.round(160 * ONBOARDING_SCALE);

export function OnboardingSlideLayout({ top, footer }: { top: ReactNode; footer?: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.slideContainer}>
      {ONBOARDING_SHORT ? (
        // Écran court (iPad compat) : contenu centré verticalement, sans offset figé
        // en haut, pour que tout tienne dans l'écran.
        <View style={styles.slideTopCentered}>{top}</View>
      ) : (
        <>
          <View style={styles.slideTop}>{top}</View>
          <View style={{ flex: 1 }} />
        </>
      )}
      {footer ? (
        <View style={[styles.slideFooter, { paddingBottom: insets.bottom + 20 }]}>{footer}</View>
      ) : null}
    </View>
  );
}

// ─── Titre : phrase + mot dans le sticker brand (+ description optionnelle) ────
export function OnboardingTitle({
  prefix,
  sticker,
  description,
}: {
  prefix: string;
  sticker: string;
  description?: ReactNode;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <>
      <Text style={styles.subtitleStrongText}>
        {prefix}{" "}
        <View style={styles.stickerContainer}>
          <Text style={styles.stickerText}>{sticker}</Text>
        </View>
      </Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </>
  );
}

/**
 * Phrase de titre avec un mot dans le sticker brand, placé n'importe où dans le
 * texte. Le mot à « stickeriser » est marqué entre crochets, ex. :
 *   "Tous vos moments patientent dans votre [groupe] commun"
 * Même style que `OnboardingTitle` (subtitle-strong + sticker brand).
 */
export function OnboardingStickerText({
  text,
  rotate = "2.5deg",
  stickerY = 4,
  textColor,
  stickerBg,
  stickerColor,
}: {
  text: string;
  rotate?: string;
  /** Décalage vertical (translateY) du sticker. Mettre 0 pour le désactiver. */
  stickerY?: number;
  /** Override couleur du texte hors sticker. */
  textColor?: string;
  /** Override fond du sticker. */
  stickerBg?: string;
  /** Override couleur du texte du sticker. */
  stickerColor?: string;
}) {
  const styles = useThemedStyles(makeStyles);
  // On rend chaque ligne (séparées par \n) comme une rangée flex centrée. Une vue
  // inline (le sticker) dans un <Text> n'est PAS centrée par iOS quand elle est en
  // début de ligne → on évite l'inline et on centre chaque ligne via flexbox.
  const lines = text.split("\n");

  return (
    <View style={styles.stickerTextWrap}>
      {lines.map((line, i) => {
        const match = line.match(/^([\s\S]*?)\[([\s\S]+?)\]([\s\S]*)$/);
        if (!match) {
          return (
            <Text key={i} style={[styles.subtitleStrongText, textColor ? { color: textColor } : null]}>
              {line}
            </Text>
          );
        }
        const [, before, word, after] = match;
        return (
          <View key={i} style={styles.stickerLine}>
            {before !== "" && <Text style={[styles.subtitleStrongText, textColor ? { color: textColor } : null]}>{before}</Text>}
            <View
              style={[
                styles.stickerContainer,
                { transform: [{ rotate }, { translateY: stickerY }] },
                stickerBg ? { backgroundColor: stickerBg } : null,
              ]}
            >
              <Text style={[styles.stickerText, stickerColor ? { color: stickerColor } : null]}>{word}</Text>
            </View>
            {after !== "" && <Text style={[styles.subtitleStrongText, textColor ? { color: textColor } : null]}>{after}</Text>}
          </View>
        );
      })}
    </View>
  );
}

/** Span pour mettre en valeur une portion de la description (ex. l'email). */
export function OnboardingHighlight({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.highlightText}>{children}</Text>;
}

// ─── Champ texte : identique aux champs d'édition du profil ───────────────────
export function OnboardingTextField({
  inputStyle,
  containerStyle,
  counterMax,
  ...inputProps
}: TextInputProps & {
  inputStyle?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  /** Affiche un compteur x/xx à droite (comme le champ surnom de l'édition profil). */
  counterMax?: number;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [isFocused, setIsFocused] = useState(false);
  const len = String(inputProps.value ?? "").length;

  return (
    <View
      style={[
        styles.input,
        { borderColor: isFocused ? colors.borderBrandSecondary : colors.cardBorder, backgroundColor: colors.bg },
        containerStyle,
      ]}
    >
      <TextInput
        style={[styles.inputText, { color: colors.text }, inputStyle]}
        placeholderTextColor={colors.textTertiary}
        {...inputProps}
        onFocus={(e) => {
          setIsFocused(true);
          inputProps.onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          inputProps.onBlur?.(e);
        }}
      />
      {counterMax != null && (
        <Text style={styles.inputCounter}>
          {len}/{counterMax}
        </Text>
      )}
    </View>
  );
}

// ─── Bouton principal (« Valider ») ───────────────────────────────────────────
export function OnboardingButton({
  label,
  onPress,
  active = true,
  loading = false,
  disabled = false,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  /** primary uniquement : true = rempli brand (texte default-fix), false = neutre désactivé. */
  active?: boolean;
  loading?: boolean;
  disabled?: boolean;
  /**
   * "primary"   = brand + text/default/default-fix
   * "secondary" = background/neutral/tertiary + text/neutral/default
   * "plain"     = background/default/default + text/default/default
   */
  variant?: "primary" | "secondary" | "plain";
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const bg =
    variant === "plain" ? colors.bg
    : variant === "secondary" ? colors.bgNeutralTertiary
    : active ? colors.brand
    : colors.bgNeutralTertiary;
  const fg =
    variant === "plain" ? colors.text
    : variant === "secondary" ? colors.textNeutral
    : active ? colors.textFix
    : colors.textNeutral;

  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: bg }]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading ? <Loader size={20} /> : <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

// ─── Bouton DEV (raccourci pour passer une étape — visible en __DEV__ seulement) ─
export function OnboardingDevButton({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity style={styles.devButton} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.devButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    devButton: {
      height: 48,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.borderNeutralSecondary,
      borderStyle: "dashed",
      alignSelf: "stretch",
    },
    devButtonText: {
      fontFamily: typography.family.semibold,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    safeArea: {
      flex: 1,
    },
    header: {
      height: 48,
      paddingHorizontal: 16,
      justifyContent: "center",
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: radii.md,
      backgroundColor: colors.card,
      justifyContent: "center",
      alignItems: "center",
    },
    centerContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 16,
      marginTop: -40,
      gap: spacing.xl3, // space/1200 (48) entre le titre et le formulaire
    },
    headerBlock: {
      alignItems: "center",
      width: "100%",
    },
    formBlock: {
      width: "100%",
      gap: spacing.lg, // space/400 (16) entre les éléments du formulaire
    },

    // ── Layout des écrans "slide" (texte à 160px du haut, footer en bas)
    slideContainer: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    slideTop: {
      paddingTop: ONBOARDING_TOP_OFFSET, // 160px sous le haut de l'écran
      paddingHorizontal: 16,
      alignItems: "center",
      width: "100%",
    },
    // Écran court : on centre le contenu verticalement dans l'espace au-dessus
    // du footer, sans offset figé en haut.
    slideTopCentered: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 16,
      alignItems: "center",
      width: "100%",
    },
    slideFooter: {
      paddingHorizontal: 16,
      alignItems: "center",
    },

    // ── Titre + sticker brand
    stickerTextWrap: {
      alignSelf: "stretch",
      alignItems: "center",
    },
    stickerLine: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "center",
    },
    subtitleStrongText: {
      ...textStyles.subtitleStrong,
      color: colors.text,
      textAlign: "center",
      lineHeight: Math.round(typography.size.subtitle * 1.2),
    },
    stickerContainer: {
      transform: [{ rotate: "2.5deg" }, { translateY: 4 }],
      marginHorizontal: 4,
      backgroundColor: colors.brand,
      paddingVertical: spacing.xs,    // space/100 = 4px
      paddingHorizontal: spacing.xs2, // space/150 = 6px
      gap: spacing.sm,                // 8px
      justifyContent: "center",
      alignItems: "center",
    },
    stickerText: {
      color: "#FFFFFF",
      fontFamily: typography.family.bold,
      fontSize: typography.size.subtitle,
      lineHeight: 40, // 100%
      includeFontPadding: false,
      textAlignVertical: "center",
      // leading-trim: both / text-edge: cap — RN n'a pas ces props CSS, on retire
      // l'espace de leading via des marges négatives : beaucoup en bas (descente
      // vide sous la baseline) et un peu en haut (leading au-dessus des capitales).
      marginBottom: -Math.round(typography.size.subtitle * 0.2), // ~ -6
      marginTop: -Math.round(typography.size.subtitle * 0.06),   // ~ -2
    },
    description: {
      ...textStyles.bodyBase,
      color: colors.secondary,
      textAlign: "center",
      marginTop: 8,
    },
    highlightText: {
      color: colors.text,
      fontFamily: typography.family.semibold,
    },

    // ── Champ texte (identique à ProfileSettingsPage)
    input: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.md,    // space/300 = 12px
      paddingHorizontal: spacing.lg,  // space/400 = 16px
      gap: spacing.sm,                // space/200 = 8px
      alignSelf: "stretch",
      borderRadius: radii.sm,         // radius/200 = 8px
      borderWidth: 1,
    },
    inputText: {
      flex: 1,
      fontFamily: textStyles.singleLineSubheadingStrong.fontFamily,
      fontSize: textStyles.singleLineSubheadingStrong.fontSize,
      includeFontPadding: false,
      padding: 0,
    },
    inputCounter: {
      fontFamily: typography.family.semibold,
      fontSize: typography.size.md,
      color: colors.textTertiary,
      includeFontPadding: false,
    },

    // ── Bouton principal
    button: {
      height: 56,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: radii.lg,
      width: "100%",
    },
    buttonText: {
      ...textStyles.singleLineSubheadingStrong,
      lineHeight: undefined,
    },
  });
