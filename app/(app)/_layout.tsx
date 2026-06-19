import { Stack, router } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { registerForPushNotifications, scheduleAllRecaps } from "../../lib/notifications";
import { useEffect } from "react";

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
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#0A0A0F" },
      }}
    />
  );
}
