import { Dimensions } from "react-native";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// ─── Hauteurs du tiroir de commentaires (source de vérité unique) ────────────
// Consommé par CommentModal (qui dimensionne le tiroir) ET par PhotoFeed (qui
// met à l'échelle l'aperçu du post au-dessus du tiroir). Ces deux fichiers
// DOIVENT lire les mêmes valeurs, sinon l'aperçu se désaligne du tiroir.
//
// SHEET_BASE    : hauteur au repos (clavier fermé).
// SHEET_KB      : hauteur quand le clavier est ouvert en mode commentaire — plus
//                 courte pour que le haut du tiroir reste vers le milieu de l'écran
//                 et que l'aperçu garde la portion supérieure.
// SHEET_STICKER : hauteur en mode sticker (clavier ouvert) — réglable
//                 indépendamment de SHEET_KB car le contenu (aperçu + champ) diffère.
export const SHEET_BASE = Math.round(SCREEN_HEIGHT * 0.46);
export const SHEET_KB = Math.round(SCREEN_HEIGHT * 0.32);
export const SHEET_STICKER = Math.round(SCREEN_HEIGHT * 0.20);

/** Durée de l'animation d'ouverture/fermeture du tiroir (pas le lift clavier). */
export const SHEET_TIMING = { duration: 260 } as const;
