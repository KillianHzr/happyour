import { View, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { type ThemeColors } from "../../lib/theme";
import { useThemedStyles } from "../../lib/theme-context";
import {
  OnboardingSlideLayout,
  OnboardingStickerText,
  OnboardingButton,
} from "../../components/onboarding/OnboardingKit";

export default function OnboardingGroupCreatedScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { groupId, groupName, mode } = useLocalSearchParams<{ groupId: string; groupName: string; mode?: string }>();

  const verb = mode === "joined" ? "rejoint" : "créé";

  const handleStart = () => {
    if (mode === "joined") {
      // En rejoignant un groupe, on saute l'étape de partage → directement les notifs.
      router.replace({ pathname: "/(onboarding)/notifications", params: { groupId, groupName } });
    } else {
      router.replace({ pathname: "/(onboarding)/group-invite", params: { groupId, groupName } });
    }
  };

  return (
    <OnboardingSlideLayout
      top={
        <>
          <OnboardingStickerText text={`Félicitation, tu as\n${verb} le groupe`} />
          <View style={styles.nameSticker}>
            <OnboardingStickerText text={`[${groupName ?? ""}]`} />
          </View>
        </>
      }
      footer={<OnboardingButton label="Démarrer" onPress={handleStart} active />}
    />
  );
}

const makeStyles = (_colors: ThemeColors) =>
  StyleSheet.create({
    nameSticker: {
      marginTop: 8, // 8px sous le texte
    },
  });
