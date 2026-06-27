-- ─────────────────────────────────────────────────────────────────────────────
-- Signalements (App Store : obligation d'un moyen de signaler des utilisateurs /
-- du contenu). Un signalement enregistre : qui signale, qui est signalé, la
-- raison, et le contexte (le commentaire si on signale un commentaire, le groupe
-- si on signale un membre).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.signalements (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid not null references public.profiles(id) on delete cascade,
  reason           text not null,
  comment_id       uuid references public.comments(id) on delete set null, -- si signalement d'un commentaire
  group_id         uuid references public.groups(id)   on delete set null, -- si signalement d'un membre
  created_at       timestamptz not null default now()
);

create index if not exists signalements_reported_user_idx on public.signalements(reported_user_id);
create index if not exists signalements_reporter_idx       on public.signalements(reporter_id);

alter table public.signalements enable row level security;

-- Un utilisateur authentifié peut créer un signalement où il est le rapporteur,
-- et il ne peut pas se signaler lui-même.
drop policy if exists "create own report" on public.signalements;
create policy "create own report" on public.signalements
  for insert to authenticated
  with check (auth.uid() = reporter_id and reporter_id <> reported_user_id);

-- Un utilisateur peut relire ses propres signalements (facultatif côté app).
drop policy if exists "read own report" on public.signalements;
create policy "read own report" on public.signalements
  for select to authenticated
  using (auth.uid() = reporter_id);
