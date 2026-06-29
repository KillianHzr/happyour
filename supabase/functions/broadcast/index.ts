// Edge Function : envoi d'une notification push à TOUS les utilisateurs (ou à un seul).
//
// Usage (POST, header x-share-secret) :
//   {}                                  → notif "reveal dispo" par défaut (texte/son du reveal)
//   { "title": "...", "body": "..." }   → notif personnalisée
//   { "variant": "reveal" | "basic" }   → choisit le son (défaut: reveal)
//   { "email": "..." }                  → cible UN seul utilisateur (par email auth)
//   { "userId": "uuid" }                → cible UN seul utilisateur (par id profil)
// Sans email/userId → broadcast à tout le monde (comportement par défaut).
//
// ⚠️ Purement cosmétique : envoyer cette notif ne déverrouille RIEN dans l'app (la dispo du
// reveal est calculée côté client). Sert p.ex. à déclencher la notif pendant une démo.
//
// Reprend de share-notify : auth par secret partagé, envoi par lots de 100, re-split message
// par message si les tokens viennent de projets Expo différents (PUSH_TOO_MANY_EXPERIENCE_IDS),
// et nettoyage en DB des tokens DeviceNotRegistered.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHARED_SECRET = Deno.env.get("SHARE_NOTIFY_SECRET") ?? "";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// Texte/son par défaut = la notif "reveal disponible" (cf. lib/notifications.ts).
const DEFAULT_TITLE = "LE REVEAL EST DISPO !";
const DEFAULT_BODY = "Découvre le quotidien de tes proches :)";

async function sendPush(tokens: string[], title: string, body: string, sound: string, channelId: string) {
  if (tokens.length === 0) return;
  const messages = tokens.map((to) => ({
    to, title, body, sound, channelId,
    priority: "high",
    vibrate: true,
    data: { type: "recap" },
  }));

  const post = async (batch: typeof messages) => {
    const r = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(batch),
    });
    return await r.json();
  };

  // Map token → index pour pouvoir nullifier les DeviceNotRegistered.
  const deadTokens: string[] = [];
  const handleTickets = (tickets: any, batch: typeof messages) => {
    const data = tickets?.data;
    if (!Array.isArray(data)) return;
    data.forEach((t: any, i: number) => {
      if (t?.status === "error" && t?.details?.error === "DeviceNotRegistered") {
        deadTokens.push(batch[i].to);
      }
    });
  };

  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const res = await post(batch);
      const mixed = Array.isArray(res?.errors) && res.errors.some((e: any) => e.code === "PUSH_TOO_MANY_EXPERIENCE_IDS");
      if (mixed) {
        console.log(`[push] lot mixte (projets Expo multiples) → renvoi individuel de ${batch.length} messages`);
        for (const m of batch) {
          try {
            const r = await post([m]);
            handleTickets(r, [m]);
          } catch (e) { console.error("[push] envoi individuel échoué:", e); }
        }
      } else {
        handleTickets(res, batch);
        console.log(`[push] ${batch.length} envoyés — réponse:`, JSON.stringify(res).slice(0, 300));
      }
    } catch (e) {
      console.error("[broadcast] push batch failed:", e);
    }
  }

  // Nettoyage des tokens morts.
  if (deadTokens.length > 0) {
    console.log(`[push] nullification de ${deadTokens.length} tokens DeviceNotRegistered`);
    await sb.from("profiles").update({ expo_push_token: null }).in("expo_push_token", deadTokens);
  }
}

Deno.serve(async (req) => {
  if (SHARED_SECRET && req.headers.get("x-share-secret") !== SHARED_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* corps vide */ }

  const title = typeof body?.title === "string" && body.title ? body.title : DEFAULT_TITLE;
  const text = typeof body?.body === "string" && body.body ? body.body : DEFAULT_BODY;
  const variant = body?.variant === "basic" ? "basic" : "reveal";
  const sound = variant === "reveal" ? "reveal_notification.wav" : "basic_notification.wav";
  const channelId = variant === "reveal" ? "reveal" : "default";

  // Ciblage optionnel d'un seul utilisateur (par id ou email). Sinon : tout le monde.
  // L'email vit dans auth.users (pas dans profiles) → on le résout via l'API admin Auth.
  let targetUserId = typeof body?.userId === "string" && body.userId ? body.userId : null;
  const targetEmail = typeof body?.email === "string" && body.email ? body.email.trim().toLowerCase() : null;

  if (!targetUserId && targetEmail) {
    // Parcourt les pages de auth.users pour trouver l'id correspondant à l'email.
    let found: string | null = null;
    for (let page = 1; page <= 50 && !found; page++) {
      const { data, error: listErr } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
      if (listErr) {
        console.error("[broadcast] listUsers error:", listErr.message);
        return new Response(JSON.stringify({ ok: false, error: listErr.message }), { status: 500 });
      }
      const users = data?.users ?? [];
      const hit = users.find((u: any) => (u.email ?? "").toLowerCase() === targetEmail);
      if (hit) found = hit.id;
      if (users.length < 1000) break; // dernière page
    }
    if (!found) {
      console.log(`[broadcast] email introuvable: ${targetEmail}`);
      return new Response(JSON.stringify({ ok: false, error: "email introuvable", sent: 0 }), {
        status: 404, headers: { "Content-Type": "application/json" },
      });
    }
    targetUserId = found;
  }

  let query = sb
    .from("profiles")
    .select("expo_push_token")
    .not("expo_push_token", "is", null);
  if (targetUserId) query = query.eq("id", targetUserId);

  const { data: rows, error } = await query;
  if (error) {
    console.error("[broadcast] select error:", error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }

  const target = targetEmail ? `email=${targetEmail}` : targetUserId ? `userId=${targetUserId}` : "ALL";
  const tokens = [...new Set((rows ?? []).map((r: any) => r.expo_push_token).filter(Boolean))] as string[];
  console.log(`[broadcast] (${target}) "${title}" / "${text}" → ${tokens.length} tokens`);
  await sendPush(tokens, title, text, sound, channelId);

  return new Response(JSON.stringify({ ok: true, sent: tokens.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
