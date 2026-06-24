import { Stack, router } from "expo-router";
import { View } from "react-native";
import { useAuth } from "../../lib/auth-context";
import { registerForPushNotifications, scheduleAllRecaps } from "../../lib/notifications";
import { useEffect } from "react";
import OfflineBanner from "../../components/OfflineBanner";

export default function AppLayout() {
  const { session, loading, profileComplete } = useAuth();

  useEffect(() => {
    if (!loading && profileComplete !== null) {
      if (!session) {
        router.replace("/(auth)/intro");
      } else if (profileComplete === false) {
        router.replace("/(onboarding)/intro");
      }
    }
  }, [session, loading, profileComplete]);

  useEffect(() => {
    if (session?.user?.id) {
      registerForPushNotifications(session.user.id);
      scheduleAllRecaps(session.user.id);
    }
  }, [session?.user?.id]);

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0A0A0F" },
        }}
      />
      {/* Bandeau global "pas de connexion" — visible partout dans l'app tant qu'on est hors-ligne. */}
      <OfflineBanner />
    </View>
  );
}
