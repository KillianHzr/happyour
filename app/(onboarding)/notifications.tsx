import { useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { spacing, type ThemeColors } from "../../lib/theme";
import { useThemedStyles } from "../../lib/theme-context";
import {
  OnboardingSlideLayout,
  OnboardingStickerText,
  OnboardingButton,
} from "../../components/onboarding/OnboardingKit";
import {
  OnboardingNotifications,
  type OnboardingNotificationsHandle,
} from "../../components/onboarding/OnboardingNotifications";

export default function OnboardingNotificationsScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { groupId, groupName } = useLocalSearchParams<{ groupId: string; groupName: string }>();
  const notifRef = useRef<OnboardingNotificationsHandle>(null);
  const [loading, setLoading] = useState(false);

  // Persiste les préférences de notifications en BDD avant de passer à la suite.
  const handleValidate = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await notifRef.current?.save();
    } catch {
      // on continue quand même : l'utilisateur pourra régler ça dans les paramètres
    } finally {
      setLoading(false);
      router.replace({ pathname: "/(onboarding)/done", params: { groupId, groupName } });
    }
  };

  return (
    <OnboardingSlideLayout
      top={
        <>
          <OnboardingStickerText text={"Gère tes propres\n[notifications]"} />
          <View style={styles.section}>
            <OnboardingNotifications ref={notifRef} />
          </View>
        </>
      }
      footer={<OnboardingButton label="Valider" onPress={handleValidate} active loading={loading} />}
    />
  );
}

const makeStyles = (_colors: ThemeColors) =>
  StyleSheet.create({
    section: {
      alignSelf: "stretch",
      marginTop: spacing.xl3, // space/1200 sous le texte
    },
  });
