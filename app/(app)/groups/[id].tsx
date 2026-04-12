import { useEffect, useState, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View, Text, StyleSheet, Dimensions, Animated, TouchableOpacity, Alert, TextInput, AppState } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { BlurView } from "expo-blur";
import { supabase } from "../../../lib/supabase";
import { r2Storage } from "../../../lib/r2";
import { useAuth } from "../../../lib/auth-context";
import { useToast } from "../../../lib/toast-context";
import { translateError } from "../../../lib/error-messages";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { computeCrownWinner } from "../../../lib/crown";
import { useUpload } from "../../../lib/upload-context";
import Svg, { Path } from "react-native-svg";

import { type PhotoEntry, type Reaction } from "../../../components/PhotoFeed";
import { type StickerId } from "../../../components/stickers";
import Loader from "../../../components/Loader";
import { ProfileIcon, VaultIcon, MomentIcon } from "../../../components/icons";

import ProfilePage from "../../../components/groups/ProfilePage";
import CameraPage from "../../../components/groups/CameraPage";
import VaultPage from "../../../components/groups/VaultPage";
import GroupSettingsModal from "../../../components/groups/GroupSettingsModal";
import BottomSheet from "../../../components/BottomSheet";
import PhotoFeed from "../../../components/PhotoFeed";
import LiveReactions from "../../../components/reveal/LiveReactions";
import { scheduleImmediateLocalNotification, scheduleFirstMomentReminder } from "../../../lib/notifications";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const NAVBAR_HEIGHT = 100;

type GroupInfo = { id: string; name: string; invite_code: string };

type GroupData = {
  name: string;
  inviteCode: string;
  members: any[];
  photoCount: number;
  photos: PhotoEntry[];
  crownWinnerId: string | null;
  crownDurationMs: number;
  isAdmin: boolean;
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const { activeUploads } = useUpload();

  const scrollX = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const scrollRef = useRef<Animated.ScrollView>(null);
  const pagerTouchRef = useRef<{ x: number; y: number; decided: boolean } | null>(null);

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

  // Pager
  const [currentPage, setCurrentPage] = useState(1);
  const [cameraScrollLocked, setCameraScrollLocked] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Modals
  const [showReveal, setShowReveal] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [addGroupView, setAddGroupView] = useState<null | "create" | "join">(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [addGroupLoading, setAddGroupLoading] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  // DEV
  const [debugUnlocked, setDebugUnlocked] = useState(false);

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

  const { revealDate } = getWeekBounds(revealConfig.day, revealConfig.hour);
  const revealEndDate = new Date(revealDate.getTime() + 12 * 60 * 60 * 1000);
  const nextRevealDate = new Date(revealDate.getTime() + 7 * 24 * 60 * 60 * 1000);

  const now = new Date();
  const isAfterRevealWindow = now >= revealEndDate;
  const unlocked = __DEV__ ? debugUnlocked : (now >= revealDate && now < revealEndDate);
  const lockedRevealDate = isAfterRevealWindow ? nextRevealDate : revealDate;

  // ── Fetch all groups data at once ──
  const fetchAllData = useCallback(async () => {
    if (!user) return;
    try {
      const { data: cfgRows } = await supabase
        .from("app_config")
        .select("key, value")
        .in("key", ["reveal_day", "reveal_hour"]);
      const cfgMap = Object.fromEntries((cfgRows ?? []).map((r: any) => [r.key, Number(r.value)]));
      const cfg = { reveal_day: cfgMap["reveal_day"] ?? 0, reveal_hour: cfgMap["reveal_hour"] ?? 20 };
      setRevealConfig({ day: cfg.reveal_day, hour: cfg.reveal_hour });

      const { revealDate: currentRevealDate, prevRevealDate } = getWeekBounds(cfg.reveal_day, cfg.reveal_hour);
      const currentRevealEndDate = new Date(currentRevealDate.getTime() + 12 * 60 * 60 * 1000);
      const currentNextRevealDate = new Date(currentRevealDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      const afterRevealWindow = new Date() >= currentRevealEndDate;
      const photoStart = afterRevealWindow ? currentRevealDate : prevRevealDate;
      const photoEnd = afterRevealWindow ? currentNextRevealDate : currentRevealDate;

      const [groupsRes, profileRes] = await Promise.all([
        supabase.from("group_members").select("groups(id, name, invite_code)").eq("user_id", user.id),
        supabase.from("profiles").select("username, avatar_url, email").eq("id", user.id).single(),
      ]);

      const groups: GroupInfo[] = (groupsRes.data ?? []).map((g: any) => g.groups).filter(Boolean);
      setAllGroups(groups);

      if (profileRes.data) {
        setUsername(profileRes.data.username);
        setAvatarUrl(profileRes.data.avatar_url);
        setEmail(profileRes.data.email || user.email || "");
      }

      const dataEntries = await Promise.all(
        groups.map(async (g) => {
          const [membersRes, photosRes] = await Promise.all([
            supabase.from("group_members").select("user_id, role, profiles:user_id(username, avatar_url)").eq("group_id", g.id),
            supabase.from("photos")
              .select("id, image_path, created_at, note, user_id, profiles:user_id(username, avatar_url)")
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

          let groupPhotos: PhotoEntry[] = [];
          let crownWinnerId: string | null = null;
          let crownDurationMs = 0;

          if (!afterRevealWindow && photosRes.data && photosRes.data.length > 0) {
            const photoIds = photosRes.data.map((p: any) => p.id);
            const reactionsRes = await supabase
              .from("reactions")
              .select("id, photo_id, user_id, emoji, profiles:user_id(username, avatar_url)")
              .in("photo_id", photoIds);

            const reactionsByPhoto: Record<string, Reaction[]> = {};
            for (const r of reactionsRes.data ?? []) {
              const stickerId = (r.emoji || "") as StickerId;
              if (!reactionsByPhoto[r.photo_id]) reactionsByPhoto[r.photo_id] = [];
              reactionsByPhoto[r.photo_id].push({
                id: r.id, user_id: r.user_id,
                username: r.profiles?.username ?? "?",
                avatar_url: r.profiles?.avatar_url ?? null,
                sticker_id: stickerId,
              });
            }

            groupPhotos = photosRes.data.map((p: any) => ({
              id: p.id,
              url: p.image_path === "text_mode" ? "" : r2Storage.getPublicUrl(p.image_path),
              fallback_url: p.image_path === "text_mode" ? undefined : supabase.storage.from("moments").getPublicUrl(p.image_path).data.publicUrl,
              created_at: p.created_at,
              note: p.note ?? null,
              username: p.profiles?.username ?? "Anonyme",
              avatar_url: p.profiles?.avatar_url,
              image_path: p.image_path,
              user_id: p.user_id,
              reactions: reactionsByPhoto[p.id] ?? [],
            }));
            const crown = computeCrownWinner(groupPhotos, prevRevealDate, currentRevealDate);
            crownWinnerId = crown?.winnerId ?? null;
            crownDurationMs = crown?.durationMs ?? 0;
          }

          return [g.id, {
            name: g.name,
            inviteCode: g.invite_code,
            members: membersData,
            photoCount,
            photos: groupPhotos,
            crownWinnerId,
            crownDurationMs,
            isAdmin: isAdminForGroup,
          }] as [string, GroupData];
        })
      );

      setGroupData(Object.fromEntries(dataEntries));
    } catch {}
    setDataLoaded(true);
  }, [user]);

  const fetchAllDataRef = useRef(fetchAllData);
  fetchAllDataRef.current = fetchAllData;

  useEffect(() => { fetchAllData(); }, [fetchAllData]);

  useEffect(() => {
    const hasJustFinished = activeUploads.some((u) => u.status === "success");
    if (hasJustFinished) fetchAllData();
  }, [activeUploads, fetchAllData]);

  // Keep a ref so the real-time callback always reads the latest reveal config
  const revealConfigRef = useRef(revealConfig);
  revealConfigRef.current = revealConfig;

  // ── Real-time + AppState refresh ──
  // Un seul channel sans filtre — les filtres group_id=eq.X nécessitent
  // REPLICA IDENTITY FULL côté Supabase, sans quoi les events ne sont jamais émis.
  // RLS garantit qu'on ne reçoit que les events des groupes dont on est membre.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`user-rt-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "photos" },
        () => fetchAllDataRef.current())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_members" },
        () => fetchAllDataRef.current())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // Rafraîchit les données quand l'app revient au premier plan
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") fetchAllDataRef.current();
    });
    return () => sub.remove();
  }, []);

  // Polling toutes les 30s (filet de sécurité si Realtime non configuré)
  useEffect(() => {
    const interval = setInterval(() => {
      if (AppState.currentState === "active") fetchAllDataRef.current();
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Persiste le groupe actif pour le prochain lancement de l'app
  useEffect(() => {
    if (activeGroupId) AsyncStorage.setItem("lastGroupId", activeGroupId);
  }, [activeGroupId]);

  // ── Group switching ──
  const handleSwitchGroup = useCallback((groupId: string) => {
    if (groupId === activeGroupId) return;
    setActiveGroupId(groupId);
  }, [activeGroupId]);

  // ── Reactions ──
  const handleReact = async (photoId: string, stickerId: StickerId) => {
    if (!user) return;
    const photo = photos.find((p) => p.id === photoId);
    const existing = photo?.reactions.find((r) => r.user_id === user.id);

    const updatePhotos = (updater: (p: PhotoEntry[]) => PhotoEntry[]) =>
      setGroupData((prev) => ({
        ...prev,
        [activeGroupId]: { ...prev[activeGroupId], photos: updater(prev[activeGroupId]?.photos ?? []) },
      }));

    try {
      if (existing && existing.sticker_id === stickerId) {
        await supabase.from("reactions").delete().eq("id", existing.id);
        updatePhotos((p) => p.map((e) => e.id === photoId ? { ...e, reactions: e.reactions.filter((r) => r.id !== existing.id) } : e));
      } else {
        const { data, error } = await supabase
          .from("reactions")
          .upsert({ photo_id: photoId, user_id: user.id, type: "emoji", emoji: stickerId }, { onConflict: "photo_id,user_id" })
          .select("id")
          .single();
        if (error) throw error;
        if (data) {
          const newReaction: Reaction = { id: data.id, user_id: user.id, username, avatar_url: avatarUrl, sticker_id: stickerId };
          updatePhotos((p) => p.map((e) => {
            if (e.id !== photoId) return e;
            return { ...e, reactions: [...e.reactions.filter((r) => r.user_id !== user.id), newReaction] };
          }));
        }
      }
    } catch (e) {
      Alert.alert("Erreur", "Impossible d'enregistrer la réaction.");
    }
  };

  // ── Group management ──
  const handleRenameGroup = async (newName: string) => {
    if (!activeGroupId || !newName.trim()) return;
    await supabase.from("groups").update({ name: newName.trim() }).eq("id", activeGroupId);
    setGroupData((prev) => ({ ...prev, [activeGroupId]: { ...prev[activeGroupId], name: newName.trim() } }));
    setAllGroups((prev) => prev.map((g) => g.id === activeGroupId ? { ...g, name: newName.trim() } : g));
  };

  const handleLeaveGroup = async () => {
    if (!user || !activeGroupId) return;
    setIsLeaving(true);
    try {
      const others = members.filter((m: any) => m.user_id !== user.id);
      if (isAdmin && others.length > 0) {
        await supabase.from("group_members").update({ role: "admin" }).eq("group_id", activeGroupId).eq("user_id", others[0].user_id);
      }
      await supabase.from("group_members").delete().eq("group_id", activeGroupId).eq("user_id", user.id);
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
      await supabase.from("groups").delete().eq("id", activeGroupId);
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
    await supabase.from("group_members").update({ role: "admin" }).eq("group_id", activeGroupId).eq("user_id", newAdminId);
    await supabase.from("group_members").update({ role: "member" }).eq("group_id", activeGroupId).eq("user_id", user.id);
    setGroupData((prev) => ({ ...prev, [activeGroupId]: { ...prev[activeGroupId], isAdmin: false } }));
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
      const { count } = await supabase
        .from("group_members")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);
      if ((count ?? 0) >= 3) {
        showToast("Limite atteinte", "Tu peux appartenir à 3 groupes maximum.", "info");
        return;
      }
      const { data: group, error } = await supabase
        .from("groups")
        .insert({ name: newGroupName.trim(), created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      await supabase.from("group_members").insert({ group_id: group.id, user_id: user.id, role: "admin" });
      closeAddGroupModal();
      await fetchAllData();
      setActiveGroupId(group.id);
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
      const { count } = await supabase
        .from("group_members")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);
      if ((count ?? 0) >= 3) {
        showToast("Limite atteinte", "Tu peux appartenir à 3 groupes maximum.", "info");
        return;
      }
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
      if (joinErr) {
        if (joinErr.message.includes("unique")) {
          showToast("Info", "Tu fais déjà partie de ce groupe.", "info");
        } else {
          throw joinErr;
        }
      } else {
        showToast("Succès", `Tu as rejoint "${group.name}" !`, "success");
        scheduleFirstMomentReminder(group.id, group.name);
      }
      closeAddGroupModal();
      await fetchAllData();
      setActiveGroupId(group.id);
    } catch (e: any) {
      showToast("Erreur", translateError(e.message));
    } finally {
      setAddGroupLoading(false);
    }
  };

  // ── Pager ──
  const jumpTo = (page: number) => {
    scrollRef.current?.scrollTo({ x: page * SCREEN_WIDTH, animated: false });
    scrollX.setValue(page * SCREEN_WIDTH);
    setCurrentPage(page);
  };

  const cameraTranslateX = scrollX.interpolate({ inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH], outputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH] });
  const cameraScale = scrollX.interpolate({ inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH], outputRange: [0.9, 1, 0.9] });
  const cameraOpacity = scrollX.interpolate({ inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH], outputRange: [0.4, 1, 0.4] });

  const scrollEnabled = !cameraScrollLocked;

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
        onMomentumScrollEnd={(e) => setCurrentPage(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        contentOffset={{ x: SCREEN_WIDTH, y: 0 }}
        style={styles.pager}
      >
        {/* PAGE 0: PROFILE */}
        <View style={[styles.page, { zIndex: 2 }]}>
          <ProfilePage
            userId={user?.id ?? ""}
            username={username}
            avatarUrl={avatarUrl}
            email={email}
            onAvatarUpdate={setAvatarUrl}
            onUsernameUpdate={setUsername}
          />
        </View>

        {/* PAGE 1: CAMERA */}
        <Animated.View style={[styles.page, { transform: [{ translateX: cameraTranslateX }, { scale: cameraScale }], opacity: cameraOpacity }]}>
          <CameraPage
            groupId={activeGroupId}
            userId={user?.id ?? ""}
            isActive={currentPage === 1}
            allGroups={allGroups}
            onScrollLock={setCameraScrollLocked}
          />
        </Animated.View>

        {/* PAGE 2: VAULT */}
        <View style={[styles.page, { zIndex: 2 }]}>
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
            unlocked={unlocked}
            onOpenReveal={() => setShowReveal(true)}
            onOpenSettings={() => setShowGroupSettings(true)}
            onLeaveGroup={() => setShowLeaveConfirm(true)}
            onRemoveMember={async (memberId) => {
              const { error } = await supabase.from("group_members").delete().eq("group_id", activeGroupId).eq("user_id", memberId);
              if (error) throw new Error(error.message);
              setGroupData((prev) => ({
                ...prev,
                [activeGroupId]: {
                  ...prev[activeGroupId],
                  members: (prev[activeGroupId]?.members ?? []).filter((m: any) => m.user_id !== memberId),
                },
              }));
            }}
            groupId={activeGroupId}
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await fetchAllData();
              setRefreshing(false);
            }}
            onSimulateReveal={__DEV__ ? () => setDebugUnlocked(true) : undefined}
            onDebugNotifReveal={__DEV__ ? () => scheduleImmediateLocalNotification("Le coffre est ouvert !", `Les moments de "${groupName}" sont disponibles`, { type: "recap", groupId: activeGroupId }) : undefined}
            onDebugNotifPhoto={__DEV__ ? () => scheduleImmediateLocalNotification(groupName || "Groupe", "Un ami a partagé un moment !", { type: "new_photo", groupId: activeGroupId }) : undefined}
            onDebugNotifInvite={__DEV__ ? () => scheduleImmediateLocalNotification("Nouvelle invitation !", `Tu as été invité à rejoindre "${groupName}"`, { type: "invite", groupName: groupName || "Groupe" }) : undefined}
          />
        </View>
      </Animated.ScrollView>

      {/* NAV BAR — masquée pendant une capture ou le reveal */}
      {!cameraScrollLocked && !showReveal && (
        <View style={[styles.tabBarContainer, { paddingBottom: insets.bottom }]}>
          <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.tabBarContent}>
            <TouchableOpacity style={styles.tab} onPress={() => jumpTo(0)}>
              <ProfileIcon color={currentPage === 0 ? "#FFF" : "rgba(255,255,255,0.4)"} size={24} />
              <Text style={[styles.tabLabel, currentPage === 0 && styles.tabLabelActive]}>Profil</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tab} onPress={() => jumpTo(1)}>
              <MomentIcon color={currentPage === 1 ? "#FFF" : "rgba(255,255,255,0.4)"} size={28} />
              <Text style={[styles.tabLabel, currentPage === 1 && styles.tabLabelActive]}>Moment</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tab} onPress={() => jumpTo(2)}>
              <VaultIcon color={currentPage === 2 ? "#FFF" : "rgba(255,255,255,0.4)"} size={24} />
              <Text style={[styles.tabLabel, currentPage === 2 && styles.tabLabelActive]}>Coffre</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── REVEAL OVERLAY ── */}
      {showReveal && (
        <View style={[StyleSheet.absoluteFill, styles.revealOverlay]}>
          <TouchableOpacity
            style={[styles.revealBackBtn, { top: insets.top + 12 }]}
            onPress={() => setShowReveal(false)}
          >
            <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <Path d="M19 12H5M12 5l-7 7 7 7" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
          <PhotoFeed
            photos={photos}
            onReact={handleReact}
            currentUserId={user?.id}
            nextUnlockDate={nextRevealDate}
            crownWinnerId={crownWinnerId}
            crownDurationMs={crownDurationMs}
            groupName={groupName}
            onScrollLock={lockScrollDirect}
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
        <Text style={styles.leaveTitle}>Quitter le groupe</Text>
        <Text style={styles.leaveBody}>Tu ne pourras plus accéder aux moments de ce groupe.</Text>
        <TouchableOpacity style={styles.leaveConfirmBtn} onPress={handleLeaveGroup} disabled={isLeaving}>
          <Text style={styles.leaveConfirmText}>{isLeaving ? "..." : "Quitter"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowLeaveConfirm(false)} style={styles.leaveCancelWrap}>
          <Text style={styles.leaveCancelText}>Annuler</Text>
        </TouchableOpacity>
      </BottomSheet>

      {/* ── ADD GROUP (choix + formulaires en sous-vues) ── */}
      <BottomSheet visible={showAddGroupModal} onClose={closeAddGroupModal}>
        {addGroupView === null && (
          <>
            <Text style={styles.addGroupTitle}>Ajouter un groupe</Text>
            <Text style={styles.addGroupSub}>Tu peux rejoindre ou créer jusqu'à 3 groupes.</Text>
            <TouchableOpacity
              style={styles.addGroupPrimary}
              onPress={() => setAddGroupView("create")}
            >
              <Text style={styles.addGroupPrimaryText}>Créer un groupe</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addGroupSecondary}
              onPress={() => setAddGroupView("join")}
            >
              <Text style={styles.addGroupSecondaryText}>Rejoindre avec un code</Text>
            </TouchableOpacity>
          </>
        )}

        {addGroupView === "create" && (
          <>
            <Text style={styles.addGroupTitle}>Nouveau groupe</Text>
            <TextInput
              style={styles.sheetInput}
              placeholder="Nom du groupe"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={newGroupName}
              onChangeText={setNewGroupName}
              maxLength={25}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreateGroup}
            />
            <TouchableOpacity
              style={[styles.addGroupPrimary, (!newGroupName.trim() || addGroupLoading) && { opacity: 0.45 }]}
              onPress={handleCreateGroup}
              disabled={!newGroupName.trim() || addGroupLoading}
            >
              <Text style={styles.addGroupPrimaryText}>{addGroupLoading ? "Création..." : "Créer"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setAddGroupView(null); setNewGroupName(""); }} style={styles.sheetCancelWrap}>
              <Text style={styles.sheetCancelText}>Retour</Text>
            </TouchableOpacity>
          </>
        )}

        {addGroupView === "join" && (
          <>
            <Text style={styles.addGroupTitle}>Rejoindre un cercle</Text>
            <TextInput
              style={[styles.sheetInput, styles.sheetCodeInput]}
              placeholder="CODE-1234"
              placeholderTextColor="rgba(255,255,255,0.3)"
              autoCapitalize="characters"
              value={joinCode}
              onChangeText={setJoinCode}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleJoinGroup}
            />
            <TouchableOpacity
              style={[styles.addGroupPrimary, (!joinCode.trim() || addGroupLoading) && { opacity: 0.45 }]}
              onPress={handleJoinGroup}
              disabled={!joinCode.trim() || addGroupLoading}
            >
              <Text style={styles.addGroupPrimaryText}>{addGroupLoading ? "..." : "Rejoindre"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setAddGroupView(null); setJoinCode(""); }} style={styles.sheetCancelWrap}>
              <Text style={styles.sheetCancelText}>Retour</Text>
            </TouchableOpacity>
          </>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  loaderWrap: { flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" },
  pager: { flex: 1 },
  page: { width: SCREEN_WIDTH, height: "100%", backgroundColor: "#000" },

  // Navbar
  tabBarContainer: { position: "absolute", bottom: 0, left: 0, right: 0, height: NAVBAR_HEIGHT, overflow: "hidden", zIndex: 100, backgroundColor: "rgba(10,10,10,0.92)" },
  tabBarContent: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-evenly", paddingTop: 12 },
  tab: { alignItems: "center", justifyContent: "center", gap: 4, flex: 1 },
  tabLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.4)" },
  tabLabelActive: { color: "#FFF" },

  // Reveal overlay
  revealOverlay: { zIndex: 200, backgroundColor: "#000" },
  revealBackBtn: {
    position: "absolute", left: 16, zIndex: 201,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center", alignItems: "center",
  },

  // Leave confirm
  leaveTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#FFF", marginBottom: 12 },
  leaveBody: { fontSize: 15, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.55)", marginBottom: 28, lineHeight: 22 },
  leaveConfirmBtn: { backgroundColor: "#FF3B30", borderRadius: 16, paddingVertical: 15, alignItems: "center", marginBottom: 10 },
  leaveConfirmText: { color: "#FFF", fontSize: 16, fontFamily: "Inter_700Bold" },
  leaveCancelWrap: { alignItems: "center", paddingVertical: 8 },
  leaveCancelText: { color: "rgba(255,255,255,0.35)", fontSize: 15, fontFamily: "Inter_600SemiBold" },

  // Add group
  addGroupTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#FFF", marginBottom: 8 },
  addGroupSub: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.45)", marginBottom: 24 },
  addGroupPrimary: { backgroundColor: "#FFF", borderRadius: 16, paddingVertical: 16, alignItems: "center", marginBottom: 12 },
  addGroupPrimaryText: { color: "#000", fontSize: 16, fontFamily: "Inter_700Bold" },
  addGroupSecondary: { backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", borderRadius: 16, paddingVertical: 16, alignItems: "center", marginBottom: 12 },
  addGroupSecondaryText: { color: "#FFF", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  // Sheet inputs (create/join inside BottomSheet)
  sheetInput: {
    backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, color: "#FFF",
    fontFamily: "Inter_600SemiBold", fontSize: 16,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
    marginBottom: 16,
  },
  sheetCodeInput: { fontSize: 22, textAlign: "center", letterSpacing: 3, fontFamily: "Inter_700Bold" },
  sheetCancelWrap: { alignItems: "center", paddingVertical: 8 },
  sheetCancelText: { color: "rgba(255,255,255,0.4)", fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
