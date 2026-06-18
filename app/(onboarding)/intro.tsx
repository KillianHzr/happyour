import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { spacing, radii, typography, textStyles, type ThemeColors } from "../../lib/theme";
import Svg, { Path, Circle } from "react-native-svg";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const SLIDES = [
  {
    id: 1,
    title: "Partage tes moments",
    description: "Capture chaque Happy Hour et partage-les avec ton groupe d'amis proches.",
    icon: (color: string) => (
      <Svg width={120} height={120} viewBox="0 0 24 24" fill="none">
        <Path
          d="M12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21Z"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16Z"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx={12} cy={12} r={1} fill={color} />
      </Svg>
    ),
  },
  {
    id: 2,
    title: "Débloque des stickers",
    description: "Plus tu participes, plus tu collectionnes des stickers uniques pour décorer tes photos.",
    icon: (color: string) => (
      <Svg width={120} height={120} viewBox="0 0 24 24" fill="none">
        <Path
          d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
          stroke={color}
          strokeWidth={1.5}
        />
        <Path
          d="M8 14C8 14 9.5 16 12 16C14.5 16 16 14 16 14"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        <Circle cx={9} cy={9} r={1.5} fill={color} />
        <Circle cx={15} cy={9} r={1.5} fill={color} />
      </Svg>
    ),
  },
  {
    id: 3,
    title: "Garde le contact",
    description: "Rejoins des salons de discussion vocaux et écrits pour ne jamais rater une occasion.",
    icon: (color: string) => (
      <Svg width={120} height={120} viewBox="0 0 24 24" fill="none">
        <Path
          d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    ),
  },
];

export default function OnboardingIntroScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [currentStep, setCurrentStep] = useState(0);

  const slide = SLIDES[currentStep];
  const isLastStep = currentStep === SLIDES.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      // Navigate to username step (or next onboarding screen)
      router.push("/(onboarding)/username");
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Skip button */}
      <View style={styles.header}>
        {!isLastStep && (
          <TouchableOpacity
            onPress={() => router.push("/(onboarding)/username")}
            style={styles.skipBtn}
          >
            <Text style={styles.skipText}>Passer</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Main Slide Content */}
      <View style={styles.slideContent}>
        <View style={styles.iconContainer}>{slide.icon(colors.brand)}</View>

        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.description}>{slide.description}</Text>
      </View>

      {/* Footer (Dots + Button) */}
      <View style={styles.footer}>
        {/* Progress Indicators */}
        <View style={styles.indicators}>
          {SLIDES.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                index === currentStep && styles.activeDot,
              ]}
            />
          ))}
        </View>

        {/* Action Button */}
        <TouchableOpacity
          style={styles.button}
          onPress={handleNext}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>
            {isLastStep ? "C'est parti !" : "Suivant"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    height: 48,
    paddingHorizontal: 24,
    justifyContent: "center",
    alignItems: "flex-end",
  },
  skipBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  skipText: {
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    color: colors.secondary,
  },
  slideContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    gap: spacing.lg, // space/400
  },
  iconContainer: {
    marginBottom: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    ...textStyles.heading,
    color: colors.text,
    textAlign: "center",
  },
  description: {
    ...textStyles.bodyBase,
    color: colors.secondary,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 10,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: spacing.xl,
    alignItems: "center",
  },
  indicators: {
    flexDirection: "row",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.bgNeutralTertiary,
  },
  activeDot: {
    width: 24,
    backgroundColor: colors.brand,
  },
  button: {
    backgroundColor: colors.brand,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: "center",
    width: "100%",
  },
  buttonText: {
    ...textStyles.singleLineSubheadingStrong,
    color: colors.textBrandOnBrandSecondary,
    lineHeight: undefined,
  },
});
