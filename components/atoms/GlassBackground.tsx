import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import BlurView from "./BlurView";
import { glassBlurIntensity } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";

// Sur iOS, expo-blur fonctionne nativement ; sur Android on retombe sur un overlay
// sombre (géré dans l'atom BlurView). Même réglage que la page capture.
const BLUR_METHOD = Platform.OS === "ios" ? ("dimezisBlurView" as const) : ("none" as const);

interface GlassBackgroundProps {
  /** Rayon des coins — doit correspondre à celui du conteneur parent pour bien clipper. */
  radius?: number;
}

/**
 * Fond "glass" (flou + fill background/default-opacity), identique aux boutons de la
 * page capture. À placer en PREMIER enfant d'un conteneur (le contenu rendu ensuite
 * passe au-dessus). Se clippe lui-même à `radius`, donc le parent n'a pas besoin de
 * `overflow: hidden` (utile quand un élément déborde, ex. la pastille d'activité).
 */
export const GlassBackground = ({ radius = 0 }: GlassBackgroundProps) => {
  const { colors } = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }]} pointerEvents="none">
      <BlurView intensity={glassBlurIntensity} tint="dark" blurMethod={BLUR_METHOD} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.opacityLight }]} pointerEvents="none" />
    </View>
  );
};

export default GlassBackground;
