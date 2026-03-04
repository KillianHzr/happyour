import { useEffect, useState } from "react";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import * as Updates from "expo-updates";
import { AuthProvider } from "../lib/auth-context";
import { setupNotificationHandler } from "../lib/notifications";
import { checkAppVersion } from "../lib/version-check";
import UpdateModal from "../components/UpdateModal";

setupNotificationHandler();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const [updateRequired, setUpdateRequired] = useState(false);
  const [apkUrl, setApkUrl] = useState("");

  useEffect(() => {
    // Check if APK version is outdated
    checkAppVersion().then(({ needsUpdate, apkUrl }) => {
      if (needsUpdate) {
        setUpdateRequired(true);
        setApkUrl(apkUrl);
        return;
      }

      // If APK is up to date, check for OTA updates
      checkOTAUpdate();
    });
  }, []);

  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <UpdateModal visible={updateRequired} apkUrl={apkUrl} />
      {fontsLoaded ? (
        <Slot />
      ) : (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      )}
    </AuthProvider>
  );
}

async function checkOTAUpdate() {
  if (__DEV__) return;
  try {
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    }
  } catch {
    // Silently fail — OTA is best-effort
  }
}

const styles = StyleSheet.create({
  loader: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" },
});
