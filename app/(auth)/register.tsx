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
import { colors, radii, theme, typography } from "../../lib/theme";
import Loader from "../../components/Loader";

export default function RegisterScreen() {
  const { register } = useAuth();
  const { showToast } = useToast();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!username || !email || !password) return showToast("Erreur", "Remplis tous les champs.");
    setLoading(true);
    try {
      await register(email, password, username);
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
      <View style={styles.logoMark} />
      <Text style={styles.title}>HappyOur</Text>
      <Text style={styles.subtitle}>Créer une identité</Text>

      <View style={styles.form}>
        <TextInput
          style={[theme.glassInput, styles.input]}
          placeholder="Pseudo"
          placeholderTextColor={colors.secondary}
          autoCapitalize="none"
          value={username}
          onChangeText={setUsername}
          maxLength={30}
        />
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

        <TouchableOpacity style={[theme.accentButton, styles.button]} onPress={handleRegister} disabled={loading}>
          {loading ? (
            <Loader size={20} />
          ) : (
            <Text style={theme.accentButtonText}>Rejoindre</Text>
          )}
        </TouchableOpacity>
      </View>

      <Link href="/(auth)/login" asChild>
        <TouchableOpacity style={styles.linkBtn}>
          <Text style={styles.link}>Déjà membre ? Se connecter</Text>
        </TouchableOpacity>
      </Link>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", paddingHorizontal: 40, backgroundColor: colors.bg },
  logoMark: {
    width: 32,
    height: 32,
    borderWidth: 2,
    borderColor: colors.white,
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
});
