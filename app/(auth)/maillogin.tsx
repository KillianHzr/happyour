import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  SafeAreaView,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { translateError } from "../../lib/error-messages";
import { spacing, radii, typography, textStyles, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import Loader from "../../components/Loader";
import { DiscloseIcon } from "../../components/atoms/DiscloseIcon";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Icon from "../../components/Icon";

export default function MailLoginScreen() {
  const router = useRouter();
  const { sendOtp } = useAuth();
  const { showToast } = useToast();
  const { colors, theme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const isEmailEntered = email.trim().length > 0;

  const handleSendOtp = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      return showToast("Veuillez rentrer un mail valide.", undefined, "error");
    }

    setLoading(true);
    try {
      const formattedEmail = email.trim().toLowerCase();
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
              T’as juste à rentrer ton{" "}
              <View style={styles.mailStickerContainer}>
                <Text style={styles.mailSticker}>Mail</Text>
              </View>
            </Text>
          </View>

          {/* Form Block with inputs and button spaced/400 (spacing.lg = 16) */}
          <View style={styles.formBlock}>
            <TextInput
              style={[
                theme.glassInput,
                styles.input,
                isFocused && { borderColor: colors.borderBrandSecondary }
              ]}
              placeholder="Email"
              placeholderTextColor={colors.secondary}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              autoComplete="email"
              editable={!loading}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
            />

            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: isEmailEntered ? colors.brand : colors.bgNeutralTertiary }
              ]}
              onPress={handleSendOtp}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <Loader size={20} />
              ) : (
                <Text style={[
                  styles.buttonText,
                  { color: isEmailEntered ? colors.textBrandOnBrandSecondary : colors.textOnDisabled }
                ]}>
                  Valider
                </Text>
              )}
            </TouchableOpacity>

            {__DEV__ && (
              <View style={styles.devContainer}>
                <TouchableOpacity
                  style={styles.devButton}
                  onPress={() => {
                    router.push({
                      pathname: "/(auth)/codeverif",
                      params: { email: email.trim() || "dev@test.com" }
                    });
                  }}
                >
                  <Text style={styles.devButtonText}>[DEV] Passer à l'étape suivante</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.devButton}
                  onPress={() => {
                    router.push("/(auth)/adminlogin");
                  }}
                >
                  <Text style={styles.devButtonText}>[DEV] Admin Login (Mot de passe)</Text>
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
  },
  subtitleStrongText: {
    ...textStyles.subtitleStrong,
    color: colors.text,
    textAlign: "center",
    lineHeight: Math.round(typography.size.subtitle * 1.2),
  },
  mailStickerContainer: {
    transform: [{ rotate: "2.5deg" }],
    marginHorizontal: 4,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.xs2,
    paddingVertical: 0, // Compensated for built-in font leading (visual spacing = 8px)
    justifyContent: "center",
    alignItems: "center",
  },
  mailSticker: {
    color: "#FFFFFF",
    fontFamily: typography.family.bold,
    fontSize: typography.size.subtitle,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  formBlock: {
    width: "100%",
    gap: spacing.lg, // space/400 (16) gap between inputs
  },
  input: {
    height: 56,
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
