import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { GRADIENT_ORANGE } from "../lib/assets";
import { textStyles } from "../lib/theme";
import AppLoader from "./AppLoader";

/**
 * Écran de chargement de marque : même visuel que le splash (dégradé orange + "Source STUDIO")
 * avec le loader Lottie (LOADERv2) au centre. Utilisé pour tous les états de chargement plein
 * écran (résolution auth/groupe, fetch des données d'un groupe…) afin d'éviter toute page
 * blanche avec un spinner gris entre le splash et le contenu réel.
 */
export default function LoadingScreen() {
  return (
    <View style={styles.container}>
      <Image source={GRADIENT_ORANGE} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
      <AppLoader />
      <Text style={styles.studio}>Source STUDIO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    // Fond orange de marque : fallback si l'image dégradé ne charge pas (jamais d'écran nu).
    backgroundColor: "#FF561A",
  },
  studio: {
    ...textStyles.bodySmallStrong,
    position: "absolute",
    bottom: 60,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#FFFFFF",
  },
});
