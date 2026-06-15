import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Dimensions, BackHandler } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { r2Storage } from "../../lib/r2";
import { radii, spacing, textStyles, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import Icon from "../Icon";
import EdgeSwipeBack from "../EdgeSwipeBack";
import { type ShapeName } from "../Shape";
import GroupsSlider, { type GroupCard } from "./GroupsSlider";

// Espace réservé en bas pour la barre d'onglets flottante du pager
const TABBAR_SPACE = 110;
const { width: SCREEN_WIDTH } = Dimensions.get("window");

type GroupInfo = { id: string; name: string; invite_code?: string };

// Données déjà chargées par [id].tsx (pas de fetch ici → cards instantanées)
type GroupDataLike = {
  photos: { image_path: string; created_at: string; url: string }[]; // triées croissant
  photoCount: number; // moments depuis le dernier reveal (cycle courant)
  members: { avatar_url?: string | null; role?: string }[];
};

type Props = {
  allGroups: GroupInfo[];
  groupData: Record<string, GroupDataLike>;
  revealConfig: { day: number; hour: number };
  isActive: boolean;
  onSelectGroup: (groupId: string) => void;
  onAddGroup: () => void;
  onScrollLock?: (locked: boolean) => void;
};

/** Mappe un image_path vers la shape du moment correspondant. */
function imagePathToShape(path: string): ShapeName {
  if (path === "text_mode") return "texte";
  if (path.endsWith(".mp4")) return "video";
  if (path.endsWith(".m4a")) return "audio";
  if (path.includes("_draw")) return "dessin";
  return "photo";
}

/** Vrai si l'image_path est une vraie photo (ni texte, ni vidéo, ni audio, ni dessin). */
function isPhotoPath(path: string): boolean {
  return (
    path !== "text_mode" &&
    !path.endsWith(".mp4") &&
    !path.endsWith(".m4a") &&
    !path.includes("_draw")
  );
}

/** Prochaine date de reveal (jour/heure configurés dans app_config). */
function computeNextRevealDate(revealDayOfWeek: number, revealHour: number): Date {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const daysFromMonday = revealDayOfWeek === 0 ? 6 : revealDayOfWeek - 1;
  const reveal = new Date(monday);
  reveal.setDate(monday.getDate() + daysFromMonday);
  reveal.setHours(revealHour, 0, 0, 0);
  if (now >= reveal) reveal.setDate(reveal.getDate() + 7);
  return reveal;
}

export default function GroupsPage({ allGroups, groupData, revealConfig, isActive, onSelectGroup, onAddGroup, onScrollLock }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [viewingGroupId, setViewingGroupId] = useState<string | null>(null);
  const revealDate = useMemo(
    () => computeNextRevealDate(revealConfig.day, revealConfig.hour),
    [revealConfig.day, revealConfig.hour]
  );
  const allGroupsKey = allGroups.map((g) => g.id).join(",");

  // Champs dynamiques rafraîchis par le fetch à l'arrivée (uniquement ce qui change)
  type CardOverride = { momentCount: number; shape: ShapeName | null; bgUrl: string | null };
  const [overrides, setOverrides] = useState<Record<string, CardOverride>>({});

  // Base instantanée dérivée des données déjà chargées par [id].tsx (aucune attente).
  const cards = useMemo<GroupCard[]>(() => {
    const built = allGroups.map((g): GroupCard => {
      const gd = groupData[g.id];
      const photos = gd?.photos ?? [];
      const lastMoment = photos.length ? photos[photos.length - 1] : undefined; // triées croissant
      const momentCount = gd?.photoCount ?? 0; // moments depuis le dernier reveal

      // Fond : dernière vraie photo (sinon avatar du chef). Aucun moment → null = fond dark.
      let bgUrl: string | null = null;
      if (momentCount > 0) {
        for (let i = photos.length - 1; i >= 0; i--) {
          if (isPhotoPath(photos[i].image_path) && photos[i].url) { bgUrl = photos[i].url; break; }
        }
        if (!bgUrl) {
          const admin = gd?.members?.find((m) => m.role === "admin");
          bgUrl = admin?.avatar_url ?? null;
        }
      }

      return {
        id: g.id,
        name: g.name,
        momentCount,
        shape: lastMoment ? imagePathToShape(lastMoment.image_path) : null,
        bgUrl,
        lastMomentAt: lastMoment ? new Date(lastMoment.created_at).getTime() : 0,
        loaded: true,
      };
    });
    // Ordre (groupe au moment le plus récent en premier) figé sur la base → pas de saut au refresh
    built.sort((a, b) => b.lastMomentAt - a.lastMomentAt);
    // On applique les champs rafraîchis (fond, nombre de moments, shape) sans réordonner
    return built.map((c) => {
      const o = overrides[c.id];
      return o ? { ...c, momentCount: o.momentCount, shape: o.shape, bgUrl: o.bgUrl } : c;
    });
  }, [allGroups, groupData, overrides]);

  // Fetch à l'arrivée sur la liste : met à jour fond / nombre de moments / shape
  const refresh = useCallback(async () => {
    if (allGroups.length === 0) return;
    const lastReveal = computeNextRevealDate(revealConfig.day, revealConfig.hour).getTime() - 7 * 24 * 60 * 60 * 1000;
    await Promise.all(
      allGroups.map(async (g) => {
        const [photosRes, membersRes] = await Promise.all([
          supabase.from("photos").select("image_path, created_at").eq("group_id", g.id).order("created_at", { ascending: false }),
          supabase.from("group_members").select("role, profiles:user_id(avatar_url)").eq("group_id", g.id),
        ]);
        const photos = photosRes.data ?? [];
        const last = photos[0] as any | undefined;
        const lastPhoto = photos.find((p: any) => isPhotoPath(p.image_path)) as any | undefined;
        const admin = (membersRes.data ?? []).find((m: any) => m.role === "admin");
        const chiefAvatar = (admin as any)?.profiles?.avatar_url ?? null;
        const momentCount = photos.filter((p: any) => new Date(p.created_at).getTime() >= lastReveal).length;
        // Aucun moment → pas de fond (null = background/default/default dark)
        const bgUrl = momentCount > 0 ? (lastPhoto ? r2Storage.getPublicUrl(lastPhoto.image_path) : chiefAvatar) : null;
        setOverrides((prev) => ({
          ...prev,
          [g.id]: {
            momentCount,
            shape: last ? imagePathToShape(last.image_path) : null,
            bgUrl,
          },
        }));
      })
    );
  }, [allGroupsKey, revealConfig.day, revealConfig.hour]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isActive) refresh();
  }, [isActive, refresh]);

  const singleGroup = cards.length === 1;
  const selectionShown = !singleGroup && !viewingGroupId;

  // Bloque totalement le swipe du pager tant qu'on affiche la sélection de groupe
  useEffect(() => {
    onScrollLock?.(isActive && selectionShown);
  }, [isActive, selectionShown]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Transition d'ouverture/fermeture de la page groupe (slide depuis la droite) ──
  const slideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const [groupViewMounted, setGroupViewMounted] = useState(false);

  const openGroup = useCallback((groupId: string) => {
    onSelectGroup(groupId);
    setViewingGroupId(groupId);
    setGroupViewMounted(true);
    slideAnim.setValue(SCREEN_WIDTH);
    requestAnimationFrame(() => {
      Animated.timing(slideAnim, {
        toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start();
    });
  }, [onSelectGroup, slideAnim]);

  const closeGroup = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_WIDTH, duration: 250, easing: Easing.in(Easing.quad), useNativeDriver: true,
    }).start(() => {
      setViewingGroupId(null);
      setGroupViewMounted(false);
    });
  }, [slideAnim]);

  // Bouton retour matériel (Android) : ferme la page groupe → liste, au lieu de quitter l'app
  useEffect(() => {
    const onBack = () => {
      if (isActive && viewingGroupId) { closeGroup(); return true; }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [isActive, viewingGroupId, closeGroup]);

  // ── Un seul groupe : on entre directement, sans transition ─────────────────
  if (singleGroup) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{cards[0]?.name ?? ""}</Text>
          </View>
        </View>
      </View>
    );
  }

  // ── Sélection de groupe (slider) + overlay animé de la page groupe ─────────
  const openedGroup = cards.find((c) => c.id === viewingGroupId);
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={[styles.headerRow, { justifyContent: "space-between" }]}>
          <Text style={styles.title}>Groupes</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.addBtn} onPress={() => {}} activeOpacity={0.8}>
              <Icon name="search" size={20} color={colors.iconNeutral} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={onAddGroup} activeOpacity={0.8}>
              <Icon name="plus" size={20} color={colors.iconNeutral} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={{ flex: 1, marginTop: spacing.xl, paddingBottom: TABBAR_SPACE }}>
        <GroupsSlider cards={cards} revealDate={revealDate} onSelect={openGroup} showActiveBorder={!viewingGroupId} />
      </View>

      {/* Page groupe (provisoire) — slide à l'entrée + retour par glissement depuis le bord gauche */}
      {groupViewMounted && (
        <Animated.View style={[StyleSheet.absoluteFillObject, { transform: [{ translateX: slideAnim }] }]}>
          <EdgeSwipeBack
            style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.bg, paddingTop: insets.top }]}
            onBack={() => { setViewingGroupId(null); setGroupViewMounted(false); }}
          >
            <View style={styles.header}>
              <View style={styles.headerRow}>
                <TouchableOpacity style={styles.iconBtn} onPress={closeGroup} activeOpacity={0.7}>
                  <Icon name="chevron-left" size={20} color={colors.icon} />
                </TouchableOpacity>
                <Text style={styles.title}>{openedGroup?.name ?? ""}</Text>
              </View>
            </View>
          </EdgeSwipeBack>
        </Animated.View>
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  // Même espace en haut que les paramètres : insets.top (container) + marginTop spacing.lg
  header: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 40 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconBtn: {
    width: 40, height: 40, borderRadius: radii.md,
    justifyContent: "center", alignItems: "center",
  },
  addBtn: {
    width: 40, height: 40, borderRadius: radii.md,
    justifyContent: "center", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.card, // background/default/secondary
  },
  title: {
    ...textStyles.subtitleStrong,
    color: colors.text,
    lineHeight: undefined,
    fontSize: 32,
  },
});
