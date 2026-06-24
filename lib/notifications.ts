import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { supabase } from "./supabase";

// ── Register & Token ──

export async function registerForPushNotifications(userId: string) {
  if (!Device.isDevice) return;

  try {
    if (Platform.OS === "android") {
      // Sur Android le son d'une notif est porté par le channel (pas par le contenu).
      // Channel "default" → son basique pour toutes les notifs ; "reveal" → son du reveal.
      // NB: les noms de fichiers sont sans extension (ressource res/raw).
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
        enableVibrate: true,
        showBadge: true,
        sound: "basic_notification.wav",
      });
      await Notifications.setNotificationChannelAsync("reveal", {
        name: "reveal",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
        enableVibrate: true,
        showBadge: true,
        sound: "reveal_notification.wav",
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = (
      await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {})
    ).data;

    await supabase
      .from("profiles")
      .update({ expo_push_token: token })
      .eq("id", userId);

    return token;
  } catch (e: any) {
    console.warn("registerForPushNotifications error:", e);
  }
}

// ── Send Push ──

export async function sendPushToTokens(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
  // Son custom : iOS lit `sound` (nom de fichier), Android lit le son du `channelId`.
  // Par défaut : son basique. Pour le reveal, passer "reveal".
  variant: "basic" | "reveal" = "basic"
) {
  if (tokens.length === 0) return;

  const sound = variant === "reveal" ? "reveal_notification.wav" : "basic_notification.wav";
  const channelId = variant === "reveal" ? "reveal" : "default";

  const messages = tokens.map((to) => ({
    to,
    title,
    body,
    sound,
    data,
    channelId,
    priority: "high",
    vibrate: true,
  }));

  const sendBatch = async (batch: typeof messages) => {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(batch),
    });
    const res = await response.json();
    return res;
  };

  try {
    const result = await sendBatch(messages);
    
    if (result.errors) {
      const isMixedExperience = result.errors.some(
        (e: any) => e.code === "PUSH_TOO_MANY_EXPERIENCE_IDS"
      );

      if (isMixedExperience) {
        await Promise.all(
          messages.map(async (msg) => {
            try {
              const res = await sendBatch([msg]);
              if (res.errors) console.error("[Push] Erreur individuelle:", res.errors);
            } catch (e) {
              console.error("[Push] Échec envoi individuel:", e);
            }
          })
        );
      } else {
        console.warn("[Push] Erreurs API Expo:", result.errors);
      }
    } else if (result.data) {
      result.data.forEach((ticket: any, index: number) => {
        if (ticket.status === "error") {
          console.warn(`[Push] Erreur token ${tokens[index]}: ${ticket.message} | details: ${JSON.stringify(ticket.details)}`);
          if (ticket.details?.error === "DeviceNotRegistered") {
            supabase.from("profiles").update({ expo_push_token: null }).eq("expo_push_token", tokens[index]).then();
          }
        }
      });
    }
  } catch (e) {
    console.warn("[Push] Erreur fatale fetch:", e);
  }
}

export async function getGroupMemberTokens(
  groupId: string,
  excludeUserId?: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("group_members")
    .select("user_id, profiles:user_id(expo_push_token)")
    .eq("group_id", groupId);
  if (error || !data) return [];
  return data
    .filter((m: any) => m.user_id !== excludeUserId)
    .map((m: any) => m.profiles?.expo_push_token)
    .filter(Boolean);
}

// ── Recap (local notifications) ──

export async function scheduleRecapNotification(
  groupId: string,
  groupName: string,
  unlockDate: Date
) {
  if (!Notifications) return;
  const now = new Date();
  const secondsUntil = Math.floor((unlockDate.getTime() - now.getTime()) / 1000);
  if (secondsUntil <= 0) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `recap_${groupId}`,
      content: {
        title: "Le Reveal est disponible !",
        body: `Les moments de "${groupName}" sont disponibles`,
        data: { type: "recap", groupId },
        sound: "basic_notification.wav",
        channelId: "default",
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secondsUntil },
    });
  } catch (e) {
    console.warn("scheduleRecapNotification error:", e);
  }
}

export async function cancelAllRecapNotifications() {
  if (!Notifications) return;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      if (
        n.identifier.startsWith("recap_") ||
        n.identifier.startsWith("countdown_") ||
        n.identifier.startsWith("reactions_") ||
        n.identifier.startsWith("post_reminder_") ||
        n.identifier.startsWith("challenge_24h_") ||
        n.identifier.startsWith("challenge_4h_") ||
        n.identifier.startsWith("challenge_available_") ||
        n.identifier.startsWith("reveal_")
      ) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch (e) {
    console.warn("cancelAllRecapNotifications error:", e);
  }
}

export async function scheduleChallenge24hReminder(
  groupId: string,
  groupName: string,
  deadline: Date
) {
  if (!Notifications) return;
  const now = new Date();
  const twentyFourHoursBefore = new Date(deadline.getTime() - 24 * 3600 * 1000);
  const secondsUntil = Math.floor((twentyFourHoursBefore.getTime() - now.getTime()) / 1000);
  if (secondsUntil <= 0) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `challenge_24h_${groupId}_${deadline.getTime()}`,
      content: {
        title: "Tic, tac...",
        body: "Plus que 24H pour participer au défi !",
        data: { type: "new_photo", groupId },
        sound: "basic_notification.wav",
        channelId: "default",
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secondsUntil },
    });
  } catch (e) {
    console.warn("scheduleChallenge24hReminder error:", e);
  }
}

export async function scheduleChallenge4hReminder(
  groupId: string,
  groupName: string,
  deadline: Date
) {
  if (!Notifications) return;
  const now = new Date();
  const fourHoursBefore = new Date(deadline.getTime() - 4 * 3600 * 1000);
  const secondsUntil = Math.floor((fourHoursBefore.getTime() - now.getTime()) / 1000);
  if (secondsUntil <= 0) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `challenge_4h_${groupId}_${deadline.getTime()}`,
      content: {
        title: "Tic, tac...",
        body: "Plus que 4H pour participer au défi !",
        data: { type: "new_photo", groupId },
        sound: "basic_notification.wav",
        channelId: "default",
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secondsUntil },
    });
  } catch (e) {
    console.warn("scheduleChallenge4hReminder error:", e);
  }
}

export async function scheduleReactionsReminder(
  groupId: string,
  groupName: string,
  revealDate: Date
) {
  if (!Notifications) return;
  const now = new Date();
  // Lendemain du reveal à 9h
  const sendAt = new Date(revealDate);
  sendAt.setDate(sendAt.getDate() + 1);
  sendAt.setHours(9, 0, 0, 0);
  const secondsUntil = Math.floor((sendAt.getTime() - now.getTime()) / 1000);
  if (secondsUntil <= 0) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `reactions_${groupId}`,
      content: {
        title: groupName,
        body: "Venez voir les réactions de vos potes 👀",
        data: { type: "recap", groupId },
        sound: "basic_notification.wav",
        channelId: "default",
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secondsUntil },
    });
  } catch (e) {
    console.warn("scheduleReactionsReminder error:", e);
  }
}

export async function scheduleCountdownNotification(
  groupId: string,
  groupName: string,
  unlockDate: Date
) {
  if (!Notifications) return;
  const now = new Date();
  const sixHoursBefore = new Date(unlockDate.getTime() - 6 * 3600 * 1000);
  const secondsUntil = Math.floor((sixHoursBefore.getTime() - now.getTime()) / 1000);
  if (secondsUntil <= 0) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `countdown_${groupId}`,
      content: {
        title: "Le Reveal est disponible !",
        body: `Plus que 6h avant de découvrir les moments de "${groupName}"`,
        data: { type: "recap", groupId },
        sound: "basic_notification.wav",
        channelId: "default",
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secondsUntil },
    });
  } catch (e) {
    console.warn("scheduleCountdownNotification error:", e);
  }
}

// Reveal milestones — scheduled ONCE (not per group): every group reveals at the same global
// time, so a single notification per milestone avoids spamming N identical pushes to a user in
// N groups. Copy is intentionally group-agnostic.
export async function scheduleRevealNotifications(revealDate: Date) {
  if (!Notifications) return;
  const now = new Date();
  const milestones: { id: string; offsetMs: number; title: string; body: string; reveal?: boolean }[] = [
    { id: "reveal_24h", offsetMs: 24 * 3600 * 1000, title: "L'attente touche à sa fin", body: "Plus que 24H avant le reveal" },
    { id: "reveal_4h", offsetMs: 4 * 3600 * 1000, title: "L'attente touche à sa fin", body: "Plus que 4H avant le reveal" },
    // Reveal disponible → son dédié.
    { id: "reveal_available", offsetMs: 0, title: "LE REVEAL EST DISPO !", body: "Découvre le quotidien de tes proches :)", reveal: true },
  ];
  for (const m of milestones) {
    const sendAt = new Date(revealDate.getTime() - m.offsetMs);
    const secondsUntil = Math.floor((sendAt.getTime() - now.getTime()) / 1000);
    if (secondsUntil <= 0) continue;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: m.id,
        content: {
          title: m.title,
          body: m.body,
          data: { type: "recap" },
          sound: m.reveal ? "reveal_notification.wav" : "basic_notification.wav",
          channelId: m.reveal ? "reveal" : "default",
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secondsUntil },
      });
    } catch (e) {
      console.warn(`scheduleRevealNotifications (${m.id}) error:`, e);
    }
  }
}

// "Nouveau défi disponible" — scheduled ONCE for all groups (period timing is global).
//  • Period 1 challenge: 24h after the reveal that opens the week (reveal Sun 20h → Mon 20h).
//  • Period 2 challenge: the period boundary is Thursday 00:00, but we fire it Thursday at 09:00
//    (never in the middle of the night).
export async function scheduleNewChallengeNotifications(revealDate: Date) {
  if (!Notifications) return;
  const now = new Date();

  // revealDate is the UPCOMING reveal (end of this week). The week opened at the previous reveal.
  const weekStart = new Date(revealDate.getTime() - 7 * 24 * 3600 * 1000);
  const p1At = new Date(weekStart.getTime() + 24 * 3600 * 1000); // Monday 20:00

  const p2At = new Date(revealDate);
  p2At.setDate(p2At.getDate() - 3); // Thursday
  p2At.setHours(9, 0, 0, 0);        // Thursday 09:00

  const items = [
    { id: "challenge_available_p1", at: p1At },
    { id: "challenge_available_p2", at: p2At },
  ];
  for (const it of items) {
    const secondsUntil = Math.floor((it.at.getTime() - now.getTime()) / 1000);
    if (secondsUntil <= 0) continue;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: it.id,
        content: {
          title: "L'heure de juger tes potes",
          body: "Un nouveau défi t'attend, viens !",
          data: { type: "new_photo" },
          sound: "basic_notification.wav",
          channelId: "default",
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secondsUntil },
      });
    } catch (e) {
      console.warn(`scheduleNewChallengeNotifications (${it.id}) error:`, e);
    }
  }
}

export async function schedulePostReminderNotification(
  groupId: string,
  groupName: string,
  revealDate: Date
) {
  if (!Notifications) return;
  const now = new Date();
  const sendAt = new Date(revealDate.getTime() - 3 * 24 * 60 * 60 * 1000);
  sendAt.setHours(11, 0, 0, 0);
  const secondsUntil = Math.floor((sendAt.getTime() - now.getTime()) / 1000);
  if (secondsUntil <= 0) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `post_reminder_${groupId}`,
      content: {
        title: groupName,
        body: "Poste un moment pour déverrouiller le reveal de fin de semaine !",
        data: { type: "new_photo", groupId },
        sound: "basic_notification.wav",
        channelId: "default",
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secondsUntil },
    });
  } catch (e) {
    console.warn("schedulePostReminderNotification error:", e);
  }
}

export async function cancelPostReminderNotification(groupId: string) {
  try {
    await Notifications.cancelScheduledNotificationAsync(`post_reminder_${groupId}`);
  } catch (_) {}
}

export async function scheduleAllRecaps(userId: string) {
  if (!Notifications) return;
  await cancelAllRecapNotifications();
  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, groups:group_id(name)")
    .eq("user_id", userId);
  if (!memberships) return;

  const now = new Date();
  const day = now.getDay();
  const diffToSunday = day === 0 ? 0 : 7 - day;
  const sunday = new Date(now);
  sunday.setDate(now.getDate() + diffToSunday);
  sunday.setHours(20, 0, 0, 0);
  if (now >= sunday) {
    sunday.setDate(sunday.getDate() + 7);
  }

  // Reveal milestones (24h before / 4h before / available) — once for all groups.
  await scheduleRevealNotifications(sunday);
  // New-challenge notifications (period 1 & 2) — once for all groups.
  await scheduleNewChallengeNotifications(sunday);

  for (const m of memberships as any[]) {
    const groupName = m.groups?.name;
    if (groupName) {
      await scheduleReactionsReminder(m.group_id, groupName, sunday);
      await schedulePostReminderNotification(m.group_id, groupName, sunday);

      // Challenges reminders (24h + 4h before end of period)
      // Period 1: Ends Wednesday midnight (Thursday 00:00)
      const p1Deadline = new Date(sunday);
      p1Deadline.setDate(p1Deadline.getDate() - 3);
      p1Deadline.setHours(0, 0, 0, 0);
      await scheduleChallenge24hReminder(m.group_id, groupName, p1Deadline);
      await scheduleChallenge4hReminder(m.group_id, groupName, p1Deadline);

      // Period 2: Ends Sunday 20:00
      await scheduleChallenge24hReminder(m.group_id, groupName, sunday);
      await scheduleChallenge4hReminder(m.group_id, groupName, sunday);

      // Vérification asynchrone de la participation (après 2 jours)
      checkGroupParticipationAndNotify(m.group_id, groupName);
    }
  }
}

/**
 * Au bout de 2 jours si moins de 45% des membres dans le groupe ne postent pas, 
 * une notifications push s’envoie au groupe : ”N’oublie pas de partager un moment à ton groupe !“
 */
export async function checkGroupParticipationAndNotify(groupId: string, groupName: string) {
  try {
    const now = new Date();
    
    // Calcul du début de la semaine (dernier dimanche 20h)
    const day = now.getDay();
    const diffToSunday = day === 0 ? 0 : 7 - day;
    const sunday = new Date(now);
    sunday.setDate(now.getDate() + diffToSunday);
    sunday.setHours(20, 0, 0, 0);
    if (now >= sunday) {
      sunday.setDate(sunday.getDate() + 7);
    }
    const weekStart = new Date(sunday.getTime() - 7 * 24 * 3600 * 1000);
    
    // Seuil de 2 jours après le début de la semaine (Mardi 20h)
    const reminderThreshold = new Date(weekStart.getTime() + 2 * 24 * 3600 * 1000);
    if (now < reminderThreshold) return;

    // 1. Vérifier si une notification a déjà été envoyée cette semaine pour ce groupe
    const { data: existing, error: checkError } = await supabase
      .from("group_notifications")
      .select("sent_at")
      .eq("group_id", groupId)
      .eq("notification_type", "participation_reminder")
      .gte("sent_at", weekStart.toISOString())
      .limit(1);

    if (checkError || (existing && existing.length > 0)) return;

    // 2. Calculer le taux de participation actuel
    const [membersRes, photosRes] = await Promise.all([
      supabase.from("group_members").select("user_id", { count: "exact", head: true }).eq("group_id", groupId),
      supabase.from("photos")
        .select("user_id")
        .eq("group_id", groupId)
        .gte("created_at", weekStart.toISOString())
    ]);

    const memberCount = membersRes.count || 0;
    if (memberCount === 0) return;

    const uniquePosters = new Set((photosRes.data || []).map((p: any) => p.user_id)).size;
    const participationRate = uniquePosters / memberCount;

    // 3. Si participation < 45%, envoyer le rappel
    if (participationRate < 0.45) {
      const tokens = await getGroupMemberTokens(groupId);
      if (tokens.length > 0) {
        await sendPushToTokens(
          tokens,
          groupName,
          "N’oublie pas de partager un moment à ton groupe !"
        );
        
        // 4. Marquer comme envoyé dans la base de données
        await supabase
          .from("group_notifications")
          .insert({
            group_id: groupId,
            notification_type: "participation_reminder",
            sent_at: now.toISOString()
          });
      }
    }
  } catch (e) {
    console.error("Error in checkGroupParticipationAndNotify:", e);
  }
}

// ── Anti-spam Photo Notification ──

export async function notifyNewPhoto(
  groupId: string,
  groupName: string,
  senderName: string,
  senderId: string
) {
  const tokens = await getGroupMemberTokens(groupId, senderId);
  if (tokens.length === 0) return;
  await sendPushToTokens(tokens, `${senderName} a partagé !`, `Un nouveau moment dans ${groupName}`, { type: "new_photo", groupId });
}

// Notify the EXISTING members when someone joins their group. The joiner has already been
// inserted into group_members, so getGroupMemberTokens(..., joinerId) correctly returns everyone
// except them. joinerName is optional — fetched here if not supplied, so call sites stay minimal.
export async function notifyGroupJoin(
  groupId: string,
  groupName: string,
  joinerId: string,
  joinerName?: string
) {
  const tokens = await getGroupMemberTokens(groupId, joinerId);
  if (tokens.length === 0) return;
  let name = joinerName;
  if (!name) {
    const { data } = await supabase.from("profiles").select("username").eq("id", joinerId).single();
    name = data?.username ?? "Quelqu'un";
  }
  await sendPushToTokens(tokens, `${name} est dans la place !`, `Un nouveau membre a rejoint ${groupName}`, { type: "group_join", groupId });
}

export async function notifyGroupInvite(
  invitedUserId: string,
  groupName: string
) {
  const { data } = await supabase.from("profiles").select("expo_push_token").eq("id", invitedUserId).single();
  const token = data?.expo_push_token;
  if (!token) return;
  await sendPushToTokens([token], "Nouvelle invitation !", `Tu as ete invite a rejoindre "${groupName}"`, { type: "invite", groupName });
}

export async function notifyReaction(
  photoOwnerId: string,
  reactorName: string,
  sticker: string,
  groupName: string,
  reactorId: string
): Promise<void> {
  if (photoOwnerId === reactorId) return;
  try {
    const { data } = await supabase.from("profiles").select("expo_push_token").eq("id", photoOwnerId).single();
    const token = data?.expo_push_token;
    if (!token) return;
    await sendPushToTokens([token], `${reactorName} a réagi !`, "Viens voir les dernières réactions", { type: "new_photo", groupName });
  } catch (e) {
    console.warn("[Notif] notifyReaction error:", e);
  }
}

// ── First moment reminder ──

export async function scheduleFirstMomentReminder(groupId: string, groupName: string) {
  const now = new Date();
  const target = new Date(now.getTime() + 4 * 3600 * 1000);

  let sendAt: Date;
  const h = target.getHours();

  if (h >= 9 && h < 20) {
    sendAt = target;
  } else {
    sendAt = new Date(now);
    sendAt.setHours(13, 0, 0, 0);
    if (sendAt <= now) sendAt.setDate(sendAt.getDate() + 1);
  }

  const secondsUntil = Math.floor((sendAt.getTime() - now.getTime()) / 1000);
  if (secondsUntil <= 0) return;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `first_moment_${groupId}`,
      content: {
        title: groupName,
        body: "Partage ton premier souvenir avec le groupe !",
        data: { type: "new_photo", groupId },
        sound: "basic_notification.wav",
        channelId: "default",
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secondsUntil },
    });
  } catch (e) {
    console.warn("scheduleFirstMomentReminder error:", e);
  }
}

export async function cancelFirstMomentReminder(groupId: string) {
  try {
    await Notifications.cancelScheduledNotificationAsync(`first_moment_${groupId}`);
  } catch (_) {}
}

// ── "Tu dors ?" — fires 24h after the user's LAST share. Call it on every successful upload:
// it cancels the previous one and re-arms +24h, so it only fires if the user goes 24h without
// sharing. Clamped to daytime (9h–22h) so it never lands in the middle of the night.
export async function scheduleNoShareReminder() {
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync("no_share_24h");
  } catch (_) {}

  const now = new Date();
  const sendAt = new Date(now.getTime() + 24 * 3600 * 1000);
  const h = sendAt.getHours();
  if (h < 9) {
    sendAt.setHours(9, 0, 0, 0);
  } else if (h >= 22) {
    sendAt.setDate(sendAt.getDate() + 1);
    sendAt.setHours(9, 0, 0, 0);
  }

  const secondsUntil = Math.floor((sendAt.getTime() - now.getTime()) / 1000);
  if (secondsUntil <= 0) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: "no_share_24h",
      content: {
        title: "Tu dors ?",
        body: "24H que tu n'as rien partagé",
        data: { type: "new_photo" },
        sound: "basic_notification.wav",
        channelId: "default",
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secondsUntil },
    });
  } catch (e) {
    console.warn("scheduleNoShareReminder error:", e);
  }
}

// ── Motivational Notifications ──

export async function cancelAllMotivationalNotifications() {
  if (!Notifications) return;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      if (n.identifier.startsWith("motivational_")) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch (e) {
    console.warn("cancelAllMotivationalNotifications error:", e);
  }
}

export async function scheduleMotivationalNotifications(count: number, periods: ("morning" | "afternoon" | "evening")[]) {
  if (!Notifications || count === 0 || periods.length === 0) {
    await cancelAllMotivationalNotifications();
    return;
  }

  await cancelAllMotivationalNotifications();

  // 1. Récupérer les messages
  const { data: dbMessages } = await supabase.from("motivational_notifications").select("category, message");
  if (!dbMessages || dbMessages.length === 0) return;

  const windows: Record<string, { start: number; end: number }> = {
    morning: { start: 7, end: 10 },
    afternoon: { start: 15, end: 18 },
    evening: { start: 19, end: 23 },
  };

  const activeSlots = [...periods];
  if (periods.includes("morning") && periods.includes("afternoon")) {
    activeSlots.push("noon" as any);
    windows["noon"] = { start: 12, end: 14 };
  }

  const now = new Date();

  // 2. Planifier pour les 7 prochains jours
  for (let day = 0; day < 7; day++) {
    // Déterminer combien de notifs par créneau pour ce jour
    const dailySlotsCount: Record<string, number> = {};
    const slotsPool = [...activeSlots].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < count; i++) {
      const slot = slotsPool[i % slotsPool.length];
      dailySlotsCount[slot] = (dailySlotsCount[slot] || 0) + 1;
    }

    const usedMessages = new Set<string>();

    // Pour chaque créneau actif, on répartit les notifs qui lui sont assignées
    for (const slot of Object.keys(dailySlotsCount)) {
      const nInSlot = dailySlotsCount[slot];
      const win = windows[slot];
      
      // On divise la fenêtre en N segments pour bien répartir
      const totalMinutes = (win.end - win.start) * 60;
      const segmentMinutes = totalMinutes / nInSlot;

      for (let j = 0; j < nInSlot; j++) {
        // Heure aléatoire dans son segment dédié
        const randomOffset = Math.floor(Math.random() * segmentMinutes);
        const minutesFromStart = Math.floor((j * segmentMinutes) + randomOffset);
        
        const hour = win.start + Math.floor(minutesFromStart / 60);
        const minute = minutesFromStart % 60;

        let scheduledDate = new Date();
        scheduledDate.setDate(scheduledDate.getDate() + day);
        scheduledDate.setHours(hour, minute, 0, 0);

        if (day === 0 && scheduledDate <= now) continue;

        // Sélection du message
        const contextual = dbMessages.filter(m => m.category === slot && !usedMessages.has(m.message));
        const randoms = dbMessages.filter(m => m.category === "random" && !usedMessages.has(m.message));
        
        let pool = [...randoms];
        if (Math.random() > 0.5 && contextual.length > 0) pool = contextual;
        else if (pool.length === 0) pool = contextual.length > 0 ? contextual : dbMessages;

        const chosen = pool[Math.floor(Math.random() * pool.length)];
        usedMessages.add(chosen.message);

        const secondsUntil = Math.floor((scheduledDate.getTime() - now.getTime()) / 1000);
        if (secondsUntil <= 0) continue;

        await Notifications.scheduleNotificationAsync({
          identifier: `motivational_${day}_${slot}_${j}`,
          content: {
            title: "Disclose",
            body: chosen.message,
            sound: "basic_notification.wav",
            channelId: "default",
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secondsUntil },
        });
      }
    }
  }
}

// ── Setup notification handler (FIXED WARNING) ──

export function setupNotificationHandler() {
  if (!Notifications) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function scheduleImmediateLocalNotification(title: string, body: string, data?: any) {
  if (!Notifications) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound: "basic_notification.wav", channelId: "default" },
      trigger: null,
    });
  } catch (e) {
    console.warn("scheduleImmediateLocalNotification error:", e);
  }
}
