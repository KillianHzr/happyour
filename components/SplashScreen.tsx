import { useEffect, useRef, useState } from "react";
import { Text, StyleSheet, Animated, Easing } from "react-native";
import { Image } from "expo-image";
import { GRADIENT_ORANGE } from "../lib/assets";
import { textStyles } from "../lib/theme";
import Shape from "./Shape";
import Logo from "../assets/logo.svg";

interface SplashScreenProps {
  onFinish: () => void;
  ready: boolean;
}

// Durée minimale d'affichage du logo (phase 1) avant de passer au loader (phase 2).
const LOGO_MS = 900;
// Durée minimale du loader (phase 2) une fois l'app prête, avant le fondu de sortie.
const LOADER_MIN_MS = 500;

export default function SplashScreen({ onFinish, ready }: SplashScreenProps) {
  const [phase, setPhase] = useState<"logo" | "loader">("logo");

  const logoOpacity = useRef(new Animated.Value(0)).current;   // entrée + cross-fade sortie
  const shapeOpacity = useRef(new Animated.Value(0)).current;  // cross-fade entrée loader
  const shapePulse = useRef(new Animated.Value(1)).current;    // pulsation du loader
  const fadeOut = useRef(new Animated.Value(1)).current;       // fondu final

  // Phase 1 : apparition du logo, puis bascule vers le loader après LOGO_MS.
  useEffect(() => {
    Animated.timing(logoOpacity, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    const t = setTimeout(() => setPhase("loader"), LOGO_MS);
    return () => clearTimeout(t);
  }, []);

  // Phase 2 : cross-fade logo → shape photo + pulsation en boucle.
  useEffect(() => {
    if (phase !== "loader") return;
    Animated.parallel([
      Animated.timing(logoOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.timing(shapeOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(shapePulse, { toValue: 1.12, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(shapePulse, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [phase]);

  // Sortie : une fois l'app prête ET le loader affiché un minimum, fondu puis onFinish.
  useEffect(() => {
    if (!ready || phase !== "loader") return;
    const t = setTimeout(() => {
      Animated.timing(fadeOut, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start(() => onFinish());
    }, LOADER_MIN_MS);
    return () => clearTimeout(t);
  }, [ready, phase]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}>
      <Image source={GRADIENT_ORANGE} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />

      {/* Marque centrale : logo (phase 1) puis shape photo (phase 2), cross-fade */}
      <Animated.View style={[styles.center, { opacity: logoOpacity }]} pointerEvents="none">
        <Logo width={120} height={48} />
      </Animated.View>
      <Animated.View style={[styles.center, { opacity: shapeOpacity }]} pointerEvents="none">
        <Animated.View style={{ transform: [{ scale: shapePulse }] }}>
          <Shape name="photo" size={70} color="#FFFFFF" />
        </Animated.View>
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
