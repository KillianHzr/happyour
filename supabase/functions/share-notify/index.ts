// Edge Function : notifications de partage avec digest "leading + trailing".
//
// Comportement (par groupe, fenêtre = SHARE_COOLDOWN_MIN) :
//  - 1er partage après une période calme  → notif IMMÉDIATE (leading).
//  - partages suivants pendant la fenêtre → accumulés (silence).
//  - à la fin de la fenêtre, s'il y a des accumulés → 1 notif REGROUPÉE (digest),
//    puis la fenêtre est réarmée.
//
// Deux modes d'invocation :
//  - { group_id }  → traite ce groupe (appelé par le client juste après l'upload = leading immédiat).
//  - {}            → mode "flush" (appelé par pg_cron chaque minute = trailing + rattrapage).
//
// La concurrence (client + cron en même temps) est gérée par un UPDATE conditionnel atomique
// sur groups.notify_last_at (un seul invocateur "gagne" le droit d'envoyer).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SHARE_COOLDOWN_MIN = 30;
const COOLDOWN_MS = SHARE_COOLDOWN_MIN * 60 * 1000;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Secret partagé : le trigger / cron / client doivent envoyer ce header pour appeler la fonction.
const SHARED_SECRET = Deno.env.get("SHARE_NOTIFY_SECRET") ?? "";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// ── Envoi Expo Push (porté depuis lib/notifications.ts) ──
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

  // Expo accepte des lots, MAIS refuse de mélanger des tokens de projets Expo différents
  // (PUSH_TOO_MANY_EXPERIENCE_IDS). On tente le lot ; en cas de conflit, on renvoie chaque
  // message individuellement (chaque message = 1 token = 1 seul projet).
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const res = await post(batch);
      const mixed = Array.isArray(res?.errors) && res.errors.some((e: any) => e.code === "PUSH_TOO_MANY_EXPERIENCE_IDS");
      if (mixed) {
        console.log(`[push] lot mixte (projets Expo multiples) → renvoi individuel de ${batch.length} messages`);
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

// Traite UN groupe : décide d'envoyer (leading/digest) ou d'accumuler.
async function processGroup(groupId: string) {
  const { data: g, error: gErr } = await sb.from("groups").select("id, name, notify_last_at").eq("id", groupId).single();
  if (gErr) { console.error(`[pg] ${groupId} SELECT groups error:`, gErr.message); return; }
  if (!g) { console.log(`[pg] ${groupId} group introuvable`); return; }

  const oldLast: string | null = g.notify_last_at;
  const now = Date.now();
  const cooldownOver = !oldLast || (now - new Date(oldLast).getTime()) >= COOLDOWN_MS;
  console.log(`[pg] ${groupId} oldLast=${oldLast} cooldownOver=${cooldownOver}`);
  if (!cooldownOver) { console.log(`[pg] ${groupId} SKIP cooldown actif`); return; }

  // Borne : depuis la dernière notif ; si jamais notifié (null), on ne regarde QUE la fenêtre
  // récente (pas tout l'historique du groupe, sinon "tout le monde a posté" → 0 destinataire).
  const sinceIso = oldLast ?? new Date(now - COOLDOWN_MS).toISOString();
  const { data: newPhotos } = await sb
    .from("photos")
    .select("user_id, created_at")
    .eq("group_id", groupId)
    .gt("created_at", sinceIso)
    .order("created_at", { ascending: true });
  console.log(`[pg] ${groupId} newPhotos=${newPhotos?.length ?? 0}`);
  if (!newPhotos || newPhotos.length === 0) return; // rien de nouveau

  // ── Réservation atomique : on ne poursuit que si notify_last_at n'a pas bougé entre-temps
  //    (sinon un autre invocateur — client ou cron — a déjà envoyé) ──
  let claim = sb.from("groups").update({ notify_last_at: new Date(now).toISOString() }).eq("id", groupId);
  claim = oldLast === null ? claim.is("notify_last_at", null) : claim.eq("notify_last_at", oldLast);
  const { data: claimed, error: claimErr } = await claim.select("id");
  if (claimErr) console.error(`[pg] ${groupId} claim error:`, claimErr.message);
  console.log(`[pg] ${groupId} claimed=${claimed?.length ?? 0}`);
  if (!claimed || claimed.length === 0) { console.log(`[pg] ${groupId} SKIP claim perdu`); return; }

  const contributorIds = [...new Set(newPhotos.map((p: any) => p.user_id))];

  const { data: profs } = await sb.from("profiles").select("id, username").in("id", contributorIds);
  const nameById = new Map((profs ?? []).map((p: any) => [p.id, p.username ?? "Quelqu'un"]));
  const names = contributorIds.map((id) => nameById.get(id) ?? "Quelqu'un");

  // Destinataires :
  //  - leading (1 seul auteur) → tout le monde SAUF lui (on ne se notifie pas soi-même).
  //  - digest (plusieurs auteurs) → TOUT LE MONDE, y compris les auteurs : poster un moment
  //    ne doit pas priver quelqu'un des notifs des autres.
  const excluded = contributorIds.length === 1 ? contributorIds : [];
  const { data: members } = await sb
    .from("group_members")
    .select("user_id, profiles:user_id(expo_push_token)")
    .eq("group_id", groupId);
  const tokens = (members ?? [])
    .filter((m: any) => !excluded.includes(m.user_id))
    .map((m: any) => m.profiles?.expo_push_token)
    .filter(Boolean) as string[];
  console.log(`[pg] ${groupId} contributors=${contributorIds.length} recipients=${tokens.length}`);
  if (tokens.length === 0) return;

  let title: string;
  let bodyText: string;
  if (contributorIds.length === 1) {
    title = `${names[0]} a partagé !`;
    bodyText = `Un nouveau moment dans ${g.name}`;
  } else {
    const shown = names.slice(0, 2).join(", ");
    const others = contributorIds.length - 2;
    bodyText = others > 0
      ? `${shown} et ${others} autre${others > 1 ? "s" : ""} ont partagé`
      : `${names.join(" et ")} ont partagé`;
    title = `Nouveaux moments dans ${g.name}`;
  }

  console.log(`[pg] ${groupId} ENVOI à ${tokens.length} tokens — "${title}" / "${bodyText}"`);
  await sendPush(tokens, title, bodyText, { type: "new_photo", groupId });
}

// Mode flush (cron) : tous les groupes ayant des partages récents non encore notifiés.
async function flushAll() {
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // fenêtre de sécurité 3h
  const { data: rows } = await sb.from("photos").select("group_id").gt("created_at", since);
  const groupIds = [...new Set((rows ?? []).map((r: any) => r.group_id))];
  for (const gid of groupIds) {
    try { await processGroup(gid); } catch (e) { console.error("[share-notify] group failed", gid, e); }
  }
}

Deno.serve(async (req) => {
  // Auth simple par secret partagé.
  if (SHARED_SECRET && req.headers.get("x-share-secret") !== SHARED_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  let body: any = {};
  try { body = await req.json(); } catch { /* corps vide (cron) */ }

  if (body?.group_id) {
    console.log(`[req] mode=group group_id=${body.group_id}`);
    await processGroup(String(body.group_id));
  } else {
    console.log(`[req] mode=flush (cron)`);
    await flushAll();
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});
