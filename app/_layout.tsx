import { useEffect, useState } from "react";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { View, StyleSheet } from "react-native";
import * as Updates from "expo-updates";
import { AuthProvider } from "../lib/auth-context";
import { UploadProvider } from "../lib/upload-context";
import { ToastProvider } from "../lib/toast-context";
import { setupNotificationHandler } from "../lib/notifications";
import { checkAppVersion } from "../lib/version-check";
import UpdateModal from "../components/UpdateModal";
import SplashScreen from "../components/SplashScreen";

setupNotificationHandler();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const [updateRequired, setUpdateRequired] = useState(false);
  const [apkUrl, setApkUrl] = useState("");
  const [checksReady, setChecksReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    checkAppVersion().then(({ needsUpdate, apkUrl }) => {
      if (needsUpdate) {
        setUpdateRequired(true);
        setApkUrl(apkUrl);
      } else {
        checkOTAUpdate();
      }
      setChecksReady(true);
    });
  }, []);

  const appReady = fontsLoaded && checksReady;

  if (updateRequired && splashDone) {
    return <UpdateModal visible apkUrl={apkUrl} />;
  }

  return (
    <AuthProvider>
      <UploadProvider>
        <ToastProvider>
          <View style={{ flex: 1 }}>
            <StatusBar style="light" />
            {!splashDone && (
              <SplashScreen ready={appReady} onFinish={() => setSplashDone(true)} />
            )}
            {appReady && (
              <View style={splashDone ? styles.visible : styles.hidden}>
                <Slot />
              </View>
            )}
          </View>
        </ToastProvider>
      </UploadProvider>
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
  visible: { flex: 1 },
  hidden: { flex: 1, opacity: 0 },
});
