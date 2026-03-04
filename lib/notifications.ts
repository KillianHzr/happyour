import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { supabase } from "./supabase";

// Detect Expo Go — expo-notifications is not supported there since SDK 53
const isExpoGo = Constants.appOwnership === "expo";

// Only require expo-notifications in dev builds / standalone
let Notifications: typeof import("expo-notifications") | null = null;
if (!isExpoGo) {
  try {
    Notifications = require("expo-notifications");
  } catch {
    // module not available
  }
}

let Device: typeof import("expo-device") | null = null;
if (!isExpoGo) {
  try {
    Device = require("expo-device");
  } catch {}
}

// ── Register & Token ──

export async function registerForPushNotifications(userId: string) {
  if (!Notifications || !Device) {
    console.log("Notifications not available (Expo Go?)");
    return;
  }

  if (!Device.isDevice) {
    console.log("Push notifications require a physical device");
    return;
  }

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("Push notification permission not granted");
      return;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = (
      await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {})
    ).data;

    await supabase
      .from("profiles")
      .update({ expo_push_token: token })
      .eq("id", userId);

    return token;
  } catch (e) {
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

  const messages = tokens.map((to) => ({ to, title, body, sound: "default" as const, data }));

  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });
  } catch (e) {
    console.error("sendPushToTokens error:", e);
  }
}

// ── Get Group Member Tokens ──

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
      if (n.identifier.startsWith("recap_")) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch (e) {
    console.warn("cancelAllRecapNotifications error:", e);
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
    }
  }
}

// ── Anti-spam Photo Notification ──

interface PhotoNotifState {
  lastNotifAt: number;
  countSince: number;
}

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const GROUPED_THRESHOLD = 3;

function isSameDay(ts1: number, ts2: number): boolean {
  const d1 = new Date(ts1);
  const d2 = new Date(ts2);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

export async function notifyNewPhoto(
  groupId: string,
  groupName: string,
  senderName: string,
  senderId: string
) {
  const key = `notif_photo_${groupId}`;
  const now = Date.now();

  let state: PhotoNotifState | null = null;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) state = JSON.parse(raw);
  } catch {}

  const tokens = await getGroupMemberTokens(groupId, senderId);
  if (tokens.length === 0) return;

  let shouldNotify = false;
  let isGrouped = false;

  if (!state || !isSameDay(state.lastNotifAt, now)) {
    shouldNotify = true;
  } else if (now - state.lastNotifAt >= FIVE_HOURS_MS) {
    shouldNotify = true;
  } else if (state.countSince + 1 >= GROUPED_THRESHOLD) {
    shouldNotify = true;
    isGrouped = true;
  }

  if (shouldNotify) {
    const title = groupName;
    const body = isGrouped
      ? `${state!.countSince + 1} nouveaux moments dans ${groupName}`
      : `${senderName} a partage un moment dans ${groupName}`;

    await sendPushToTokens(tokens, title, body, { type: "new_photo", groupId });

    await AsyncStorage.setItem(
      key,
      JSON.stringify({ lastNotifAt: now, countSince: 0 } satisfies PhotoNotifState)
    );
  } else {
    const newState: PhotoNotifState = {
      lastNotifAt: state!.lastNotifAt,
      countSince: (state?.countSince ?? 0) + 1,
    };
    await AsyncStorage.setItem(key, JSON.stringify(newState));
  }
}

// ── Group Invite Notification ──

export async function notifyGroupInvite(
  invitedUserId: string,
  groupName: string
) {
  const { data } = await supabase
    .from("profiles")
    .select("expo_push_token")
    .eq("id", invitedUserId)
    .single();

  const token = data?.expo_push_token;
  if (!token) return;

  await sendPushToTokens(
    [token],
    "Nouvelle invitation !",
    `Tu as ete invite a rejoindre "${groupName}"`,
    { type: "invite", groupName }
  );
}

// ── Setup notification handler (call from root layout) ──

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

// ── Schedule immediate local notification (for dev testing) ──

export async function scheduleImmediateLocalNotification(title: string, body: string) {
  if (!Notifications) {
    console.log("Notifications not available (Expo Go?)");
    return;
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null,
    });
  } catch (e) {
    console.warn("scheduleImmediateLocalNotification error:", e);
  }
}
