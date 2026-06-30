import { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Animated, Dimensions } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth-context";
import { useThemedStyles } from "../../lib/theme-context";
import { radii, type ThemeColors } from "../../lib/theme";
import {
  ONBOARDING_TOP_OFFSET,
  ONBOARDING_SCALE,
  ONBOARDING_SHORT,
  OnboardingStickerText,
  OnboardingButton,
} from "../../components/onboarding/OnboardingKit";
import { GroupAvatarReveal } from "../../components/onboarding/GroupAvatarReveal";
import { ShapesFormsReveal } from "../../components/onboarding/ShapesFormsReveal";
import { OnboardingRevealStats } from "../../components/onboarding/OnboardingRevealStats";
import { GROUP_SHAPE } from "../../lib/onboarding-assets";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Suite de l'onboarding (après création du compte) : 3 slides de présentation.
const SLIDES: { text: string; rotate?: string; stickerY?: number }[] = [
  { text: "Partage le quotidien\navec tes [proches]" },
  { text: "Tous vos moments patientent dans votre\n[groupe] commun", rotate: "-2deg" },
  { text: "Tout est [révélé] en fin\nde semaine", stickerY: 0 },
];

const FADE_MS = 200;
const OFFSET = 56;

// Slide 2 : illustration GroupShape en pleine largeur (fondu lié à la slide active).
function GroupShapeLayer({ active }: { active: boolean }) {
  const op = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(op, { toValue: active ? 1 : 0, duration: 300, useNativeDriver: true }).start();
  }, [active]);
  return (
    <Animated.View style={{ opacity: op, width: SCREEN_WIDTH, aspectRatio: 402 / 283 }}>
      <Image source={GROUP_SHAPE} style={{ width: "100%", height: "100%" }} contentFit="cover" />
    </Animated.View>
  );
}

// Slide 3 : stats (nombre de moments + countdown), 16px sous les shapes. Fondu lié à la slide.
function RevealStatsLayer({ active }: { active: boolean }) {
  const op = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(op, { toValue: active ? 1 : 0, duration: 300, useNativeDriver: true }).start();
  }, [active]);
  return (
    <Animated.View style={{ opacity: op, alignSelf: "stretch", marginTop: 16 }}>
      <OnboardingRevealStats />
    </Animated.View>
  );
}

export default function OnboardingIntroScreen() {
  const router = useRouter();
  const { markOnboarded } = useAuth();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);
  const animating = useRef(false);

  const isLast = index === SLIDES.length - 1;

  const goNext = () => {
    if (animating.current) return;
    animating.current = true;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -OFFSET, duration: FADE_MS, useNativeDriver: true }),
    ]).start(() => {
      setIndex((i) => i + 1);
      translateY.setValue(OFFSET);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: FADE_MS, useNativeDriver: true }),
      ]).start(() => {
        animating.current = false;
      });
    });
  };

  const handleNext = () => {
    if (isLast) {
      markOnboarded();
      router.push("/(onboarding)/photo");
      return;
    }
    goNext();
  };

  return (
    <View style={styles.container}>
      {/* Texte (160px du haut), transition masquée verticale */}
      <View style={styles.top}>
        <View style={styles.mask}>
          <Animated.View style={{ opacity, transform: [{ translateY }] }}>
            <OnboardingStickerText
              text={SLIDES[index].text}
              rotate={SLIDES[index].rotate}
              stickerY={SLIDES[index].stickerY}
            />
          </Animated.View>
        </View>
      </View>

      {/* Illustrations (pleine largeur) superposées, une par slide.
          Sur écran très court (iPad compat iPhone), on masque les illustrations
          des slides 2 et 3 qui chevauchent le texte — cf. ONBOARDING_SHORT. */}
      <View style={styles.illustration}>
        <View style={[styles.illoLayer, ONBOARDING_SHORT && styles.illoLayerShort]} pointerEvents="none">
          <GroupAvatarReveal active={index === 0} />
        </View>
        {!ONBOARDING_SHORT && (
          <View style={styles.illoLayer} pointerEvents="none">
            <GroupShapeLayer active={index === 1} />
          </View>
        )}
        <View style={styles.illoLayer} pointerEvents="none">
          <View style={styles.slide3}>
            {!ONBOARDING_SHORT && <ShapesFormsReveal active={index === 2} />}
            <RevealStatsLayer active={index === 2} />
          </View>
        </View>
      </View>

      {/* Footer fixe : pagination + bouton */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.indicators}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index ? styles.dotActive : styles.dotInactive]} />
          ))}
        </View>
        <OnboardingButton label="Suivant" onPress={handleNext} active />
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    top: {
      paddingTop: ONBOARDING_TOP_OFFSET,
      paddingHorizontal: 16,
      alignItems: "center",
      width: "100%",
    },
    mask: {
      alignSelf: "stretch",
      overflow: "hidden",
      paddingVertical: 20,
      marginVertical: -20,
      paddingHorizontal: 20,
      marginHorizontal: -20,
    },
    illustration: {
      flex: 1,
      alignSelf: "stretch",
    },
    illoLayer: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "center",
      alignItems: "center",
      // Réduit les illustrations (taille fixe) sur les écrans courts pour qu'elles
      // ne débordent pas sur le titre — cf. iPad en mode compatibilité iPhone.
      transform: [{ scale: ONBOARDING_SCALE }],
    },
    // Slide 1 sur écran court : on descend un peu l'illustration pour aérer
    // l'espace entre le titre et les avatars.
    illoLayerShort: {
      paddingTop: 96,
    },
    slide3: {
      alignItems: "center",
      paddingHorizontal: 16,
      alignSelf: "stretch",
    },
    footer: {
      paddingHorizontal: 16,
      alignItems: "center",
    },
    indicators: {
      flexDirection: "row",
      paddingVertical: 8,
      paddingHorizontal: 12,
      justifyContent: "center",
      alignItems: "center",
      gap: 6,
      marginBottom: 40,
    },
    dot: {
      width: 12,
      height: 12,
      flexShrink: 0,
      borderRadius: radii.full,
    },
    dotActive: {
      backgroundColor: colors.iconBrandTertiary,
    },
    dotInactive: {
      backgroundColor: colors.iconTertiary,
    },
  });
