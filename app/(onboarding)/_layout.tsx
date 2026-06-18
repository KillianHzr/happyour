import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import Loader from "../../components/Loader";
import { View, StyleSheet } from "react-native";
import { type ThemeColors } from "../../lib/theme";
import { useThemedStyles } from "../../lib/theme-context";

export default function OnboardingLayout() {
  const { session, loading, profileComplete } = useAuth();
  const styles = useThemedStyles(makeStyles);

  useEffect(() => {
    if (!loading && profileComplete !== null) {
      if (!session) {
        router.replace("/(auth)/intro");
      } else if (profileComplete === true) {
        router.replace("/(app)/groups");
      }
    }
  }, [session, loading, profileComplete]);

  if (loading || profileComplete === null || !session || profileComplete === true) {
    return (
      <View style={styles.container}>
        <Loader size={40} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false, // Prevents skipping steps on iOS back-swipe
        animation: "slide_from_right",
        contentStyle: { backgroundColor: "#0A0A0F" },
      }}
    />
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
  },
});
