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
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
        enableVibrate: true,
        showBadge: true,
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

    const deviceToken = await Notifications.getDevicePushTokenAsync();
    console.log("APNs device token:", deviceToken.data);

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
  data?: Record<string, unknown>
) {
  if (tokens.length === 0) return;

  const messages = tokens.map((to) => ({
    to,
    title,
    body,
    sound: "default" as const,
    data,
    channelId: "default",
    priority: "high",
    vibrate: true,
  }));

  const sendBatch = async (batch: typeof messages) => {
    console.log(`[Push] Envoi de ${batch.length} notification(s) à Expo...`);
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(batch),
    });
    const res = await response.json();
    console.log("[Push] Réponse Expo:", JSON.stringify(res));
    return res;
  };

  try {
    const result = await sendBatch(messages);
    
    if (result.errors) {
      const isMixedExperience = result.errors.some(
        (e: any) => e.code === "PUSH_TOO_MANY_EXPERIENCE_IDS"
      );

      if (isMixedExperience) {
        console.log("[Push] Experience IDs mixtes détectés, passage en envoi individuel...");
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
        } else {
          console.log(`[Push] Ticket OK: ${ticket.id}`);
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
        title: "Le coffre est ouvert !",
        body: `Les moments de "${groupName}" sont disponibles`,
        data: { type: "recap", groupId },
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
        n.identifier.startsWith("challenge_24h_")
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
        title: groupName,
        body: "Plus que 24H pour participer au défis",
        data: { type: "new_photo", groupId },
        channelId: "default",
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secondsUntil },
    });
  } catch (e) {
    console.warn("scheduleChallenge24hReminder error:", e);
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
        title: "Le coffre ouvre bientôt 🔓",
        body: `Plus que 6h avant de découvrir les moments de "${groupName}"`,
        data: { type: "recap", groupId },
        channelId: "default",
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secondsUntil },
    });
  } catch (e) {
    console.warn("scheduleCountdownNotification error:", e);
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

  for (const m of memberships as any[]) {
    const groupName = m.groups?.name;
    if (groupName) {
      await scheduleRecapNotification(m.group_id, groupName, sunday);
      await scheduleCountdownNotification(m.group_id, groupName, sunday);
      await scheduleReactionsReminder(m.group_id, groupName, sunday);
      await schedulePostReminderNotification(m.group_id, groupName, sunday);
      
      // Challenges reminders (24h before end of period)
      // Period 1: Ends Wednesday midnight (Thursday 00:00)
      const p1Deadline = new Date(sunday);
      p1Deadline.setDate(p1Deadline.getDate() - 3);
      p1Deadline.setHours(0, 0, 0, 0); 
      await scheduleChallenge24hReminder(m.group_id, groupName, p1Deadline);
      
      // Period 2: Ends Sunday 20:00
      await scheduleChallenge24hReminder(m.group_id, groupName, sunday);

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
        console.log(`[Participation] Envoi rappel pour "${groupName}" (${Math.round(participationRate * 100)}% de participation)`);
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
  await sendPushToTokens(tokens, groupName, `${senderName} a partage un moment !`, { type: "new_photo", groupId });
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
    await sendPushToTokens([token], groupName, `${reactorName} a réagi à ton moment ${sticker}`);
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
            title: "HappyOur ✨",
            body: chosen.message,
            sound: "default",
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
      content: { title, body, data, channelId: "default" },
      trigger: null,
    });
  } catch (e) {
    console.warn("scheduleImmediateLocalNotification error:", e);
  }
}
