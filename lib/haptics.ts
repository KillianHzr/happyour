import { playAhap } from "../modules/ahap-haptics/src";
import envoiePattern from "../assets/haptics/envoie.json";
import revealPattern from "../assets/haptics/reveal.json";

// Retours haptiques custom (patterns AHAP / Core Haptics, iOS only — no-op ailleurs).

/** Vibration jouée à l'envoi d'un moment, en même temps que l'animation Lottie d'envoi. */
export function hapticSend(): void {
  playAhap(envoiePattern as object);
}

/** Vibration jouée au déverrouillage du reveal. */
export function hapticReveal(): void {
  playAhap(revealPattern as object);
}
