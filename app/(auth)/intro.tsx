import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useTheme, useThemedStyles, ForceTheme } from "../../lib/theme-context";
import { spacing, radii, textStyles, type ThemeColors } from "../../lib/theme";
import { DiscloseIcon } from "../../components/atoms/DiscloseIcon";

const bgIntroField = require("../../assets/images/background-intro-field.png");

export default function IntroScreen() {
  return (
    <ForceTheme mode="Dark">
      <IntroScreenContent />
    </ForceTheme>
  );
}

function IntroScreenContent() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.container}>
      {/* Background covering the whole page */}
      <Image
        source={bgIntroField}
        style={styles.bgImage}
        contentFit="cover"
        cachePolicy="memory"
      />

      <SafeAreaView style={styles.content}>
        {/* Centered view with space/400 (spacing.lg) gap */}
        <View style={styles.centerView}>
          <DiscloseIcon />
          <Text style={styles.headingText}>
            You’ve never been this close
          </Text>
        </View>

        {/* Bottom-aligned view with space/400 (spacing.lg) gap */}
        <View style={styles.bottomView}>
          <TouchableOpacity
            onPress={() => router.push("/(auth)/maillogin")}
            activeOpacity={0.7}
            style={styles.loginLink}
          >
            <Text style={styles.loginText}>Déjà un compte ?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push("/(auth)/maillogin")}
            activeOpacity={0.85}
          >
            <Text style={styles.buttonText}>Démarrer</Text>
          </TouchableOpacity>

          <Text style={styles.termsText}>
            En continuant vous acceptez nos{" "}
            <Text style={styles.termsSpan} onPress={() => {}}>
              Termes
            </Text>{" "}
            et{" "}
            <Text style={styles.termsSpan} onPress={() => {}}>
              Politique de Confidentialité
            </Text>
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingRight: spacing.sm,
    paddingLeft: spacing.sm,
  },
  bgImage: {
    ...StyleSheet.absoluteFill,
    opacity: 0.6, // Glassmorphic blending on screen background
  },
  content: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl, // 24
    paddingTop: 60,
    paddingBottom: 20,
  },
  centerView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.lg, // space/400
  },
  headingText: {
    ...textStyles.heading,
    color: colors.text,
    textAlign: "center",
  },
  bottomView: {
    width: "100%",
    gap: spacing.lg, // space/400
    alignItems: "center",
    paddingBottom: 20,
  },
  loginLink: {
    paddingVertical: 4,
  },
  loginText: {
    ...textStyles.singleLineBodyBaseStrong,
    color: colors.text,
    
  },
  button: {
    backgroundColor: colors.brand,
    borderRadius: radii.lg,
    paddingHorizontal: 24,
    paddingVertical: 16,
    alignItems: "center",
    width: "100%",
  },
  buttonText: {
    ...textStyles.singleLineSubheadingStrong,
    color: colors.textBrandOnBrandSecondary,
    lineHeight: undefined,
  },
  termsText: {
    ...textStyles.bodyBase,
    color: colors.secondary,
    textAlign: "center",
    paddingHorizontal: 16,
    opacity: 0.8,
  },
  termsSpan: {
    ...textStyles.bodyStrong,
    color: colors.text,
  },
});
