import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
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
import { TextSticker } from "../../components/atoms/TextSticker";
import { DiscloseIcon } from "../../components/atoms/DiscloseIcon";
import Icon from "../../components/Icon";

export default function AdminLoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const { showToast } = useToast();
  const { colors, theme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

  const isFormFilled = email.trim().length > 0 && password.trim().length > 0;

  const handlePasswordLogin = async () => {
    if (!email || !password) {
      return showToast("Attention", "Veuillez remplir tous les champs.");
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return showToast("Erreur", "Veuillez entrer une adresse email valide.");
    }

    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      showToast("Succès", "Connexion réussie !");
      // The router index will handle redirect to (app)/groups or onboarding depending on profileComplete
      router.replace("/");
    } catch (e: any) {
      showToast("Erreur", translateError(e.message));
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
            <DiscloseIcon style={styles.logo} />
            <View style={styles.titleWrapper}>
              <Text style={styles.subtitleStrongText}>T’as juste à te </Text>
              <TextSticker text="CONNECTER" fontSize={16} />
            </View>
          </View>

          {/* Form Block with inputs and button spaced/400 (spacing.lg = 16) */}
          <View style={styles.formBlock}>
            <TextInput
              style={[
                theme.glassInput,
                styles.input,
                isEmailFocused && { borderColor: colors.borderBrandSecondary }
              ]}
              placeholder="Email"
              placeholderTextColor={colors.secondary}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              autoComplete="email"
              editable={!loading}
              onFocus={() => setIsEmailFocused(true)}
              onBlur={() => setIsEmailFocused(false)}
            />

            <TextInput
              style={[
                theme.glassInput,
                styles.input,
                isPasswordFocused && { borderColor: colors.borderBrandSecondary }
              ]}
              placeholder="Mot de passe"
              placeholderTextColor={colors.secondary}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              autoComplete="password"
              editable={!loading}
              onFocus={() => setIsPasswordFocused(true)}
              onBlur={() => setIsPasswordFocused(false)}
            />

            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: isFormFilled ? colors.brand : colors.bgNeutralTertiary }
              ]}
              onPress={handlePasswordLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <Loader size={20} />
              ) : (
                <Text style={[
                  styles.buttonText,
                  { color: isFormFilled ? colors.textBrandOnBrandSecondary : colors.textOnDisabled }
                ]}>
                  Valider
                </Text>
              )}
            </TouchableOpacity>
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
    gap: spacing.xl3, // space/1200
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
  },
  formBlock: {
    width: "100%",
    gap: spacing.lg, // space/400
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
});
