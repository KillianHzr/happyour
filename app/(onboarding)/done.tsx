import { View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GRADIENT_ORANGE } from "../../lib/assets";
import { type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles, ForceTheme } from "../../lib/theme-context";
import {
  ONBOARDING_TOP_OFFSET,
  OnboardingStickerText,
  OnboardingButton,
} from "../../components/onboarding/OnboardingKit";
import AppLoader from "../../components/AppLoader";

export default function OnboardingDoneScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { groupId, groupName } = useLocalSearchParams<{ groupId: string; groupName: string }>();

  const finish = () => {
    // Fin de l'onboarding → on entre dans l'app, sur le groupe créé/rejoint.
    if (groupId) router.replace(`/(app)/groups/${groupId}`);
    else router.replace("/(app)/groups");
  };

  return (
    <View style={styles.container}>
      {/* Fond orange plein écran (même image que le splash/loader). */}
      <Image source={GRADIENT_ORANGE} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />

      <View style={styles.top}>
        <OnboardingStickerText text="Capture un moment pour remplir" textColor={colors.textFix} />
        <View style={styles.nameSticker}>
          <OnboardingStickerText
            text={`[${groupName ?? ""}]`}
            textColor={colors.textFix}
            stickerBg={colors.bgFix}
            stickerColor={colors.textBrandTertiary}
          />
        </View>

        {/* Lottie du loader de l'app, 90px sous le sticker, en boucle. */}
        <View style={styles.lottie}>
          <AppLoader />
        </View>
      </View>

      <View style={{ flex: 1 }} />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        {/* Bouton forcé en mode clair (fond clair / texte sombre) sur le fond orange. */}
        <ForceTheme mode="Light">
          <OnboardingButton label="Démarrer" onPress={finish} variant="plain" />
        </ForceTheme>
      </View>
    </View>
  );
}

const makeStyles = (_colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    top: {
      paddingTop: ONBOARDING_TOP_OFFSET,
      paddingHorizontal: 16,
      alignItems: "center",
      width: "100%",
    },
    nameSticker: { marginTop: 8 },
    lottie: { marginTop: 90 }, // 90px sous le sticker du nom
    footer: {
      paddingHorizontal: 16,
      alignItems: "center",
    },
  });
