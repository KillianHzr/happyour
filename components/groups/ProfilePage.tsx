import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions, Animated, Easing, PanResponder,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { supabase } from "../../lib/supabase";
import { r2Storage } from "../../lib/r2";
import { useToast } from "../../lib/toast-context";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { radii, spacing, textStyles, typography, type ThemeColors } from "../../lib/theme";
import Icon from "../Icon";
import BottomSheet from "../BottomSheet";
import SettingsSheet from "../SettingsSheet";
import SettingsMainContent from "../settings/SettingsMainContent";

// ─── Date helpers ────────────────────────────────────────────────────────────
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
  onEmailUpdate?: (email: string) => void;
  onStreakUpdate: (days: number) => void;
  isActive?: boolean;
  refreshKey?: number;
  /**
   * "self" (défaut) : profil de l'utilisateur connecté, avec header (pseudo + burger
   * réglages) et sélecteur de groupe dans le coffre.
   * "member" : profil d'un membre affiché depuis les réglages d'un groupe. Le header et
   * le sélecteur de groupe sont masqués (le pseudo est porté par le header de la pile de
   * réglages, et les données sont déjà restreintes au groupe courant).
   */
  variant?: "self" | "member";
};

// ─── SVG Icons ───────────────────────────────────────────────────────────────
const FireIcon = ({ size = 20, color = "#FF3F05" }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
    <Path d="M3 12.1051C3 10.9733 3.37399 9.87321 4.0625 8.97131C4.32278 8.63072 4.77162 8.49417 5.17773 8.63146C5.58381 8.76892 5.85742 9.14999 5.85742 9.57873C5.85746 9.86604 5.97316 10.1455 6.18555 10.3541C6.39856 10.5633 6.69129 10.6842 7 10.6842C7.30871 10.6842 7.60144 10.5633 7.81445 10.3541C8.02684 10.1455 8.14254 9.86604 8.14258 9.57873C8.14258 9.00531 7.93627 8.57161 7.6084 7.92736C7.29348 7.30858 6.85742 6.47851 6.85742 5.36779C6.85753 3.78924 7.86073 2.40907 9.38184 1.2135C9.6478 1.00446 10.002 0.944443 10.3223 1.05334C10.6421 1.16228 10.8852 1.42513 10.9688 1.75256C11.4901 3.80126 12.5215 5.43815 14.0625 6.69982C15.93 8.22891 17 10.0327 17 12.1051C16.9999 13.9393 16.2579 15.6944 14.9434 16.986C13.6293 18.277 11.8509 18.9996 10 18.9996C8.14914 18.9996 6.3707 18.277 5.05664 16.986C3.74215 15.6944 3.00006 13.9393 3 12.1051Z" fill={color} />
  </Svg>
);

// ─── Compteur "casino" ─────────────────────────────────────────────────────────
// Au changement de groupe (spinKey) — ou quand une stat asynchrone arrive (value) —
// la valeur fait défiler un ruban de chiffres aléatoires et s'arrête sur la valeur
// finale, façon machine à sous. Elle tourne même si la valeur est identique.
function SlotNumber({ value, spinKey, style }: { value: number; spinKey: string | number; style: any }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const [rowH, setRowH] = useState(0);
  const prevValue = useRef(value);
  // Ruban à 2 lignes : on glisse de la valeur précédente vers la nouvelle.
  const [reel, setReel] = useState<[number, number]>([value, value]);

  useEffect(() => {
    if (rowH === 0) return; // on attend la mesure d'une ligne avant d'animer
    setReel([prevValue.current, value]);
    translateY.setValue(0);
    const anim = Animated.timing(translateY, {
      toValue: -rowH,
      duration: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start(() => { prevValue.current = value; });
    return () => anim.stop();
  }, [spinKey, value, rowH]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ height: rowH || undefined, overflow: "hidden", alignSelf: "flex-start" }}>
      <Animated.View style={{ transform: [{ translateY }] }}>
        {reel.map((n, i) => (
          <Text
            key={i}
            onLayout={i === 0 && rowH === 0 ? (e) => setRowH(e.nativeEvent.layout.height) : undefined}
            style={[style, rowH ? { height: rowH, lineHeight: rowH, includeFontPadding: false, textAlignVertical: "center" } : null]}
          >
            {n}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ProfilePage({
  userId, username, avatarUrl, email, groupName, allGroups, revealConfig,
  onAvatarUpdate, onUsernameUpdate, onEmailUpdate, onStreakUpdate, isActive = false, refreshKey,
  variant = "self",
}: Props) {
  const isMember = variant === "member";
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  // ── Profile data ──
  const [photoTimestamps, setPhotoTimestamps] = useState<{ id: string; created_at: string; group_id: string; image_path: string; note: string | null }[]>([]);
  // Id du vrai dernier moment supprimable, par groupe (group_members.deletable_photo_id).
  const [deletableByGroup, setDeletableByGroup] = useState<Record<string, string | null>>({});
  const [streak, setStreak] = useState(0);
  const [streakWeeks, setStreakWeeks] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  // Scroll activé uniquement si le contenu dépasse la zone visible → pas de bounce iOS inutile.
  const [scrollViewportH, setScrollViewportH] = useState(0);
  const [scrollContentH, setScrollContentH] = useState(0);
  // Hystérésis : un seuil de ±1px faisait clignoter en boucle sur les écrans où le contenu
  // tombe pile à la limite. Monter/démonter le RefreshControl (et toggler scrollEnabled)
  // re-mesure la ScrollView de ~1px → isScrollable repassait true/false en boucle → tressautement.
  // Avec une bande morte (16px) et une décision mémorisée, une fois stabilisé ça ne flippe plus.
  const [isScrollable, setIsScrollable] = useState(false);
  useEffect(() => {
    if (scrollViewportH === 0 || scrollContentH === 0) return;
    setIsScrollable((prev) =>
      prev
        ? scrollContentH > scrollViewportH - 16   // reste scrollable tant qu'on n'est pas nettement en dessous
        : scrollContentH > scrollViewportH + 16   // ne devient scrollable qu'au-delà d'une marge franche
    );
  }, [scrollViewportH, scrollContentH]);

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

  // Le slider du coffre suit le groupe ouvert en single : quand on change de groupe
  // dans la page groupe (groupName change), on aligne la sélection du profil dessus.
  // On résout l'index dans la liste TRIÉE courante (via ref) pour ne se déclencher
  // que sur changement de groupName — pas à chaque re-tri après un refresh de photos
  // — afin de préserver une sélection manuelle tant que le groupe ouvert ne change pas.
  const sortedCoffreGroupsRef = useRef(sortedCoffreGroups);
  sortedCoffreGroupsRef.current = sortedCoffreGroups;
  useEffect(() => {
    const idx = sortedCoffreGroupsRef.current.findIndex(g => g.name === groupName);
    if (idx >= 0) setCoffreGroupIndex(idx);
  }, [groupName]);

  // Swipe horizontal sur tout le bloc coffre (groupe + stats) pour changer de groupe, comme
  // les flèches de pagination. Détection horizontale stricte pour ne pas voler le scroll vertical.
  const coffreIndexRef = useRef(coffreGroupIndex);
  coffreIndexRef.current = coffreGroupIndex;
  const coffreLenRef = useRef(sortedCoffreGroups.length);
  coffreLenRef.current = sortedCoffreGroups.length;

  // Animation de slide : le bloc sort dans le sens du swipe, l'index change, puis le nouveau
  // bloc entre depuis le côté opposé. coffreAnimating évite les changements concurrents.
  const coffreSlide = useRef(new Animated.Value(0)).current;
  const coffreAnimating = useRef(false);
  const changeCoffreGroup = useCallback((delta: number) => {
    if (coffreAnimating.current) return;
    const len = coffreLenRef.current;
    const target = coffreIndexRef.current + delta;
    if (target < 0 || target >= len) return;
    const W = Dimensions.get("window").width;
    coffreAnimating.current = true;
    Animated.timing(coffreSlide, {
      toValue: -delta * W,
      duration: 150,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setCoffreGroupIndex(target);
      coffreSlide.setValue(delta * W); // le nouveau bloc démarre hors écran du côté d'entrée
      Animated.timing(coffreSlide, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => { coffreAnimating.current = false; });
    });
  }, [coffreSlide]);

  const coffreSwipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
      onPanResponderRelease: (_e, g) => {
        if (g.dx <= -40) changeCoffreGroup(1);
        else if (g.dx >= 40) changeCoffreGroup(-1);
      },
    })
  ).current;

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
    if (!coffreLastPhoto || !coffreGroup) return false;
    // Le moment affiché doit être CELUI explicitement marqué comme supprimable
    // (le vrai dernier partagé). Après une suppression, le flag est null → on ne
    // peut plus supprimer l'avant-dernier.
    if (deletableByGroup[coffreGroup.id] !== coffreLastPhoto.id) return false;
    const today = new Date();
    const monday = getMondayOf(today);
    const { revealStart } = weekRevealDates(monday, revealConfig.day, revealConfig.hour);
    const photoDate = new Date(coffreLastPhoto.created_at);
    return photoDate >= monday && photoDate < revealStart && Date.now() < revealStart.getTime();
  }, [coffreLastPhoto, coffreGroup, deletableByGroup, revealConfig]);

  const [showSettings, setShowSettings] = useState(false);

  const settingsInitialPage = useMemo(() => ({
    title: "Paramètres",
    content: <SettingsMainContent username={username} avatarUrl={avatarUrl} onUsernameUpdate={onUsernameUpdate} onAvatarUpdate={onAvatarUpdate} onEmailUpdate={onEmailUpdate} />,
  }), [username, avatarUrl, onUsernameUpdate, onAvatarUpdate, onEmailUpdate]);

  // ── Load all user photo timestamps ──
  const loadData = useCallback(async (isRefresh = false) => {
    if (!userId || allGroups.length === 0) { setRefreshing(false); return; }
    if (isRefresh) setRefreshing(true);

    const { data: timestamps = [] } = await supabase
      .from("photos")
      .select("id, created_at, group_id, image_path, note")
      .eq("user_id", userId)
      .in("group_id", allGroups.map(g => g.id))
      .order("created_at", { ascending: true });

    const safeTimestamps = timestamps ?? [];
    setPhotoTimestamps(safeTimestamps);

    // ── Marqueur "dernier moment supprimable" par groupe ──
    const { data: memberRows } = await supabase
      .from("group_members")
      .select("group_id, deletable_photo_id")
      .eq("user_id", userId)
      .in("group_id", allGroups.map(g => g.id));
    const deletableMap: Record<string, string | null> = {};
    for (const r of memberRows ?? []) deletableMap[r.group_id] = r.deletable_photo_id;
    setDeletableByGroup(deletableMap);

    // ── Daily streak ──
    function dayKey(d: Date): string { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
    const postDayKeys = new Set(safeTimestamps.map(p => dayKey(new Date(p.created_at))));
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
    for (const p of safeTimestamps) {
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
    if (isRefresh) setRefreshing(false);
  }, [userId, allGroups.length, revealConfig.day, revealConfig.hour]);

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
    // Sécurité : ne supprime que le moment réellement marqué comme supprimable.
    if (deletableByGroup[coffreGroup.id] !== coffreLastPhoto.id) {
      setShowDeleteMomentModal(false);
      return;
    }
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
  }, [coffreLastPhoto, coffreGroup, deletableByGroup, loadData, showToast]);

  // Initial load
  useEffect(() => { loadData(); }, [loadData]);

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

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
        // Désactive le scroll/bounce quand tout tient à l'écran (sinon RefreshControl force le bounce iOS).
        scrollEnabled={isScrollable}
        onLayout={(e) => setScrollViewportH(e.nativeEvent.layout.height)}
        onContentSizeChange={(_w, h) => setScrollContentH(h)}
        refreshControl={
          isScrollable ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadData(true)}
              tintColor={colors.textTertiary}
            />
          ) : undefined
        }
      >
        {/* ── Top header (masqué en mode membre : le pseudo est dans le header des réglages) ── */}
        {!isMember && (
          <View style={[styles.topHeaderWrap, { paddingTop: insets.top, marginTop: 16 }]}>
            <View style={styles.topHeaderRow}>
              <View style={styles.topHeaderLeft}>
                <Text style={[textStyles.subtitleStrong, { color: colors.text }]} numberOfLines={1}>{username}</Text>
              </View>
              <View style={styles.topHeaderRight}>
                <TouchableOpacity style={styles.moreBtn} activeOpacity={0.75} onPress={() => setShowSettings(true)}>
                  <Icon name="settings" size={20} color={colors.iconNeutral} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ── NEW: content ── */}
        <View style={[styles.newContent, isMember && { marginTop: spacing.xxl }]}>
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
                  <FireIcon size={20} color={colors.brand} />
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
                      <FireIcon size={16} color={colors.iconBrandOnBrand} />
                    )}
                  </View>
                  <Text style={[styles.newDayLabel, state === "today" && { color: colors.textBrandTertiary }]}>{DAY_LABELS[i]}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* container-coffre */}
          {sortedCoffreGroups.length > 0 && (
            <View style={styles.containerCoffre} {...coffreSwipe.panHandlers}>
              {/* title (masqué en mode membre : pas de sélecteur de groupe, données déjà restreintes) */}
              {!isMember && (
              <View style={styles.coffreTitle}>
                <Animated.View style={[styles.cofreTitleSlide, { transform: [{ translateX: coffreSlide }] }]}>
                  <Text style={styles.cofreTitleText} numberOfLines={1}>
                    {sortedCoffreGroups[coffreGroupIndex]?.name ?? ""}
                  </Text>
                </Animated.View>
                {sortedCoffreGroups.length > 1 && (
                  <View style={styles.cofrePagination}>
                    <TouchableOpacity
                      disabled={coffreGroupIndex === 0}
                      onPress={() => changeCoffreGroup(-1)}
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
                      onPress={() => changeCoffreGroup(1)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Icon name="chevron-right" size={24} color={coffreGroupIndex === sortedCoffreGroups.length - 1 ? colors.iconDisabled : colors.icon} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              )}

              {/* bento (slide animé au changement de groupe) */}
              <Animated.View style={[styles.cofreBentoSlide, { transform: [{ translateX: coffreSlide }] }]}>
              <View style={styles.cofreBento}>
                <View style={styles.cofreBentoRow}>
                  <View style={[styles.cofreBentoItem, { flex: 1 }]}>
                    <SlotNumber value={coffreMomentsCount} spinKey={coffreGroupIndex} style={styles.cofreBentoNum} />
                    <Text style={styles.cofreBentoLabel}>Moments partagés</Text>
                  </View>
                  <View style={[styles.cofreBentoItem, { flex: 1 }]}>
                    <SlotNumber value={coffreRevealsCount} spinKey={coffreGroupIndex} style={styles.cofreBentoNum} />
                    <Text style={styles.cofreBentoLabel}>Reveal vécus</Text>
                  </View>
                </View>
                <View style={styles.cofreBentoRow}>
                  <View style={[styles.cofreBentoItem, { flex: 1 }]}>
                    <SlotNumber value={coffreGroupStat?.comments ?? 0} spinKey={coffreGroupIndex} style={styles.cofreBentoNum} />
                    <Text style={styles.cofreBentoLabel}>Commentaires</Text>
                  </View>
                  <View style={[styles.cofreBentoItem, { flex: 1 }]}>
                    <SlotNumber value={coffreGroupStat?.stickers ?? 0} spinKey={coffreGroupIndex} style={styles.cofreBentoNum} />
                    <Text style={styles.cofreBentoLabel}>Stickers</Text>
                  </View>
                </View>
                {/* last moment row — only shown if current week and reveal not started (jamais en mode membre) */}
                {canDeleteLastMoment && !isMember && (
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
                    <TouchableOpacity
                      style={styles.cofreBentoCapture}
                      onPress={() => setShowDeleteMomentModal(true)}
                      activeOpacity={0.7}
                    >
                      {coffreLastPhoto?.image_path !== "text_mode"
                        ? <Image source={{ uri: r2Storage.getPublicUrl(coffreLastPhoto?.image_path ?? "") }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                        : <View style={{ flex: 1, backgroundColor: colors.bgNeutral }} />
                      }
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              </Animated.View>
            </View>
          )}
        </View>

      </ScrollView>

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

      {!isMember && (
        <SettingsSheet
          visible={showSettings}
          onClose={() => setShowSettings(false)}
          initialPage={settingsInitialPage}
        />
      )}

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
    gap: spacing.xxl,
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
    backgroundColor: colors.card,
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
    alignItems: "baseline",
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
    overflow: "hidden", // clippe le slide horizontal des blocs au changement de groupe
  },
  cofreTitleSlide: {
    flex: 1,
    overflow: "hidden", // le nom slide sans déborder sur la pagination
  },
  cofreBentoSlide: {
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

});
