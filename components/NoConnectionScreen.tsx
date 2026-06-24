import { View, Text, StyleSheet } from "react-native";
import { textStyles } from "../lib/theme";
import AppLoader from "./AppLoader";

/**
 * Écran "pas de connexion" : même esprit que le splash, mais SANS image de fond (impossible
 * à charger hors-ligne) → fond orange de marque uni + loader Lottie (LOADERv2) + message.
 * Affiché à la place de l'onboarding quand l'appareil est hors-ligne.
 */
export default function NoConnectionScreen() {
  return (
    <View style={styles.container}>
      <AppLoader />
      <Text style={styles.title}>Pas de connexion internet</Text>
      <Text style={styles.subtitle}>Vérifie ta connexion et réessaie.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FF561A", // background/brand uni (pas d'image hors-ligne)
    paddingHorizontal: 32,
    gap: 8,
  },
  title: {
    ...textStyles.subtitleStrong,
    color: "#FFFFFF",
    textAlign: "center",
  },
  subtitle: {
    ...textStyles.bodyBase,
    color: "#FFFFFF",
    textAlign: "center",
    opacity: 0.9,
  },
});
