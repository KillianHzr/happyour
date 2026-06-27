import { Asset } from "expo-asset";
import { GRADIENT_ORANGE } from "./assets";

/**
 * Tous les assets image utilisés dans le tunnel d'onboarding, regroupés ici pour
 * une seule source de vérité (même référence de module = même clé de cache
 * expo-image) et pour pouvoir tout précharger d'un coup à l'entrée du tunnel.
 */

// Slide 1 — grille d'avatars
export const AVATAR_LEO = require("../assets/images/onboarding/Leo.png");
export const AVATAR_KILLIAN = require("../assets/images/onboarding/killian.png");
export const AVATAR_MEL = require("../assets/images/onboarding/mel.png");
export const AVATAR_THEO = require("../assets/images/onboarding/theo.png");
export const AVATAR_HUGO = require("../assets/images/onboarding/hugo.png");
export const AVATAR_AXEL = require("../assets/images/onboarding/axel.png");

// Slide 2 — illustration pleine largeur
export const GROUP_SHAPE = require("../assets/images/onboarding/GroupShape.png");

// Slide 3 — formes "pétales"
export const SHAPE_MOVIE = require("../assets/images/onboarding/movie.png");
export const SHAPE_FRIENDS = require("../assets/images/onboarding/friends.png");
export const SHAPE_ALCOOL = require("../assets/images/onboarding/alcool.png");
export const SHAPE_PARTY = require("../assets/images/onboarding/party.png");
export const SHAPE_CONCERT = require("../assets/images/onboarding/concert.png");
export const SHAPE_COOKING = require("../assets/images/onboarding/cooking.png");

/** Toutes les images du tunnel (slides + page finale orange). */
export const ONBOARDING_ASSETS = [
  AVATAR_LEO, AVATAR_KILLIAN, AVATAR_MEL, AVATAR_THEO, AVATAR_HUGO, AVATAR_AXEL,
  GROUP_SHAPE,
  SHAPE_MOVIE, SHAPE_FRIENDS, SHAPE_ALCOOL, SHAPE_PARTY, SHAPE_CONCERT, SHAPE_COOKING,
  GRADIENT_ORANGE,
];

let started = false;

/**
 * Précharge (download + décode) toutes les images de l'onboarding. Appelé dès
 * l'entrée du tunnel (boutons « Démarrer » / « Déjà un compte ? ») pour qu'aucune
 * image ne soit vue « charger » à l'arrivée sur sa page. Idempotent et
 * fire-and-forget (les erreurs réseau ne bloquent pas le parcours).
 */
export function preloadOnboardingAssets() {
  if (started) return;
  started = true;
  Asset.loadAsync(ONBOARDING_ASSETS).catch(() => {
    started = false; // autorise une nouvelle tentative en cas d'échec
  });
}
