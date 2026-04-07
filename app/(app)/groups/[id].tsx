import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, Dimensions, Animated, TouchableOpacity, Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { BlurView } from "expo-blur";
import { supabase } from "../../../lib/supabase";
import { r2Storage } from "../../../lib/r2";
import { useAuth } from "../../../lib/auth-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { computeCrownWinner } from "../../../lib/crown";
import { useUpload } from "../../../lib/upload-context";

import { type PhotoEntry, type Reaction } from "../../../components/PhotoFeed";
import { type StickerId } from "../../../components/stickers";
import Loader from "../../../components/Loader";
import { ProfileIcon, VaultIcon, MomentIcon } from "../../../components/icons";

import ProfilePage from "../../../components/groups/ProfilePage";
import CameraPage from "../../../components/groups/CameraPage";
import VaultPage from "../../../components/groups/VaultPage";
import MembersModal from "../../../components/groups/MembersModal";
import LeaveGroupModal from "../../../components/groups/LeaveGroupModal";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const NAVBAR_HEIGHT = 100;

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
  const insets = useSafeAreaInsets();
  const { activeUploads } = useUpload();

  const scrollX = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const scrollRef = useRef<Animated.ScrollView>(null);
  const pagerTouchRef = useRef<{ x: number; y: number; decided: boolean } | null>(null);

  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [crownWinnerId, setCrownWinnerId] = useState<string | null>(null);
  const [crownDurationMs, setCrownDurationMs] = useState<number>(0);
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [dataLoaded, setDataLoaded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveNextAdmin, setLeaveNextAdmin] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [cameraScrollLocked, setCameraScrollLocked] = useState(false);
  const [debugUnlocked, setDebugUnlocked] = useState(false);
  const [revealConfig, setRevealConfig] = useState({ day: 0, hour: 20 });

  const { revealDate } = getWeekBounds(revealConfig.day, revealConfig.hour);
  const revealEndDate = new Date(revealDate.getTime() + 12 * 60 * 60 * 1000);
  const nextRevealDate = new Date(revealDate.getTime() + 7 * 24 * 60 * 60 * 1000);

  const now = new Date();
  const isAfterRevealWindow = now >= revealEndDate;
  const unlocked = __DEV__ ? debugUnlocked : (now >= revealDate && now < revealEndDate);

  // When after the 12h window, the locked state counts toward the NEXT reveal
  const lockedRevealDate = isAfterRevealWindow ? nextRevealDate : revealDate;

  const fetchData = useCallback(async () => {
    if (!user || !id) return;
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

      // Photos window:
      // - Before/during reveal: prevRevealDate → currentRevealDate  (reveal content + crown)
      // - After reveal window:  currentRevealDate → nextRevealDate  (new collection count only)
      const photoStart = afterRevealWindow ? currentRevealDate : prevRevealDate;
      const photoEnd = afterRevealWindow ? currentNextRevealDate : currentRevealDate;

      const [groupRes, profileRes, photosRes, membersRes] = await Promise.all([
        supabase.from("groups").select("name").eq("id", id).single(),
        supabase.from("profiles").select("username, avatar_url, email").eq("id", user.id).single(),
        supabase.from("photos")
          .select("id, image_path, created_at, note, user_id, profiles:user_id(username, avatar_url)")
          .eq("group_id", id)
          .gte("created_at", photoStart.toISOString())
          .lt("created_at", photoEnd.toISOString())
          .order("created_at", { ascending: true }),
        supabase.from("group_members").select("user_id, role, profiles:user_id(username, avatar_url)").eq("group_id", id),
      ]);

      if (groupRes.data) setGroupName(groupRes.data.name);
      if (profileRes.data) {
        setUsername(profileRes.data.username);
        setAvatarUrl(profileRes.data.avatar_url);
        setEmail(profileRes.data.email || user.email || "");
      }
      if (membersRes.data) {
        const me = membersRes.data.find((m: any) => m.user_id === user?.id);
        if (!me) { router.replace("/(app)/groups"); return; }
        setMembers(membersRes.data.map((m: any) => ({ ...m.profiles, user_id: m.user_id })));
        setIsAdmin(me?.role === "admin");
      }
      if (photosRes.data) {
        setPhotoCount(photosRes.data.length);

        if (afterRevealWindow) {
          // Reveal window is over — only the count matters for the new collection period
          setPhotos([]);
          setCrownWinnerId(null);
          setCrownDurationMs(0);
        } else {
          // Before or during reveal — full processing for PhotoFeed + crown
          const photoIds = photosRes.data.map((p: any) => p.id);
          const reactionsRes = photoIds.length > 0
            ? await supabase
                .from("reactions")
                .select("id, photo_id, user_id, emoji, profiles:user_id(username, avatar_url)")
                .in("photo_id", photoIds)
                .eq("type", "emoji")
            : { data: [] };

          const reactionsByPhoto: Record<string, Reaction[]> = {};
          for (const r of reactionsRes.data ?? []) {
            if (!r.emoji) continue;
            if (!reactionsByPhoto[r.photo_id]) reactionsByPhoto[r.photo_id] = [];
            reactionsByPhoto[r.photo_id].push({
              id: r.id,
              user_id: r.user_id,
              username: r.profiles?.username ?? "?",
              avatar_url: r.profiles?.avatar_url ?? null,
              sticker_id: r.emoji as StickerId,
            });
          }

          const entries: PhotoEntry[] = photosRes.data.map((p: any) => ({
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
          setPhotos(entries);
          const crown = computeCrownWinner(entries, prevRevealDate, currentRevealDate);
          setCrownWinnerId(crown?.winnerId ?? null);
          setCrownDurationMs(crown?.durationMs ?? 0);
        }
      }
      setDataLoaded(true);
    } catch {
      setDataLoaded(true);
    }
  }, [id, user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const hasJustFinished = activeUploads.some((u) => u.status === "success");
    if (hasJustFinished) fetchData();
  }, [activeUploads, fetchData]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`group-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "photos", filter: `group_id=eq.${id}` }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, fetchData]);

  const handleReact = async (photoId: string, stickerId: StickerId) => {
    if (!user) return;
    const existing = photos.find((p) => p.id === photoId)?.reactions.find((r) => r.user_id === user.id);
    try {
      if (existing) {
        if (existing.sticker_id === stickerId) {
          await supabase.from("reactions").delete().eq("id", existing.id);
          setPhotos((prev) => prev.map((p) => p.id === photoId ? { ...p, reactions: p.reactions.filter((r) => r.id !== existing.id) } : p));
        } else {
          await supabase.from("reactions").update({ emoji: stickerId }).eq("id", existing.id);
          setPhotos((prev) => prev.map((p) => p.id === photoId ? { ...p, reactions: p.reactions.map((r) => r.id === existing.id ? { ...r, sticker_id: stickerId } : r) } : p));
        }
      } else {
        const { data } = await supabase.from("reactions").insert({ photo_id: photoId, user_id: user.id, type: "emoji", emoji: stickerId }).select("id").single();
        if (data) setPhotos((prev) => prev.map((p) => p.id === photoId ? { ...p, reactions: [...p.reactions, { id: data.id, user_id: user.id, username, avatar_url: avatarUrl, sticker_id: stickerId }] } : p));
      }
    } catch {
      Alert.alert("Erreur", "Impossible d'enregistrer la réaction.");
    }
  };

  const jumpTo = (page: number) => {
    scrollRef.current?.scrollTo({ x: page * SCREEN_WIDTH, animated: false });
    scrollX.setValue(page * SCREEN_WIDTH);
    setCurrentPage(page);
  };

  const openLeaveModal = () => {
    const others = members.filter((m: any) => m.user_id !== user?.id);
    setLeaveNextAdmin(isAdmin && others.length > 0 ? others[0].username : null);
    setShowLeaveModal(true);
  };

  const handleLeaveGroup = async () => {
    if (!user || !id) return;
    setIsLeaving(true);
    try {
      const others = members.filter((m: any) => m.user_id !== user.id);
      if (isAdmin && others.length > 0) {
        await supabase.from("group_members").update({ role: "admin" }).eq("group_id", id).eq("user_id", others[0].user_id);
      }
      await supabase.from("group_members").delete().eq("group_id", id).eq("user_id", user.id);
      router.replace("/(app)/groups");
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setIsLeaving(false);
      setShowLeaveModal(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      await supabase.from("group_members").delete().eq("group_id", id).eq("user_id", memberId);
      setMembers((prev) => prev.filter((m: any) => m.user_id !== memberId));
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    }
  };

  const cameraTranslateX = scrollX.interpolate({ inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH], outputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH] });
  const cameraScale = scrollX.interpolate({ inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH], outputRange: [0.9, 1, 0.9] });
  const cameraOpacity = scrollX.interpolate({ inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH], outputRange: [0.4, 1, 0.4] });

  const scrollEnabled = !cameraScrollLocked;

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
            groupId={id ?? ""}
            userId={user?.id ?? ""}
            isActive={currentPage === 1}
            onUploadSuccess={fetchData}
            onScrollLock={setCameraScrollLocked}
          />
        </Animated.View>

        {/* PAGE 2: VAULT */}
        <View style={[styles.page, { zIndex: 2 }]}>
          <VaultPage
            unlocked={unlocked}
            photos={photos}
            crownWinnerId={crownWinnerId}
            crownDurationMs={crownDurationMs}
            groupName={groupName}
            onReact={handleReact}
            currentUserId={user?.id}
            nextRevealDate={nextRevealDate}
            photoCount={photoCount}
            revealDate={lockedRevealDate}
            isAdmin={isAdmin}
            onOpenMembers={() => setShowMembersModal(true)}
            onSimulateReveal={() => setDebugUnlocked(true)}
            groupId={id ?? ""}
          />
        </View>
      </Animated.ScrollView>

      {/* NAV BAR — masquée pendant une capture / dessin actif */}
      {!cameraScrollLocked && (
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

      <MembersModal
        visible={showMembersModal}
        onClose={() => setShowMembersModal(false)}
        members={members}
        isAdmin={isAdmin}
        userId={user?.id ?? ""}
        groupId={id ?? ""}
        onRemoveMember={handleRemoveMember}
        onLeave={() => { setShowMembersModal(false); openLeaveModal(); }}
      />

      <LeaveGroupModal
        visible={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        onConfirm={handleLeaveGroup}
        isAdmin={isAdmin}
        leaveNextAdmin={leaveNextAdmin}
        isLeaving={isLeaving}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  loaderWrap: { flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" },
  pager: { flex: 1 },
  page: { width: SCREEN_WIDTH, height: "100%", backgroundColor: "#000" },
  tabBarContainer: { position: "absolute", bottom: 0, left: 0, right: 0, height: NAVBAR_HEIGHT, overflow: "hidden", zIndex: 100, backgroundColor: "rgba(10,10,10,0.92)" },
  tabBarContent: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-evenly", paddingTop: 12 },
  tab: { alignItems: "center", justifyContent: "center", gap: 4, flex: 1 },
  tabLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.4)" },
  tabLabelActive: { color: "#FFF" },
});
