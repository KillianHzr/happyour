import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import Loader from "../../components/Loader";
import { View, StyleSheet } from "react-native";
import { type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";

export default function OnboardingLayout() {
  const { session, loading } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  // Le groupe onboarding (slider de bienvenue, etc.) ne dépend QUE de la session :
  // on l'affiche aussi bien aux nouveaux comptes (profil incomplet) qu'aux comptes
  // déjà complets qui viennent de cliquer « Démarrer » (signup). Les profils
  // complets en connexion normale sont, eux, routés vers l'app par index.tsx /
  // (app)/_layout / adminlogin — ils n'arrivent jamais ici par accident.
  useEffect(() => {
    if (!loading && !session) {
      router.replace("/(auth)/intro");
    }
  }, [session, loading]);

  if (loading || !session) {
    return (
      <View style={styles.container}>
        <Loader size={40} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false, // Prevents skipping steps on iOS back-swipe
        animation: "slide_from_right",
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
  },
});
