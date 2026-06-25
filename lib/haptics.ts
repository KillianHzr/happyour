import { Platform, Vibration } from "react-native";
import * as Haptics from "expo-haptics";
import { playAhap } from "../modules/ahap-haptics/src";
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
