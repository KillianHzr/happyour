-- ─────────────────────────────────────────────────────────────────────────────
-- Suppression du « dernier moment partagé » : fiabilisation par groupe.
--
-- Problème : le client déduisait le moment supprimable en prenant simplement le
-- plus récent. Après suppression du dernier, l'avant-dernier devenait « le
-- dernier » et redevenait supprimable → on pouvait vider tout son historique.
--
-- Correctif : on mémorise EXPLICITEMENT, par membre de groupe, l'id du vrai
-- dernier moment partagé. Au partage on l'écrit, à la suppression la FK
-- `ON DELETE SET NULL` le remet à null tout seul → l'avant-dernier n'est plus
-- supprimable. La valeur est portée par `group_members`, donc une suppression
-- dans un groupe n'affecte aucun autre groupe.
--
-- 100 % additif : un ADD COLUMN IF NOT EXISTS + un backfill idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.group_members
  add column if not exists deletable_photo_id uuid
    references public.photos(id) on delete set null;

-- Backfill : marque le moment le plus récent de chaque membre dans chaque groupe
-- comme supprimable. Le client recoupe ensuite avec la fenêtre de la semaine en
-- cours, donc seuls les derniers moments de la semaine restent réellement
-- supprimables (= comportement attendu pour la 1re suppression post-déploiement).
update public.group_members gm
set deletable_photo_id = lp.id
from (
  select distinct on (group_id, user_id) id, group_id, user_id
  from public.photos
  order by group_id, user_id, created_at desc
) lp
where gm.group_id = lp.group_id
  and gm.user_id = lp.user_id
  and gm.deletable_photo_id is null;
