import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Link, router } from "expo-router";
import { useAuth } from "../../lib/auth-context";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return Alert.alert("Erreur", "Remplis tous les champs.");
    setLoading(true);
    try {
      await login(email, password);
      router.replace("/(app)/groups");
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>HappyOur</Text>
      <Text style={styles.subtitle}>Connecte-toi</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#999"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Mot de passe"
        placeholderTextColor="#999"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Connexion..." : "Se connecter"}</Text>
      </TouchableOpacity>

      <Link href="/(auth)/register" asChild>
        <TouchableOpacity style={styles.linkBtn}>
          <Text style={styles.link}>Pas encore de compte ? Inscris-toi</Text>
        </TouchableOpacity>
      </Link>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", paddingHorizontal: 32, backgroundColor: "#fff" },
  title: { fontFamily: "Inter_700Bold", fontSize: 36, textAlign: "center", marginBottom: 4 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 16, textAlign: "center", color: "#666", marginBottom: 32 },
  input: {
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: "#fafafa",
  },
  button: {
    backgroundColor: "#000",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { fontFamily: "Inter_600SemiBold", color: "#fff", fontSize: 16 },
  linkBtn: { marginTop: 20, alignItems: "center" },
  link: { fontFamily: "Inter_400Regular", color: "#666", fontSize: 14 },
});
