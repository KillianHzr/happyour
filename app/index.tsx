import { useEffect, useRef, useState } from "react";
import { useRouter, Redirect } from "expo-router";
import { useNetworkState } from "expo-network";
import { useAuth } from "../lib/auth-context";
import { supabase } from "../lib/supabase";
import LoadingScreen from "../components/LoadingScreen";
import NoConnectionScreen from "../components/NoConnectionScreen";

export default function Index() {
  const { session, loading: authLoading, hasOnboarded, checkProfileStatus } = useAuth();
  const networkState = useNetworkState();
  // ⚠️ TEST DEV : passe à true pour voir l'écran "pas de connexion" SANS couper le wifi
  // (utile en dev build connecté à Metro). Remettre à false avant de commit/build.
  const FORCE_OFFLINE = __DEV__ && false;
  // Hors-ligne : isConnected=false (aucun réseau) ou isInternetReachable=false (wifi sans
  // internet). On ignore les valeurs encore indéterminées (undefined/null) au 1er render.
  const offline = FORCE_OFFLINE || networkState.isConnected === false || networkState.isInternetReachable === false;
  const [checkingGroup, setCheckingGroup] = useState(true);
  const [targetGroupId, setTargetGroupId] = useState<string | null>(null);

  // Au retour de connexion : le check de profil initial a pu échouer hors-ligne
  // (profileComplete=false par erreur → onboarding). On le relance pour router correctement.
  const wasOffline = useRef(false);
  useEffect(() => {
    if (wasOffline.current && !offline && session?.user) {
      checkProfileStatus(session.user.id);
    }
    wasOffline.current = offline;
  }, [offline, session?.user?.id]);

  useEffect(() => {
    async function checkUserGroups() {
      if (!session?.user) {
        setCheckingGroup(false);
        return;
      }

      try {
        // On récupère le premier groupe de l'utilisateur
        const { data, error } = await supabase
          .from("group_members")
          .select("group_id")
          .eq("user_id", session.user.id)
          .limit(1)
          .single();

        if (data?.group_id) {
          setTargetGroupId(data.group_id);
        }
      } catch (e) {
        // Pas de groupe trouvé ou erreur, on reste sur null
      } finally {
        setCheckingGroup(false);
      }
    }

    if (!authLoading) {
      checkUserGroups();
    }
  }, [session, authLoading]);

  // Hors-ligne : on n'a pas pu résoudre l'état réel → écran "pas de connexion" plutôt que de
  // router vers l'onboarding/login par défaut. Se met à jour seul au retour du réseau.
  if (offline) {
    return <NoConnectionScreen />;
  }

  if (authLoading || checkingGroup || hasOnboarded === null) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <Redirect href="/(auth)/intro" />;
  }

  if (hasOnboarded === false) {
    return <Redirect href="/(onboarding)/intro" />;
  }

  // Si on a trouvé un groupe, on y va direct
  if (targetGroupId) {
    return <Redirect href={`/(app)/groups/${targetGroupId}`} />;
  }

  // Sinon, on va sur l'écran de création/rejoindre
  return <Redirect href="/(app)/groups" />;
}
