-- ════════════════════════════════════════════════════════════════════════════
-- Notifications de partage "digest" (leading + trailing) — infra Supabase
-- ════════════════════════════════════════════════════════════════════════════
-- À exécuter UNE fois (SQL Editor du dashboard, OU `supabase db push`).
-- ⚠️ Remplace <PROJECT_REF> et <SHARE_NOTIFY_SECRET> par tes valeurs (voir le guide).
--    <PROJECT_REF>         = l'identifiant du projet (xxxx dans xxxx.supabase.co)
--    <SHARE_NOTIFY_SECRET> = une chaîne aléatoire que tu génères (ex: openssl rand -hex 24)

-- 1) Colonne d'état : horodatage de la dernière notif envoyée pour le groupe.
alter table public.groups
  add column if not exists notify_last_at timestamptz;

-- 2) Extensions (dispo sur le plan gratuit).
create extension if not exists pg_net;     -- appels HTTP depuis Postgres
create extension if not exists pg_cron;    -- tâches planifiées

-- 3) LEADING : à chaque nouveau partage, on appelle l'Edge Function pour CE groupe.
--    L'Edge Function envoie la notif immédiate si la fenêtre est libre, sinon accumule.
create or replace function public.notify_share_on_insert()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/share-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-share-secret', '<SHARE_NOTIFY_SECRET>'
    ),
    body    := jsonb_build_object('group_id', NEW.group_id)
  );
  return NEW;
end;
$$;

drop trigger if exists trg_notify_share on public.photos;
create trigger trg_notify_share
  after insert on public.photos
  for each row execute function public.notify_share_on_insert();

-- 4) TRAILING : chaque minute, "flush" les digests dont la fenêtre (30 min) est finie.
--    => appelle l'Edge Function SANS group_id (mode trailing + rattrapage).
--    NB: granularité minimale de pg_cron = 1 minute.
select cron.schedule(
  'share-notify-flush',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/share-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-share-secret', '<SHARE_NOTIFY_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Pour défaire plus tard :
--   select cron.unschedule('share-notify-flush');
--   drop trigger if exists trg_notify_share on public.photos;
