import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import {
  AVATAR_LEO, AVATAR_KILLIAN, AVATAR_MEL, AVATAR_THEO, AVATAR_HUGO, AVATAR_AXEL,
} from "../../lib/onboarding-assets";

// Images des membres (ordre du SVG GroupAvatar).
const IMAGES = {
  leo: AVATAR_LEO,
  killian: AVATAR_KILLIAN,
  mel: AVATAR_MEL,
  theo: AVATAR_THEO,
  hugo: AVATAR_HUGO,
  axel: AVATAR_AXEL,
};

// Géométrie issue de GroupAvatar.svg (canvas 300 × 216).
const SMALL = 48;
const SMALL_R = 12;
// Centre du grand carré (132×132 à (84,84)) → (150,150). Position "imploded" des
// petits carrés = centrés derrière le grand carré.
const CENTER = 150 - SMALL / 2; // 126

// Petits carrés 2→6 (qui explosent depuis le centre).
const SMALLS = [
  { x: 0,     y: 115.5, src: IMAGES.killian }, // 2
  { x: 28.5,  y: 28.5,  src: IMAGES.mel },     // 3
  { x: 126,   y: 0,     src: IMAGES.theo },    // 4
  { x: 223.5, y: 28.5,  src: IMAGES.hugo },    // 5
  { x: 252,   y: 126,   src: IMAGES.axel },    // 6
];

/**
 * Grille d'avatars du slider d'onboarding.
 * - Apparition (`active` true) : les petits carrés jaillissent du centre (derrière
 *   le grand carré) façon explosion + fondu de tout l'ensemble.
 * - Disparition (`active` false) : l'inverse (implosion + fondu).
 */
export function GroupAvatarReveal({ active }: { active: boolean }) {
  // Démarrent à 0 pour que l'explosion + le fondu jouent dès le montage (slide 1).
  const fade = useRef(new Animated.Value(0)).current;
  const explode = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: active ? 1 : 0,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(explode, {
        toValue: active ? 1 : 0,
        useNativeDriver: true,
        damping: 12,
        stiffness: 120,
        mass: 0.8,
      }),
    ]).start();
  }, [active]);

  return (
    <Animated.View style={[styles.container, { opacity: fade }]}>
      {SMALLS.map((s, i) => {
        const translateX = explode.interpolate({ inputRange: [0, 1], outputRange: [CENTER - s.x, 0] });
        const translateY = explode.interpolate({ inputRange: [0, 1], outputRange: [CENTER - s.y, 0] });
        const scale = explode.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
        return (
          <Animated.View
            key={i}
            style={[styles.small, { left: s.x, top: s.y, transform: [{ translateX }, { translateY }, { scale }] }]}
          >
            <Image source={s.src} style={styles.img} contentFit="cover" />
          </Animated.View>
        );
      })}

      {/* Grand carré (Leo) — au-dessus, fixe : les petits partent de derrière lui. */}
      <View style={styles.big}>
        <Image source={IMAGES.leo} style={styles.img} contentFit="cover" />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 300,
    height: 216,
  },
  small: {
    position: "absolute",
    width: SMALL,
    height: SMALL,
    borderRadius: SMALL_R,
    overflow: "hidden",
  },
  big: {
    position: "absolute",
    left: 84,
    top: 84,
    width: 132,
    height: 132,
    borderRadius: 30,
    overflow: "hidden",
  },
  img: {
    width: "100%",
    height: "100%",
  },
});
