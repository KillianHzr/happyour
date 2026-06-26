import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { translateError } from "../../lib/error-messages";
import { typography, textStyles, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import {
  OnboardingScreen,
  OnboardingTitle,
  OnboardingHighlight,
  OnboardingTextField,
  OnboardingButton,
} from "../../components/onboarding/OnboardingKit";

export default function CodeVerifScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const { sendOtp, verifyOtp, bypassAuthDev } = useAuth();
  const { showToast } = useToast();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  // Cooldown anti-spam : Supabase impose ~60s entre deux envois de code pour
  // la même adresse. On démarre le compte à rebours dès l'arrivée sur l'écran
  // (un code vient d'être envoyé) puis après chaque renvoi.
  const [cooldown, setCooldown] = useState(60);

  const isOtpEntered = otp.trim().length === 8;
  const canResend = cooldown === 0 && !loading;

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleDevBypass = async (isExisting: boolean) => {
    try {
      await bypassAuthDev(isExisting);
      showToast("Authentification simulée.", undefined, "success");
      router.replace(isExisting ? "/(app)/groups" : "/(onboarding)/intro");
    } catch (e: any) {
      showToast(e.message, undefined, "error");
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length < 8) {
      return showToast("Veuillez entrer le code à 8 chiffres.", undefined, "info");
    }
    if (!email) {
      return showToast("Email manquant, veuillez recommencer.", undefined, "error");
    }

    setLoading(true);
    try {
      const { hasOnboarded } = await verifyOtp(email, otp.trim());
      showToast("Validation réussie !", undefined, "success");
      // Parcours unique (peu importe le bouton « Démarrer » / « Déjà un compte ? ») :
      // a déjà fait l'onboarding → connexion, on entre dans l'app ;
      // sinon (nouveau compte) → slider d'onboarding.
      router.replace(hasOnboarded ? "/(app)/groups" : "/(onboarding)/intro");
    } catch (e: any) {
      showToast(translateError(e.message), undefined, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!email || !canResend) return;
    setLoading(true);
    try {
      await sendOtp(email);
      setCooldown(60);
      showToast("Un nouveau code de vérification a été envoyé.", undefined, "success");
    } catch (e: any) {
      showToast(translateError(e.message), undefined, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <OnboardingScreen
      title={
        <OnboardingTitle
          prefix={"Rentre simplement\nton"}
          sticker="code"
          description={<>Un code a été envoyé à <OnboardingHighlight>{email}</OnboardingHighlight></>}
        />
      }
    >
      <OnboardingTextField
        placeholder="ex. 12345678"
        autoCapitalize="none"
        keyboardType="number-pad"
        value={otp}
        onChangeText={(t) => setOtp(t.replace(/[^0-9]/g, ""))}
        maxLength={8}
        editable={!loading}
      />

      <TouchableOpacity
        onPress={handleResendOtp}
        disabled={!canResend}
        style={styles.resendBtn}
        activeOpacity={0.7}
      >
        <Text style={[styles.resendText, !canResend && styles.resendTextDisabled]}>
          {cooldown > 0 ? `Renvoyer un code (${cooldown}s)` : "Renvoyer un code"}
        </Text>
      </TouchableOpacity>

      <OnboardingButton
        label="Valider"
        onPress={handleVerifyOtp}
        active={isOtpEntered}
        loading={loading}
        disabled={!isOtpEntered}
      />

      {__DEV__ && (
        <View style={styles.devContainer}>
          <TouchableOpacity style={styles.devButton} onPress={() => handleDevBypass(false)}>
            <Text style={styles.devButtonText}>[DEV] Passer (Nouveau compte)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.devButton} onPress={() => handleDevBypass(true)}>
            <Text style={styles.devButtonText}>[DEV] Passer (Compte existant)</Text>
          </TouchableOpacity>
        </View>
      )}
    </OnboardingScreen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    resendBtn: {
      paddingVertical: 8,
      alignSelf: "center",
    },
    resendText: {
      ...textStyles.singleLineBodyBaseStrong,
      color: colors.text,
      textAlign: "center",
    },
    resendTextDisabled: {
      color: colors.secondary,
    },
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
