import { requireOptionalNativeModule } from "expo";

// Module natif iOS uniquement. `requireOptionalNativeModule` renvoie null là où il n'existe pas
// (Android, Expo Go), de sorte que les appels deviennent de simples no-op sans crash.
const AhapHaptics = requireOptionalNativeModule<{
  playPattern: (json: string) => void;
  startContinuous: (intensity: number, sharpness: number) => void;
  updateContinuous: (intensity: number, sharpness: number) => void;
  stopContinuous: () => void;
}>("AhapHaptics");

/** Joue un pattern haptique au format AHAP (Core Haptics). Best-effort, no-op si indisponible. */
export function playAhap(pattern: object): void {
  if (!AhapHaptics) return;
  try {
    AhapHaptics.playPattern(JSON.stringify(pattern));
  } catch {
    // best-effort
  }
}

/** True si le retour haptique continu natif est dispo (iOS avec Core Haptics). */
export const hasContinuousHaptics = !!AhapHaptics?.startContinuous;

/** Démarre une vibration continue dont l'intensité s'ajuste en direct. intensity/sharpness 0–1. */
export function startContinuousAhap(intensity: number, sharpness = 0.5): void {
  try { AhapHaptics?.startContinuous?.(intensity, sharpness); } catch { /* best-effort */ }
}

/** Met à jour l'intensité (et la netteté) de la vibration continue en cours. */
export function updateContinuousAhap(intensity: number, sharpness = 0.5): void {
  try { AhapHaptics?.updateContinuous?.(intensity, sharpness); } catch { /* best-effort */ }
}

/** Arrête la vibration continue. */
export function stopContinuousAhap(): void {
  try { AhapHaptics?.stopContinuous?.(); } catch { /* best-effort */ }
}
