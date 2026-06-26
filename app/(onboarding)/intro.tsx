import { useRef, useState } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { useThemedStyles } from "../../lib/theme-context";
import { radii, type ThemeColors } from "../../lib/theme";
import {
  OnboardingSlideLayout,
  OnboardingStickerText,
  OnboardingButton,
} from "../../components/onboarding/OnboardingKit";

// Suite de l'onboarding (après création du compte) : 3 slides de présentation.
// Le mot entre crochets est rendu dans le sticker brand (cf. OnboardingStickerText).
const SLIDES: { text: string; rotate?: string; stickerY?: number }[] = [
  { text: "Partage le quotidien\navec tes [proches]" },
  { text: "Tous vos moments patientent dans votre\n[groupe] commun", rotate: "-2deg" },
  { text: "Tout est [révélé] en fin\nde semaine", stickerY: 0 },
];

const FADE_MS = 200; // durée d'une demi-transition (sortie ou entrée)
const OFFSET = 56;   // amplitude du translate masqué (façon cards de groupe)

export default function OnboardingIntroScreen() {
  const router = useRouter();
  const { markOnboarded } = useAuth();
  const styles = useThemedStyles(makeStyles);
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);
  const animating = useRef(false);

  const isLast = index === SLIDES.length - 1;

  // Transition « masque » (comme la sortie du contenu des cards de groupe) :
  // le texte courant fond + glisse derrière le bord du masque, puis le suivant
  // arrive depuis le bas en fondu.
  const goNext = () => {
    if (animating.current) return;
    animating.current = true;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -OFFSET, duration: FADE_MS, useNativeDriver: true }),
    ]).start(() => {
      setIndex((i) => i + 1);
      translateY.setValue(OFFSET); // le nouveau démarre depuis le bas
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
      // L'utilisateur a passé le slider → l'onboarding est validé en BDD. Même
      // s'il reste des étapes après, on ne lui réaffichera plus le slider.
      markOnboarded();
      router.push("/(onboarding)/photo");
      return;
    }
    goNext();
  };

  return (
    <OnboardingSlideLayout
      top={
        <View style={styles.mask}>
          <Animated.View style={{ opacity, transform: [{ translateY }] }}>
            <OnboardingStickerText
              text={SLIDES[index].text}
              rotate={SLIDES[index].rotate}
              stickerY={SLIDES[index].stickerY}
            />
          </Animated.View>
        </View>
      }
      footer={
        <>
          <View style={styles.indicators}>
            {SLIDES.map((_, i) => (
              <View key={i} style={[styles.dot, i === index ? styles.dotActive : styles.dotInactive]} />
            ))}
          </View>
          <OnboardingButton label="Suivant" onPress={handleNext} active />
        </>
      }
    />
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    // Masque "aspiré derrière un mur" : clippe le texte pendant le translate.
    // Le padding/-margin agrandit la zone de clip pour ne rien rogner au repos.
    mask: {
      alignSelf: "stretch",
      overflow: "hidden",
      paddingVertical: 20,
      marginVertical: -20,
      paddingHorizontal: 20,
      marginHorizontal: -20,
    },
    indicators: {
      flexDirection: "row",
      paddingVertical: 8,    // space/200
      paddingHorizontal: 12, // space/300
      justifyContent: "center",
      alignItems: "center",
      gap: 6,                // space/150
      marginBottom: 40,      // 40px au-dessus du bouton
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
