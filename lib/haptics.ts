import { Platform, Vibration } from "react-native";
import * as Haptics from "expo-haptics";
import {
  playAhap,
  hasContinuousHaptics,
  startContinuousAhap,
  updateContinuousAhap,
  stopContinuousAhap,
} from "../modules/ahap-haptics/src";
import envoiePattern from "../assets/haptics/envoie.json";
import revealPattern from "../assets/haptics/reveal.json";
import coucouPattern from "../assets/haptics/coucou.json";
import lightPattern from "../assets/haptics/light.json";
import selectionPattern from "../assets/haptics/selection.json";

// Retours haptiques custom (patterns AHAP / Core Haptics, iOS only — no-op ailleurs).

// ── Retours haptiques simples ──
//
// IMPORTANT iOS : les haptics `UIFeedbackGenerator` (ceux d'expo-haptics) sont coupés par le
// système quand une session audio caméra / lecture vidéo est active → ils ne se déclenchaient
// pas dans l'appareil photo ni dans le reveal. Core Haptics (AHAP) joue, lui, dans tous les cas.
// Donc sur iOS on passe par l'AHAP ; sur Android (pas de ce blocage) on garde expo-haptics.

/** Petit "tic" de sélection : à chaque nouvel élément qui passe au centre d'un slider. */
export function hapticSelection(): void {
  if (Platform.OS === "ios") playAhap(selectionPattern as object);
  else Haptics.selectionAsync().catch(() => {});
}

/** Impact léger (volontairement discret) : capture photo/vidéo/audio, réaction posée, etc. */
export function hapticLight(): void {
  if (Platform.OS === "ios") playAhap(lightPattern as object);
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Impact moyen : confirmation d'une action (ex. ouverture d'un groupe). */
export function hapticImpact(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/**
 * Vibration "coucou" du reveal (secousse) : volontairement plus longue (~400 ms).
 * iOS : pattern AHAP continu (Core Haptics). Android : Vibration.vibrate(400 ms),
 * expo-haptics ne sachant pas produire de vibration de durée arbitraire.
 */
export function hapticCoucou(): void {
  if (Platform.OS === "ios") {
    playAhap(coucouPattern as object);
  } else {
    Vibration.vibrate(400);
  }
}

/** Vibration jouée à l'envoi d'un moment, en même temps que l'animation Lottie d'envoi. */
export function hapticSend(): void {
  playAhap(envoiePattern as object);
}

/** Vibration jouée au déverrouillage du reveal. */
export function hapticReveal(): void {
  playAhap(revealPattern as object);
}

// ── Retour haptique continu à intensité dynamique (slider de déverrouillage du groupe) ──
//
// Tant qu'on maintient le doigt, ça vibre ; l'intensité suit le pourcentage de slide (0→1),
// et continue de s'adapter même si le doigt est immobile sur le nob.
// iOS : lecteur continu Core Haptics (intensité ajustée en direct).
// Android (module natif iOS absent) : on émule par des `Vibration.vibrate` répétés dont la
// cadence se resserre quand l'intensité monte → sensation de montée en puissance.

let androidPulseTimer: ReturnType<typeof setInterval> | null = null;
let androidPulseProgress = 0; // 0–1, lu par le timer

function androidPulseTick(): void {
  // Plancher net (déjà senti dès la prise) + durée qui monte avec la progression.
  const p = androidPulseProgress;
  Vibration.vibrate(Math.round(18 + p * 22)); // 18ms → 40ms
}

// Courbe d'intensité du slider : plancher élevé (déjà bien senti dès la prise) + montée rapide
// via une racine (le milieu cogne fort), jusqu'à 1.0 plein en fin de course.
// p=0 → 0.5 ; p=0.25 → 0.75 ; p=0.5 → 0.85 ; p=1 → 1.0.
const unlockIntensity = (p: number) => 0.5 + 0.5 * Math.sqrt(p);
// Netteté qui monte aussi → plus "mordant" vers la fin.
const unlockSharpness = (p: number) => 0.4 + 0.6 * p;

/** Démarre le retour continu du slider. `progress` 0–1 = pourcentage de slide initial. */
export function hapticUnlockStart(progress: number): void {
  const p = Math.max(0, Math.min(1, progress));
  if (Platform.OS === "ios" && hasContinuousHaptics) {
    startContinuousAhap(unlockIntensity(p), unlockSharpness(p));
    return;
  }
  // Android : pulsations périodiques pilotées par la progression.
  androidPulseProgress = p;
  if (androidPulseTimer == null) {
    androidPulseTimer = setInterval(androidPulseTick, 60);
  }
}

/** Met à jour l'intensité du retour continu en fonction du pourcentage de slide (0–1). */
export function hapticUnlockUpdate(progress: number): void {
  const p = Math.max(0, Math.min(1, progress));
  if (Platform.OS === "ios" && hasContinuousHaptics) {
    updateContinuousAhap(unlockIntensity(p), unlockSharpness(p));
    return;
  }
  androidPulseProgress = p;
}

/**
 * Met à jour l'intensité SANS plancher : `level` 0–1 mappe directement l'intensité (0 = silence).
 * Sert au relâchement pour faire un decrescendo jusqu'à 0 vrai (le plancher de unlockIntensity
 * empêcherait sinon d'atteindre le silence).
 */
export function hapticUnlockUpdateRaw(level: number): void {
  const v = Math.max(0, Math.min(1, level));
  if (Platform.OS === "ios" && hasContinuousHaptics) {
    updateContinuousAhap(v, unlockSharpness(v));
    return;
  }
  androidPulseProgress = v;
}

/** Arrête le retour continu (doigt relâché / déverrouillage déclenché). */
export function hapticUnlockStop(): void {
  if (Platform.OS === "ios" && hasContinuousHaptics) {
    stopContinuousAhap();
    return;
  }
  if (androidPulseTimer != null) {
    clearInterval(androidPulseTimer);
    androidPulseTimer = null;
  }
  androidPulseProgress = 0;
  Vibration.cancel();
}
