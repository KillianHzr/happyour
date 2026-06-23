import React from "react";
import { View, StyleSheet } from "react-native";
import LottieView from "lottie-react-native";

/**
 * Loader principal de l'app (écran de chargement après le splash screen).
 * Utilise l'animation Lottie `assets/lotties/LOADERv2.json`.
 * Pour les petits spinners inline (boutons), utiliser `Loader` (anneau).
 */
export default function AppLoader({ size = 140 }: { size?: number }) {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <LottieView
        source={require("../assets/lotties/LOADERv2.json")}
        autoPlay
        loop
        style={{ width: size, height: size }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
});
