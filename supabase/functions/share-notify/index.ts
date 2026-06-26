// Edge Function : notifications de partage avec digest "leading + trailing", PAR UTILISATEUR.
//
// État stocké par (group_id, user_id) dans public.notify_user_state.last_notified_at
// = dernière fois qu'on a notifié CE destinataire pour CE groupe. Son horloge lui est propre :
// son propre moment ne compte JAMAIS dans son délai (le "pending" exclut user_id === u).
//
// Pour un destinataire u dans un groupe g (processUser) :
//  - "pending" = moments du groupe postés par d'AUTRES que u, depuis sa dernière notif.
//  - cooldown actif (now - last < WINDOW)        → on accumule en silence (#2).
//  - cooldown fini :
//      • 1 seul auteur ET u jamais notifié (last=null) → LEADING immédiat "X a partagé" (#1).
//      • 1 seul auteur ET u déjà notifié             → HOLD : on attend un 2e (#4)…
//                                                       …SAUF pendant l'heure de reveal (forceSingle).
//      • ≥ 2 auteurs                                 → DIGEST "X, Y et N autres ont partagé" (#3).
//
// Modes d'invocation :
//  - { group_id }  → traite ce groupe (trigger après upload = leading immédiat).
//  - {}            → "flush" (pg_cron chaque minute = trailing + rattrapage + flush reveal).
//
// Concurrence (trigger + cron simultanés) : claim atomique via la fonction SQL claim_notify.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Fenêtre d'accumulation. 60 = "1h" (ta description). 30 = ancien comportement.
const WINDOW_MIN = 60;
const WINDOW_MS = WINDOW_MIN * 60 * 1000;
// Profondeur max regardée pour les moments "en attente" (évite de notifier des moments très anciens
// si un user est resté longtemps sans être notifié).
const SAFETY_MS = 3 * 60 * 60 * 1000;
// Fuseau de référence pour calculer l'heure de reveal (cohérent avec l'app côté client).
const REVEAL_TZ = "Europe/Paris";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHARED_SECRET = Deno.env.get("SHARE_NOTIFY_SECRET") ?? "";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// ── Envoi Expo Push ──
async function sendPush(tokens: string[], title: string, body: string, data: Record<string, unknown>) {
  if (tokens.length === 0) return;
  const messages = tokens.map((to) => ({
    to, title, body,
    sound: "basic_notification.wav",
    data,
    channelId: "default",
    priority: "high",
    vibrate: true,
  }));
  const post = async (batch: typeof messages) => {
    const r = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(batch),
    });
    return await r.json();
  };

  // Expo refuse de mélanger des tokens de projets Expo différents (PUSH_TOO_MANY_EXPERIENCE_IDS).
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const res = await post(batch);
      const mixed = Array.isArray(res?.errors) && res.errors.some((e: any) => e.code === "PUSH_TOO_MANY_EXPERIENCE_IDS");
      if (mixed) {
        for (const m of batch) {
          try { await post([m]); } catch (e) { console.error("[push] envoi individuel échoué:", e); }
        }
      } else {
        console.log(`[push] ${batch.length} envoyés — réponse Expo:`, JSON.stringify(res).slice(0, 400));
      }
    } catch (e) {
      console.error("[share-notify] push batch failed:", e);
    }
  }
}

// ── Détection de l'heure de reveal (DST-safe via Intl, fuseau Europe/Paris) ──
const DAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

async function isRevealHourNow(): Promise<boolean> {
  let revealDay = 0, revealHour = 20;
  try {
    const { data } = await sb.from("app_config").select("key, value").in("key", ["reveal_day", "reveal_hour"]);
    for (const row of data ?? []) {
      if (row.key === "reveal_day") revealDay = parseInt(row.value, 10);
      if (row.key === "reveal_hour") revealHour = parseInt(row.value, 10);
    }
  } catch (e) { console.error("[reveal] app_config read failed:", e); }

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: REVEAL_TZ, weekday: "short", hour: "2-digit", hour12: false })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  const parisDay = DAY_INDEX[parts.weekday as string];
  const parisHour = parseInt(parts.hour as string, 10);
  // Toute la durée de l'heure de reveal sert de fenêtre de flush (le cron passe chaque minute).
  return parisDay === revealDay && parisHour === revealHour;
}

type Member = { user_id: string; username: string; token: string | null };
type Photo = { user_id: string; created_at: string };

// Décide et envoie ce qui doit partir pour UN destinataire dans un groupe.
async function processUser(
  groupId: string,
  groupName: string,
  member: Member,
  recentPhotos: Photo[],
  stateByUser: Map<string, string | null>,
  nameById: Map<string, string>,
  now: number,
  forceSingle: boolean,
) {
  const u = member.user_id;
  if (!member.token) return; // pas de push token → rien à faire

  const oldLast = stateByUser.get(u) ?? null;
  const cooldownOver = !oldLast || (now - new Date(oldLast).getTime()) >= WINDOW_MS;
  if (!cooldownOver) return; // dans la fenêtre → on accumule en silence

  // Borne basse des moments "en attente" pour CE destinataire.
  const floorMs = oldLast ? Math.max(new Date(oldLast).getTime(), now - SAFETY_MS) : now - WINDOW_MS;
  const pending = recentPhotos.filter(
    (p) => p.user_id !== u && new Date(p.created_at).getTime() > floorMs,
  );
  if (pending.length === 0) return;

  // Auteurs distincts, dans l'ordre du 1er post (u en est forcément absent).
  const authorIds: string[] = [];
  for (const p of pending) if (!authorIds.includes(p.user_id)) authorIds.push(p.user_id);

  // Leading vs digest vs hold.
  let single: boolean;
  if (authorIds.length === 1) {
    if (oldLast === null) single = true;       // leading immédiat (#1)
    else if (forceSingle) single = true;       // flush reveal : on lâche le hold (#4 → garde-fou)
    else return;                               // 1 seul accumulé → on attend un 2e (#4)
  } else {
    single = false;                            // digest (#3)
  }

  // Claim atomique : on n'envoie que si last_notified_at n'a pas bougé entre-temps.
  const nowIso = new Date(now).toISOString();
  const { data: won, error: claimErr } = await sb.rpc("claim_notify", {
    p_group_id: groupId, p_user_id: u, p_old: oldLast, p_new: nowIso,
  });
  if (claimErr) { console.error(`[pu] ${groupId}/${u} claim error:`, claimErr.message); return; }
  if (won !== true) { console.log(`[pu] ${groupId}/${u} claim perdu`); return; }

  const names = authorIds.map((id) => nameById.get(id) ?? "Quelqu'un");
  let title: string, bodyText: string;
  if (single) {
    title = `${names[0]} a partagé !`;
    bodyText = `Un nouveau moment dans ${groupName}`;
  } else {
    const shown = names.slice(0, 2).join(", ");
    const others = authorIds.length - 2;
    bodyText = others > 0
      ? `${shown} et ${others} autre${others > 1 ? "s" : ""} ont partagé`
      : `${names.join(" et ")} ont partagé`;
    title = `Nouveaux moments dans ${groupName}`;
  }

  console.log(`[pu] ${groupId}/${u} ENVOI (${single ? "single" : "digest"}) — "${title}" / "${bodyText}"`);
  await sendPush([member.token], title, bodyText, { type: "new_photo", groupId });
}

// Traite tous les destinataires d'un groupe (leading sur insert, ou rattrapage cron).
async function processGroup(groupId: string, forceSingle: boolean) {
  const now = Date.now();

  const { data: g, error: gErr } = await sb.from("groups").select("id, name").eq("id", groupId).single();
  if (gErr || !g) { console.error(`[pg] ${groupId} group introuvable`, gErr?.message); return; }

  const { data: rawMembers } = await sb
    .from("group_members")
    .select("user_id, profiles:user_id(username, expo_push_token)")
    .eq("group_id", groupId);
  const members: Member[] = (rawMembers ?? []).map((m: any) => ({
    user_id: m.user_id,
    username: m.profiles?.username ?? "Quelqu'un",
    token: m.profiles?.expo_push_token ?? null,
  }));
  if (members.length === 0) return;
  const nameById = new Map(members.map((m) => [m.user_id, m.username]));

  const sinceIso = new Date(now - SAFETY_MS).toISOString();
  const { data: photos } = await sb
    .from("photos")
    .select("user_id, created_at")
    .eq("group_id", groupId)
    .gt("created_at", sinceIso)
    .order("created_at", { ascending: true });
  const recentPhotos: Photo[] = (photos ?? []) as Photo[];
  if (recentPhotos.length === 0) return;

  const { data: states } = await sb
    .from("notify_user_state")
    .select("user_id, last_notified_at")
    .eq("group_id", groupId);
  const stateByUser = new Map<string, string | null>((states ?? []).map((s: any) => [s.user_id, s.last_notified_at]));

  for (const m of members) {
    try {
      await processUser(groupId, g.name, m, recentPhotos, stateByUser, nameById, now, forceSingle);
    } catch (e) {
      console.error(`[pg] ${groupId} user ${m.user_id} failed`, e);
    }
  }
}

// Mode flush (cron) : tous les groupes ayant des partages récents.
async function flushAll() {
  const forceSingle = await isRevealHourNow();
  if (forceSingle) console.log("[flush] heure de reveal → on lâche les holds (moments solos en attente)");
  const since = new Date(Date.now() - SAFETY_MS).toISOString();
  const { data: rows } = await sb.from("photos").select("group_id").gt("created_at", since);
  const groupIds = [...new Set((rows ?? []).map((r: any) => r.group_id))];
  for (const gid of groupIds) {
    try { await processGroup(gid, forceSingle); } catch (e) { console.error("[share-notify] group failed", gid, e); }
  }
}

Deno.serve(async (req) => {
  if (SHARED_SECRET && req.headers.get("x-share-secret") !== SHARED_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  let body: any = {};
  try { body = await req.json(); } catch { /* corps vide (cron) */ }

  if (body?.group_id) {
    console.log(`[req] mode=group group_id=${body.group_id}`);
    await processGroup(String(body.group_id), false); // insert = leading, jamais de force
  } else {
    console.log(`[req] mode=flush (cron)`);
    await flushAll();
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});
