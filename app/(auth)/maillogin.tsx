import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { translateError } from "../../lib/error-messages";
import { typography, type ThemeColors } from "../../lib/theme";
import { useThemedStyles } from "../../lib/theme-context";
import { isReviewEmail } from "../../lib/review-account";
import {
  OnboardingScreen,
  OnboardingTitle,
  OnboardingTextField,
  OnboardingButton,
} from "../../components/onboarding/OnboardingKit";

export default function MailLoginScreen() {
  const router = useRouter();
  const { sendOtp } = useAuth();
  const { showToast } = useToast();
  const styles = useThemedStyles(makeStyles);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const isEmailEntered = email.trim().length > 0;

  const handleSendOtp = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      return showToast("Veuillez rentrer un mail valide.", undefined, "error");
    }

    setLoading(true);
    try {
      const formattedEmail = email.trim().toLowerCase();
      // Compte de démo Apple : pas d'OTP, on affiche l'écran de connexion par mot
      // de passe (le testeur saisit le mot de passe fourni dans App Store Connect).
      if (isReviewEmail(formattedEmail)) {
        router.push({ pathname: "/(auth)/password", params: { email: formattedEmail } });
        return;
      }
      await sendOtp(formattedEmail);
      showToast("Code de vérification envoyé par mail.", undefined, "success");
      router.push({
        pathname: "/(auth)/codeverif",
        params: { email: formattedEmail },
      });
    } catch (e: any) {
      console.error("[sendOtp] erreur brute Supabase:", e?.message ?? e);
      showToast(translateError(e.message), undefined, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <OnboardingScreen title={<OnboardingTitle prefix={"T’as juste à rentrer\nton"} sticker="mail" />}>
      <OnboardingTextField
        placeholder="ex. hello@disclose.com"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        autoComplete="email"
        editable={!loading}
      />

      <OnboardingButton
        label="Valider"
        onPress={handleSendOtp}
        active={isEmailEntered}
        loading={loading}
      />

      {__DEV__ && (
        <View style={styles.devContainer}>
          <TouchableOpacity
            style={styles.devButton}
            onPress={() => {
              router.push({
                pathname: "/(auth)/codeverif",
                params: { email: email.trim() || "dev@test.com" },
              });
            }}
          >
            <Text style={styles.devButtonText}>[DEV] Passer à l'étape suivante</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.devButton} onPress={() => router.push("/(auth)/adminlogin")}>
            <Text style={styles.devButtonText}>[DEV] Admin Login (Mot de passe)</Text>
          </TouchableOpacity>
        </View>
      )}
    </OnboardingScreen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    devContainer: {
      marginTop: 12,
      gap: 8,
      width: "100%",
    },
    devButton: {
      height: 48,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.borderNeutralSecondary,
      borderStyle: "dashed",
    },
    devButtonText: {
      fontFamily: typography.family.semibold,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
  });
