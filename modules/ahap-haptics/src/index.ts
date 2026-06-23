import { requireOptionalNativeModule } from "expo";

// Module natif iOS uniquement. `requireOptionalNativeModule` renvoie null là où il n'existe pas
// (Android, Expo Go), de sorte que les appels deviennent de simples no-op sans crash.
const AhapHaptics = requireOptionalNativeModule<{ playPattern: (json: string) => void }>("AhapHaptics");

/** Joue un pattern haptique au format AHAP (Core Haptics). Best-effort, no-op si indisponible. */
export function playAhap(pattern: object): void {
  if (!AhapHaptics) return;
  try {
    AhapHaptics.playPattern(JSON.stringify(pattern));
  } catch {
    // best-effort
  }
}
