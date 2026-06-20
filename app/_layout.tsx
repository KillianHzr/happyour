import { useEffect, useState } from "react";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from "@expo-google-fonts/inter";
import { useAssets } from "expo-asset";
import { Image } from "expo-image";
import { View, StyleSheet } from "react-native";
import { GRADIENT_ORANGE } from "../lib/assets";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import * as Updates from "expo-updates";
import { AuthProvider } from "../lib/auth-context";
import { ThemeProvider, useTheme } from "../lib/theme-context";
import { UploadProvider } from "../lib/upload-context";
import { ToastProvider } from "../lib/toast-context";
import { setupNotificationHandler } from "../lib/notifications";
import SplashScreen from "../components/SplashScreen";

setupNotificationHandler();

// DEV ONLY : React Native (new arch) loggue chaque rendu de composant via
// performance.measure -> NativePerformance.reportMeasure, qui peut throw
// "Exception in HostFunction: std::bad_alloc" au lancement (component
// performance track). On rend ces appels non-fatals : on n'utilise pas
// l'API performance nous-mêmes, donc aucun impact fonctionnel.
if (__DEV__ && typeof globalThis.performance !== "undefined") {
  const perf = globalThis.performance as any;
  for (const method of ["measure", "mark"] as const) {
    const original = perf[method];
    if (typeof original === "function") {
      perf[method] = function (...args: any[]) {
        try {
          return original.apply(this, args);
        } catch {
          // swallow std::bad_alloc et autres erreurs natives de tracking
          return undefined;
        }
      };
    }
  }
}

// Catch toutes les erreurs JS non catchées (handlers async, promises, etc.)
const _ErrorUtils = (global as any).ErrorUtils;
if (_ErrorUtils) {
  const previousHandler = _ErrorUtils.getGlobalHandler();
  _ErrorUtils.setGlobalHandler((error: any, isFatal: boolean) => {
    console.error(`[GlobalError] ${isFatal ? "FATAL" : "non-fatal"}:`, error?.message ?? error);
    console.error("[GlobalError] Stack:", error?.stack);
    previousHandler?.(error, isFatal);
  });
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    // Inter conservé en secours
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold,
    // Police du design system : Parkinsans (familles internes uniques par graisse)
    ParkinsansRegular: require("../assets/fonts/Parkinsans-Regular.ttf"),
    ParkinsansMedium: require("../assets/fonts/Parkinsans-Medium.ttf"),
    ParkinsansSemiBold: require("../assets/fonts/Parkinsans-SemiBold.ttf"),
    ParkinsansBold: require("../assets/fonts/Parkinsans-Bold.ttf"),
    ParkinsansExtraBold: require("../assets/fonts/Parkinsans-ExtraBold.ttf"),
    // Nunito Sans (variable) chargée et disponible
    NunitoSans: require("../assets/fonts/NunitoSans.ttf"),
  });
  const [assetsLoaded] = useAssets([GRADIENT_ORANGE]);
  const [checksReady, setChecksReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    checkOTAUpdate();
    setChecksReady(true);
  }, []);

  const appReady = fontsLoaded && !!assetsLoaded && checksReady;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <AuthProvider>
          <ThemeProvider>
            <UploadProvider>
              <ToastProvider>
                <View style={{ flex: 1 }}>
                  <ThemedStatusBar />
                  {/* Préchargement permanent du dégradé orange en cache mémoire (pleine résolution),
                      pour qu'il ne soit jamais vu "charger" sur les boutons premium. */}
                  <Image
                    source={GRADIENT_ORANGE}
                    style={styles.preload}
                    cachePolicy="memory-disk"
                    priority="high"
                    allowDownscaling={false}
                    pointerEvents="none"
                  />
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
          </ThemeProvider>
        </AuthProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

/** StatusBar dont le style suit le mode de thème actif. */
function ThemedStatusBar() {
  const { mode } = useTheme();
  return <StatusBar style={mode === "Dark" ? "light" : "dark"} />;
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
  preload: { position: "absolute", width: 1, height: 1, opacity: 0 },
});
