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
import GroupRoom from "./GroupRoom";
import GroupSearchSheet from "./GroupSearchSheet";
import { type ActiveChallenge, TARGET_CHALLENGE_PROMPT, getChallengePrompt } from "../../lib/challenges";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Mappe un type de capture de défi vers la shape correspondante. */
function captureTypeToShape(t?: string | null): ShapeName | null {
  switch (t) {
    case "PHOTO": return "photo";
    case "VIDEO": return "video";
    case "TEXTE": return "texte";
    case "AUDIO": return "audio";
    case "DESSIN": return "dessin";
    default: return null;
  }
}

// Espace réservé en bas pour la barre d'onglets flottante du pager
const TABBAR_SPACE = 110;
const { width: SCREEN_WIDTH } = Dimensions.get("window");

type GroupInfo = { id: string; name: string; invite_code?: string };

// Données déjà chargées par [id].tsx (pas de fetch ici → cards instantanées)
type GroupDataLike = {
  photos: { image_path: string; created_at: string; url: string; user_id?: string }[]; // triées croissant
  photoCount: number; // moments depuis le dernier reveal (cycle courant)
  members: { avatar_url?: string | null; role?: string; user_id?: string; username?: string }[];
  crownWinnerId?: string | null;
  challenges?: { period1: any | null; period2: any | null } | null;
  currentUserRespondedToChallenge?: boolean;
};

type Props = {
  allGroups: GroupInfo[];
  groupData: Record<string, GroupDataLike>;
  revealConfig: { day: number; hour: number };
  isActive: boolean;
  userId: string;
  enterGroupId?: string | null;        // ouvrir directement la vue de ce groupe (après ajout)
  onEnteredGroup?: () => void;         // consommé → réinitialise enterGroupId côté parent
  closeGroupSignal?: number;           // incrémenté par le parent (onglet Groupes) → revenir à la liste
  onSelectGroup: (groupId: string) => void;
  onAddGroup: () => void;
  onGoToCapture: () => void;           // ouvrir la vue capture
  onOpenChallenge?: (challenge: ActiveChallenge) => void; // ouvrir la capture d'un défi précis
  onOpenReveal: () => void;            // déverrouiller / ouvrir le reveal
  onRevealStart?: () => void;          // début du slide reveal → sortie du menu parent
  onCardFrame?: (frame: { x: number; y: number; width: number; height: number }) => void; // frame de la card (transition reveal)
  onLottieFrame?: (frame: { x: number; y: number; width: number; height: number }) => void; // frame du Lottie (au-dessus de la transition)
  onOpenSettings?: () => void;         // ouvrir les réglages du groupe courant
  onOpenArchives?: () => void;         // ouvrir les archives du groupe courant
  onScrollLock?: (locked: boolean) => void;
  onDebugNamePress?: () => void;       // DEV : clic sur le nom du groupe → menu debug
  debugUnlocked?: boolean;             // DEV : force l'état déverrouillé du reveal
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

/** Premier minuit (00:00) qui suit un timestamp (ex: reveal dim 20h → lun 00:00). */
function midnightAfter(ts: number): number {
  const d = new Date(ts);
  d.setHours(24, 0, 0, 0); // 24h → bascule au 00:00 du jour suivant
  return d.getTime();
}

export default function GroupsPage({ allGroups, groupData, revealConfig, isActive, userId, enterGroupId, onEnteredGroup, closeGroupSignal, onSelectGroup, onAddGroup, onGoToCapture, onOpenChallenge, onOpenReveal, onRevealStart, onCardFrame, onLottieFrame, onOpenSettings, onOpenArchives, onScrollLock, onDebugNamePress, debugUnlocked }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [viewingGroupId, setViewingGroupId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const revealDate = useMemo(
    () => computeNextRevealDate(revealConfig.day, revealConfig.hour),
    [revealConfig.day, revealConfig.hour]
  );
  const allGroupsKey = allGroups.map((g) => g.id).join(",");

  // État reveal global (par défaut, avant le fetch par groupe). Le `refresh` calcule ensuite
  // un état PAR GROUPE (un reveal vide se referme à minuit) qui prend le relais via les overrides.
  const lastRevealTs = revealDate.getTime() - WEEK_MS;
  const unlockedDefault = (Date.now() - lastRevealTs < DAY_MS) || !!debugUnlocked;

  // Champs dynamiques rafraîchis par le fetch à l'arrivée (uniquement ce qui change)
  type CardOverride = { momentCount: number; shape: ShapeName | null; bgUrl: string | null; unlocked: boolean };
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

      // Couronne : surnom + avatar du porteur
      let crownUsername: string | null = null;
      let crownAvatarUrl: string | null = null;
      if (gd?.crownWinnerId) {
        const winner = gd.members?.find((m) => m.user_id === gd.crownWinnerId);
        crownUsername = winner?.username ?? null;
        crownAvatarUrl = winner?.avatar_url ?? null;
      }

      // Défi en cours : surnom cible + shape du type de média
      const ch = gd?.challenges?.period1 ?? gd?.challenges?.period2 ?? null;
      const challengeLabel = ch?.target_username ?? null;
      const challengeShape = captureTypeToShape(ch?.theme?.capture_type);

      // L'utilisateur a-t-il posté cette semaine dans ce groupe ?
      const postedThisWeek =
        (photos.some((p) => p.user_id === userId)) || (gd?.currentUserRespondedToChallenge ?? false);

      return {
        id: g.id,
        name: g.name,
        momentCount,
        shape: lastMoment ? imagePathToShape(lastMoment.image_path) : null,
        bgUrl,
        lastMomentAt: lastMoment ? new Date(lastMoment.created_at).getTime() : 0,
        loaded: true,
        crownUsername,
        crownAvatarUrl,
        challengeLabel,
        challengeShape,
        postedThisWeek,
        unlocked: unlockedDefault,
      };
    });
    // Ordre (groupe au moment le plus récent en premier) figé sur la base → pas de saut au refresh
    built.sort((a, b) => b.lastMomentAt - a.lastMomentAt);
    // On applique les champs rafraîchis (fond, nombre de moments, shape, état reveal) sans réordonner
    return built.map((c) => {
      const o = overrides[c.id];
      return o ? { ...c, momentCount: o.momentCount, shape: o.shape, bgUrl: o.bgUrl, unlocked: o.unlocked } : c;
    });
  }, [allGroups, groupData, overrides, unlockedDefault]);

  // Fetch à l'arrivée sur la liste : met à jour fond / nombre de moments / shape
  const refresh = useCallback(async () => {
    if (allGroups.length === 0) return;
    // Dernier reveal passé = prochain reveal − 1 semaine.
    const lastReveal = computeNextRevealDate(revealConfig.day, revealConfig.hour).getTime() - WEEK_MS;
    const now = Date.now();
    // Pendant les 24h qui suivent le reveal, on garde par défaut les moments de la période
    // RÉVÉLÉE (celle qui vient de se terminer), pas ceux de la nouvelle semaine de collecte.
    const inRevealWindow = now - lastReveal < DAY_MS;
    // Minuit suivant le reveal (reveal dim 20h → lun 00:00).
    const midnightAfterReveal = midnightAfter(lastReveal);
    const revealedWeekStart = lastReveal - WEEK_MS;
    await Promise.all(
      allGroups.map(async (g) => {
        const [photosRes, membersRes] = await Promise.all([
          supabase.from("photos").select("image_path, created_at").eq("group_id", g.id).order("created_at", { ascending: false }),
          supabase.from("group_members").select("role, profiles:user_id(avatar_url)").eq("group_id", g.id),
        ]);
        const photos = photosRes.data ?? [];

        // Nb de moments de la SEMAINE RÉVÉLÉE (celle qui vient de se terminer).
        const revealedCount = photos.filter((p: any) => {
          const t = new Date(p.created_at).getTime();
          return t >= revealedWeekStart && t < lastReveal;
        }).length;

        // Règle : un reveal VIDE (0 moment) n'est plus visible passé minuit → on bascule
        // ce groupe sur la nouvelle semaine de collecte (moments depuis le reveal). Un reveal
        // qui a des moments reste visible toute la fenêtre de 24h.
        const emptyRevealCollapsed = inRevealWindow && revealedCount === 0 && now >= midnightAfterReveal;
        const showRevealed = inRevealWindow && !emptyRevealCollapsed;

        const windowStart = showRevealed ? revealedWeekStart : lastReveal;
        const windowEnd = showRevealed ? lastReveal : Infinity;
        const windowed = photos.filter((p: any) => {
          const t = new Date(p.created_at).getTime();
          return t >= windowStart && t < windowEnd;
        });
        const last = windowed[0] as any | undefined;
        const lastPhoto = windowed.find((p: any) => isPhotoPath(p.image_path)) as any | undefined;
        const admin = (membersRes.data ?? []).find((m: any) => m.role === "admin");
        const chiefAvatar = (admin as any)?.profiles?.avatar_url ?? null;
        const momentCount = windowed.length;
        // Aucun moment → pas de fond (null = background/default/secondary dark)
        const bgUrl = momentCount > 0 ? (lastPhoto ? r2Storage.getPublicUrl(lastPhoto.image_path) : chiefAvatar) : null;
        // Reveal accessible pour CE groupe uniquement tant qu'on affiche une vraie fenêtre reveal.
        const unlocked = showRevealed || !!debugUnlocked;
        setOverrides((prev) => ({
          ...prev,
          [g.id]: {
            momentCount,
            shape: last ? imagePathToShape(last.image_path) : null,
            bgUrl,
            unlocked,
          },
        }));
      })
    );
  }, [allGroupsKey, revealConfig.day, revealConfig.hour, debugUnlocked]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Construit l'ActiveChallenge du défi en cours d'un groupe (même logique que la card),
  // pour ouvrir directement sa capture au clic sur l'encart "Défi @…".
  const buildActiveChallenge = useCallback((groupId: string): ActiveChallenge | null => {
    const ch = groupData[groupId]?.challenges?.period1 ?? groupData[groupId]?.challenges?.period2 ?? null;
    if (!ch) return null;
    const isTarget = ch.target_user_id === userId;
    return {
      challengeId: ch.id,
      captureType: isTarget ? "PHOTO" : ch.theme.capture_type,
      promptText: isTarget ? TARGET_CHALLENGE_PROMPT : getChallengePrompt(ch.target_username, ch.theme.label),
      groupId,
      isTarget,
      proposedByUsername: ch.proposed_by_username ?? null,
      targetUsername: ch.target_username,
      themeLabel: ch.theme.label,
    };
  }, [groupData, userId]);

  const handleOpenChallenge = useCallback((groupId: string) => {
    const challenge = buildActiveChallenge(groupId);
    if (challenge) onOpenChallenge?.(challenge);
  }, [buildActiveChallenge, onOpenChallenge]);

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

  // Onglet "Groupes" du menu : revenir à la liste si une vue groupe est ouverte
  // (même comportement que le chevron retour). Déclenché par incrément du signal parent.
  useEffect(() => {
    if (closeGroupSignal && viewingGroupId) closeGroup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeGroupSignal]);

  // Bouton retour matériel (Android) : ferme la page groupe → liste, au lieu de quitter l'app
  useEffect(() => {
    const onBack = () => {
      if (isActive && viewingGroupId) { closeGroup(); return true; }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [isActive, viewingGroupId, closeGroup]);

  // Après ajout d'un groupe : on entre directement dans sa vue
  useEffect(() => {
    if (!enterGroupId) return;
    // Avec un seul groupe la vue single s'affiche déjà ; sinon on ouvre l'overlay
    if (cards.length > 1) openGroup(enterGroupId);
    onEnteredGroup?.();
  }, [enterGroupId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Un seul groupe : on entre directement dans la single, sans flèche retour ──
  if (singleGroup) {
    return (
      <GroupRoom
        card={cards[0]}
        revealDate={revealDate}
        unlocked={cards[0].unlocked}
        showBack={false}
        showAddButton
        topInset={insets.top}
        onBack={() => {}}
        onAddGroup={onAddGroup}
        onSettings={() => onOpenSettings?.()}
        onArchive={() => onOpenArchives?.()}
        onCapture={onGoToCapture}
        onOpenChallenge={onOpenChallenge ? () => handleOpenChallenge(cards[0].id) : undefined}
        onUnlock={onOpenReveal}
        onRevealStart={onRevealStart}
        onCardFrame={onCardFrame}
        onLottieFrame={onLottieFrame}
        onDebugNamePress={onDebugNamePress}
      />
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
            {allGroups.length > 5 && (
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowSearch(true)} activeOpacity={0.8}>
                <Icon name="search" size={20} color={colors.iconNeutral} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.addBtn} onPress={onAddGroup} activeOpacity={0.8}>
              <Icon name="plus" size={20} color={colors.iconNeutral} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={{ flex: 1, marginTop: spacing.xl, paddingBottom: TABBAR_SPACE }}>
        <GroupsSlider cards={cards} revealDate={revealDate} onSelect={openGroup} showActiveBorder={!viewingGroupId} />
      </View>

      {/* Single du groupe — slide à l'entrée + retour par glissement depuis le bord gauche */}
      {groupViewMounted && openedGroup && (
        <Animated.View style={[StyleSheet.absoluteFillObject, { transform: [{ translateX: slideAnim }] }]}>
          <EdgeSwipeBack
            style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.bg }]}
            onBack={() => { setViewingGroupId(null); setGroupViewMounted(false); }}
          >
            <GroupRoom
              card={openedGroup}
              revealDate={revealDate}
              unlocked={openedGroup.unlocked}
              showBack
              showAddButton={false}
              topInset={insets.top}
              onBack={closeGroup}
              onAddGroup={onAddGroup}
              onSettings={() => onOpenSettings?.()}
              onArchive={() => onOpenArchives?.()}
              onCapture={onGoToCapture}
              onOpenChallenge={onOpenChallenge && openedGroup ? () => handleOpenChallenge(openedGroup.id) : undefined}
              onUnlock={onOpenReveal}
              onRevealStart={onRevealStart}
              onCardFrame={onCardFrame}
              onLottieFrame={onLottieFrame}
              onDebugNamePress={onDebugNamePress}
            />
          </EdgeSwipeBack>
        </Animated.View>
      )}

      <GroupSearchSheet
        visible={showSearch}
        onClose={() => setShowSearch(false)}
        groups={allGroups}
        onSelectGroup={(id) => { setShowSearch(false); openGroup(id); }}
      />
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
