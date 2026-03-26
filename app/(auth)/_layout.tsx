import { Stack } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import OfflineView from "../../components/OfflineView";

export default function AuthLayout() {
  const { isOffline } = useAuth();

  if (isOffline) {
    return <OfflineView />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#0A0A0F" },
      }}
    />
  );
}
