import { useState } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { translateError } from "../../lib/error-messages";
import { supabase } from "../../lib/supabase";
import {
  OnboardingScreen,
  OnboardingStickerText,
  OnboardingTextField,
  OnboardingButton,
  OnboardingDevButton,
} from "../../components/onboarding/OnboardingKit";

const NAME_MAX = 50;
const MAX_GROUPS = 3;

export default function OnboardingGroupNameScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const isValid = name.trim().length >= 1;

  const handleCreate = async (overrideName?: string) => {
    const finalName = (overrideName ?? name).trim();
    if (!finalName || !user || loading) return;
    setLoading(true);
    try {
      const { count } = await supabase
        .from("group_members")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);
      if ((count ?? 0) >= MAX_GROUPS) {
        showToast("Limite atteinte", `Tu peux appartenir à ${MAX_GROUPS} groupes maximum.`, "info");
        return;
      }

      const { data: group, error } = await supabase
        .from("groups")
        .insert({ name: finalName, created_by: user.id })
        .select("id, name")
        .single();
      if (error) throw error;

      await supabase
        .from("group_members")
        .insert({ group_id: group.id, user_id: user.id, role: "admin" });

      router.replace({
        pathname: "/(onboarding)/group-created",
        params: { groupId: group.id, groupName: group.name, mode: "created" },
      });
    } catch (e: any) {
      showToast("Erreur", translateError(e.message), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <OnboardingScreen
      hideBack
      title={<OnboardingStickerText text={"Si tu devais nommer\nton [groupe],\nce serait"} />}
    >
      <OnboardingTextField
        placeholder="ex. Source"
        value={name}
        onChangeText={(t) => setName(t.slice(0, NAME_MAX))}
        autoCorrect={false}
        maxLength={NAME_MAX}
        counterMax={NAME_MAX}
      />

      <OnboardingButton label="Valider" onPress={() => handleCreate()} active={isValid} loading={loading} />

      {__DEV__ && (
        <OnboardingDevButton label="[DEV] Passer" onPress={() => handleCreate("Dev")} />
      )}
    </OnboardingScreen>
  );
}
