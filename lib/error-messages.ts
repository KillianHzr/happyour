const translations: Record<string, string> = {
  "Invalid login credentials": "Email ou mot de passe incorrect.",
  "invalid login credentials": "Email ou mot de passe incorrect.",
  "Email not confirmed": "Confirme ton email avant de te connecter.",
  "User already registered": "Un compte existe déjà avec cet email.",
  "Password should be at least 6 characters": "Le mot de passe doit contenir au moins 6 caractères.",
  "Unable to validate email address: invalid format": "Format d'email invalide.",
  "Email rate limit exceeded": "Trop de tentatives, réessaie plus tard.",
  "For security purposes, you can only request this after": "Trop de tentatives, réessaie dans quelques secondes.",
  "User not found": "Aucun compte trouvé avec cet email.",
  "New password should be different from the old password": "Le nouveau mot de passe doit être différent.",
  "Auth session missing": "Session expirée, reconnecte-toi.",
  "JWT expired": "Session expirée, reconnecte-toi.",
  "Signup requires a valid password": "Le mot de passe est invalide.",
  "duplicate key value violates unique constraint": "Cette entrée existe déjà.",
  "row-level security": "Action non autorisée.",
};

export function translateError(message: string): string {
  // Exact match
  if (translations[message]) return translations[message];

  // Partial match
  for (const [key, value] of Object.entries(translations)) {
    if (message.toLowerCase().includes(key.toLowerCase())) return value;
  }

  // Generic fallback for common patterns
  if (message.includes("rate limit") || message.includes("too many")) {
    return "Trop de tentatives, réessaie plus tard.";
  }
  if (message.includes("network") || message.includes("fetch")) {
    return "Erreur de connexion. Vérifie ta connexion internet.";
  }
  if (message.includes("timeout")) {
    return "Le serveur met trop de temps à répondre.";
  }

  return message;
}
