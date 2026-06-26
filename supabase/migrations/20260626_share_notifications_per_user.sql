-- ════════════════════════════════════════════════════════════════════════════
-- Notifications de partage "digest" — passage à un état PAR UTILISATEUR
-- ════════════════════════════════════════════════════════════════════════════
-- Remplace la logique par-groupe (groups.notify_last_at) par un état par (group, user),
-- pour que :
--   • le moment d'un user ne compte pas dans SON propre délai ;
--   • un user ne reçoive jamais sa propre notif / ne voie jamais son nom dans un digest ;
--   • chaque user ait son horloge de cooldown indépendante.
--
-- Le trigger `trg_notify_share` et le cron `share-notify-flush` (déjà en place) sont
-- conservés tels quels : ils appellent toujours la même Edge Function `share-notify`,
-- c'est sa logique interne qui change. (La colonne groups.notify_last_at devient inutile
-- mais on la laisse pour ne rien casser ; tu peux la drop plus tard.)

-- 1) État par destinataire : dernière notif envoyée à CE user pour CE groupe.
create table if not exists public.notify_user_state (
  group_id          uuid not null references public.groups(id)   on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  last_notified_at  timestamptz,
  primary key (group_id, user_id)
);

-- Table d'infra : accédée uniquement par l'Edge Function (service_role, qui bypass RLS).
-- On active RLS sans policy → verrouillée pour les clients.
alter table public.notify_user_state enable row level security;

-- 2) Claim atomique (compare-and-swap) : pose last_notified_at = p_new SEULEMENT si la
--    valeur actuelle vaut encore p_old. Renvoie true si on a "gagné" le droit d'envoyer.
--    Gère le cas initial (aucune ligne ⇔ p_old NULL) via un insert on conflict do nothing.
create or replace function public.claim_notify(
  p_group_id uuid,
  p_user_id  uuid,
  p_old      timestamptz,
  p_new      timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.notify_user_state
     set last_notified_at = p_new
   where group_id = p_group_id
     and user_id  = p_user_id
     and last_notified_at is not distinct from p_old;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    return true;
  end if;

  -- Pas de ligne mise à jour : si on attendait l'état initial (NULL), on tente l'insert.
  if p_old is null then
    insert into public.notify_user_state (group_id, user_id, last_notified_at)
    values (p_group_id, p_user_id, p_new)
    on conflict (group_id, user_id) do nothing;
    get diagnostics v_count = row_count;
    return v_count > 0;
  end if;

  return false;
end;
$$;

grant execute on function public.claim_notify(uuid, uuid, timestamptz, timestamptz) to service_role;

-- ── Rappels (déjà en place, ne rien refaire si déjà fait) ──
-- Trigger leading (sur insert d'un moment) :
--   create trigger trg_notify_share after insert on public.photos
--     for each row execute function public.notify_share_on_insert();
-- Cron flush (chaque minute) :
--   select cron.schedule('share-notify-flush', '* * * * *', $$ ... net.http_post(... body '{}') ... $$);
