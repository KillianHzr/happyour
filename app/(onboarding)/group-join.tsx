import { useState } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { translateError } from "../../lib/error-messages";
import { supabase } from "../../lib/supabase";
import { scheduleFirstMomentReminder, notifyGroupJoin } from "../../lib/notifications";
import {
  OnboardingScreen,
  OnboardingStickerText,
  OnboardingTextField,
  OnboardingButton,
} from "../../components/onboarding/OnboardingKit";

const MAX_GROUPS = 3;

export default function OnboardingGroupJoinScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const isValid = code.trim().length >= 1;

  const goCreated = (groupId: string, groupName: string) => {
    router.replace({
      pathname: "/(onboarding)/group-created",
      params: { groupId, groupName, mode: "joined" },
    });
  };

  const handleJoin = async () => {
    if (!isValid || !user || loading) return;
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

      const cleanCode = code.trim().toUpperCase();
      const { data: group, error: groupErr } = await supabase
        .from("groups")
        .select("id, name")
        .eq("invite_code", cleanCode)
        .maybeSingle();
      if (groupErr) { showToast("Erreur", translateError(groupErr.message), "error"); return; }
      if (!group) { showToast("Erreur", "Code invalide ou groupe introuvable.", "error"); return; }

      const { error: joinErr } = await supabase
        .from("group_members")
        .insert({ group_id: group.id, user_id: user.id });

      if (joinErr) {
        if (joinErr.message.includes("unique")) {
          goCreated(group.id, group.name); // déjà membre → on continue quand même
        } else {
          throw joinErr;
        }
      } else {
        scheduleFirstMomentReminder(group.id, group.name);
        notifyGroupJoin(group.id, group.name, user.id).catch(() => {});
        goCreated(group.id, group.name);
      }
    } catch (e: any) {
      showToast("Erreur", translateError(e.message), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <OnboardingScreen
      hideBack
      title={<OnboardingStickerText text={"Rentre le [code]\nd’accès reçu"} />}
    >
      <OnboardingTextField
        placeholder="ex. XXXX-0000"
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      <OnboardingButton label="Valider" onPress={handleJoin} active={isValid} loading={loading} />
    </OnboardingScreen>
  );
}
