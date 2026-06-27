import { useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { translateError } from "../../lib/error-messages";
import {
  OnboardingScreen,
  OnboardingStickerText,
  OnboardingTextField,
  OnboardingButton,
} from "../../components/onboarding/OnboardingKit";

/**
 * Écran de connexion par mot de passe — affiché uniquement pour le compte de démo
 * (cf. review-account). Le testeur saisit le mot de passe fourni dans App Store
 * Connect → vraie session Supabase (signInWithPassword), sans OTP par email.
 */
export default function PasswordLoginScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const { login } = useAuth();
  const { showToast } = useToast();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const isValid = password.length > 0;

  const handleLogin = async () => {
    if (!isValid || !email || loading) return;
    setLoading(true);
    try {
      await login(email, password);
      router.replace("/");
    } catch (e: any) {
      showToast(translateError(e.message), undefined, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <OnboardingScreen title={<OnboardingStickerText text={"Entre ton\n[mot de passe]"} />}>
      <OnboardingTextField
        placeholder="Mot de passe"
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        editable={!loading}
      />

      <OnboardingButton label="Valider" onPress={handleLogin} active={isValid} loading={loading} />
    </OnboardingScreen>
  );
}
