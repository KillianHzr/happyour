import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View, Text, StyleSheet, Dimensions, Animated, TouchableOpacity, Alert, TextInput, AppState, Modal, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import BlurView from "../../../components/atoms/BlurView";
import { supabase } from "../../../lib/supabase";
import { r2Storage } from "../../../lib/r2";
import { useAuth } from "../../../lib/auth-context";
import { useToast } from "../../../lib/toast-context";
import { translateError } from "../../../lib/error-messages";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { computeCrownWinner } from "../../../lib/crown";
import { useUpload } from "../../../lib/upload-context";
import { mediaCache } from "../../../lib/media-cache";
import Svg, { Path } from "react-native-svg";

import PhotoFeed, { type PhotoEntry, type Reaction } from "../../../components/PhotoFeed";
import { TextSticker } from "../../../components/atoms/TextSticker";
import { fetchChallengeData, getChallengeWeekStart, type ChallengeWithData } from "../../../lib/challenges";
import Loader from "../../../components/Loader";
import { ProfileIcon, VaultIcon, MomentIcon, FlowerIcon } from "../../../components/icons";
import { CloseIcon } from "../../../components/groups/GroupIcons";

import ProfilePage from "../../../components/groups/ProfilePage";
import CameraPage from "../../../components/groups/CameraPage";
import VaultPage from "../../../components/groups/VaultPage";
import GroupsPage from "../../../components/groups/GroupsPage";
import PagerTabBar from "../../../components/groups/PagerTabBar";
import AddGroupFlow from "../../../components/groups/AddGroupFlow";
import GroupSettingsModal from "../../../components/groups/GroupSettingsModal";
import CustomChallengeCreatePage from "../../../components/groups/CustomChallengeCreatePage";
import CustomChallengeQueuePage from "../../../components/groups/CustomChallengeQueuePage";
import BottomSheet from "../../../components/BottomSheet";
import LiveReactions from "../../../components/reveal/LiveReactions";
import MotivationalNotificationsModal from "../../../components/MotivationalNotificationsModal";
import { scheduleImmediateLocalNotification, scheduleFirstMomentReminder, notifyReaction } from "../../../lib/notifications";
import { radii, spacing, typography, textStyles, buildColors, type ThemeColors } from "../../../lib/theme";
import Icon from "../../../components/Icon";
import Shape, { type ShapeName } from "../../../components/Shape";
import { useTheme, useThemedStyles, ForceThemeMode } from "../../../lib/theme-context";

const captureToastShape = (mode: string): ShapeName => {
  if (mode === "VIDEO") return "video";
  if (mode === "DESSIN") return "dessin";
  if (mode === "AUDIO") return "audio";
  if (mode === "TEXTE") return "texte";
  return "photo";
};

const captureToastMsg = (mode: string, groupName: string, isChallenge?: boolean): string => {
  if (isChallenge) return `Participation au défi envoyée dans ${groupName}`;
  const labels: Record<string, string> = {
    PHOTO: "Photo partagée",
    VIDEO: "Vidéo partagée",
    DESSIN: "Dessin partagé",
    AUDIO: "Audio partagé",
    TEXTE: "Texte partagé",
  };
  return `${labels[mode] ?? "Moment partagé"} dans ${groupName}`;
};

const isEmoji = (str: string) => {
  const regexExp = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/gi;
  return regexExp.test(str);
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const NAVBAR_HEIGHT = 100;
const STANDARD_EMOJIS = ["🤷", "🤦", "🙋", "🫶", "👌", "🤞"];

type GroupInfo = { id: string; name: string; invite_code: string };

type GroupData = {
  name: string;
  inviteCode: string;
  members: any[];
  photoCount: number;
  photos: PhotoEntry[];
  crownWinnerId: string | null;
  crownDurationMs: number;
  allDurations: Record<string, number>;
  isAdmin: boolean;
  challenges: { period1: ChallengeWithData | null; period2: ChallengeWithData | null } | null;
  currentUserRespondedToChallenge: boolean;
};

function getWeekBounds(revealDayOfWeek = 0, revealHour = 20) {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const daysFromMonday = revealDayOfWeek === 0 ? 6 : revealDayOfWeek - 1;
  const revealDate = new Date(monday);
  revealDate.setDate(monday.getDate() + daysFromMonday);
  revealDate.setHours(revealHour, 0, 0, 0);
  const prevRevealDate = new Date(revealDate);
  prevRevealDate.setDate(revealDate.getDate() - 7);
  return { monday, revealDate, prevRevealDate };
}

export default function MainPagerScreen() {
  const { id, onboarding } = useLocalSearchParams<{ id: string; onboarding?: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { uploads: activeUploads } = useUpload();

  const scrollX = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const scrollRef = useRef<Animated.ScrollView>(null);
  const pagerTouchRef = useRef<{ x: number; y: number; decided: boolean } | null>(null);
  // Désactive complètement le swipe du pager quand on est sur la vue de sélection de groupe
  const [groupsPagerLocked, setGroupsPagerLocked] = useState(false);

  // Multi-group
  const [allGroups, setAllGroups] = useState<GroupInfo[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string>(id ?? "");

  // Group data (all groups preloaded)
  const [groupData, setGroupData] = useState<Record<string, GroupData>>({});
  const [dataLoaded, setDataLoaded] = useState(false);
  const [revealConfig, setRevealConfig] = useState({ day: 0, hour: 20 });

  // User profile
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [streakDays, setStreakDays] = useState(0);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [captureToast, setCaptureToast] = useState<{ mode: string; groupName: string; isChallenge?: boolean } | null>(null);
  const captureToastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const captureToastAnim = useRef({ opacity: new Animated.Value(0), translateY: new Animated.Value(-12) }).current;

  const [dailyNotifs, setDailyNotifs] = useState(3);
  const [notifPeriods, setNotifPeriods] = useState<("morning" | "afternoon" | "evening")[]>(["morning", "afternoon", "evening"]);

  // Pager
  const [currentPage, setCurrentPage] = useState(1);
  // Page "active" différée : pilote l'activation des pages lourdes (caméra, fetch…)
  // APRÈS la transition, pour ne pas geler le swipe ni retarder l'affichage du menu.
  const [activePage, setActivePage] = useState(1);
  const [cameraScrollLocked, setCameraScrollLocked] = useState(false);
  const [cameraHideMenu, setCameraHideMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Modals
  const [showReveal, setShowReveal] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  // Quand le flow d'ajout se termine : ouvrir la vue du nouveau groupe dans GroupsPage
  const [enterGroupId, setEnterGroupId] = useState<string | null>(null);
  const [showNotifOnboarding, setShowNotifOnboarding] = useState(false);
  const [addGroupView, setAddGroupView] = useState<null | "create" | "join">(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [addGroupLoading, setAddGroupLoading] = useState(false);
  const lastSyncRef = useRef<number>(0);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  // Toast capture
  const cameraFrameTop = SCREEN_HEIGHT - NAVBAR_HEIGHT - SCREEN_WIDTH * (16 / 9);

  const dismissCaptureToast = () => {
    if (captureToastTimerRef.current) clearTimeout(captureToastTimerRef.current);
    Animated.parallel([
      Animated.timing(captureToastAnim.opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(captureToastAnim.translateY, { toValue: -12, duration: 220, useNativeDriver: true }),
    ]).start(() => setCaptureToast(null));
  };

  const showCaptureToast = (info: { mode: string; groupName: string; isChallenge?: boolean }) => {
    if (captureToastTimerRef.current) clearTimeout(captureToastTimerRef.current);
    captureToastAnim.opacity.setValue(0);
    captureToastAnim.translateY.setValue(-12);
    setCaptureToast(info);
    Animated.parallel([
      Animated.spring(captureToastAnim.opacity, { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
      Animated.spring(captureToastAnim.translateY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }),
    ]).start();
    captureToastTimerRef.current = setTimeout(dismissCaptureToast, 3000);
  };

  useEffect(() => () => { if (captureToastTimerRef.current) clearTimeout(captureToastTimerRef.current); }, []);

  // Reactions
  const [activeReactionPhotoId, setActiveReactionPhotoId] = useState<string | null>(null);
  const [showCustomTextInput, setShowCustomTextInput] = useState(false);
  const [customReactionText, setCustomReactionText] = useState("");
  const [customReactionHistory, setCustomReactionHistory] = useState<string[]>([]);
  const emojiWarningAnim = useRef(new Animated.Value(0)).current;
  const emojiWarningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emojiWarningVisible = useRef(false);
  const emojiWheelAnim = useRef(new Animated.Value(0)).current;
  const customInputRef = useRef<TextInput>(null);

  useEffect(() => {
    AsyncStorage.getItem("custom_reaction_history").then(raw => {
      if (raw) setCustomReactionHistory(JSON.parse(raw));
    }).catch(() => {});
  }, []);

  // DEV
  const [debugUnlocked, setDebugUnlocked] = useState(false);
  const [debugVaultChallenges, setDebugVaultChallenges] = useState<{ period1: ChallengeWithData | null; period2: ChallengeWithData | null } | null>(null);
  const [showCustomChallengeCreate, setShowCustomChallengeCreate] = useState(false);
  const [showCustomChallengeQueue, setShowCustomChallengeQueue] = useState(false);

  // Derived from active group data
  const activeData = groupData[activeGroupId] ?? null;
  const groupName = activeData?.name ?? "";
  const groupInviteCode = activeData?.inviteCode ?? "";
  const members = activeData?.members ?? [];
  const photoCount = activeData?.photoCount ?? 0;
  const photos = activeData?.photos ?? [];
  const crownWinnerId = activeData?.crownWinnerId ?? null;
  const crownDurationMs = activeData?.crownDurationMs ?? 0;
  const isAdmin = activeData?.isAdmin ?? false;
  const challenges = activeData?.challenges ?? null;

  const { revealDate, prevRevealDate } = getWeekBounds(revealConfig.day, revealConfig.hour);
  const revealEndDate = new Date(revealDate.getTime() + 24 * 60 * 60 * 1000);
  const prevRevealEndDate = new Date(prevRevealDate.getTime() + 24 * 60 * 60 * 1000);
  const nextRevealDate = new Date(revealDate.getTime() + 7 * 24 * 60 * 60 * 1000);

  const now = new Date();
  const inCurrentRevealWindow = now >= revealDate && now < revealEndDate;
  // Le lundi matin après un dimanche soir : on est dans la fenêtre du reveal précédent
  const inPrevRevealWindow = now >= prevRevealDate && now < prevRevealEndDate;
  const activeRevealEndDate = inPrevRevealWindow ? prevRevealEndDate : revealEndDate;
  const isAfterRevealWindow = now >= activeRevealEndDate;
  const unlocked = inCurrentRevealWindow || inPrevRevealWindow || (__DEV__ && debugUnlocked);
  const lockedRevealDate = now >= revealDate ? nextRevealDate : revealDate;
  const currentUserRespondedToChallenge = activeData?.currentUserRespondedToChallenge ?? false;
  const currentUserPostedThisWeek = photos.some(p => p.user_id === user?.id) || currentUserRespondedToChallenge || (__DEV__ && debugUnlocked);

  useEffect(() => {
    if (onboarding === "true" && allGroups.length <= 1) {
      const timer = setTimeout(() => setShowNotifOnboarding(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [onboarding, allGroups.length]);

  // ── Fetch all groups data at once ──
  const fetchAllData = useCallback(async (options?: { force?: boolean }) => {
    if (!user) return;

    // Cooldown de 45s pour éviter les syncs excessifs (ex: retour de caméra)
    // Sauf si c'est un refresh forcé (manuel ou upload terminé)
    const nowTs = Date.now();
    if (!options?.force && nowTs - lastSyncRef.current < 45_000) {
      console.log("[DB FETCH] fetchAllData: Cooldown active, skipping sync...");
      return;
    }

    console.log("[DB FETCH] fetchAllData: Starting full sync...");
    lastSyncRef.current = nowTs;
    // Ensure the local media manifest is loaded before building PhotoEntries
    await mediaCache.load();
    try {
      const [cfgRows, profileRes] = await Promise.all([
        supabase.from("app_config").select("key, value").in("key", ["reveal_day", "reveal_hour"]),
        supabase.from("profiles").select("username, avatar_url, email, daily_notifications_count, notification_periods").eq("id", user.id).single(),
      ]);
      
      const cfgMap = Object.fromEntries((cfgRows.data ?? []).map((r: any) => [r.key, Number(r.value)]));
      const cfg = { reveal_day: cfgMap["reveal_day"] ?? 0, reveal_hour: cfgMap["reveal_hour"] ?? 20 };
      setRevealConfig({ day: cfg.reveal_day, hour: cfg.reveal_hour });

      const { revealDate: currentRevealDate, prevRevealDate } = getWeekBounds(cfg.reveal_day, cfg.reveal_hour);
      const currentRevealEndDate = new Date(currentRevealDate.getTime() + 24 * 60 * 60 * 1000);
      const prevRevealEndDate = new Date(prevRevealDate.getTime() + 24 * 60 * 60 * 1000);
      const now = new Date();
      // Pendant la fenêtre du reveal (prevRevealDate → prevRevealDate+24h) : afficher la semaine écoulée
      // Après la fenêtre : nouvelle semaine en cours (prevRevealDate → currentRevealDate)
      const inRevealWindow = now >= prevRevealDate && now < prevRevealEndDate;
      const weekBeforeReveal = new Date(prevRevealDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      const photoStart = inRevealWindow ? weekBeforeReveal : prevRevealDate;
      const photoEnd = inRevealWindow ? prevRevealDate : currentRevealDate;

      const { data: groupsData } = await supabase.from("group_members").select("groups(id, name, invite_code, created_at)").eq("user_id", user.id);

      const groups: GroupInfo[] = (groupsData ?? [])
        .map((g: any) => g.groups)
        .filter(Boolean)
        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      setAllGroups(groups);

      if (profileRes.data) {
        setUsername(profileRes.data.username);
        setAvatarUrl(profileRes.data.avatar_url);
        setEmail(profileRes.data.email || user.email || "");
        setDailyNotifs(profileRes.data.daily_notifications_count ?? 3);
        setNotifPeriods(profileRes.data.notification_periods ?? ["morning", "afternoon", "evening"]);
      }

      const dataEntries = await Promise.all(
        groups.map(async (g) => {
          const [membersRes, photosRes] = await Promise.all([
            supabase.from("group_members").select("user_id, role, profiles:user_id(username, avatar_url)").eq("group_id", g.id),
            supabase.from("photos")
              .select("id, image_path, second_image_path, audio_note_path, waveform, caption_waveform, created_at, note, user_id, profiles:user_id(username, avatar_url)")
              .eq("group_id", g.id)
              .gte("created_at", photoStart.toISOString())
              .lt("created_at", photoEnd.toISOString())
              .order("created_at", { ascending: true }),
          ]);

          const membersData = (membersRes.data ?? []).map((m: any) => ({
            ...m.profiles, user_id: m.user_id, role: m.role,
          }));
          const me = (membersRes.data ?? []).find((m: any) => m.user_id === user.id);
          const isAdminForGroup = me?.role === "admin" ?? false;
          const photoCount = photosRes.data?.length ?? 0;

          const photoIds = (photosRes.data ?? []).map((p: any) => p.id);
          
          const challengeWeekStart = getChallengeWeekStart(prevRevealDate);
          let challenges = await fetchChallengeData(g.id, challengeWeekStart, membersData);
          // DEV: if prev week has no challenges, load current week so simulate-reveal shows data
          if (__DEV__ && !challenges.period1 && !challenges.period2) {
            const currentWeekStart = getChallengeWeekStart();
            if (currentWeekStart !== challengeWeekStart) {
              challenges = await fetchChallengeData(g.id, currentWeekStart, membersData);
            }
          }

          // Check if current user responded to any challenge this week (unlocks reveal)
          const currentChallengeWeekStart = getChallengeWeekStart();
          const { data: currentWeekChallenges } = await supabase
            .from("weekly_challenges")
            .select("id")
            .eq("group_id", g.id)
            .eq("week_start", currentChallengeWeekStart);
          let currentUserRespondedToChallenge = false;
          if (currentWeekChallenges && currentWeekChallenges.length > 0) {
            const ids = currentWeekChallenges.map((c: any) => c.id);
            const { data: myResp } = await supabase
              .from("challenge_responses")
              .select("id")
              .in("challenge_id", ids)
              .eq("user_id", user.id)
              .limit(1)
              .maybeSingle();
            currentUserRespondedToChallenge = !!myResp;
          }

          if (photoIds.length > 0) {
  ;
            const [reactionsRes, viewsRes, latestCommentsRes] = await Promise.all([
              supabase.from("reactions").select("id, photo_id, user_id, emoji").in("photo_id", photoIds),
              supabase.from("comment_views").select("photo_id, last_viewed_at").eq("user_id", user.id).in("photo_id", photoIds),
              supabase.from("comments").select("photo_id, created_at").in("photo_id", photoIds).order("created_at", { ascending: false })
            ]);

            const viewsMap = Object.fromEntries((viewsRes.data ?? []).map((v: any) => [v.photo_id, v.last_viewed_at]));
            const latestCommentsMap: Record<string, string> = {};
            for (const c of latestCommentsRes.data ?? []) {
              if (!latestCommentsMap[c.photo_id]) {
                latestCommentsMap[c.photo_id] = c.created_at;
              }
            }

            const reactionsByPhoto: Record<string, Reaction[]> = {};
            for (const r of reactionsRes.data ?? []) {
              if (!reactionsByPhoto[r.photo_id]) reactionsByPhoto[r.photo_id] = [];
              const member = membersData.find(m => m.user_id === r.user_id);
              reactionsByPhoto[r.photo_id].push({
                id: r.id, 
                user_id: r.user_id,
                username: member?.username ?? "Anonyme",
                avatar_url: member?.avatar_url ?? null,
                sticker_id: r.emoji,
              });
            }

            const groupPhotos = photosRes.data!.map((p: any) => {
              const r2Url = p.image_path === "text_mode" ? "" : r2Storage.getPublicUrl(p.image_path);
              const url = mediaCache.getLocalUri(p.image_path) ?? r2Url;
              const lastViewedAt = viewsMap[p.id];
              const latestCommentAt = latestCommentsMap[p.id];
              const hasNewComments = latestCommentAt && (!lastViewedAt || new Date(latestCommentAt) > new Date(lastViewedAt));

              return {
                id: p.id,
                url,
                fallback_url: p.image_path === "text_mode" ? undefined : supabase.storage.from("moments").getPublicUrl(p.image_path).data.publicUrl,
                created_at: p.created_at,
                note: p.note ?? null,
                username: p.profiles?.username ?? "Anonyme",
                avatar_url: p.profiles?.avatar_url,
                image_path: p.image_path,
                second_image_path: p.second_image_path ?? null,
                second_note: p.second_note ?? null,
                audio_note_path: p.audio_note_path ?? null,
                waveform: p.waveform ?? null,
                caption_waveform: p.caption_waveform ?? null,
                user_id: p.user_id,
                reactions: reactionsByPhoto[p.id] ?? [],
                hasNewComments: !!hasNewComments,
              };
            });

            const crown = computeCrownWinner(groupPhotos, prevRevealDate, currentRevealDate);
            return [g.id, {
              name: g.name,
              inviteCode: g.invite_code,
              members: membersData,
              photoCount,
              photos: groupPhotos,
              crownWinnerId: crown?.winnerId ?? null,
              crownDurationMs: crown?.durationMs ?? 0,
              allDurations: crown?.allDurations ?? {},
              isAdmin: isAdminForGroup,
              challenges,
              currentUserRespondedToChallenge,
            }] as [string, GroupData];
          }

          return [g.id, {
            name: g.name,
            inviteCode: g.invite_code,
            members: membersData,
            photoCount: 0,
            photos: [],
            crownWinnerId: null,
            crownDurationMs: 0,
            allDurations: {},
            isAdmin: isAdminForGroup,
            challenges,
            currentUserRespondedToChallenge,
          }] as [string, GroupData];
        })
      );

      setGroupData(Object.fromEntries(dataEntries));
    } catch (err) {
      console.error("[fetchAllData]", err);
    }
    setDataLoaded(true);
  }, [user]);

  const fetchAllDataRef = useRef(fetchAllData);
  fetchAllDataRef.current = fetchAllData;

  // Re-fetch only the reactions of the active group — lightweight, used by realtime
  const refreshReactions = useCallback(async () => {
    if (!activeGroupId) return;
    const gd = groupData[activeGroupId];
    if (!gd || gd.photos.length === 0) return;
    const photoIds = gd.photos.map((p) => p.id);
    const { data: rawReactions } = await supabase
      .from("reactions")
      .select("id, photo_id, user_id, emoji")
      .in("photo_id", photoIds);
    if (!rawReactions) return;
    const reactionsByPhoto: Record<string, Reaction[]> = {};
    for (const r of rawReactions) {
      if (!reactionsByPhoto[r.photo_id]) reactionsByPhoto[r.photo_id] = [];
      const member = gd.members.find((m: any) => m.user_id === r.user_id);
      reactionsByPhoto[r.photo_id].push({
        id: r.id,
        user_id: r.user_id,
        username: member?.username ?? "Anonyme",
        avatar_url: member?.avatar_url ?? null,
        sticker_id: r.emoji,
      });
    }
    setGroupData((prev) => {
      const g = prev[activeGroupId];
      if (!g) return prev;
      return {
        ...prev,
        [activeGroupId]: {
          ...g,
          photos: g.photos.map((p) => ({ ...p, reactions: reactionsByPhoto[p.id] ?? [] })),
        },
      };
    });
  }, [activeGroupId, groupData]);

  const refreshReactionsRef = useRef(refreshReactions);
  refreshReactionsRef.current = refreshReactions;

  const handleVoteChallenge = useCallback(async (challengeId: string, responseId: string) => {
    if (!user) return;
    // Optimistic update
    setGroupData((prev) => {
      const g = prev[activeGroupId];
      if (!g || !g.challenges) return prev;
      const updatePeriod = (c: ChallengeWithData | null) => {
        if (!c || c.id !== challengeId) return c;
        const existingIdx = c.votes.findIndex((v) => v.voter_id === user.id);
        const newVote = { id: "temp", challenge_id: challengeId, response_id: responseId, voter_id: user.id };
        const votes = existingIdx >= 0
          ? c.votes.map((v, i) => (i === existingIdx ? newVote : v))
          : [...c.votes, newVote];
        return { ...c, votes };
      };
      return {
        ...prev,
        [activeGroupId]: {
          ...g,
          challenges: {
            period1: updatePeriod(g.challenges.period1),
            period2: updatePeriod(g.challenges.period2),
          },
        },
      };
    });
    try {
      await supabase.from("challenge_votes")
        .upsert(
          { challenge_id: challengeId, response_id: responseId, voter_id: user.id },
          { onConflict: "challenge_id,voter_id" }
        );
    } catch (e) {
      console.error("[DB WRITE] handleVoteChallenge error:", e);
      fetchAllDataRef.current();
    }
  }, [user, activeGroupId]);

  useEffect(() => { fetchAllData(); }, [fetchAllData]);

  useEffect(() => {
    const hasJustFinished = activeUploads.some((u) => u.status === "success");
    if (hasJustFinished) fetchAllData({ force: true });
  }, [activeUploads, fetchAllData]);

  // Keep a ref so the real-time callback always reads the latest reveal config
  const revealConfigRef = useRef(revealConfig);
  revealConfigRef.current = revealConfig;

  // ── Real-time + AppState refresh ──
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`user-rt-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "photos" },
        () => { fetchAllDataRef.current(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_members" },
        () => { fetchAllDataRef.current(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // Rafraîchit les données quand l'app revient au premier plan
  useEffect(() => {
    const isMounted = { skipped: false };
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        if (!isMounted.skipped) { isMounted.skipped = true; return; }
        fetchAllDataRef.current();
      }
    });
    return () => sub.remove();
  }, []);

  // Polling toutes les 30s
  useEffect(() => {
    const interval = setInterval(() => {
      if (AppState.currentState === "active" && !showReveal) {
        fetchAllDataRef.current();
      }
    }, 120_000);
    return () => clearInterval(interval);
  }, [showReveal]);

  // Persiste le groupe actif pour le prochain lancement de l'app
  useEffect(() => {
    if (activeGroupId) AsyncStorage.setItem("lastGroupId", activeGroupId);
  }, [activeGroupId]);

  // ── Group switching ──
  const handleSwitchGroup = useCallback((groupId: string) => {
    if (groupId === activeGroupId) return;
    setActiveGroupId(groupId);
  }, [activeGroupId]);

  // Cleanup emoji warning timer on unmount
  useEffect(() => {
    return () => { if (emojiWarningTimer.current) clearTimeout(emojiWarningTimer.current); emojiWarningAnim.setValue(0); };
  }, []);

  // ── Emoji Wheel & Custom Text ──
  useEffect(() => {
    if (activeReactionPhotoId) {
      Animated.spring(emojiWheelAnim, { toValue: 1, useNativeDriver: true, tension: 50, friction: 7 }).start();
    } else {
      Animated.timing(emojiWheelAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [activeReactionPhotoId]);

  const handleEmojiReact = async (emoji: string) => {
    if (!user || !activeReactionPhotoId) return;
    const photoId = activeReactionPhotoId;
    
    const activePhoto = photos.find(p => p.id === photoId);
    const existing = activePhoto?.reactions.find(r => r.user_id === user.id);
    const isDeletion = existing && existing.sticker_id === emoji;

    setActiveReactionPhotoId(null);
    setShowCustomTextInput(false);

    if (isDeletion) {
      
      setGroupData(prev => {
        const next = { ...prev };
        const g = next[activeGroupId];
        if (!g) return prev;
        const newPhotos = g.photos.map(p => {
          if (p.id !== photoId) return p;
          return { ...p, reactions: p.reactions.filter(r => r.user_id !== user.id) };
        });
        next[activeGroupId] = { ...g, photos: newPhotos };
        return next;
      });

      try {
        const { error } = await supabase.from("reactions").delete().eq("id", existing.id);
        if (error) throw error;
      } catch (e) {
        console.error("[DB WRITE] Reaction delete error:", e);
      }
      return;
    }

    const reactionId = `temp-${Math.random()}`;
    const reactionObj: Reaction = {
      id: reactionId,
      user_id: user.id,
      username: username || "Moi",
      avatar_url: avatarUrl,
      sticker_id: emoji
    };

    setGroupData(prev => {
      const next = { ...prev };
      const g = next[activeGroupId];
      if (!g) return prev;
      const newPhotos = g.photos.map(p => {
        if (p.id !== photoId) return p;
        return { ...p, reactions: [...p.reactions.filter(r => r.user_id !== user.id), reactionObj] };
      });
      next[activeGroupId] = { ...g, photos: newPhotos };
      return next;
    });

    try {
      const { data, error } = await supabase
        .from("reactions")
        .upsert({ photo_id: photoId, user_id: user.id, type: "emoji", emoji }, { onConflict: "photo_id,user_id" })
        .select("id")
        .single();
      if (error) throw error;
      if (data) {
        setGroupData(prev => {
          const next = { ...prev };
          const g = next[activeGroupId];
          if (!g) return prev;
          const newPhotos = g.photos.map(p => {
            if (p.id !== photoId) return p;
            return { ...p, reactions: p.reactions.map(r => r.id === reactionId ? { ...r, id: data.id } : r) };
          });
          next[activeGroupId] = { ...g, photos: newPhotos };
          return next;
        });
      }
      if (activePhoto && activePhoto.user_id !== user.id) {
        const groupName = groupData[activeGroupId]?.name ?? "";
        notifyReaction(activePhoto.user_id, username ?? "", emoji, groupName, user.id)
          .catch((e) => console.warn("[Notif] Reaction notif error:", e));
      }
    } catch (e) {
      console.error("[DB WRITE] Reaction upsert error:", e);
      Alert.alert("Erreur", "Impossible d'enregistrer la réaction.");
    }
  };

  const handleCustomTextSubmit = () => {
    const trimmed = customReactionText.trim().toUpperCase();
    if (trimmed) {
      handleEmojiReact(trimmed);
      const newHistory = [trimmed, ...customReactionHistory.filter(h => h !== trimmed)].slice(0, 3);
      setCustomReactionHistory(newHistory);
      AsyncStorage.setItem("custom_reaction_history", JSON.stringify(newHistory)).catch(() => {});
      setCustomReactionText("");
    }
  };

  const openCustomTextInput = () => {
    if (!activeReactionPhotoId) return;
    const activePhoto = photos.find(p => p.id === activeReactionPhotoId);
    const myReactionStr = activePhoto?.reactions.find(r => r.user_id === user?.id)?.sticker_id;
    const isCustomText = myReactionStr && !STANDARD_EMOJIS.includes(myReactionStr);

    setCustomReactionText(isCustomText ? myReactionStr : "");
    setShowCustomTextInput(true);
  };

  // Real-time reactions
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`rt-reactions-${activeGroupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const old = payload.old as any;
          if (!old?.photo_id) return;
          setGroupData((prev) => {
            const next = { ...prev };
            for (const gid in next) {
              const g = next[gid];
              const pIdx = g.photos.findIndex((p) => p.id === old.photo_id);
              if (pIdx === -1) continue;
              const newPhotos = [...g.photos];
              newPhotos[pIdx] = { ...newPhotos[pIdx], reactions: newPhotos[pIdx].reactions.filter((r) => r.id !== old.id) };
              next[gid] = { ...g, photos: newPhotos };
              return next;
            }
            return prev;
          });
        } else {
          const nr = payload.new as any;
          if (!nr?.photo_id) return;
          setGroupData((prev) => {
            const next = { ...prev };
            for (const gid in next) {
              const g = next[gid];
              const pIdx = g.photos.findIndex((p) => p.id === nr.photo_id);
              if (pIdx === -1) continue;
              const member = g.members.find((m: any) => m.user_id === nr.user_id);
              const reactionObj: Reaction = {
                id: nr.id,
                user_id: nr.user_id,
                username: member?.username ?? "Anonyme",
                avatar_url: member?.avatar_url ?? null,
                sticker_id: nr.emoji,
              };
              const newPhotos = [...g.photos];
              newPhotos[pIdx] = {
                ...newPhotos[pIdx],
                reactions: [...newPhotos[pIdx].reactions.filter((r) => r.user_id !== nr.user_id), reactionObj],
              };
              next[gid] = { ...g, photos: newPhotos };
              return next;
            }
            return prev;
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, activeGroupId]);

  // ── Group management ──
  const handleRenameGroup = async (newName: string) => {
    if (!activeGroupId || !newName.trim()) return;
    try {
      const { data, error } = await supabase
        .from("groups")
        .update({ name: newName.trim() })
        .eq("id", activeGroupId)
        .select()
        .single();

      if (error) throw error;
      
      setGroupData((prev) => ({ ...prev, [activeGroupId]: { ...prev[activeGroupId], name: newName.trim() } }));
      setAllGroups((prev) => prev.map((g) => g.id === activeGroupId ? { ...g, name: newName.trim() } : g));
      showToast("Succès", "Groupe renommé avec succès", "success");
    } catch (e: any) {
      showToast("Erreur", "Impossible de renommer le groupe", "error");
      throw e;
    }
  };

  const handleLeaveGroup = async () => {
    if (!user || !activeGroupId) return;
    setIsLeaving(true);
    try {
      const others = members.filter((m: any) => m.user_id !== user.id);
      
      if (others.length === 0) {
        const { error: delErr } = await supabase.from("groups").delete().eq("id", activeGroupId);
        if (delErr) throw delErr;
      } else {
        // D'AUTRES MEMBRES RESTENT : On transfère l'admin si nécessaire et on se retire
        if (isAdmin) {
          await supabase
            .from("group_members")
            .update({ role: "admin" })
            .eq("group_id", activeGroupId)
            .eq("user_id", others[0].user_id);
        }
        const { error: leaveErr } = await supabase
          .from("group_members")
          .delete()
          .eq("group_id", activeGroupId)
          .eq("user_id", user.id);
        if (leaveErr) throw leaveErr;
      }

      // Mise à jour de l'état local et redirection
      const remaining = allGroups.filter((g) => g.id !== activeGroupId);
      if (remaining.length > 0) {
        setAllGroups(remaining);
        setGroupData((prev) => { const next = { ...prev }; delete next[activeGroupId]; return next; });
        setShowLeaveConfirm(false);
        setShowGroupSettings(false);
        setActiveGroupId(remaining[0].id);
      } else {
        router.replace("/(app)/groups");
      }
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setIsLeaving(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!activeGroupId) return;
    try {
      const { error } = await supabase.from("groups").delete().eq("id", activeGroupId);
      if (error) throw new Error(error.message);
      setShowGroupSettings(false);
      const remaining = allGroups.filter((g) => g.id !== activeGroupId);
      if (remaining.length > 0) {
        setAllGroups(remaining);
        setGroupData((prev) => { const next = { ...prev }; delete next[activeGroupId]; return next; });
        setActiveGroupId(remaining[0].id);
      } else {
        router.replace("/(app)/groups");
      }
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    }
  };

  const handleTransferAdmin = async (newAdminId: string) => {
    if (!user || !activeGroupId) return;
    try {
      const [r1, r2] = await Promise.all([
        supabase.from("group_members").update({ role: "admin" }).eq("group_id", activeGroupId).eq("user_id", newAdminId),
        supabase.from("group_members").update({ role: "member" }).eq("group_id", activeGroupId).eq("user_id", user.id),
      ]);
      if (r1.error) throw new Error(r1.error.message);
      if (r2.error) throw new Error(r2.error.message);
      await fetchAllData();
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
      throw e;
    }
  };

  const closeAddGroupModal = () => {
    setShowAddGroupModal(false);
    setAddGroupView(null);
    setNewGroupName("");
    setJoinCode("");
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !user) return;
    setAddGroupLoading(true);
    try {
      const { data: group, error } = await supabase
        .from("groups")
        .insert({ name: newGroupName.trim(), created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      await supabase.from("group_members").insert({ group_id: group.id, user_id: user.id, role: "admin" });
      const isFirstGroup = allGroups.length === 0;
      closeAddGroupModal();
      await fetchAllData();
      setActiveGroupId(group.id);
      if (isFirstGroup) {
        setTimeout(() => setShowNotifOnboarding(true), 500);
      }
    } catch (e: any) {
      showToast("Erreur", translateError(e.message));
    } finally {
      setAddGroupLoading(false);
    }
  };

  const handleJoinGroup = async () => {
    if (!joinCode.trim() || !user) return;
    setAddGroupLoading(true);
    try {
      const cleanCode = joinCode.trim().toUpperCase();
      const { data: group, error: groupErr } = await supabase
        .from("groups")
        .select("id, name")
        .eq("invite_code", cleanCode)
        .maybeSingle();
      if (groupErr) throw groupErr;
      if (!group) { showToast("Erreur", "Code invalide ou groupe introuvable."); return; }
      const { error: joinErr } = await supabase
        .from("group_members")
        .insert({ group_id: group.id, user_id: user.id });
      if (joinErr) throw joinErr;
      
      showToast("Succès", `Tu as rejoint "${group.name}" !`, "success");
      const isFirstGroup = allGroups.length === 0;
      closeAddGroupModal();
      await fetchAllData();
      setActiveGroupId(group.id);
      if (isFirstGroup) {
        setTimeout(() => setShowNotifOnboarding(true), 500);
      }
    } catch (e: any) {
      showToast("Erreur", translateError(e.message));
    } finally {
      setAddGroupLoading(false);
    }
  };

  // ── Pager ──
  // Le menu ne dépend que de currentPage → mis à jour instantanément au tap (re-render léger).
  const commitPage = (page: number) => {
    setCurrentPage(page);
  };

  // L'activation lourde des pages (caméra, fetch…) est repoussée APRÈS que le menu se soit
  // peint, pour que le changement de menu soit instantané et ne soit pas bloqué par ce re-render.
  useEffect(() => {
    const id = setTimeout(() => setActivePage(currentPage), 60);
    return () => clearTimeout(id);
  }, [currentPage]);

  const jumpTo = (page: number) => {
    if (page === currentPage) return;
    // Scroll natif (thread UI) → fluide comme le swipe ; scrollX suit via onScroll donc le
    // fondu du menu reste synchronisé (pas de flash). Le re-render JS d'activation ne le bloque pas.
    scrollRef.current?.scrollTo({ x: page * SCREEN_WIDTH, animated: true });
    commitPage(page);
  };

  // Fondu natif entre le menu "capture" (sombre, page 1) et le menu "app" (pages 0 et 2)
  const captureMenuOpacity = scrollX.interpolate({ inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH], outputRange: [0, 1, 0], extrapolate: 'clamp' });
  const appMenuOpacity = scrollX.interpolate({ inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH], outputRange: [1, 0, 1], extrapolate: 'clamp' });

  const cameraTranslateX = scrollX.interpolate({ inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH], outputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH] });
  const cameraScale = scrollX.interpolate({ inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH], outputRange: [0.9, 1, 0.9] });
  const cameraOpacity = scrollX.interpolate({ inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH], outputRange: [0.4, 1, 0.4] });

  const scrollEnabled = !cameraScrollLocked && !groupsPagerLocked;

  // Palette sombre fixe pour le menu de la vue capture
  const darkColors = useMemo(() => buildColors("Dark"), []);

  const lockScrollDirect = useCallback((locked: boolean) => {
    if (!locked && cameraScrollLocked) return;
    scrollRef.current?.setNativeProps({ scrollEnabled: !locked });
  }, [cameraScrollLocked]);

  const handlePagerTouchStart = (e: any) => {
    pagerTouchRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, decided: false };
    scrollRef.current?.setNativeProps({ scrollEnabled });
  };

  const handlePagerTouchMove = (e: any) => {
    const t = pagerTouchRef.current;
    if (!t || t.decided) return;
    const dx = Math.abs(e.nativeEvent.pageX - t.x);
    const dy = Math.abs(e.nativeEvent.pageY - t.y);
    if (dx + dy > 5) {
      t.decided = true;
      if (dy > dx) scrollRef.current?.setNativeProps({ scrollEnabled: false });
    }
  };

  const handlePagerTouchEnd = () => {
    pagerTouchRef.current = null;
    scrollRef.current?.setNativeProps({ scrollEnabled });
  };

  const handleCommentSeen = useCallback(async (photoId: string) => {
    if (!user || !activeGroupId) return;
    
    // 1. Optimistic local update (immediate feedback)
    setGroupData(prev => {
      const next = { ...prev };
      const g = next[activeGroupId];
      if (!g) return prev;
      const pIdx = g.photos.findIndex(p => p.id === photoId);
      if (pIdx !== -1 && g.photos[pIdx].hasNewComments) {
        const newPhotos = [...g.photos];
        newPhotos[pIdx] = { ...newPhotos[pIdx], hasNewComments: false };
        next[activeGroupId] = { ...g, photos: newPhotos };
        return next;
      }
      return prev;
    });

    // 2. Global Sync: Fetch all view statuses and latest comment times for this group
    try {
      const currentPhotos = groupData[activeGroupId]?.photos || [];
      const photoIds = currentPhotos.map(p => p.id);
      if (photoIds.length === 0) return;

      const [viewsRes, latestCommentsRes] = await Promise.all([
        supabase.from("comment_views").select("photo_id, last_viewed_at").eq("user_id", user.id).in("photo_id", photoIds),
        supabase.from("comments").select("photo_id, created_at").in("photo_id", photoIds).order("created_at", { ascending: false })
      ]);

      const viewsMap = Object.fromEntries((viewsRes.data ?? []).map((v: any) => [v.photo_id, v.last_viewed_at]));
      const latestCommentsMap: Record<string, string> = {};
      for (const c of latestCommentsRes.data ?? []) {
        if (!latestCommentsMap[c.photo_id]) {
          latestCommentsMap[c.photo_id] = c.created_at;
        }
      }

      setGroupData(prev => {
        const g = prev[activeGroupId];
        if (!g) return prev;
        return {
          ...prev,
          [activeGroupId]: {
            ...g,
            photos: g.photos.map(p => {
              const lastViewedAt = viewsMap[p.id];
              const latestCommentAt = latestCommentsMap[p.id];
              const hasNew = latestCommentAt && (!lastViewedAt || new Date(latestCommentAt) > new Date(lastViewedAt));
              return { ...p, hasNewComments: !!hasNew };
            })
          }
        };
      });
    } catch (e) {
      console.error("[DB FETCH] handleCommentSeen Sync Error:", e);
    }
  }, [user, activeGroupId, groupData]);

  const memoizedVaultPage = useMemo(() => (
    <VaultPage
      allGroups={allGroups}
      activeGroupId={activeGroupId}
      onSwitchGroup={handleSwitchGroup}
      onAddGroup={() => setShowAddGroupModal(true)}
      groupName={groupName}
      inviteCode={groupInviteCode}
      isAdmin={isAdmin}
      currentUserId={user?.id}
      members={members}
      photoCount={photoCount}
      photos={photos}
      revealDate={lockedRevealDate}
      revealEndDate={unlocked ? activeRevealEndDate : undefined}
      unlocked={unlocked}
      currentUserPostedThisWeek={currentUserPostedThisWeek}
      onOpenReveal={() => { if (currentUserPostedThisWeek) setShowReveal(true); }}
      onOpenSettings={() => setShowGroupSettings(true)}
      onLeaveGroup={() => setShowLeaveConfirm(true)}
      onRemoveMember={async (memberId) => {
        const { error } = await supabase.from("group_members").delete().eq("group_id", activeGroupId).eq("user_id", memberId);
        if (error) throw new Error(error.message);
        await fetchAllData();
      }}
      groupId={activeGroupId}
      vaultChallenges={debugVaultChallenges ?? challenges}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await fetchAllData({ force: true });
        setRefreshing(false);
      }}
      onSimulateReveal={__DEV__ ? () => setDebugUnlocked(true) : undefined}
      onDebugNotifReveal={__DEV__ ? () => scheduleImmediateLocalNotification("Le coffre est ouvert !", `Les moments de "${groupName}" sont disponibles`, { type: "recap", groupId: activeGroupId }) : undefined}
      onDebugNotifPhoto={__DEV__ ? () => scheduleImmediateLocalNotification(groupName || "Groupe", "Un ami a partagé un moment !", { type: "new_photo", groupId: activeGroupId }) : undefined}
      onDebugNotifInvite={__DEV__ ? () => scheduleImmediateLocalNotification("Nouvelle invitation !", `Tu as été invité à rejoindre "${groupName}"`, { type: "invite", groupName: groupName || "Groupe" }) : undefined}
      onDebugResetChallenges={__DEV__ ? async () => {
        const weekStart = getChallengeWeekStart();
        await supabase.from("weekly_challenges").delete().eq("group_id", activeGroupId).eq("week_start", weekStart);
        await fetchAllData();
      } : undefined}
      onDebugResetMyResponse={__DEV__ ? async () => {
        const weekStart = getChallengeWeekStart();
        const { data: ch } = await supabase.from("weekly_challenges").select("id").eq("group_id", activeGroupId).eq("week_start", weekStart);
        if (ch && ch.length > 0) {
          const ids = ch.map((c: any) => c.id);
          await supabase.from("challenge_responses").delete().eq("user_id", user?.id ?? "").in("challenge_id", ids);
        }
        await fetchAllData();
      } : undefined}
      onDebugShowCurrentChallenges={__DEV__ ? async () => {
        const currentWeekStart = getChallengeWeekStart();
        const result = await fetchChallengeData(activeGroupId, currentWeekStart, members);
        setDebugVaultChallenges(result);
      } : undefined}
      onDebugOpenCreateCustom={__DEV__ ? () => setShowCustomChallengeCreate(true) : undefined}
      onDebugOpenQueueCustom={__DEV__ ? () => setShowCustomChallengeQueue(true) : undefined}
      onGoToCamera={() => jumpTo(1)}
    />
  ), [
    allGroups, activeGroupId, handleSwitchGroup, groupName, groupInviteCode, isAdmin, user?.id, members, photoCount, photos,
    lockedRevealDate, unlocked, activeRevealEndDate, currentUserPostedThisWeek, refreshing, challenges, debugVaultChallenges, fetchAllData, debugUnlocked
  ]);

  const memoizedGroupsPage = useMemo(() => (
    <GroupsPage
      allGroups={allGroups}
      groupData={groupData}
      revealConfig={revealConfig}
      isActive={activePage === 0}
      userId={user?.id ?? ""}
      enterGroupId={enterGroupId}
      onEnteredGroup={() => setEnterGroupId(null)}
      onSelectGroup={handleSwitchGroup}
      onAddGroup={() => setShowAddGroupModal(true)}
      onGoToCapture={() => jumpTo(1)}
      onOpenReveal={() => { if (currentUserPostedThisWeek) setShowReveal(true); }}
      onScrollLock={setGroupsPagerLocked}
    />
  ), [allGroups, groupData, revealConfig, activePage === 0, user?.id, enterGroupId, handleSwitchGroup, currentUserPostedThisWeek]);

  const memoizedCameraPage = useMemo(() => (
    <ForceThemeMode mode="Dark">
      <CameraPage
        groupId={activeGroupId}
        userId={user?.id ?? ""}
        isActive={activePage === 1}
        allGroups={allGroups}
        onScrollLock={(v) => { setCameraScrollLocked(v); scrollRef.current?.setNativeProps({ scrollEnabled: !v }); }}
        onHideMenu={setCameraHideMenu}
        onCaptureSent={(info) => { setProfileRefreshKey(k => k + 1); showCaptureToast(info); }}
      />
    </ForceThemeMode>
  ), [activeGroupId, user?.id, activePage === 1, allGroups]);

  const memoizedProfilePage = useMemo(() => (
    <ProfilePage
      userId={user?.id ?? ""}
      username={username}
      avatarUrl={avatarUrl}
      email={email}
      groupName={groupName}
      allGroups={allGroups}
      revealConfig={revealConfig}
      onAvatarUpdate={setAvatarUrl}
      onUsernameUpdate={setUsername}
      onEmailUpdate={setEmail}
      onStreakUpdate={setStreakDays}
      isActive={activePage === 2}
      refreshKey={profileRefreshKey}
    />
  ), [user?.id, username, avatarUrl, email, groupName, allGroups, revealConfig, profileRefreshKey, activePage === 2]);

  if (!dataLoaded) return <View style={styles.loaderWrap}><Loader size={48} /></View>;

  return (
    <View
      style={styles.container}
      onTouchStart={handlePagerTouchStart}
      onTouchMove={handlePagerTouchMove}
      onTouchEnd={handlePagerTouchEnd}
      onTouchCancel={handlePagerTouchEnd}
    >
      <Animated.ScrollView
        ref={scrollRef}
        horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        bounces={false} overScrollMode="never"
        scrollEnabled={scrollEnabled}
        delaysContentTouches={false}
        onMomentumScrollEnd={(e) => { const p = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH); commitPage(p); }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        contentOffset={{ x: SCREEN_WIDTH, y: 0 }}
        style={styles.pager}
      >
        {/* PAGE 0: GROUPES */}
        <View style={[styles.page, { zIndex: 2 }]}>
          {memoizedGroupsPage}
        </View>

        {/* PAGE 1: CAMERA */}
        <Animated.View style={[styles.page, { transform: [{ translateX: cameraTranslateX }, { scale: cameraScale }], opacity: cameraOpacity }]}>
          {memoizedCameraPage}
        </Animated.View>

        {/* PAGE 2: PROFIL */}
        <View style={[styles.page, { zIndex: 2 }]}>
          {memoizedProfilePage}
        </View>
      </Animated.ScrollView>

      {/* NAV BAR — deux menus thémés (capture sombre / app) qui se croisent en fondu natif */}
      {!showReveal && (
        <>
          {/* Menu de l'app (Groupes/Profil) — invisible sur la capture via l'opacité */}
          <PagerTabBar
            scrollX={scrollX}
            colors={colors}
            backgroundColor={colors.card}
            opacity={appMenuOpacity}
            pointerEvents={currentPage === 1 ? "none" : "auto"}
            onJump={jumpTo}
          />
          {/* Menu de la capture (sombre) — caché pendant une capture active */}
          {!cameraHideMenu && (
            <PagerTabBar
              scrollX={scrollX}
              colors={darkColors}
              backgroundColor={darkColors.bg}
              opacity={captureMenuOpacity}
              pointerEvents={currentPage === 1 ? "auto" : "none"}
              onJump={jumpTo}
            />
          )}
        </>
      )}

      {/* ── Toast capture ── */}
      {captureToast && (
        <Animated.View
          style={[
            styles.captureToast,
            { top: cameraFrameTop + spacing.lg },
            { opacity: captureToastAnim.opacity, transform: [{ translateY: captureToastAnim.translateY }] },
          ]}
          pointerEvents="box-none"
        >
          <Shape name={captureToastShape(captureToast.mode)} size={20} color={colors.iconBrandTertiary} />
          <Text style={styles.captureToastText}>{captureToastMsg(captureToast.mode, captureToast.groupName, captureToast.isChallenge)}</Text>
          <TouchableOpacity onPress={dismissCaptureToast} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="x" size={20} color={colors.icon} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── REVEAL OVERLAY ── */}
      {showReveal && (
        <View style={[StyleSheet.absoluteFill, styles.revealOverlay]}>
          <TouchableOpacity
            style={[styles.revealBackBtn, { top: insets.top + 12 }]}
            onPress={() => setShowReveal(false)}
          >
            <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <Path d="M19 12H5M12 5l-7 7 7 7" stroke={colors.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
          <PhotoFeed
            photos={photos}
            currentUserId={user?.id}
            nextUnlockDate={nextRevealDate}
            revealEndDate={activeRevealEndDate}
            crownWinnerId={crownWinnerId}
            crownDurationMs={crownDurationMs}
            crownAllDurations={activeData?.allDurations ?? {}}
            groupName={groupName}
            onScrollLock={lockScrollDirect}
            onOpenPicker={setActiveReactionPhotoId}
            onOpenComments={handleCommentSeen}
            challengePeriod1={challenges?.period1 ?? null}
            challengePeriod2={challenges?.period2 ?? null}
            onVoteChallenge={handleVoteChallenge}
          />
          {user?.id && username && (
            <LiveReactions
              groupId={activeGroupId}
              currentUserId={user.id}
              currentUsername={username}
              currentAvatarUrl={avatarUrl ?? null}
              isVisible={true}
            />
          )}

          {/* Emoji Wheel (Vertical Popover) */}
          {activeReactionPhotoId && (
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setActiveReactionPhotoId(null)}>
              <Animated.View style={[styles.emojiWheel, { 
                opacity: emojiWheelAnim,
                transform: [{ scale: emojiWheelAnim }]
              }]}>
                <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
                {(() => {
                  const activePhoto = photos.find(p => p.id === activeReactionPhotoId);
                  const myReactionStr = activePhoto?.reactions.find(r => r.user_id === user?.id)?.sticker_id;

                  return STANDARD_EMOJIS.map(emoji => {
                    const isActive = myReactionStr === emoji;
                    return (
                      <TouchableOpacity 
                        key={emoji} 
                        onPress={() => handleEmojiReact(emoji)} 
                        style={[styles.wheelBtn, isActive && styles.wheelBtnActive]}
                      >
                        <Text style={styles.wheelEmoji}>{emoji}</Text>
                      </TouchableOpacity>
                    );
                  });
                })()}
                {(() => {
                  const activePhoto = photos.find(p => p.id === activeReactionPhotoId);
                  const myReactionStr = activePhoto?.reactions.find(r => r.user_id === user?.id)?.sticker_id;
                  const isCustomText = myReactionStr && !STANDARD_EMOJIS.includes(myReactionStr);

                  return (
                    <TouchableOpacity 
                      onPress={openCustomTextInput} 
                      style={[styles.wheelBtn, isCustomText && styles.wheelBtnActive]}
                    >
                      <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth="2.5">
                        <Path d="M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-1.5M14 17l-1.5-1.5M10 21l-1.5-1.5" />
                        <Path d="M3 21h4.5l10.5-10.5-4.5-4.5L3 16.5V21z" strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    </TouchableOpacity>
                  );
                })()}
              </Animated.View>
            </Pressable>
          )}

          {/* Custom Text Input Modal */}
          <Modal visible={showCustomTextInput} transparent animationType="fade" onRequestClose={() => setShowCustomTextInput(false)}>
            <KeyboardAvoidingView behavior="padding" style={styles.customModalContainer}>
               <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
               <TouchableOpacity style={styles.customModalClose} onPress={() => setShowCustomTextInput(false)}>
                 <CloseIcon />
               </TouchableOpacity>
               <View style={styles.customInputWrapper}>
                  {customReactionText.length > 0 && (
                    <View style={styles.customPreviewSticker}>
                      <TextSticker text={customReactionText} fontSize={32} />
                    </View>
                  )}
                  <View style={styles.customTextInputWrapper}>
                    <TextInput
                      ref={customInputRef}
                      style={[styles.customTextInput, { fontSize: customReactionText.length <= 6 ? 38 : 24 }]}
                      placeholder="Ton message..."
                      placeholderTextColor={colors.textTertiary}
                      value={customReactionText}
                      onChangeText={(val) => {
                        const emojiRegex = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}\u{200D}\u{20E3}]/gu;
                        const hasEmoji = emojiRegex.test(val);
                        const filtered = val.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}\u{200D}\u{20E3}]/gu, "").slice(0, 10);
                        setCustomReactionText(filtered);
                        if (hasEmoji && !emojiWarningVisible.current) {
                          emojiWarningVisible.current = true;
                          Animated.spring(emojiWarningAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }).start();
                        }
                        if (hasEmoji) {
                          if (emojiWarningTimer.current) clearTimeout(emojiWarningTimer.current);
                          emojiWarningTimer.current = setTimeout(() => {
                            Animated.timing(emojiWarningAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => { emojiWarningVisible.current = false; });
                          }, 2000);
                        }
                      }}
                      maxLength={10}
                      autoCapitalize="characters"
                      keyboardType="visible-password"
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={handleCustomTextSubmit}
                    />
                    <Animated.View style={[styles.emojiTooltip, {
                      opacity: emojiWarningAnim,
                      transform: [{ translateY: emojiWarningAnim.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }],
                    }]} pointerEvents="none">
                      <Text style={styles.emojiTooltipIcon}>⛔</Text>
                      <Text style={styles.emojiTooltipText}>Texte uniquement</Text>
                    </Animated.View>
                  </View>
                  {customReactionHistory.length > 0 && (
                    <View style={styles.historyRow}>
                      {customReactionHistory.map((h) => (
                        <TouchableOpacity key={h} onPress={() => setCustomReactionText(h)}>
                          <TextSticker text={h} fontSize={22} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <View style={styles.customModalActions}>
                    <TouchableOpacity 
                      style={[styles.customSendBtn, !customReactionText.trim() && styles.customSendBtnDisabled]} 
                      onPress={handleCustomTextSubmit}
                      disabled={!customReactionText.trim()}
                    >
                      <Text style={styles.customSendText}>
                        {(() => {
                          const activePhoto = photos.find(p => p.id === activeReactionPhotoId);
                          const myReactionStr = activePhoto?.reactions.find(r => r.user_id === user?.id)?.sticker_id;
                          return myReactionStr && !isEmoji(myReactionStr) ? "Modifier" : "Ajouter";
                        })()}
                      </Text>
                    </TouchableOpacity>

                    {(() => {
                      const activePhoto = photos.find(p => p.id === activeReactionPhotoId);
                      const myReactionStr = activePhoto?.reactions.find(r => r.user_id === user?.id)?.sticker_id;
                      const isCustomText = myReactionStr && !isEmoji(myReactionStr);
                      
                      if (!isCustomText) return null;
                      
                      return (
                        <TouchableOpacity 
                          style={styles.customDeleteBtn} 
                          onPress={() => handleEmojiReact(myReactionStr)}
                        >
                          <Text style={styles.customDeleteText}>Supprimer message actuel</Text>
                        </TouchableOpacity>
                      );
                    })()}
                  </View>
               </View>
            </KeyboardAvoidingView>
          </Modal>
        </View>
      )}

      {/* ── GROUP SETTINGS MODAL ── */}
      <GroupSettingsModal
        visible={showGroupSettings}
        onClose={() => setShowGroupSettings(false)}
        groupName={groupName}
        isAdmin={isAdmin}
        members={members}
        userId={user?.id ?? ""}
        onRename={handleRenameGroup}
        onLeave={handleLeaveGroup}
        onDelete={handleDeleteGroup}
        onTransferAdmin={handleTransferAdmin}
      />

      {/* ── LEAVE CONFIRM (non-admin) ── */}
      <BottomSheet visible={showLeaveConfirm} onClose={() => setShowLeaveConfirm(false)}>
        <Text style={styles.leaveTitle}>
          {members.length === 1 ? "Supprimer le groupe ?" : "Quitter le groupe"}
        </Text>
        <Text style={styles.leaveBody}>
          {members.length === 1 
            ? "Tu es le dernier membre. En quittant ce groupe, il sera définitivement supprimé ainsi que tous ses moments."
            : "Tu ne pourras plus accéder aux moments de ce groupe."}
        </Text>
        <TouchableOpacity style={styles.leaveConfirmBtn} onPress={handleLeaveGroup} disabled={isLeaving}>
          <Text style={styles.leaveConfirmText}>
            {isLeaving ? "..." : (members.length === 1 ? "Quitter et supprimer" : "Quitter")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowLeaveConfirm(false)} style={styles.leaveCancelWrap}>
          <Text style={styles.leaveCancelText}>Annuler</Text>
        </TouchableOpacity>
      </BottomSheet>

      {/* ── AJOUTER UN GROUPE (flow créer / rejoindre / félicitations / invite) ── */}
      <AddGroupFlow
        visible={showAddGroupModal}
        userId={user?.id ?? ""}
        onClose={() => setShowAddGroupModal(false)}
        onGroupsChanged={async () => { await fetchAllData({ force: true }); }}
        onEnterGroup={(id) => { setActiveGroupId(id); setEnterGroupId(id); }}
      />

      <MotivationalNotificationsModal
        visible={showNotifOnboarding}
        onClose={() => setShowNotifOnboarding(false)}
        initialValue={dailyNotifs}
        initialPeriods={notifPeriods}
      />

      <CustomChallengeCreatePage
        visible={showCustomChallengeCreate}
        onClose={() => setShowCustomChallengeCreate(false)}
        groupId={activeGroupId}
        currentUserId={user?.id ?? ""}
        members={members}
        onAdded={() => {}}
      />

      <CustomChallengeQueuePage
        visible={showCustomChallengeQueue}
        onClose={() => setShowCustomChallengeQueue(false)}
        groupId={activeGroupId}
        currentUserId={user?.id ?? ""}
        members={members}
      />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loaderWrap: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" },
  pager: { flex: 1, zIndex: 1 },
  page: { width: SCREEN_WIDTH, height: "100%", backgroundColor: colors.bg },

  // Toast capture
  captureToast: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 150,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: radii.sm,
    backgroundColor: colors.card,
  },
  captureToastText: { flex: 1, color: colors.text, ...textStyles.bodyStrong },

  // Navbar
  tabBarContainer: { position: "absolute", bottom: 26, left: 16, right: 16, zIndex: 100, paddingVertical: spacing.sm, paddingHorizontal: 0, borderRadius: radii.lg },
  tabBarContent: { flexDirection: "row" },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  tabLabel: { ...textStyles.singleLineBodyExtraSmallStrong, color: colors.textSecondary },
  tabLabelActive: { color: colors.text },
  streakBadge: { position: "absolute", top: -5, right: -8, width: 16, height: 16, borderRadius: radii.sm, justifyContent: "center", alignItems: "center" },
  streakBadgeText: { position: "absolute", fontSize: typography.size.xs, fontFamily: typography.family.bold, color: "#FFFFFF", textAlign: "center", bottom: 1 },

  // Reveal overlay
  revealOverlay: { zIndex: 200, backgroundColor: colors.bg },
  revealBackBtn: {
    position: "absolute", left: 16, zIndex: 201,
    width: 40, height: 40, borderRadius: radii.lg,
    backgroundColor: colors.opacityLight,
    justifyContent: "center", alignItems: "center",
  },

  // Leave confirm
  leaveTitle: { fontSize: typography.size.xl, fontFamily: typography.family.bold, color: colors.text, marginBottom: 12 },
  leaveBody: { fontSize: typography.size.sm, fontFamily: typography.family.regular, color: colors.secondary, marginBottom: 28, lineHeight: 22 },
  leaveConfirmBtn: { backgroundColor: "#FF3B30", borderRadius: radii.lg, paddingVertical: 15, alignItems: "center", marginBottom: 10 },
  leaveConfirmText: { color: "#FFFFFF", fontSize: typography.size.md, fontFamily: typography.family.bold },
  leaveCancelWrap: { alignItems: "center", paddingVertical: 8 },
  leaveCancelText: { color: colors.textTertiary, fontSize: typography.size.sm, fontFamily: typography.family.semibold },

  // Add group
  addGroupTitle: { fontSize: typography.size.xl, fontFamily: typography.family.bold, color: colors.text, marginBottom: 8 },
  addGroupSub: { fontSize: typography.size.sm, fontFamily: typography.family.regular, color: colors.textTertiary, marginBottom: 24 },
  addGroupPrimary: { backgroundColor: colors.text, borderRadius: radii.lg, paddingVertical: 16, alignItems: "center", marginBottom: 12 },
  addGroupPrimaryText: { color: colors.bg, fontSize: typography.size.md, fontFamily: typography.family.bold },
  addGroupSecondary: { backgroundColor: colors.accentMuted, borderWidth: 1, borderColor: colors.borderSecondary, borderRadius: radii.lg, paddingVertical: 16, alignItems: "center", marginBottom: 12 },
  addGroupSecondaryText: { color: colors.text, fontSize: typography.size.md, fontFamily: typography.family.semibold },
  // Sheet inputs
  sheetInput: {
    backgroundColor: colors.card, borderRadius: radii.md,
    paddingHorizontal: 16, paddingVertical: 14, color: colors.text,
    fontFamily: typography.family.semibold, fontSize: typography.size.md,
    borderWidth: 1, borderColor: colors.cardBorder,
    marginBottom: 16,
  },
  sheetCodeInput: { fontSize: typography.size.xl, textAlign: "center", letterSpacing: 3, fontFamily: typography.family.bold },
  sheetCancelWrap: { alignItems: "center", paddingVertical: 8 },
  sheetCancelText: { color: colors.textTertiary, fontFamily: typography.family.semibold, fontSize: typography.size.sm },

  // New Reactions UI
  emojiWheel: {
    position: "absolute",
    right: 24, // Match the padding of the momentOverlay
    bottom: NAVBAR_HEIGHT + 140, // Elevated further to ensure it sits above the + button
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: 8,
    gap: 10,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.borderSecondary,
    elevation: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    overflow: "hidden",
  },
  wheelBtn: {
    width: 56,
    height: 56,
    borderRadius: radii.full,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.accentMuted,
  },
  wheelBtnActive: {
    backgroundColor: colors.opacityDark,
    borderColor: "#FFF065",
    borderWidth: 2.5,
  },
  wheelEmoji: { fontSize: typography.size.xxl },

  customModalContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  customModalClose: { position: "absolute", top: 60, right: 20, width: 44, height: 44, borderRadius: radii.xl, backgroundColor: colors.opacityLight, justifyContent: "center", alignItems: "center", zIndex: 10 },
  customInputWrapper: { width: "100%", alignItems: "center", paddingHorizontal: 40, gap: 32 },
  customPreviewSticker: { marginBottom: 10, transform: [{ scale: 1.2 }] },
  customTextInput: { width: "100%", color: colors.text, fontFamily: typography.family.extrabold, textAlign: "center", padding: 20, height: 90 },
  customSendBtn: { backgroundColor: colors.text, paddingHorizontal: 32, paddingVertical: 14, borderRadius: radii.xl },
  customSendBtnDisabled: { opacity: 0.5 },
  customSendText: { color: colors.bg, fontFamily: typography.family.bold, fontSize: typography.size.md },
  customModalActions: { alignItems: "center", gap: 16, width: "100%" },
  customDeleteBtn: { paddingVertical: 8 },
  customDeleteText: { color: "#FF3B30", fontFamily: typography.family.semibold, fontSize: typography.size.sm },
  customTextInputWrapper: { width: "100%", position: "relative" },
  emojiTooltip: {
    position: "absolute", bottom: "100%", alignSelf: "center", marginBottom: 8,
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.card, borderRadius: radii.lg,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  emojiTooltipIcon: { fontSize: typography.size.xs },
  emojiTooltipText: { color: colors.secondary, fontFamily: typography.family.semibold, fontSize: typography.size.xs },
  historyRow: { flexDirection: "row", gap: 8, justifyContent: "center", flexWrap: "wrap" },
  historyChip: { backgroundColor: colors.accentMuted, borderRadius: radii.lg, paddingHorizontal: 14, paddingVertical: 7 },
  historyChipText: { color: colors.text, fontFamily: typography.family.bold, fontSize: typography.size.xs },
});