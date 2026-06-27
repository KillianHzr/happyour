import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { type ThemeColors } from "../../lib/theme";
import { useThemedStyles } from "../../lib/theme-context";
import {
  OnboardingSlideLayout,
  OnboardingStickerText,
  OnboardingButton,
} from "../../components/onboarding/OnboardingKit";

export default function OnboardingGroupScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);

  return (
    <OnboardingSlideLayout
      top={
        <>
          <OnboardingStickerText text={"Inaugure ton premier\n[groupe] !"} rotate="2deg" />

          {/* 80px sous le texte : choix créer / rejoindre (style "Importe galerie"). */}
          <View style={styles.buttons}>
            <OnboardingButton
              label="Créer un groupe"
              onPress={() => router.push("/(onboarding)/group-name")}
              variant="secondary"
            />
            <OnboardingButton
              label="Rejoindre un groupe"
              onPress={() => router.push("/(onboarding)/group-join")}
              variant="secondary"
            />
          </View>
        </>
      }
    />
  );
}

const makeStyles = (_colors: ThemeColors) =>
  StyleSheet.create({
    buttons: {
      width: "100%",
      gap: 12,
      marginTop: 90, // 90px sous le texte
    },
  });
