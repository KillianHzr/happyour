import { useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
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
  const { avatar } = useLocalSearchParams<{ avatar?: string }>();
  const [username, setUsername] = useState("");

  const isValid = username.trim().length >= 2;

  const handleNext = () => {
    if (!isValid) return;
    // L'avatar + le surnom sont transmis pour la suite de l'onboarding (création
    // de groupe). La persistance en BDD sera branchée plus tard.
    router.replace({
      pathname: "/(onboarding)/group",
      params: { avatar: avatar ?? "", username: username.trim() },
    });
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
      />

      <OnboardingButton label="Valider" onPress={handleNext} active={isValid} />

      {__DEV__ && (
        <OnboardingDevButton
          label="[DEV] Passer"
          onPress={() =>
            router.replace({
              pathname: "/(onboarding)/group",
              params: { avatar: avatar ?? "", username: username.trim() || "Dev" },
            })
          }
        />
      )}
    </OnboardingScreen>
  );
}
