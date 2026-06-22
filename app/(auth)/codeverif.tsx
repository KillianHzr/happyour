import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  SafeAreaView,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { translateError } from "../../lib/error-messages";
import { spacing, radii, typography, textStyles, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import Loader from "../../components/Loader";
import { DiscloseIcon } from "../../components/atoms/DiscloseIcon";
import Icon from "../../components/Icon";

export default function CodeVerifScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const { sendOtp, verifyOtp, bypassAuthDev } = useAuth();
  const { showToast } = useToast();
  const { colors, theme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
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
      if (isExisting) {
        router.replace("/(app)/groups");
      } else {
        router.replace("/(onboarding)/intro");
      }
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
      const isComplete = await verifyOtp(email, otp.trim());
      showToast("Validation réussie !", undefined, "success");
      
      if (isComplete) {
        router.replace("/(app)/groups");
      } else {
        router.replace("/(onboarding)/intro");
      }
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* Top Header Back Button */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <Icon name="chevron-left" size={20} color={colors.iconNeutral} />
          </TouchableOpacity>
        </View>

        {/* Global Centered View */}
        <View style={styles.centerContainer}>
          {/* Header block with Logo and Title */}
          <View style={styles.headerBlock}>
            <Text style={styles.subtitleStrongText}>
              Rentre simplement ton{" "}
              <View style={styles.codeStickerContainer}>
                <Text style={styles.codeSticker}>Code</Text>
              </View>
            </Text>
            <Text style={styles.description}>
              Un code a été envoyé à{" "}
              <Text style={styles.highlightText}>{email}</Text>
            </Text>
          </View>

          {/* Form Block with inputs and button spaced/400 (spacing.lg = 16) */}
          <View style={styles.formBlock}>
            <TextInput
              style={[
                theme.glassInput,
                styles.input,
                styles.otpInput,
                isFocused && { borderColor: colors.borderBrandSecondary }
              ]}
              placeholder="00 000 000"
              placeholderTextColor={colors.secondary}
              autoCapitalize="none"
              keyboardType="number-pad"
              value={otp}
              onChangeText={setOtp}
              maxLength={8}
              editable={!loading}
              selectTextOnFocus
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
            />

            <TouchableOpacity
              onPress={handleResendOtp}
              disabled={!canResend}
              style={styles.resendBtn}
              activeOpacity={0.7}
            >
              <Text style={[styles.resendText, !canResend && styles.resendTextDisabled]}>
                {cooldown > 0 ? `Renvoyer le code (${cooldown}s)` : "Renvoyer le code"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: isOtpEntered ? colors.brand : colors.bgNeutralTertiary }
              ]}
              onPress={handleVerifyOtp}
              disabled={loading || !isOtpEntered}
              activeOpacity={0.85}
            >
              {loading ? (
                <Loader size={20} />
              ) : (
                <Text style={[
                  styles.buttonText,
                  { color: isOtpEntered ? colors.textBrandOnBrandSecondary : colors.textOnDisabled }
                ]}>
                  Valider
                </Text>
              )}
            </TouchableOpacity>

            {__DEV__ && (
              <View style={styles.devContainer}>
                <TouchableOpacity
                  style={styles.devButton}
                  onPress={() => handleDevBypass(false)}
                >
                  <Text style={styles.devButtonText}>[DEV] Passer (Nouveau compte)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.devButton}
                  onPress={() => handleDevBypass(true)}
                >
                  <Text style={styles.devButtonText}>[DEV] Passer (Compte existant)</Text>
                </TouchableOpacity>
              </View>
            )}

            
          </View>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    height: 48,
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    justifyContent: "center",
    alignItems: "center",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    marginTop: -40,
    gap: spacing.xl3, // space/1200 (48) gap between header block and form block
  },
  headerBlock: {
    alignItems: "center",
    width: "100%",
  },
  logo: {
    marginBottom: 20,
  },
  titleWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    marginTop: 8,
    marginBottom: 8,
    gap: 8,
  },
  subtitleStrongText: {
    ...textStyles.subtitleStrong,
    color: colors.text,
    textAlign: "center",
    lineHeight: Math.round(typography.size.subtitle * 1.2),
  },
  codeStickerContainer: {
    transform: [{ rotate: "2.5deg" }],
    marginHorizontal: 4,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.xs2,
    paddingVertical: 0, // Compensated for built-in font leading (visual spacing = 8px)
    justifyContent: "center",
    alignItems: "center",
  },
  codeSticker: {
    color: "#FFFFFF",
    fontFamily: typography.family.bold,
    fontSize: typography.size.subtitle,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  description: {
    ...textStyles.bodyBase,
    color: colors.secondary,
    textAlign: "center",
    marginTop: 8,
  },
  highlightText: {
    color: colors.text,
    fontFamily: typography.family.semibold,
  },
  formBlock: {
    width: "100%",
    gap: spacing.lg, // space/400 (16) gap between inputs
  },
  input: {
    height: 56,
  },
  otpInput: {
    textAlign: "center",
    fontSize: typography.size.lg,
    letterSpacing: 8,
    fontFamily: typography.family.bold,
  },
  button: {
    height: 56,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: radii.lg,
    width: "100%",
  },
  buttonText: {
    ...textStyles.singleLineSubheadingStrong,
    lineHeight: undefined,
  },
  secondaryActions: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 12,
    paddingHorizontal: 4,
  },
  resendBtn: {
    paddingVertical: radii.sm,
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
  changeEmailBtn: {
    paddingVertical: 6,
  },
  changeEmailText: {
    fontFamily: typography.family.regular,
    color: colors.secondary,
    fontSize: typography.size.xs,
    opacity: 0.8,
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
    borderRadius: radii.lg,
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
