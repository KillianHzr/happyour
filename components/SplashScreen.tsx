import { useEffect, useRef, useState } from "react";
import { Text, StyleSheet, Animated, Easing } from "react-native";
import { Image } from "expo-image";
import { GRADIENT_ORANGE } from "../lib/assets";
import { textStyles } from "../lib/theme";
import Logo from "../assets/logo.svg";

interface SplashScreenProps {
  onFinish: () => void;
  ready: boolean;
}

// Durée minimale d'affichage du logo avant le fondu de sortie.
const MIN_DISPLAY_MS = 900;

export default function SplashScreen({ onFinish, ready }: SplashScreenProps) {
  const [minElapsed, setMinElapsed] = useState(false);

  const logoOpacity = useRef(new Animated.Value(0)).current; // entrée du logo
  const fadeOut = useRef(new Animated.Value(1)).current;     // fondu final

  // Apparition du logo + temps minimum d'affichage.
  useEffect(() => {
    Animated.timing(logoOpacity, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    const t = setTimeout(() => setMinElapsed(true), MIN_DISPLAY_MS);
    return () => clearTimeout(t);
  }, []);

  // Sortie : une fois l'app prête ET le temps minimum écoulé, fondu puis onFinish.
  useEffect(() => {
    if (!ready || !minElapsed) return;
    Animated.timing(fadeOut, {
      toValue: 0,
      duration: 400,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => onFinish());
  }, [ready, minElapsed]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}>
      <Image source={GRADIENT_ORANGE} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />

      {/* Logo central */}
      <Animated.View style={[styles.center, { opacity: logoOpacity }]} pointerEvents="none">
        <Logo width={199.161} height={80} />
      </Animated.View>

      <Text style={styles.studio}>Source STUDIO</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
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
