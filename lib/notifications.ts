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
        console.error("[Push] Erreurs API Expo:", result.errors);
      }
    } else if (result.data) {
      // Log du statut de chaque ticket
      result.data.forEach((ticket: any, index: number) => {
        if (ticket.status === "error") {
          console.error(`[Push] Erreur pour le token ${tokens[index]}:`, ticket.message);
        } else {
          console.log(`[Push] Ticket de succès créé: ${ticket.id}`);
        }
      });
    }
  } catch (e) {
    console.error("[Push] Erreur fatale fetch:", e);
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
      if (n.identifier.startsWith("recap_") || n.identifier.startsWith("countdown_")) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch (e) {
    console.warn("cancelAllRecapNotifications error:", e);
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
    }
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
