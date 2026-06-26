import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Dimensions, BackHandler } from "react-native";
import { BlurredImageBackground } from "../atoms/BlurredImageBackground";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { r2Storage } from "../../lib/r2";
import { radii, spacing, textStyles, colors as darkColors, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import Icon from "../Icon";
import { type ShapeName } from "../Shape";
import GroupsSlider, { type GroupCard, type CardFrame } from "./GroupsSlider";
import GroupRoom from "./GroupRoom";
import GroupSearchSheet from "./GroupSearchSheet";
import { type ActiveChallenge, TARGET_CHALLENGE_PROMPT, getChallengePrompt } from "../../lib/challenges";
import { computeCrownWinner } from "../../lib/crown";
import { hapticImpact } from "../../lib/haptics";

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
  photos: { image_path: string; created_at: string; url: string; user_id?: string; video_thumbnail_url?: string | null }[]; // triées croissant
  photoCount: number; // moments depuis le dernier reveal (cycle courant)
  members: { avatar_url?: string | null; role?: string; user_id?: string; username?: string }[];
  crownWinnerId?: string | null;
  challenges?: { period1: any | null; period2: any | null } | null;
  currentUserRespondedToChallenge?: boolean;
};

/**
 * URL d'image de fond pour un moment (comme l'intro du reveal) :
 *  - photo / dessin → l'image elle-même,
 *  - vidéo → la 1re frame (vignette),
 *  - texte / audio → pas de visuel (null).
 */
function momentBgUrl(p: { image_path: string; url?: string; video_thumbnail_url?: string | null }): string | null {
  const ip = p.image_path;
  if (ip === "text_mode" || ip.endsWith(".m4a")) return null;
  if (ip.endsWith(".mp4")) return p.video_thumbnail_url ?? null;
  return p.url ?? null; // photo OU dessin (_draw) = jpg
}

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
  photosVersion?: number;              // ++ à chaque nouveau moment → refresh (même en single ouverte)
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

/**
 * Carte "fantôme" qui ne contient QUE le fond (image floutée + voile sombre), identique au
 * fond des cards liste et single. Sert d'élément partagé qui s'agrandit de la taille liste à
 * la taille single pendant l'ouverture/fermeture d'un groupe.
 */
function MorphCard({ bgUrl, bg }: { bgUrl: string | null; bg: string }) {
  if (!bgUrl) return <View style={[StyleSheet.absoluteFillObject, { backgroundColor: bg }]} />;
  return <BlurredImageBackground uri={bgUrl} />;
}

export default function GroupsPage({ allGroups, groupData, revealConfig, isActive, userId, enterGroupId, onEnteredGroup, closeGroupSignal, onSelectGroup, onAddGroup, onGoToCapture, onOpenChallenge, onOpenReveal, onRevealStart, onCardFrame, onLottieFrame, onOpenSettings, onOpenArchives, onScrollLock, onDebugNamePress, debugUnlocked, photosVersion }: Props) {
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

  // Champs dynamiques rafraîchis par le fetch (tout ce qui change ENSEMBLE : nb moments, shape,
  // fond, état reveal ET couronne → même timing d'update, plus de couronne en décalé).
  type CardOverride = {
    momentCount: number; shape: ShapeName | null; bgUrl: string | null; unlocked: boolean;
    crownUsername: string | null; crownAvatarUrl: string | null;
  };
  const [overrides, setOverrides] = useState<Record<string, CardOverride>>({});

  // Base instantanée dérivée des données déjà chargées par [id].tsx (aucune attente).
  const cards = useMemo<GroupCard[]>(() => {
    const built = allGroups.map((g): GroupCard => {
      const gd = groupData[g.id];
      const photos = gd?.photos ?? [];
      const lastMoment = photos.length ? photos[photos.length - 1] : undefined; // triées croissant
      const momentCount = gd?.photoCount ?? 0; // moments depuis le dernier reveal

      // Fond : dernier moment visuel (photo/dessin, ou 1re frame d'une vidéo). À défaut (que du
      // texte/audio) → avatar du chef. Aucun moment → null = fond dark.
      let bgUrl: string | null = null;
      if (momentCount > 0) {
        for (let i = photos.length - 1; i >= 0; i--) {
          const u = momentBgUrl(photos[i]);
          if (u) { bgUrl = u; break; }
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
      return o ? { ...c, momentCount: o.momentCount, shape: o.shape, bgUrl: o.bgUrl, unlocked: o.unlocked, crownUsername: o.crownUsername, crownAvatarUrl: o.crownAvatarUrl } : c;
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
          supabase.from("photos").select("image_path, created_at, user_id, video_thumbnail_path").eq("group_id", g.id).order("created_at", { ascending: false }),
          supabase.from("group_members").select("role, user_id, profiles:user_id(username, avatar_url)").eq("group_id", g.id),
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
        const members = (membersRes.data ?? []) as any[];
        const admin = members.find((m) => m.role === "admin");
        const chiefAvatar = admin?.profiles?.avatar_url ?? null;
        const momentCount = windowed.length;

        // Fond : dernier moment visuel (photo/dessin, ou 1re frame d'une vidéo) ; à défaut chef.
        const bgFromMoment = (p: any): string | null => {
          const ip: string = p.image_path;
          if (ip === "text_mode" || ip.endsWith(".m4a")) return null;
          if (ip.endsWith(".mp4")) return p.video_thumbnail_path ? r2Storage.getPublicUrl(p.video_thumbnail_path) : null;
          return r2Storage.getPublicUrl(ip); // photo OU dessin
        };
        let bgUrl: string | null = null;
        if (momentCount > 0) {
          for (const p of windowed) { const u = bgFromMoment(p); if (u) { bgUrl = u; break; } } // windowed = récent→ancien
          if (!bgUrl) bgUrl = chiefAvatar;
        }

        // Couronne : recalculée ICI, sur la MÊME fenêtre que [id].tsx (collecte → jusqu'au
        // prochain reveal ; révélée → la semaine révélée) et la MÊME récupération que le reste
        // (nb moments / fond) → mise à jour synchrone, plus de décalage.
        const crownEnd = windowEnd === Infinity ? lastReveal + WEEK_MS : windowEnd;
        const crown = computeCrownWinner(
          windowed.map((p: any) => ({ user_id: p.user_id, created_at: p.created_at })) as any,
          new Date(windowStart),
          new Date(crownEnd),
        );
        const winner = crown ? members.find((m) => m.user_id === crown.winnerId) : undefined;
        const winnerProfile: any = Array.isArray(winner?.profiles) ? winner?.profiles?.[0] : winner?.profiles;

        // Reveal accessible pour CE groupe uniquement tant qu'on affiche une vraie fenêtre reveal.
        const unlocked = showRevealed || !!debugUnlocked;
        setOverrides((prev) => ({
          ...prev,
          [g.id]: {
            momentCount,
            shape: last ? imagePathToShape(last.image_path) : null,
            bgUrl,
            unlocked,
            crownUsername: winnerProfile?.username ?? null,
            crownAvatarUrl: winnerProfile?.avatar_url ?? null,
          },
        }));
      })
    );
  }, [allGroupsKey, revealConfig.day, revealConfig.hour, debugUnlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isActive) refresh();
  }, [isActive, refresh]);

  // Nouveau moment posté (realtime) → recalcule les overrides (nb moments / shape / fond) même
  // quand on est dans la single d'un groupe, sinon la vue resterait figée sur des valeurs périmées.
  useEffect(() => {
    if (photosVersion && isActive) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photosVersion]);

  const singleGroup = cards.length === 1;
  const selectionShown = !singleGroup && !viewingGroupId;

  // Bloque totalement le swipe du pager tant qu'on affiche la sélection de groupe
  useEffect(() => {
    onScrollLock?.(isActive && selectionShown);
  }, [isActive, selectionShown]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Transition d'ouverture/fermeture de la page groupe (agrandissement de la card) ──
  // La card de la liste "devient" la card de la single : une card fantôme (fond seul) grandit
  // de la frame liste → frame single, pendant que la liste s'efface (façon reveal) puis que la
  // single apparaît. `morph` 0 = liste, 1 = single.
  // Phases :
  //  opening    → contenu liste sort (reveal-style) + fond grandit ; single mesurée mais cachée.
  //  single     → single affichée, son contenu entre (reveal-style).
  //  closingOut → contenu single sort (reveal-style), fond single encore en place.
  //  closingGrow→ fond rétrécit single→liste ; contenu liste rentre (reveal-style).
  const morph = useRef(new Animated.Value(0)).current; // 0 = liste, 1 = single
  const [groupViewMounted, setGroupViewMounted] = useState(false);
  const [phase, setPhase] = useState<"list" | "opening" | "single" | "closingOut" | "closingGrow">("list");
  const [startFrame, setStartFrame] = useState<CardFrame | null>(null); // card liste tapée (coords écran)
  const [singleFrame, setSingleFrame] = useState<CardFrame | null>(null); // card single (coords écran)
  const [introKey, setIntroKey] = useState(0);   // ++ → la single fait entrer son contenu
  const [outroKey, setOutroKey] = useState(0);   // ++ → la single fait sortir son contenu
  const morphStartedRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetToList = useCallback(() => {
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    setViewingGroupId(null);
    setGroupViewMounted(false);
    setPhase("list");
    setStartFrame(null);
    setSingleFrame(null);
    morph.setValue(0);
    morphStartedRef.current = false;
  }, [morph]);

  // Frame de la card single (mesurée par GroupRoom) → cible de l'agrandissement. On relaie
  // aussi au parent (utilisé par la transition reveal).
  const handleSingleCardFrame = useCallback((f: CardFrame) => {
    setSingleFrame(f);
    onCardFrame?.(f);
  }, [onCardFrame]);

  // Démarre l'agrandissement dès qu'on a les deux frames (liste + single).
  useEffect(() => {
    if (phase === "opening" && startFrame && singleFrame && !morphStartedRef.current) {
      morphStartedRef.current = true;
      Animated.timing(morph, {
        toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) { setPhase("single"); setIntroKey((k) => k + 1); }
      });
    }
  }, [phase, startFrame, singleFrame, morph]);

  // Filet de sécurité : aucune phase transitoire (opening/closingOut/closingGrow) ne doit
  // rester bloquée — sinon tous les calques sont en pointerEvents="none" et l'écran est figé/
  // non-cliquable. Si une phase transitoire dure trop longtemps (frame jamais mesurée, callback
  // d'anim non déclenché au remount…), on force l'état terminal. Le délai (1200ms) est très au-delà
  // d'une transition normale (~400ms ouverture, ~560ms fermeture) → ne se déclenche qu'en cas de blocage.
  useEffect(() => {
    if (phase === "list" || phase === "single") return;
    const t = setTimeout(() => {
      if (phase === "opening") {
        morphStartedRef.current = true;
        morph.setValue(1);
        setIntroKey((k) => k + 1);
        setPhase("single");
      } else {
        resetToList();
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [phase, morph, resetToList]);

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

  const openGroup = useCallback((groupId: string, frame?: CardFrame) => {
    hapticImpact();
    onSelectGroup(groupId);
    setViewingGroupId(groupId);
    setGroupViewMounted(true);
    setSingleFrame(null);
    morphStartedRef.current = false;
    if (!frame) {
      // Pas de card source (ex: après création/recherche) → affichage direct (contenu en place).
      setStartFrame(null);
      morph.setValue(1);
      setPhase("single");
      return;
    }
    setStartFrame(frame);
    morph.setValue(0);
    setPhase("opening");
  }, [onSelectGroup, morph]);

  const closeGroup = useCallback(() => {
    setPhase((cur) => {
      if (cur === "list" || cur === "closingOut" || cur === "closingGrow") return cur;
      if (startFrame && singleFrame) {
        // 1) le contenu de la single sort (reveal-style)…
        setOutroKey((k) => k + 1);
        // 2) …puis le fond rétrécit vers la card liste, dont le contenu rentre.
        closeTimerRef.current = setTimeout(() => {
          setPhase("closingGrow");
          Animated.timing(morph, {
            toValue: 0, duration: 360, easing: Easing.inOut(Easing.cubic), useNativeDriver: true,
          }).start(({ finished }) => { if (finished) resetToList(); });
        }, 200);
        return "closingOut";
      }
      resetToList();
      return "list";
    });
  }, [morph, startFrame, singleFrame, resetToList]);

  // Nettoyage du timer de fermeture au démontage.
  useEffect(() => () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); }, []);

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

  // ── Sélection de groupe (slider) + agrandissement de la card vers la single ─────────
  const openedGroup = cards.find((c) => c.id === viewingGroupId);

  // Header + autres cards + pagination s'effacent (fondu + léger recul) ; le contenu de la card
  // tapée, lui, sort en reveal-style via GroupsSlider (translates par élément). L'agrandissement
  // du fond prend le relais ensuite.
  const listLayerStyle = {
    opacity: morph.interpolate({ inputRange: [0, 0.4], outputRange: [1, 0], extrapolate: "clamp" }),
    transform: [{ translateY: morph.interpolate({ inputRange: [0, 0.4], outputRange: [0, -20], extrapolate: "clamp" }) }],
  };
  // Card fantôme : posée à la taille FINALE (single) et amenée à la taille liste via un
  // transform NATIF (scale + translate). L'image floutée n'est rastérisée qu'une fois → le GPU
  // la met à l'échelle (aucun re-flou par frame) → fluide même avec un dessin lourd en fond.
  const overlayAnimStyle = (startFrame && singleFrame) ? {
    left: singleFrame.x,
    top: singleFrame.y,
    width: singleFrame.width,
    height: singleFrame.height,
    transform: [
      { translateX: morph.interpolate({ inputRange: [0, 1], outputRange: [(startFrame.x + startFrame.width / 2) - (singleFrame.x + singleFrame.width / 2), 0] }) },
      { translateY: morph.interpolate({ inputRange: [0, 1], outputRange: [(startFrame.y + startFrame.height / 2) - (singleFrame.y + singleFrame.height / 2), 0] }) },
      { scaleX: morph.interpolate({ inputRange: [0, 1], outputRange: [startFrame.width / singleFrame.width, 1] }) },
      { scaleY: morph.interpolate({ inputRange: [0, 1], outputRange: [startFrame.height / singleFrame.height, 1] }) },
    ],
  } : null;
  const showOverlay = (phase === "opening" || phase === "closingGrow") && !!overlayAnimStyle && !!openedGroup;
  // La single (vraie) est montée en continu (pour mesurer son fond), mais n'est VISIBLE qu'une
  // fois le fond agrandi → swap instantané sans crossfade (pixels identiques au fond fantôme).
  const groupRoomVisible = phase === "single" || phase === "closingOut";

  return (
    <View style={styles.container}>
      {/* Card fantôme (fond seul) qui s'agrandit liste → single — SOUS la liste, pour que le
          contenu de la card tapée s'efface PAR-DESSUS le fond qui, lui, persiste et grandit. */}
      {showOverlay && (
        <Animated.View
          style={[
            { position: "absolute", borderRadius: radii.xl, overflow: "hidden" },
            // Groupe sans moment (pas d'image) : fond + bordure visibles, sinon le fond fantôme
            // (≈ couleur de page) rend l'agrandissement imperceptible. On force les couleurs DARK
            // (darkColors) car les cards liste/single sont toujours en thème sombre (ForceThemeMode) :
            // sans ça, en mode light la transition flasherait en clair.
            !openedGroup!.bgUrl && { borderWidth: 1, borderColor: darkColors.cardBorder },
            overlayAnimStyle as any,
          ]}
          pointerEvents="none"
        >
          <MorphCard bgUrl={openedGroup!.bgUrl} bg={darkColors.card} />
        </Animated.View>
      )}

      {/* Liste (header + slider) — s'efface façon reveal pendant l'agrandissement */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { paddingTop: insets.top }, listLayerStyle]}
        pointerEvents={phase === "list" ? "auto" : "none"}
      >
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
          <GroupsSlider
            cards={cards}
            revealDate={revealDate}
            onSelect={openGroup}
            showActiveBorder={phase === "list"}
            morph={morph}
            morphingId={(phase === "opening" || phase === "closingGrow") ? viewingGroupId : null}
          />
        </View>
      </Animated.View>

      {/* Single du groupe — montée en continu (mesure du fond), visible une fois la card agrandie.
          Swap de visibilité instantané (pas d'opacité animée) → aucun crossfade ; son contenu
          entre/sort façon reveal via introTrigger/outroTrigger. Retour par chevron/menu only. */}
      {groupViewMounted && openedGroup && (
        <View
          style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.bg, opacity: groupRoomVisible ? 1 : 0 }]}
          pointerEvents={phase === "single" ? "auto" : "none"}
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
            onCardFrame={handleSingleCardFrame}
            onLottieFrame={onLottieFrame}
            onDebugNamePress={onDebugNamePress}
            introTrigger={introKey}
            outroTrigger={outroKey}
            startHidden={phase === "opening"}
          />
        </View>
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
