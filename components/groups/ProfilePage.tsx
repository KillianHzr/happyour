import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, KeyboardAvoidingView, Platform, TextInput,
  ActivityIndicator, Alert, RefreshControl, Animated, Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { decode } from "base64-arraybuffer";
import Svg, { Path, Circle } from "react-native-svg";
import { supabase } from "../../lib/supabase";
import { r2Storage } from "../../lib/r2";
import { mediaCache } from "../../lib/media-cache";
import {
  getCurrentSeasonStart, getChallengePrompt, getWinnerResponseIds,
  mapChallenge, CHALLENGE_SELECT,
  type ChallengeWithData,
} from "../../lib/challenges";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { useTheme, useThemedStyles, type ThemePreference } from "../../lib/theme-context";
import PhotoFeed from "../PhotoFeed";
import type { PhotoEntry, Reaction } from "../PhotoFeed";
import MotivationalNotificationsModal from "../MotivationalNotificationsModal";
import DeleteAccountModal from "../DeleteAccountModal";
import { radii, spacing, textStyles, typography, type ThemeColors } from "../../lib/theme";
import Icon from "../Icon";
import BottomSheet from "../BottomSheet";
import SettingsSheet from "../SettingsSheet";
import SettingsMainContent from "../settings/SettingsMainContent";

const MONTH_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

// ─── Date helpers ────────────────────────────────────────────────────────────
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return Math.ceil(((d.getTime() - y0.getTime()) / 86400000 + 1) / 7);
}

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function fmtDDMM(d: Date): string {
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`;
}

function weekKey(monday: Date): string {
  return monday.toISOString().slice(0, 10);
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const DAY_LABELS = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];

// Reveal window for a week (given its Monday)
function weekRevealDates(monday: Date, revealDay: number, revealHour: number) {
  const daysFromMon = revealDay === 0 ? 6 : revealDay - 1;
  const revealStart = new Date(monday);
  revealStart.setDate(monday.getDate() + daysFromMon);
  revealStart.setHours(revealHour, 0, 0, 0);
  const revealEnd = new Date(revealStart.getTime() + 24 * 3600 * 1000);
  const photoStart = new Date(revealStart.getTime() - 7 * 24 * 3600 * 1000);
  const photoEnd = revealStart;
  return { revealStart, revealEnd, photoStart, photoEnd };
}

function isWeekViewable(monday: Date, revealDay: number, revealHour: number): boolean {
  return Date.now() >= weekRevealDates(monday, revealDay, revealHour).revealEnd.getTime();
}

function getMonthWeeks(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const mondays: Date[] = [];
  let d = getMondayOf(first);
  while (d <= last) { mondays.push(new Date(d)); d = addDays(d, 7); }
  return mondays;
}

// ─── Types ───────────────────────────────────────────────────────────────────
type Props = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  email: string;
  groupName?: string;
  allGroups: { id: string; name: string }[];
  revealConfig: { day: number; hour: number };
  onAvatarUpdate: (url: string) => void;
  onUsernameUpdate: (name: string) => void;
  onStreakUpdate: (days: number) => void;
  isActive?: boolean;
  refreshKey?: number;
};

// ─── SVG Icons ───────────────────────────────────────────────────────────────
const FlameIcon = ({ size = 18, color = "#FFA600" }: { size?: number; color?: string }) => (
  <Svg width={size} height={Math.round(size * 21 / 16)} viewBox="0 0 16 21" fill="none">
    <Path
      d="M8 1C8.66667 3.66667 10 5.83333 12 7.5C14 9.16667 15 11 15 13C15 14.8565 14.2625 16.637 12.9497 17.9497C11.637 19.2625 9.85652 20 8 20C6.14348 20 4.36301 19.2625 3.05025 17.9497C1.7375 16.637 1 14.8565 1 13C1 11.9181 1.35089 10.8655 2 10C2 10.663 2.26339 11.2989 2.73223 11.7678C3.20107 12.2366 3.83696 12.5 4.5 12.5C5.16304 12.5 5.79893 12.2366 6.26777 11.7678C6.73661 11.2989 7 10.663 7 10C7 8 5.5 7 5.5 5C5.5 3.66667 6.33333 2.33333 8 1Z"
      fill={color}
    />
  </Svg>
);

const RandomIcon = ({ color }: { color?: string }) => {
  const { colors } = useTheme();
  return (
    <Svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <Path d="M16.92 12.9964L20.42 9.49639C20.791 9.08488 20.9964 8.55047 20.9964 7.99639C20.9964 7.44231 20.791 6.90789 20.42 6.49639L15.42 1.57639C15.0085 1.20535 14.4741 1 13.92 1C13.3659 1 12.8315 1.20535 12.42 1.57639L9 4.99639M5 16.9964H5.01M9 12.9964H9.01M14 4.99639H14.01M17 7.99639H17.01M3 8.99639H11C12.1046 8.99639 13 9.89182 13 10.9964V18.9964C13 20.101 12.1046 20.9964 11 20.9964H3C1.89543 20.9964 1 20.101 1 18.9964V10.9964C1 9.89182 1.89543 8.99639 3 8.99639Z" stroke={color ?? colors.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
};

const ChevronLeft = ({ color }: { color?: string }) => {
  const { colors } = useTheme();
  return (
    <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <Path d="M15 18l-6-6 6-6" stroke={color ?? colors.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
};

const ChevronRight = ({ color }: { color?: string }) => {
  const { colors } = useTheme();
  return (
    <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <Path d="M9 18l6-6-6-6" stroke={color ?? colors.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
};

const BackArrow = () => {
  const { colors } = useTheme();
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <Path d="M19 12H5M12 5l-7 7 7 7" stroke={colors.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
};

const InfoIcon = () => {
  const { colors } = useTheme();
  return (
    <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.textTertiary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <Path d="M12 17h.01" />
    </Svg>
  );
};

const ThemeIcon = ({ color }: { color?: string }) => {
  const { colors } = useTheme();
  return (
    <Svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={color ?? colors.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </Svg>
  );
};

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Système" },
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre" },
];

// ─── Star icon ───────────────────────────────────────────────────────────────
const DropletIcon = ({ size = 20, color = "#FF561A" }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
    <Path d="M9.9997 1.24219C10.265 1.24208 10.5191 1.34765 10.7067 1.53516L15.4235 6.25195C16.4961 7.32389 17.2269 8.68957 17.5231 10.1768C17.8194 11.6641 17.6677 13.2062 17.0876 14.6074C16.5075 16.0085 15.5251 17.2062 14.2644 18.0488C13.0036 18.8914 11.521 19.3408 10.0046 19.3408C8.4882 19.3408 7.00563 18.8913 5.74482 18.0488C4.48398 17.2062 3.50074 16.0085 2.9206 14.6074C2.34048 13.2062 2.18883 11.6641 2.48506 10.1768C2.78122 8.68985 3.51145 7.32381 4.58369 6.25195L9.29267 1.53613L9.36592 1.46875C9.54379 1.32289 9.76765 1.24229 9.9997 1.24219Z" fill={color} />
  </Svg>
);

// ─── Group name pill ──────────────────────────────────────────────────────────
function GroupNamePill({ name, bg, fg }: { name: string; bg: string; fg: string }) {
  return (
    <View style={{ height: 40, paddingHorizontal: spacing.xs2, backgroundColor: bg, justifyContent: "center", overflow: "hidden" }}>
      <Text style={{ fontFamily: textStyles.subtitleStrong.fontFamily, fontSize: typography.size.subtitle, textTransform: "uppercase", color: fg, includeFontPadding: false } as any} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ProfilePage({
  userId, username, avatarUrl, email, groupName, allGroups, revealConfig,
  onAvatarUpdate, onUsernameUpdate, onStreakUpdate, isActive = false, refreshKey,
}: Props) {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const { showToast } = useToast();
  const { colors, preference, setPreference } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const phStyles = useThemedStyles(makePhStyles);

  // ── Avatar / username edit ──
  const [uploading, setUploading] = useState(false);
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);

  // ── Profile data ──
  const [photoTimestamps, setPhotoTimestamps] = useState<{ id: string; created_at: string; group_id: string; image_path: string; note: string | null }[]>([]);
  const [streak, setStreak] = useState(0);
  const [streakWeeks, setStreakWeeks] = useState<Set<string>>(new Set());
  const [loadingData, setLoadingData] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Container coffre ──
  const [coffreGroupIndex, setCoffreGroupIndex] = useState(() => {
    const idx = allGroups.findIndex(g => g.name === groupName);
    return idx >= 0 ? idx : 0;
  });
  type GroupCoffreStats = { comments: number; stickers: number; loading: boolean };
  const [groupCoffreStats, setGroupCoffreStats] = useState<Record<string, GroupCoffreStats>>({});
  const [showDeleteMomentModal, setShowDeleteMomentModal] = useState(false);
  const [deletingMoment, setDeletingMoment] = useState(false);

  // ── Current week day statuses ──
  const weekDayStatuses = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const monday = getMondayOf(today);
    const postDayKeys = new Set(photoTimestamps.map(p => dayKey(new Date(p.created_at))));
    // Determine streak start day
    let startDay: Date | null = null;
    if (postDayKeys.has(dayKey(today))) startDay = new Date(today);
    else if (postDayKeys.has(dayKey(addDays(today, -1)))) startDay = addDays(today, -1);
    // Build set of days in current streak
    const streakDayKeys = new Set<string>();
    if (startDay && streak > 0) {
      for (let i = 0; i < streak; i++) streakDayKeys.add(dayKey(addDays(startDay, -i)));
    }
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(monday, i);
      const key = dayKey(date);
      const isPosted = postDayKeys.has(key);
      const isToday = key === dayKey(today);
      const isFuture = date > today;
      let state: "active" | "lost" | "today" | "future";
      if (isPosted) state = streakDayKeys.has(key) ? "active" : "lost";
      else if (isToday) state = "today";
      else state = "future";
      return { state, date };
    });
  }, [photoTimestamps, streak]);

  // ── Coffre computed values ──
  const sortedCoffreGroups = useMemo(() => {
    return [...allGroups].sort((a, b) => {
      const lastA = photoTimestamps.filter(p => p.group_id === a.id)
        .reduce((m, p) => Math.max(m, new Date(p.created_at).getTime()), 0);
      const lastB = photoTimestamps.filter(p => p.group_id === b.id)
        .reduce((m, p) => Math.max(m, new Date(p.created_at).getTime()), 0);
      return lastB - lastA;
    });
  }, [allGroups, photoTimestamps]);

  const coffreGroup = sortedCoffreGroups[coffreGroupIndex] ?? null;

  const coffreMomentsCount = useMemo(() => {
    if (!coffreGroup) return 0;
    return photoTimestamps.filter(p => p.group_id === coffreGroup.id).length;
  }, [photoTimestamps, coffreGroup]);

  const coffreRevealsCount = useMemo(() => {
    if (!coffreGroup) return 0;
    const groupPhotos = photoTimestamps.filter(p => p.group_id === coffreGroup.id);
    const weekSet = new Set<string>();
    for (const p of groupPhotos) {
      const mon = getMondayOf(new Date(p.created_at));
      if (isWeekViewable(mon, revealConfig.day, revealConfig.hour)) weekSet.add(weekKey(mon));
    }
    return weekSet.size;
  }, [photoTimestamps, coffreGroup, revealConfig]);

  const coffreLastPhoto = useMemo(() => {
    if (!coffreGroup) return null;
    const sorted = photoTimestamps
      .filter(p => p.group_id === coffreGroup.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return sorted[0] ?? null;
  }, [photoTimestamps, coffreGroup]);

  const coffreGroupStat = groupCoffreStats[coffreGroup?.id ?? ""];

  const canDeleteLastMoment = useMemo(() => {
    if (!coffreLastPhoto) return false;
    const today = new Date();
    const monday = getMondayOf(today);
    const { revealStart } = weekRevealDates(monday, revealConfig.day, revealConfig.hour);
    const photoDate = new Date(coffreLastPhoto.created_at);
    return photoDate >= monday && photoDate < revealStart && Date.now() < revealStart.getTime();
  }, [coffreLastPhoto, revealConfig]);

  const [dailyNotifs, setDailyNotifs] = useState(3);
  const [notifPeriods, setNotifPeriods] = useState<("morning" | "afternoon" | "evening")[]>(["morning", "afternoon", "evening"]);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showRandomInfo, setShowRandomInfo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // ── Calendar ──
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  // ── Week reveal modal ──
  const [weekRevealPhotos, setWeekRevealPhotos] = useState<PhotoEntry[]>([]);
  const [weekRevealIntroSubtitle, setWeekRevealIntroSubtitle] = useState("");
  const [showWeekReveal, setShowWeekReveal] = useState(false);
  const [loadingWeek, setLoadingWeek] = useState(false);

  // ── Challenge history (user was target) ──
  const [targetedChallenges, setTargetedChallenges] = useState<ChallengeWithData[]>([]);

  // ── Random moment modal ──
  const [randomPhoto, setRandomPhoto] = useState<PhotoEntry | null>(null);
  const [randomWeekLabel, setRandomWeekLabel] = useState("");
  const [showRandomReveal, setShowRandomReveal] = useState(false);
  const [loadingRandom, setLoadingRandom] = useState(false);
  const [randomBusy, setRandomBusy] = useState(false);
  const randomFadeAnim = useRef(new Animated.Value(1)).current;
  const randomSlideAnim = useRef(new Animated.Value(0)).current;
  const shuffleBtnOpacity = useRef(new Animated.Value(1)).current;

  // ── Load all user photo timestamps ──
  const loadData = useCallback(async (isRefresh = false) => {
    if (!userId || allGroups.length === 0) { setLoadingData(false); return; }
    if (isRefresh) setRefreshing(true); else setLoadingData(true);

    const [photosRes, profileRes] = await Promise.all([
      supabase
        .from("photos")
        .select("id, created_at, group_id, image_path, note")
        .eq("user_id", userId)
        .in("group_id", allGroups.map(g => g.id))
        .order("created_at", { ascending: true }),
      supabase
        .from("profiles")
        .select("daily_notifications_count, notification_periods")
        .eq("id", userId)
        .single()
    ]);

    const timestamps = photosRes.data ?? [];
    setPhotoTimestamps(timestamps);

    if (profileRes.data) {
      setDailyNotifs(profileRes.data.daily_notifications_count ?? 3);
      setNotifPeriods(profileRes.data.notification_periods ?? ["morning", "afternoon", "evening"]);
    }

    // ── Daily streak ──
    function dayKey(d: Date): string { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
    const postDayKeys = new Set(timestamps.map(p => dayKey(new Date(p.created_at))));
    const today = new Date();
    let startDay: Date | null = null;
    if (postDayKeys.has(dayKey(today))) startDay = today;
    else if (postDayKeys.has(dayKey(addDays(today, -1)))) startDay = addDays(today, -1);
    let dailyStreak = 0;
    if (startDay) {
      let d = new Date(startDay);
      while (postDayKeys.has(dayKey(d))) { dailyStreak++; d = addDays(d, -1); }
    }

    // ── Weekly streak (for blue flames on calendar) ──
    const photosByWeek: Record<string, boolean> = {};
    for (const p of timestamps) {
      const mon = getMondayOf(new Date(p.created_at));
      photosByWeek[weekKey(mon)] = true;
    }
    const completedMondays: Date[] = [];
    for (let i = 0; i < 52; i++) {
      const mon = getMondayOf(addDays(today, -i * 7));
      if (isWeekViewable(mon, revealConfig.day, revealConfig.hour)) completedMondays.push(mon);
    }
    completedMondays.sort((a, b) => b.getTime() - a.getTime());
    const sw = new Set<string>();
    for (const mon of completedMondays) {
      const k = weekKey(mon);
      if (photosByWeek[k]) sw.add(k); else break;
    }

    setStreak(dailyStreak);
    setStreakWeeks(sw);
    onStreakUpdate(dailyStreak);
    if (isRefresh) setRefreshing(false); else setLoadingData(false);
  }, [userId, allGroups.length, revealConfig.day, revealConfig.hour]);

  const loadChallengeHistory = useCallback(async () => {
    if (!userId) return;
    const seasonStart = getCurrentSeasonStart();
    const { data: challengeRows } = await supabase
      .from("weekly_challenges")
      .select(CHALLENGE_SELECT)
      .eq("target_user_id", userId)
      .gte("week_start", seasonStart.toISOString().slice(0, 10))
      .order("week_start", { ascending: false });

    if (!challengeRows || challengeRows.length === 0) { setTargetedChallenges([]); return; }

    const challengeIds = challengeRows.map((c: any) => c.id);
    const [respRes, voteRes] = await Promise.all([
      supabase.from("challenge_responses").select("*").in("challenge_id", challengeIds),
      supabase.from("challenge_votes").select("*").in("challenge_id", challengeIds),
    ]);
    const allResponses = respRes.data ?? [];
    const allVotes = voteRes.data ?? [];

    const responderIds = [...new Set(allResponses.map((r: any) => r.user_id))];
    const profilesMap: Record<string, { username: string; avatar_url: string | null }> = {};
    if (responderIds.length > 0) {
      const { data: pd } = await supabase.from("profiles").select("id, username, avatar_url").in("id", responderIds);
      (pd ?? []).forEach((p: any) => { profilesMap[p.id] = { username: p.username, avatar_url: p.avatar_url }; });
    }

    const mapped: ChallengeWithData[] = challengeRows.map((c: any) => {
      const base = mapChallenge(c);
      const responses = allResponses
        .filter((r: any) => r.challenge_id === c.id)
        .map((r: any) => {
          const prof = profilesMap[r.user_id];
          return { ...r, url: r.image_path === "text_mode" ? "" : r2Storage.getPublicUrl(r.image_path), username: prof?.username ?? "Anonyme", avatar_url: prof?.avatar_url ?? null };
        });
      const votes = allVotes.filter((v: any) => v.challenge_id === c.id);
      return { ...base, responses, votes };
    });
    setTargetedChallenges(mapped);
  }, [userId, username]);

  const loadCoffreStats = useCallback(async (groupId: string) => {
    const photoIds = photoTimestamps.filter(p => p.group_id === groupId).map(p => p.id);
    if (photoIds.length === 0) {
      setGroupCoffreStats(prev => ({ ...prev, [groupId]: { comments: 0, stickers: 0, loading: false } }));
      return;
    }
    setGroupCoffreStats(prev => ({ ...prev, [groupId]: { ...(prev[groupId] ?? { comments: 0, stickers: 0 }), loading: true } }));
    const [commentsRes, stickersRes] = await Promise.all([
      supabase.from("comments").select("id", { count: "exact", head: true }).eq("user_id", userId).in("photo_id", photoIds),
      supabase.from("reactions").select("id", { count: "exact", head: true }).eq("user_id", userId).in("photo_id", photoIds),
    ]);
    setGroupCoffreStats(prev => ({
      ...prev,
      [groupId]: { comments: commentsRes.count ?? 0, stickers: stickersRes.count ?? 0, loading: false },
    }));
  }, [userId, photoTimestamps]);

  const deleteLastMoment = useCallback(async () => {
    if (!coffreLastPhoto || !coffreGroup) return;
    setDeletingMoment(true);
    try {
      await supabase.from("reactions").delete().eq("photo_id", coffreLastPhoto.id);
      await supabase.from("comments").delete().eq("photo_id", coffreLastPhoto.id);
      await supabase.from("comment_views").delete().eq("photo_id", coffreLastPhoto.id);

      const { error } = await supabase.from("photos").delete().eq("id", coffreLastPhoto.id);
      if (error) throw error;
      setShowDeleteMomentModal(false);
      await loadData();
    } catch (e: any) {
      showToast(e.message ?? "Erreur lors de la suppression", "error");
    } finally {
      setDeletingMoment(false);
    }
  }, [coffreLastPhoto, coffreGroup, loadData, showToast]);

  // Initial load
  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadChallengeHistory(); }, [loadChallengeHistory]);

  // Load coffre stats when group or photos change
  useEffect(() => {
    if (coffreGroup) loadCoffreStats(coffreGroup.id);
  }, [coffreGroup, loadCoffreStats]);

  // Refetch every time the profile tab becomes active
  const prevActive = useRef(false);
  useEffect(() => {
    if (isActive && !prevActive.current) loadData();
    prevActive.current = isActive;
  }, [isActive]);

  // Refetch when a capture is sent
  const prevRefreshKey = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (refreshKey !== undefined && refreshKey !== prevRefreshKey.current) {
      loadData();
    }
    prevRefreshKey.current = refreshKey;
  }, [refreshKey]);

  // ── Photos per week (for calendar dots) ──
  const photoCountByWeek = useCallback((monday: Date): number => {
    const k = weekKey(monday);
    return photoTimestamps.filter(p => weekKey(getMondayOf(new Date(p.created_at))) === k).length;
  }, [photoTimestamps]);

  // ── Open week reveal ──
  const openWeekReveal = useCallback(async (monday: Date) => {
    setLoadingWeek(true);
    const sunday = addDays(monday, 6);
    const weekNum = getISOWeek(monday);
    setWeekRevealIntroSubtitle(`S${weekNum}  ·  ${fmtDDMM(monday)} au ${fmtDDMM(sunday)}`);
    const { photoStart, photoEnd } = weekRevealDates(monday, revealConfig.day, revealConfig.hour);

    const { data: photosData } = await supabase
      .from("photos")
      .select("id, image_path, second_image_path, note, second_note, created_at, group_id")
      .eq("user_id", userId)
      .in("group_id", allGroups.map(g => g.id))
      .gte("created_at", photoStart.toISOString())
      .lt("created_at", photoEnd.toISOString())
      .order("created_at", { ascending: true });

    if (!photosData || photosData.length === 0) { setLoadingWeek(false); return; }

    const photoIds = photosData.map(p => p.id);
    const { data: reactionsData } = await supabase
      .from("reactions").select("id, photo_id, user_id, emoji").in("photo_id", photoIds);

    const reactorIds = [...new Set((reactionsData ?? []).map(r => r.user_id))];
    const profilesMap: Record<string, { username: string; avatar_url: string | null }> = {};
    if (reactorIds.length > 0) {
      const { data: pData } = await supabase.from("profiles").select("id, username, avatar_url").in("id", reactorIds);
      (pData ?? []).forEach((p: any) => { profilesMap[p.id] = { username: p.username, avatar_url: p.avatar_url }; });
    }

    const reactionsByPhoto: Record<string, Reaction[]> = {};
    for (const r of reactionsData ?? []) {
      if (!reactionsByPhoto[r.photo_id]) reactionsByPhoto[r.photo_id] = [];
      const prof = profilesMap[r.user_id];
      reactionsByPhoto[r.photo_id].push({ id: r.id, user_id: r.user_id, username: prof?.username ?? "Anonyme", avatar_url: prof?.avatar_url ?? null, sticker_id: r.emoji });
    }

    const groupsById: Record<string, string> = {};
    allGroups.forEach(g => { groupsById[g.id] = g.name; });
    const multiGroup = allGroups.length > 1;

    const photos: PhotoEntry[] = photosData.map(p => ({
      id: p.id,
      url: mediaCache.getLocalUri(p.image_path) ?? (p.image_path === "text_mode" ? "" : r2Storage.getPublicUrl(p.image_path)),
      fallback_url: p.image_path === "text_mode" ? undefined : (supabase.storage.from("moments").getPublicUrl(p.image_path).data?.publicUrl),
      created_at: p.created_at,
      note: p.note ?? null,
      second_note: p.second_note ?? null,
      image_path: p.image_path,
      second_image_path: p.second_image_path ?? null,
      username,
      avatar_url: avatarUrl,
      user_id: userId,
      reactions: reactionsByPhoto[p.id] ?? [],
      groupName: multiGroup ? (groupsById[p.group_id] ?? null) : null,
    }));

    setWeekRevealPhotos(photos);
    setShowWeekReveal(true);
    setLoadingWeek(false);
  }, [userId, allGroups, revealConfig, username, avatarUrl]);

  // ── Fetch a random viewable photo (excludes current one and photos < 1 month old) ──
  const fetchRandomPhoto = useCallback(async (excludeId?: string): Promise<PhotoEntry | null> => {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const viewable = photoTimestamps.filter(p => {
      const photoDate = new Date(p.created_at);
      if (photoDate > oneMonthAgo) return false;

      const monday = getMondayOf(photoDate);
      return isWeekViewable(monday, revealConfig.day, revealConfig.hour);
    });
    if (viewable.length === 0) return null;

    const pool = viewable.length > 1 && excludeId
      ? viewable.filter(p => p.id !== excludeId)
      : viewable;
    const picked = pool[Math.floor(Math.random() * pool.length)];

    const { data: p } = await supabase
      .from("photos")
      .select("id, image_path, second_image_path, note, second_note, created_at, group_id")
      .eq("id", picked.id).single();

    if (!p) return null;

    const { data: reactionsData } = await supabase
      .from("reactions").select("id, photo_id, user_id, emoji").eq("photo_id", picked.id);

    const reactorIds = [...new Set((reactionsData ?? []).map((r: any) => r.user_id))];
    const profilesMap: Record<string, { username: string; avatar_url: string | null }> = {};
    if (reactorIds.length > 0) {
      const { data: pData } = await supabase.from("profiles").select("id, username, avatar_url").in("id", reactorIds);
      (pData ?? []).forEach((pr: any) => { profilesMap[pr.id] = { username: pr.username, avatar_url: pr.avatar_url }; });
    }

    const reactions: Reaction[] = (reactionsData ?? []).map((r: any) => {
      const prof = profilesMap[r.user_id];
      return { id: r.id, user_id: r.user_id, username: prof?.username ?? "Anonyme", avatar_url: prof?.avatar_url ?? null, sticker_id: r.emoji };
    });

    const groupsById: Record<string, string> = {};
    allGroups.forEach(g => { groupsById[g.id] = g.name; });

    return {
      id: p.id,
      url: mediaCache.getLocalUri(p.image_path) ?? (p.image_path === "text_mode" ? "" : r2Storage.getPublicUrl(p.image_path)),
      fallback_url: p.image_path === "text_mode" ? undefined : (supabase.storage.from("moments").getPublicUrl(p.image_path).data?.publicUrl),
      created_at: p.created_at,
      note: p.note ?? null,
      second_note: p.second_note ?? null,
      image_path: p.image_path,
      second_image_path: p.second_image_path ?? null,
      username,
      avatar_url: avatarUrl,
      user_id: userId,
      reactions,
      groupName: allGroups.length > 1 ? (groupsById[p.group_id] ?? null) : null,
    };
  }, [photoTimestamps, allGroups, username, avatarUrl, userId, revealConfig]);

  // ── Open random moment (first open) ──
  const openRandom = useCallback(async () => {
    setRandomBusy(true);
    setLoadingRandom(true);
    randomFadeAnim.setValue(1);
    randomSlideAnim.setValue(0);
    shuffleBtnOpacity.setValue(1);
    const photo = await fetchRandomPhoto();
    if (!photo) { setLoadingRandom(false); setRandomBusy(false); return; }

    const monday = getMondayOf(new Date(photo.created_at));
    const sunday = addDays(monday, 6);
    const weekNum = getISOWeek(monday);
    setRandomWeekLabel(`S${weekNum}  ·  ${fmtDDMM(monday)} au ${fmtDDMM(sunday)}`);

    setRandomPhoto(photo);
    setShowRandomReveal(true);
    setLoadingRandom(false);
    setRandomBusy(false);
  }, [fetchRandomPhoto]);

  // ── Switch to another random moment with animation ──
  const handleAnotherMoment = useCallback(() => {
    setRandomBusy(true);
    const currentId = randomPhoto?.id;
    Animated.parallel([
      Animated.timing(shuffleBtnOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(randomFadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(randomSlideAnim, { toValue: -24, duration: 180, useNativeDriver: true }),
    ]).start(async () => {
      setLoadingRandom(true);
      const photo = await fetchRandomPhoto(currentId);
      if (photo) {
        setRandomPhoto(photo);
        const monday = getMondayOf(new Date(photo.created_at));
        const sunday = addDays(monday, 6);
        const weekNum = getISOWeek(monday);
        setRandomWeekLabel(`S${weekNum}  ·  ${fmtDDMM(monday)} au ${fmtDDMM(sunday)}`);
      }
      setLoadingRandom(false);
      requestAnimationFrame(() => {
        randomSlideAnim.setValue(28);
        Animated.parallel([
          Animated.timing(randomFadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
          Animated.timing(randomSlideAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
          Animated.timing(shuffleBtnOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        ]).start(() => setRandomBusy(false));
      });
    });
  }, [fetchRandomPhoto, randomPhoto?.id]);

  // ── Avatar update ──
  const updateAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true,
    });
    if (!result.canceled) {
      setUploading(true);
      try {
        const m = await manipulateAsync(result.assets[0].uri, [{ resize: { width: 200, height: 200 } }], { compress: 0.7, format: SaveFormat.JPEG, base64: true });
        if (!m.base64) throw new Error("Erreur manipulation image");
        const filePath = `avatars/${userId}_${Date.now()}.jpg`;
        await r2Storage.upload(filePath, decode(m.base64), "image/jpeg");
        const urlData = r2Storage.getPublicUrl(filePath);
        await supabase.from("profiles").update({ avatar_url: urlData }).eq("id", userId);
        onAvatarUpdate(urlData);
      } catch (e: any) { Alert.alert("Erreur", e.message); }
      finally { setUploading(false); }
    }
  };

  // ── Username save ──
  const saveUsername = async () => {
    const trimmed = newUsername.trim();
    if (!trimmed || trimmed === username) { setIsEditingUsername(false); return; }
    setSavingUsername(true);
    const { error } = await supabase.from("profiles").update({ username: trimmed }).eq("id", userId);
    if (!error) { onUsernameUpdate(trimmed); showToast("Pseudo mis à jour", undefined, "success"); }
    else { showToast("Erreur", "Impossible de modifier le pseudo", "error"); }
    setSavingUsername(false);
    setIsEditingUsername(false);
  };

  // ── Calendar weeks ──
  const calWeeks = getMonthWeeks(calYear, calMonth);

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  const canGoNext = calYear < now.getFullYear() || (calYear === now.getFullYear() && calMonth < now.getMonth());

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
            tintColor={colors.textTertiary}
          />
        }
      >
        {/* ── Top header ── */}
        <View style={[styles.topHeaderWrap, { paddingTop: insets.top, marginTop: 16 }]}>
          <View style={styles.topHeaderRow}>
            <View style={styles.topHeaderLeft}>
              <GroupNamePill name={groupName ?? ""} bg={colors.brand} fg={colors.textInverse} />
            </View>
            <View style={styles.topHeaderRight}>
              <TouchableOpacity style={styles.moreBtn} activeOpacity={0.75} onPress={() => setShowSettings(true)}>
                <Icon name="menu" size={20} color={colors.iconNeutral} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── NEW: content ── */}
        <View style={styles.newContent}>
          {/* profil */}
          <View style={styles.newProfilCard}>
            {/* top-info */}
            <View style={styles.newTopInfo}>
              {/* a. Avatar */}
              <View style={styles.newAvatar}>
                {avatarUrl
                  ? <Image source={{ uri: avatarUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                  : <Text style={styles.newAvatarInitial}>{(username?.[0] ?? "?").toUpperCase()}</Text>}
              </View>

              {/* b. Week activity */}
              <View style={styles.newWeekActivity}>
                <View style={styles.newWeekCountRow}>
                  <Text style={styles.newWeekCountNum}>{streakWeeks.size}</Text>
                  <Text style={styles.newWeekCountLabel}>semaine{streakWeeks.size > 1 ? "s" : ""}</Text>
                </View>
                <Text style={styles.newWeekSubtitle}>d'activité</Text>
              </View>

              {/* c. Streaks */}
              <View style={styles.newStreaks}>
                <View style={styles.newStreakRow}>
                  <Text style={styles.newStreakNum}>{streak}</Text>
                  <DropletIcon size={20} color={colors.brand} />
                </View>
                <Text style={styles.newStreakLabel}>streak</Text>
              </View>
            </View>

            {/* list-day */}
            <View style={styles.newListDay}>
              {weekDayStatuses.map(({ state }, i) => (
                <View key={i} style={styles.newStreakBlock}>
                  <View style={[
                    styles.newDaySquare,
                    state === "active" && { backgroundColor: colors.brand },
                    state === "lost"   && { backgroundColor: colors.brandSecondary },
                    (state === "future" || state === "today") && {
                      backgroundColor: "transparent",
                      borderWidth: 1,
                      borderColor: state === "today" ? colors.borderBrandTertiary : colors.borderNeutralTertiary,
                    },
                  ]}>
                    {(state === "active" || state === "lost") && (
                      <DropletIcon size={16} color={colors.iconBrandOnBrand} />
                    )}
                  </View>
                  <Text style={[styles.newDayLabel, state === "today" && { color: colors.textBrandTertiary }]}>{DAY_LABELS[i]}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* container-coffre */}
          {sortedCoffreGroups.length > 0 && (
            <View style={styles.containerCoffre}>
              {/* title */}
              <View style={styles.coffreTitle}>
                <Text style={styles.cofreTitleText} numberOfLines={1}>
                  {(sortedCoffreGroups[coffreGroupIndex]?.name ?? "").toUpperCase()}
                </Text>
                {sortedCoffreGroups.length > 1 && (
                  <View style={styles.cofrePagination}>
                    <TouchableOpacity
                      disabled={coffreGroupIndex === 0}
                      onPress={() => setCoffreGroupIndex(i => i - 1)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <View style={{ transform: [{ rotate: "180deg" }] }}>
                        <Icon name="chevron-right" size={24} color={coffreGroupIndex === 0 ? colors.iconDisabled : colors.icon} />
                      </View>
                    </TouchableOpacity>
                    <Text style={styles.cofrePaginText}>{coffreGroupIndex + 1}/{sortedCoffreGroups.length}</Text>
                    <TouchableOpacity
                      disabled={coffreGroupIndex === sortedCoffreGroups.length - 1}
                      onPress={() => setCoffreGroupIndex(i => i + 1)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Icon name="chevron-right" size={24} color={coffreGroupIndex === sortedCoffreGroups.length - 1 ? colors.iconDisabled : colors.icon} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* bento */}
              <View style={styles.cofreBento}>
                <View style={styles.cofreBentoRow}>
                  <View style={[styles.cofreBentoItem, { flex: 1 }]}>
                    <Text style={styles.cofreBentoNum}>{coffreMomentsCount}</Text>
                    <Text style={styles.cofreBentoLabel}>Moments partagés</Text>
                  </View>
                  <View style={[styles.cofreBentoItem, { flex: 1 }]}>
                    <Text style={styles.cofreBentoNum}>{coffreRevealsCount}</Text>
                    <Text style={styles.cofreBentoLabel}>Reveal vécus</Text>
                  </View>
                </View>
                <View style={styles.cofreBentoRow}>
                  <View style={[styles.cofreBentoItem, { flex: 1 }]}>
                    <Text style={styles.cofreBentoNum}>
                      {coffreGroupStat?.loading ? "…" : String(coffreGroupStat?.comments ?? 0)}
                    </Text>
                    <Text style={styles.cofreBentoLabel}>Commentaires</Text>
                  </View>
                  <View style={[styles.cofreBentoItem, { flex: 1 }]}>
                    <Text style={styles.cofreBentoNum}>
                      {coffreGroupStat?.loading ? "…" : String(coffreGroupStat?.stickers ?? 0)}
                    </Text>
                    <Text style={styles.cofreBentoLabel}>Stickers</Text>
                  </View>
                </View>
                {/* last moment row — only shown if current week and reveal not started */}
                {canDeleteLastMoment && (
                  <View style={styles.cofreBentoLastItem}>
                    <View style={styles.cofreBentoLastInfo}>
                      <Text style={styles.cofreBentoLastTitle}>Dernier moment partagé</Text>
                      {canDeleteLastMoment && (
                        <TouchableOpacity
                          style={styles.cofreDeleteBtn}
                          onPress={() => setShowDeleteMomentModal(true)}
                          activeOpacity={0.7}
                        >
                          <Icon name="trash" size={20} color={colors.bgDanger} />
                          <Text style={styles.cofreDeleteText}>Supprimer</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={styles.cofreBentoCapture}>
                      {coffreLastPhoto?.image_path !== "text_mode"
                        ? <Image source={{ uri: r2Storage.getPublicUrl(coffreLastPhoto?.image_path ?? "") }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                        : <View style={{ flex: 1, backgroundColor: colors.bgNeutral }} />
                      }
                    </View>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>

        {/* ── Profile card ── */}
        <View style={[styles.profileCard, { marginTop: 20 }]}>
          <TouchableOpacity onPress={updateAvatar} disabled={uploading} style={styles.profileAvatarBtn}>
            <View style={styles.profileAvatar}>
              {avatarUrl
                ? <Image source={{ uri: avatarUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                : <Text style={styles.profileAvatarInitial}>{(username?.[0] ?? "?").toUpperCase()}</Text>}
              {uploading && <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center" }}><ActivityIndicator color={colors.text} /></View>}
            </View>
            <View style={styles.avatarEditBadge}>
              <Svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <Path d="M12 13m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0"/>
              </Svg>
            </View>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileCardName}>{username || "-"}</Text>
            <TouchableOpacity style={styles.editChip} onPress={() => { setNewUsername(username); setIsEditingUsername(true); }}>
              <Svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </Svg>
              <Text style={styles.editChipText}>Modifier le pseudo</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Streak card ── */}
        <View style={styles.streakCard}>
          <View style={styles.streakHalf}>
            <View style={styles.streakCircle}>
              <FlameIcon size={22} color="#FFA600" />
            </View>
            <View style={styles.streakTextCol}>
              <Text style={styles.streakLabel}>{streak > 1 ? "Jours" : "Jour"}</Text>
              <Text style={styles.streakValue}>{streak}</Text>
            </View>
          </View>
          <View style={styles.streakDivider} />
          <View style={styles.streakHalf}>
            <View style={[styles.streakCircle, styles.streakCircleBlue]}>
              <FlameIcon size={22} color="#4A9EFF" />
            </View>
            <View style={styles.streakTextCol}>
              <Text style={styles.streakLabel}>{streakWeeks.size > 1 ? "Semaines" : "Semaine"}</Text>
              <Text style={styles.streakValue}>{streakWeeks.size}</Text>
            </View>
          </View>
        </View>

        {/* ── Calendar ── */}
        <View style={styles.calendarSection}>
          {/* Header */}
          <View style={styles.calendarHeader}>
            <Text style={styles.calendarTitle}>Tes moments</Text>
            <View style={styles.monthNav}>
              <TouchableOpacity onPress={prevMonth} style={styles.monthNavBtn}>
                <ChevronLeft color={colors.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.monthName}>{MONTH_FR[calMonth]} {calYear}</Text>
              <TouchableOpacity onPress={canGoNext ? nextMonth : undefined} style={[styles.monthNavBtn, !canGoNext && { opacity: 0.25 }]}>
                <ChevronRight color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Week rows */}
          <View style={styles.weekList}>
            {calWeeks.map((monday) => {
              const sunday = addDays(monday, 6);
              const viewable = isWeekViewable(monday, revealConfig.day, revealConfig.hour);
              const count = photoCountByWeek(monday);
              const key = weekKey(monday);
              const hasStreak = streakWeeks.has(key);
              const isFuture = !viewable;

              if (isFuture) {
                return (
                  <View key={key} style={[styles.weekRow, styles.weekRowFuture]}>
                    <View style={styles.weekFlameSlot} />
                    <Text style={styles.weekLabelFuture}>S{getISOWeek(monday)}  ·  {fmtDDMM(monday)} au {fmtDDMM(sunday)}</Text>
                    <Text style={styles.weekStatus}>À venir</Text>
                  </View>
                );
              }

              if (count === 0) {
                return (
                  <View key={key} style={[styles.weekRow, styles.weekRowEmpty]}>
                    <View style={styles.weekFlameSlot} />
                    <Text style={styles.weekLabelEmpty}>S{getISOWeek(monday)}  ·  {fmtDDMM(monday)} au {fmtDDMM(sunday)}</Text>
                    <Text style={styles.weekStatus}>—</Text>
                  </View>
                );
              }

              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.weekRow, styles.weekRowActive]}
                  onPress={() => openWeekReveal(monday)}
                  activeOpacity={0.75}
                >
                  <View style={styles.weekFlameSlot}>
                    {hasStreak && <FlameIcon size={16} color="#4A9EFF" />}
                  </View>
                  <Text style={styles.weekLabelActive}>S{getISOWeek(monday)}  ·  {fmtDDMM(monday)} au {fmtDDMM(sunday)}</Text>
                  <View style={styles.weekRight}>
                    <Text style={styles.weekCount}>{count}</Text>
                    <ChevronRight color={colors.textTertiary} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Random moment button ── */}
        {photoTimestamps.length > 0 && (
          <View style={{ marginBottom: 32 }}>
            <TouchableOpacity
              style={{ alignSelf: 'flex-end', marginRight: 24, marginBottom: 8 }}
              onPress={() => setShowRandomInfo(true)}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            >
              <InfoIcon />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.randomBtn, { marginHorizontal: 20, marginBottom: 0 }]} onPress={openRandom} disabled={randomBusy} activeOpacity={0.8}>
              {loadingRandom
                ? <ActivityIndicator color={colors.text} size="small" />
                : <><RandomIcon /><Text style={styles.randomBtnText}>Moment aléatoire</Text></>}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Challenge history ── */}
        {targetedChallenges.length > 0 && (
          <View style={{ marginBottom: 28 }}>
            <Text style={styles.calendarTitle}>Défis · Tu étais la cible</Text>
            {targetedChallenges.map((c) => {
              const winnerIds = getWinnerResponseIds(c.responses, c.votes);
              const winners = c.responses.filter((r) => !r.is_target_response && winnerIds.includes(r.id));
              const prompt = getChallengePrompt(c.target_username, c.theme.label);
              const dateStr = c.week_start;
              return (
                <View key={c.id} style={phStyles.challengeCard}>
                  <Text style={phStyles.challengeWeek}>Semaine du {dateStr} · Défi {c.period}</Text>
                  <Text style={phStyles.challengePrompt} numberOfLines={2}>{prompt}</Text>
                  {winners.length > 0 ? (
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                      {winners.slice(0, 3).map((w) => (
                        <View key={w.id} style={phStyles.winnerThumb}>
                          {w.image_path === "text_mode" ? (
                            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 6 }}>
                              <Text style={{ color: colors.text, fontSize: typography.size.xs, textAlign: "center", fontFamily: typography.family.semibold }} numberOfLines={4}>{w.note}</Text>
                            </View>
                          ) : (
                            <Image source={{ uri: w.url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                          )}
                          <View style={phStyles.winnerLabel}>
                            <Text style={phStyles.winnerLabelText} numberOfLines={1}>🏆 {w.username}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={phStyles.noVotes}>Aucun vote encore</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── Account settings ── */}
        <View style={styles.settingsSection}>
          <Text style={styles.settingsSectionLabel}>Compte</Text>
          <View style={styles.settingsCard}>
            <View style={styles.settingsRow}>
              <View style={[styles.settingsIconWrap, { backgroundColor: "rgba(251,191,36,0.12)" }]}>
                <Svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FBB824" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <Path d="M22 6l-10 7L2 6"/>
                </Svg>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsLabel}>Email</Text>
                <Text style={styles.settingsSubValue}>{email}</Text>
              </View>
            </View>

            <View style={styles.settingsDivider} />

            <TouchableOpacity style={styles.settingsRow} onPress={() => setShowNotifModal(true)}>
              <View style={[styles.settingsIconWrap, styles.settingsIconNeutral]}>
                <Svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
                </Svg>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsLabel}>Motivation</Text>
                <Text style={styles.settingsSubValue}>{dailyNotifs} notification{dailyNotifs > 1 ? "s" : ""} / jour</Text>
              </View>
              <ChevronRight color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {/* ── Appearance ── */}
          <Text style={[styles.settingsSectionLabel, { marginTop: 28 }]}>Apparence</Text>
          <View style={styles.settingsCard}>
            <View style={styles.settingsRow}>
              <View style={[styles.settingsIconWrap, styles.settingsIconNeutral]}>
                <ThemeIcon />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsLabel}>Thème</Text>
                <Text style={styles.settingsSubValue}>Choisis l'apparence de l'app</Text>
              </View>
            </View>
            <View style={styles.themeSegment}>
              {THEME_OPTIONS.map((opt) => {
                const active = preference === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.themeOption, active && styles.themeOptionActive]}
                    onPress={() => setPreference(opt.value)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.themeOptionText, active && styles.themeOptionTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <Text style={[styles.settingsSectionLabel, { marginTop: 28 }]}>Session</Text>
          <View style={styles.settingsCard}>
            <TouchableOpacity style={styles.settingsRow} onPress={() => logout()}>
              <View style={[styles.settingsIconWrap, { backgroundColor: "rgba(255,59,48,0.12)" }]}>
                <Svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FF3B30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <Path d="M16 17l5-5-5-5"/>
                  <Path d="M21 12H9"/>
                </Svg>
              </View>
              <Text style={[styles.settingsLabel, { color: "#FF3B30" }]}>Se déconnecter</Text>
            </TouchableOpacity>

            <View style={styles.settingsDivider} />

            <TouchableOpacity style={styles.settingsRow} onPress={() => setShowDeleteModal(true)}>
              <View style={[styles.settingsIconWrap, { backgroundColor: "rgba(255,59,48,0.05)" }]}>
                <Svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgba(255,59,48,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
                </Svg>
              </View>
              <Text style={[styles.settingsLabel, { color: "rgba(255,59,48,0.6)" }]}>Supprimer mon compte</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* ── Loading overlay (week) ── */}
      {loadingWeek && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={colors.text} size="large" />
        </View>
      )}

      {/* ── Week reveal modal ── */}
      <Modal visible={showWeekReveal} animationType="slide" onRequestClose={() => setShowWeekReveal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <TouchableOpacity
            style={[styles.modalBackBtn, { top: insets.top + 12 }]}
            onPress={() => setShowWeekReveal(false)}
          >
            <BackArrow />
          </TouchableOpacity>
            <PhotoFeed
              photos={weekRevealPhotos}
              currentUserId={userId}
              nextUnlockDate={new Date(Date.now() + 7 * 86400000)}
              revealEndDate={undefined}
              crownWinnerId={null}
              onScrollLock={() => {}}
              onOpenPicker={() => {}}
              onOpenComments={() => {}}
              introTitle="Tes moments"
              introSubtitle={weekRevealIntroSubtitle}
              hideEnd={true}
            />
          {weekRevealIntroSubtitle !== "" && (
            <View style={[styles.weekLabelPill, { top: insets.top + 8 }]} pointerEvents="none">
              <Text style={styles.weekLabelPillText}>{weekRevealIntroSubtitle}</Text>
            </View>
          )}
        </View>
      </Modal>

      {/* ── Random moment modal ── */}
      <Modal visible={showRandomReveal} animationType="slide" onRequestClose={() => setShowRandomReveal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <TouchableOpacity
            style={[styles.modalBackBtn, { top: insets.top + 12 }]}
            onPress={() => setShowRandomReveal(false)}
          >
            <BackArrow />
          </TouchableOpacity>

          <Animated.View style={{ flex: 1, opacity: randomFadeAnim, transform: [{ translateY: randomSlideAnim }] }}>
            {randomPhoto && (
              <PhotoFeed
                photos={[randomPhoto]}
                currentUserId={userId}
                nextUnlockDate={new Date(Date.now() + 7 * 86400000)}
                revealEndDate={undefined}
                crownWinnerId={null}
                onScrollLock={() => {}}
                onOpenPicker={() => {}}
                onOpenComments={() => {}}
                hideIntro={true}
                hideEnd={true}
              />
            )}
          </Animated.View>

          {randomWeekLabel !== "" && (
            <View style={[styles.weekLabelPill, { top: insets.top + 8 }]} pointerEvents="none">
              <Text style={styles.weekLabelPillText}>{randomWeekLabel}</Text>
            </View>
          )}

          {loadingRandom && (
            <View style={styles.randomLoadingOverlay}>
              <ActivityIndicator size="large" color={colors.textSecondary} />
            </View>
          )}

          {randomPhoto && (
            <Animated.View style={{ opacity: shuffleBtnOpacity, position: "absolute", alignSelf: "center", bottom: insets.bottom + 20, zIndex: 10 }}>
              <TouchableOpacity style={styles.shuffleBtn} onPress={handleAnotherMoment} disabled={randomBusy}>
                <RandomIcon />
                <Text style={styles.shuffleBtnText}>Autre moment</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      </Modal>

      {/* ── Edit username sheet ── */}
      <Modal visible={isEditingUsername} transparent animationType="slide" onRequestClose={() => setIsEditingUsername(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setIsEditingUsername(false)} />
          <View style={styles.editSheet}>
            <View style={styles.editSheetHandle} />
            <Text style={styles.editSheetTitle}>Modifier le pseudo</Text>
            <TextInput
              style={styles.editSheetInput}
              value={newUsername}
              onChangeText={setNewUsername}
              maxLength={30}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={saveUsername}
              placeholder="Ton pseudo..."
              placeholderTextColor={colors.textTertiary}
              editable={!savingUsername}
            />
            <TouchableOpacity style={styles.editSheetBtn} onPress={saveUsername} disabled={savingUsername}>
              {savingUsername ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.editSheetBtnText}>Valider</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.editSheetCancel} onPress={() => setIsEditingUsername(false)}>
              <Text style={styles.editSheetCancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete last moment confirmation — BottomSheet */}
      <BottomSheet visible={showDeleteMomentModal} onClose={() => !deletingMoment && setShowDeleteMomentModal(false)}>
        <View style={[styles.deleteMomentSheet, { height: Dimensions.get("window").height - insets.top - insets.bottom - 44 }]}>
          {/* text */}
          <View style={styles.deleteMomentText}>
            <Text style={styles.deleteMomentTitle}>Attention cette action est définitive</Text>
            <Text style={styles.deleteMomentBody}>
              Ce moment sera supprimé du jardin {(coffreGroup?.name ?? "").toUpperCase()}
            </Text>
          </View>

          {/* capture */}
          <View style={styles.deleteMomentCapture}>
            {coffreLastPhoto && coffreLastPhoto.image_path !== "text_mode"
              ? <Image source={{ uri: r2Storage.getPublicUrl(coffreLastPhoto.image_path) }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
              : <View style={{ flex: 1, backgroundColor: colors.bgNeutral }} />
            }
          </View>

          {/* list-button */}
          <View style={styles.deleteMomentButtons}>
            <TouchableOpacity
              style={[styles.deleteMomentConfirmBtn, deletingMoment && { opacity: 0.7 }]}
              onPress={deleteLastMoment}
              disabled={deletingMoment}
              activeOpacity={0.8}
            >
              {deletingMoment
                ? <ActivityIndicator color={colors.textDangerOnDanger} />
                : <Text style={styles.deleteMomentConfirmText}>Oui, supprimer définitivement</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteMomentCancelBtn}
              onPress={() => setShowDeleteMomentModal(false)}
              disabled={deletingMoment}
              activeOpacity={0.8}
            >
              <Text style={styles.deleteMomentCancelText}>Non, garder</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheet>

      <MotivationalNotificationsModal
        visible={showNotifModal}
        onClose={() => {
          setShowNotifModal(false);
          loadData(true);
        }}
        initialValue={dailyNotifs}
        initialPeriods={notifPeriods}
      />

      <DeleteAccountModal
        visible={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
      />

      <SettingsSheet
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        initialPage={{
          title: "Paramètres",
          content: <SettingsMainContent username={username} avatarUrl={avatarUrl} />,
        }}
      />

      <Modal visible={showRandomInfo} transparent animationType="fade" onRequestClose={() => setShowRandomInfo(false)}>
        <TouchableOpacity
          style={styles.infoBackdrop}
          activeOpacity={1}
          onPress={() => setShowRandomInfo(false)}
        >
          <View style={styles.infoCard}>
            <View style={styles.infoIconWrap}>
              <InfoIcon />
            </View>
            <Text style={styles.infoText}>
              Seuls les moments publiés depuis plus d'un mois apparaîtront dans la sélection aléatoire.
            </Text>
            <TouchableOpacity
              style={styles.infoBtn}
              onPress={() => setShowRandomInfo(false)}
            >
              <Text style={styles.infoBtnText}>Compris</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },

  // Top header
  topHeaderWrap: {
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
  },
  topHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xl,
  },
  topHeaderLeft: {
    flex: 1,
    alignItems: "flex-start",
  },
  topHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  moreBtn: {
    width: 40,
    height: 40,
    padding: 0,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: radii.md,
    backgroundColor: colors.card,
  },

  // ── New design section ──
  newContent: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xl,
    paddingHorizontal: 20,
    marginTop: 32,
    alignSelf: "stretch",
  },
  newProfilCard: {
    padding: spacing.xl,
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.lg,
    alignSelf: "stretch",
    borderRadius: radii.lg,
    backgroundColor: colors.card,
  },
  newTopInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    alignSelf: "stretch",
  },
  newAvatar: {
    width: 80, height: 80,
    borderRadius: radii.xl,
    overflow: "hidden",
    backgroundColor: colors.accentMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  newAvatarInitial: {
    fontFamily: typography.family.bold,
    fontSize: typography.size.xl,
    color: colors.text,
  },
  newWeekActivity: {
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "flex-start",
    alignSelf: "stretch",
  },
  newWeekCountRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  newWeekCountNum: {
    ...textStyles.heading,
    color: colors.text,
  },
  newWeekCountLabel: {
    ...textStyles.bodyStrong,
    color: colors.text,
  },
  newWeekSubtitle: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
  },
  newStreaks: {
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "flex-start",
    alignSelf: "stretch",
  },
  newStreakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  newStreakNum: {
    ...textStyles.heading,
    color: colors.text,
  },
  newStreakLabel: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
  },
  newListDay: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    alignSelf: "stretch",
  },
  newStreakBlock: {
    width: 32,
    flexDirection: "column",
    alignItems: "flex-start",
  },
  newDaySquare: {
    width: 32, height: 32,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: radii.sm,
  },
  newDayLabel: {
    height: 20,
    alignSelf: "stretch",
    textAlign: "center",
    ...textStyles.bodySmall,
    color: colors.textSecondary,
  },

  // ── Container coffre ──
  containerCoffre: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.md,
    alignSelf: "stretch",
  },
  coffreTitle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    alignSelf: "stretch",
  },
  cofreTitleText: {
    ...textStyles.heading,
    color: colors.text,
    flex: 1,
    textTransform: "uppercase",
  },
  cofrePagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
  },
  cofrePaginText: {
    ...textStyles.bodySmall,
    color: colors.text,
  },
  cofreBento: {
    flexDirection: "column",
    gap: 8,
    alignSelf: "stretch",
  },
  cofreBentoRow: {
    flexDirection: "row",
    gap: 8,
  },
  cofreBentoItem: {
    padding: spacing.lg,
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: 0,
    backgroundColor: colors.bg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cofreBentoNum: {
    ...textStyles.subtitleStrong,
    color: colors.textNeutral,
  },
  cofreBentoLabel: {
    ...textStyles.bodyExtraSmall,
    color: colors.textNeutral,
  },
  cofreBentoLastItem: {
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxl,
    alignSelf: "stretch",
    backgroundColor: colors.bg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cofreBentoLastInfo: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.lg,
    flex: 1,
  },
  cofreBentoLastTitle: {
    ...textStyles.bodyBase,
    color: colors.text,
  },
  cofreDeleteBtn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
  },
  cofreDeleteText: {
    ...textStyles.singleLineBodyBaseStrong,
    color: colors.textDangerTertiary,
    includeFontPadding: false,
    lineHeight: undefined,
  } as any,
  cofreBentoCapture: {
    width: 36,
    aspectRatio: 9 / 16,
    borderRadius: radii.sm,
    overflow: "hidden",
    alignSelf: "stretch",
  },

  // Delete moment bottom sheet
  deleteMomentSheet: {
    paddingTop: spacing.xl3 - 28,
    paddingBottom: 0,
    flexDirection: "column",
    justifyContent: "space-between",
  },
  deleteMomentText: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.sm,
    alignSelf: "stretch",
  },
  deleteMomentTitle: {
    ...textStyles.subtitleStrong,
    color: colors.text,
    alignSelf: "stretch",
  },
  deleteMomentBody: {
    ...textStyles.bodyBase,
    color: colors.textSecondary,
  },
  deleteMomentCapture: {
    height: "50%",
    aspectRatio: 9 / 16,
    borderRadius: radii.sm,
    overflow: "hidden",
    alignSelf: "center",
  },
  deleteMomentButtons: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.md,
    alignSelf: "stretch",
  },
  deleteMomentConfirmBtn: {
    alignSelf: "stretch",
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.bgDanger,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteMomentConfirmText: {
    ...textStyles.singleLineSubheadingStrong,
    color: colors.textDangerOnDanger,
  },
  deleteMomentCancelBtn: {
    alignSelf: "stretch",
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.bgNeutralTertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteMomentCancelText: {
    ...textStyles.singleLineSubheadingStrong,
    color: colors.textNeutral,
  },

  // Profile card
  profileCard: {
    flexDirection: "row", alignItems: "center", gap: 16,
    backgroundColor: colors.card, borderRadius: radii.lg,
    marginHorizontal: 20, marginBottom: 12,
    padding: 16,
  },
  profileAvatarBtn: { width: 56, height: 56 },
  profileAvatar: {
    width: 56, height: 56, borderRadius: radii.full,
    backgroundColor: colors.accentMuted, overflow: "hidden",
    justifyContent: "center", alignItems: "center",
  },
  profileAvatarInitial: { fontFamily: typography.family.bold, fontSize: typography.size.xl, color: colors.text },
  profileCardName: { fontFamily: typography.family.bold, fontSize: typography.size.lg, color: colors.text, marginBottom: 4 },
  editChip: {
    flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start",
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.sm,
    backgroundColor: colors.accentMuted,
  },
  editChipText: { fontSize: typography.size.xs, fontFamily: typography.family.semibold, color: colors.textSecondary },
  avatarEditBadge: {
    position: "absolute", bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: radii.md,
    backgroundColor: colors.accentMuted, borderWidth: 1.5, borderColor: colors.card,
    justifyContent: "center", alignItems: "center",
  },

  // Streak card
  streakCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.cardBorder,
    marginHorizontal: 20, marginBottom: 24,
    padding: 16,
  },
  streakHalf: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, justifyContent: "center" },
  streakDivider: { width: 1, height: 40, backgroundColor: colors.cardBorder, marginHorizontal: 4 },
  streakCircle: {
    width: 44, height: 44, borderRadius: radii.xl,
    backgroundColor: "rgba(255,166,0,0.15)", justifyContent: "center", alignItems: "center",
    borderWidth: 1.5, borderColor: "rgba(255,166,0,0.5)",
  },
  streakCircleBlue: { backgroundColor: "rgba(74,158,255,0.15)", borderColor: "rgba(74,158,255,0.5)" },
  streakTextCol: { alignItems: "center", justifyContent: "center" },
  streakLabel: { fontFamily: typography.family.semibold, fontSize: typography.size.xs, color: colors.textSecondary, marginBottom: 2 },
  streakValue: { fontFamily: typography.family.bold, fontSize: typography.size.xl, color: colors.text },

  // Calendar
  calendarSection: { marginHorizontal: 20, marginBottom: 24 },
  calendarHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 14,
  },
  calendarTitle: { fontFamily: typography.family.bold, fontSize: typography.size.lg, color: colors.text },
  monthNav: { flexDirection: "row", alignItems: "center", gap: 4 },
  monthNavBtn: { width: 32, height: 32, justifyContent: "center", alignItems: "center" },
  monthName: { fontFamily: typography.family.semibold, fontSize: typography.size.sm, color: colors.textSecondary, minWidth: 120, textAlign: "center" },

  weekList: { gap: 8 },
  weekRow: {
    flexDirection: "row", alignItems: "center",
    borderRadius: radii.md, paddingVertical: 13, paddingHorizontal: 14,
    borderWidth: 1,
  },
  weekRowActive: { backgroundColor: colors.card, borderColor: colors.cardBorder },
  weekRowEmpty: { backgroundColor: colors.card, borderColor: colors.cardBorder },
  weekRowFuture: { backgroundColor: "transparent", borderColor: colors.cardBorder },
  weekFlameSlot: { width: 22, marginRight: 8, alignItems: "center" },
  weekLabelActive: { flex: 1, fontFamily: typography.family.semibold, fontSize: typography.size.xs, color: colors.text },
  weekLabelEmpty: { flex: 1, fontFamily: typography.family.regular, fontSize: typography.size.xs, color: colors.textSecondary, textDecorationLine: "line-through" },
  weekLabelFuture: { flex: 1, fontFamily: typography.family.regular, fontSize: typography.size.xs, color: colors.textTertiary },
  weekRight: { flexDirection: "row", alignItems: "center", gap: 2 },
  weekCount: { fontFamily: typography.family.bold, fontSize: typography.size.xs, color: colors.textSecondary },
  weekStatus: { fontFamily: typography.family.regular, fontSize: typography.size.xs, color: colors.textTertiary },

  // Random button
  randomBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12,
    backgroundColor: colors.card, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.cardBorder,
    marginHorizontal: 20, marginBottom: 32, padding: 18,
  },
  randomBtnText: { fontFamily: typography.family.bold, fontSize: typography.size.md, color: colors.text },

  // Settings
  settingsSection: { paddingHorizontal: 20, paddingBottom: 20 },
  settingsSectionLabel: { fontSize: typography.size.xs, fontFamily: typography.family.semibold, color: colors.textTertiary, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, paddingLeft: 4 },
  settingsCard: { backgroundColor: colors.card, borderRadius: radii.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.cardBorder },
  settingsDivider: { height: 1, backgroundColor: colors.cardBorder, marginLeft: 60 },
  settingsRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  settingsIconWrap: { width: 36, height: 36, borderRadius: radii.sm, justifyContent: "center", alignItems: "center" },
  settingsIconNeutral: { backgroundColor: colors.accentMuted },
  settingsLabel: { fontSize: typography.size.md, color: colors.text, fontFamily: typography.family.semibold },
  settingsSubValue: { fontSize: typography.size.xs, color: colors.textTertiary, fontFamily: typography.family.regular },

  // Theme segmented control
  themeSegment: {
    flexDirection: "row", gap: 4,
    marginHorizontal: 12, marginBottom: 12, marginTop: 2,
    backgroundColor: colors.bg, borderRadius: radii.md, padding: 4,
  },
  themeOption: { flex: 1, paddingVertical: 9, borderRadius: radii.sm, alignItems: "center" },
  themeOptionActive: { backgroundColor: colors.accentMuted },
  themeOptionText: { fontFamily: typography.family.semibold, fontSize: typography.size.xs, color: colors.textSecondary },
  themeOptionTextActive: { color: colors.text },

  // Loading
  loadingOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.opacityLight,
    justifyContent: "center", alignItems: "center",
  },

  // Modal back button
  modalBackBtn: {
    position: "absolute", left: 20, zIndex: 20,
    width: 44, height: 44, borderRadius: radii.xl,
    backgroundColor: colors.opacityLight,
    justifyContent: "center", alignItems: "center",
  },

  // Shuffle button
  weekLabelPill: {
    position: "absolute", alignSelf: "center",
    backgroundColor: colors.opacityLight, borderRadius: radii.lg,
    paddingHorizontal: 14, paddingVertical: 6,
    zIndex: 20,
  },
  weekLabelPillText: { fontFamily: typography.family.semibold, fontSize: typography.size.xs, color: colors.text },

  shuffleBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.opacityLight, borderRadius: radii.xl,
    paddingHorizontal: 20, paddingVertical: 12,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  shuffleBtnText: { fontFamily: typography.family.bold, fontSize: typography.size.sm, color: colors.text },
  randomLoadingOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: "center", alignItems: "center",
  },

  // Edit username sheet
  editSheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 24, paddingBottom: 44 },
  editSheetHandle: { width: 36, height: 4, backgroundColor: colors.borderSecondary, borderRadius: radii.xs, alignSelf: "center", marginBottom: 24 },
  editSheetTitle: { fontSize: typography.size.xl, fontFamily: typography.family.bold, color: colors.text, marginBottom: 20 },
  editSheetInput: { backgroundColor: colors.bg, borderRadius: radii.lg, paddingHorizontal: 16, paddingVertical: 15, fontSize: typography.size.lg, color: colors.text, fontFamily: typography.family.regular, marginBottom: 14, borderWidth: 1, borderColor: colors.cardBorder },
  editSheetBtn: { backgroundColor: colors.text, borderRadius: radii.lg, paddingVertical: 15, alignItems: "center", marginBottom: 10 },
  editSheetBtnText: { color: colors.bg, fontSize: typography.size.md, fontFamily: typography.family.bold },
  editSheetCancel: { paddingVertical: 12, alignItems: "center" },
  editSheetCancelText: { color: colors.textTertiary, fontSize: typography.size.sm, fontFamily: typography.family.semibold },

  // Random info modal
  infoBackdrop: { flex: 1, backgroundColor: colors.opacityLight, justifyContent: "center", alignItems: "center", padding: 32 },
  infoCard: { backgroundColor: colors.card, borderRadius: radii.xl, padding: 24, width: "100%", alignItems: "center", borderWidth: 1, borderColor: colors.cardBorder },
  infoIconWrap: { width: 48, height: 48, borderRadius: radii.xl, backgroundColor: colors.accentMuted, justifyContent: "center", alignItems: "center", marginBottom: 20 },
  infoText: { color: colors.text, fontFamily: typography.family.semibold, fontSize: typography.size.md, textAlign: "center", lineHeight: 24, marginBottom: 24 },
  infoBtn: { backgroundColor: colors.text, borderRadius: radii.lg, paddingVertical: 14, width: "100%", alignItems: "center" },
  infoBtnText: { color: colors.bg, fontFamily: typography.family.bold, fontSize: typography.size.md },
});

const makePhStyles = (colors: ThemeColors) => StyleSheet.create({
  challengeCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  challengeWeek: {
    color: colors.textTertiary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
    marginBottom: 4,
  },
  challengePrompt: {
    color: colors.text,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
    lineHeight: 19,
  },
  winnerThumb: {
    width: 80,
    height: 80,
    borderRadius: radii.sm,
    overflow: "hidden",
    backgroundColor: colors.bg,
  },
  winnerLabel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.opacityLight,
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  winnerLabelText: {
    color: colors.text,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
  },
  noVotes: {
    color: colors.textTertiary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
    marginTop: 6,
  },
});
