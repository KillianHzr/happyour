import { Stack, router } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { registerForPushNotifications, scheduleAllRecaps } from "../../lib/notifications";
import { useEffect } from "react";

export default function AppLayout() {
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading && !session) {
      router.replace("/(auth)/login");
    }
  }, [session, loading]);

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
        contentStyle: { backgroundColor: "#fff" },
      }}
    />
  );
}
