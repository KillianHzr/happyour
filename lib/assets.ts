/**
 * Assets statiques partagés (même référence de module → même clé de cache expo-image).
 * Le dégradé orange est préchargé au démarrage (cf. app/_layout.tsx) pour ne jamais
 * être vu "charger" sur les boutons premium (abonnement profil, archives…).
 */
export const GRADIENT_ORANGE = require("../assets/images/backgroundorange.png");
