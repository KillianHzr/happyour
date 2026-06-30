// ── DEBUG DÉMO (à retirer après la présentation) ──────────────────────────────
// Comptes autorisés à utiliser les béquilles de démo (déverrouillage reveal, scroll
// couronne, décalage de date des moments à J+2, …).
export const DEBUG_DEMO_EMAILS = [
  "theolanglade21@gmail.com",
  "me@melisseclivaz.com",
  "hugopinna@free.fr",
  "killianherzer@gmail.com",
  "axel.genin17@gmail.com",
];

export function isDebugDemoEmail(email?: string | null): boolean {
  return !!email && DEBUG_DEMO_EMAILS.includes(email.toLowerCase());
}
