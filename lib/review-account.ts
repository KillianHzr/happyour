/**
 * Compte de démo pour la revue Apple (et autres stores) : permet de se connecter
 * SANS recevoir d'email OTP. Quand l'utilisateur saisit EXACTEMENT cet email, l'app
 * affiche un écran de connexion par mot de passe (au lieu du code de vérification) ;
 * le testeur tape le mot de passe (fourni dans App Store Connect) → vraie connexion.
 *
 * Seul l'email est embarqué (non sensible). Aucun mot de passe ni code n'est dans le
 * bundle. Si EXPO_PUBLIC_REVIEW_EMAIL est vide, la fonctionnalité est désactivée.
 */
export const REVIEW_EMAIL = (process.env.EXPO_PUBLIC_REVIEW_EMAIL ?? "").trim().toLowerCase();

export const isReviewEmail = (email: string) =>
  !!REVIEW_EMAIL && email.trim().toLowerCase() === REVIEW_EMAIL;
