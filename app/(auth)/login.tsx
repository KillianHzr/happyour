import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Link, router } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { translateError } from "../../lib/error-messages";
import { radii, typography, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import Loader from "../../components/Loader";

export default function LoginScreen() {
  const { login, resetPassword } = useAuth();
  const { showToast } = useToast();
  const { colors, theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return showToast("Erreur", "Remplis tous les champs.");
    setLoading(true);
    try {
      await login(email, password);
      router.replace("/");
    } catch (e: any) {
      showToast("Erreur", translateError(e.message));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) return showToast("Attention", "Entre ton email pour réinitialiser ton mot de passe.");
    setLoading(true);
    try {
      await resetPassword(email);
      showToast("Succès", "Un email de réinitialisation a été envoyé.");
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
      <View style={styles.logoMark} />
      <Text style={styles.title}>Disclose</Text>
      <Text style={styles.subtitle}>Espace membre privé</Text>

      <View style={styles.form}>
        <TextInput
          style={[theme.glassInput, styles.input]}
          placeholder="Email"
          placeholderTextColor={colors.secondary}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={[theme.glassInput, styles.input]}
          placeholder="Mot de passe"
          placeholderTextColor={colors.secondary}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={styles.forgotBtn} onPress={handleResetPassword}>
          <Text style={styles.forgotText}>Mot de passe oublié ?</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[theme.accentButton, styles.button]} onPress={handleLogin} disabled={loading}>
          {loading ? (
            <Loader size={20} />
          ) : (
            <Text style={theme.accentButtonText}>Se connecter</Text>
          )}
        </TouchableOpacity>
      </View>

      <Link href="/(auth)/register" asChild>
        <TouchableOpacity style={styles.linkBtn}>
          <Text style={styles.link}>Pas encore invité ? S'inscrire</Text>
        </TouchableOpacity>
      </Link>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, justifyContent: "center", paddingHorizontal: 40, backgroundColor: colors.bg },
  logoMark: {
    width: 32,
    height: 32,
    borderWidth: 2,
    borderColor: colors.text,
    borderRadius: radii.xs,
    marginBottom: 24,
    transform: [{ rotate: "45deg" }],
    alignSelf: "center",
  },
  title: {
    fontFamily: typography.family.bold,
    fontSize: typography.size.subtitle,
    textAlign: "center",
    marginBottom: 8,
    color: colors.text,
    letterSpacing: -1,
    textTransform: "lowercase",
  },
  subtitle: {
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    textAlign: "center",
    color: colors.secondary,
    marginBottom: 48,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  form: { width: "100%" },
  input: { marginBottom: 16 },
  button: { marginTop: 12, height: 58, justifyContent: "center" },
  linkBtn: { marginTop: 32, alignItems: "center" },
  link: { fontFamily: typography.family.regular, color: colors.secondary, fontSize: typography.size.xs, textDecorationLine: "underline" },
  forgotBtn: { alignSelf: "flex-end", marginBottom: 24, marginTop: -8 },
  forgotText: { fontFamily: typography.family.regular, color: colors.secondary, fontSize: typography.size.xs, opacity: 0.8 },
});
