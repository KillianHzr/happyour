-- ─────────────────────────────────────────────────────────────────────────────
-- Onboarding : flag persistant « l'utilisateur a passé le slider de bienvenue ».
--
-- Avant, la décision slider vs app se basait sur la présence d'un username, ce
-- qui n'est pas fiable (un trigger DB peut poser un username, un e-mail peut être
-- réutilisé…). On mémorise désormais explicitement le passage de l'onboarding.
--
-- Règle : `has_onboarded = true` est posé dès que l'utilisateur sort du slider
-- (cf. markOnboarded côté app). Une fois engagé dans le tunnel, on ne lui
-- réaffiche plus le slider, même s'il reste des étapes d'onboarding.
--
-- 100 % additif : ADD COLUMN IF NOT EXISTS + backfill idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists has_onboarded boolean not null default false;

-- Le nouveau flux crée la ligne `profiles` dès la sortie du slider (markOnboarded),
-- AVANT l'étape de choix du username. La colonne doit donc être nullable pour que
-- l'insert {id, has_onboarded} passe. (No-op si déjà nullable.)
alter table public.profiles
  alter column username drop not null;

-- Backfill : tout profil déjà configuré (qui a un username) a forcément traversé
-- l'ancien onboarding → on le marque comme ayant onboardé pour ne pas lui montrer
-- le nouveau slider. Les profils sans username (comptes incomplets / stubs créés
-- par un éventuel trigger) restent à false → ils verront le slider.
update public.profiles
set has_onboarded = true
where username is not null
  and has_onboarded = false;
