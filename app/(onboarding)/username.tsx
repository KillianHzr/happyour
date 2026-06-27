import { useState } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { supabase } from "../../lib/supabase";
import {
  OnboardingScreen,
  OnboardingStickerText,
  OnboardingTextField,
  OnboardingButton,
  OnboardingDevButton,
} from "../../components/onboarding/OnboardingKit";

const USERNAME_MAX = 10;

export default function OnboardingUsernameScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  const isValid = username.trim().length >= 2;

  // Enregistre le surnom en BDD avant de passer à la suite.
  const handleNext = async () => {
    if (!isValid || loading) return;
    setLoading(true);
    try {
      if (user) {
        const { error } = await supabase
          .from("profiles")
          .upsert({ id: user.id, username: username.trim() }, { onConflict: "id" });
        if (error) throw error;
      }
      router.replace("/(onboarding)/group");
    } catch (e: any) {
      showToast("Impossible d'enregistrer le surnom, réessaie.", undefined, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <OnboardingScreen
      hideBack
      title={<OnboardingStickerText text={"Si on devait te donner\nun [surnom],\nce serait..."} stickerY={-2} />}
    >
      <OnboardingTextField
        placeholder="ex. Cam"
        value={username}
        onChangeText={(t) => setUsername(t.slice(0, USERNAME_MAX))}
        autoCorrect={false}
        maxLength={USERNAME_MAX}
        counterMax={USERNAME_MAX}
      />

      <OnboardingButton label="Valider" onPress={handleNext} active={isValid} loading={loading} />

      {__DEV__ && (
        <OnboardingDevButton label="[DEV] Passer" onPress={() => router.replace("/(onboarding)/group")} />
      )}
    </OnboardingScreen>
  );
}
