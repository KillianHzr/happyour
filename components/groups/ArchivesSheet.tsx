import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated, Dimensions, Easing, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, Easing as REasing } from "react-native-reanimated";
import { Image } from "expo-image";
import { BlurView as NativeBlurView } from "@sbaiahmed1/react-native-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { spacing, radii, stroke, textStyles, typography, buildColors, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { supabase } from "../../lib/supabase";
import { r2Storage } from "../../lib/r2";
import Icon from "../Icon";
import EdgeSwipeBack from "../EdgeSwipeBack";
import BottomSheet from "../BottomSheet";
import StickerGraphic from "../atoms/StickerGraphic";
import ArchiveRevealView, { type ArchiveRevealMeta } from "./ArchiveRevealView";
import RandomMomentView from "./RandomMomentView";
import ArchivesCalendar from "./ArchivesCalendar";
import { GRADIENT_ORANGE } from "../../lib/assets";
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

// Couleurs fixes "sombres" des cartes d'archive (texte en -fix → toujours sur fond sombre).
const darkColors = buildColors("Dark");

/** Prochaine date de reveal (> maintenant), jour/heure configurés. */
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

/** Vrai si l'image_path est une vraie photo (comme dans la liste des groupes). */
function isPhotoPath(path: string): boolean {
  return path !== "text_mode" && !path.endsWith(".mp4") && !path.endsWith(".m4a") && !path.includes("_draw");
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const ddMM = (d: Date) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;

type RevealStatus = "current" | "available" | "locked";
type Reveal = { number: number; start: Date; end: Date; status: RevealStatus; bgUrl: string | null; empty: boolean };
type MonthGroup = { key: string; year: number; month: number; label: string; reveals: Reveal[] };

type Member = { user_id: string; username: string; avatar_url?: string | null };

type Props = {
  visible: boolean;
  onClose: () => void;
  groupId?: string;
  revealConfig: { day: number; hour: number };
  groupName?: string;
  members?: Member[];
  currentUserId?: string;
  currentUsername?: string;
  currentUserAvatarUrl?: string | null;
};

export default function ArchivesSheet({
  visible, onClose, groupId, revealConfig, groupName, members = [],
  currentUserId, currentUsername, currentUserAvatarUrl,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  const [mounted, setMounted] = useState(visible);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);
  const [archiveReveal, setArchiveReveal] = useState<ArchiveRevealMeta | null>(null);
  const [showRandom, setShowRandom] = useState(false);
  const sheetAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  const [reveals, setReveals] = useState<Reveal[]>([]);

  // ── Calendrier / sélection de période ──
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selStart, setSelStart] = useState<Date | null>(null);
  const [selEnd, setSelEnd] = useState<Date | null>(null);

  // Bornes : pas plus ancien que le premier reveal ; pas plus récent qu'aujourd'hui.
  const minDate = useMemo(() => {
    const oldest = reveals[reveals.length - 1];
    const d = oldest ? oldest.start : new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, [reveals]);
  const maxDate = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, [reveals]);

  // Reveals filtrés par la sélection (un seul jour → le reveal qui le contient).
  const filteredReveals = useMemo(() => {
    if (!selStart) return reveals;
    const rangeStart = new Date(selStart.getFullYear(), selStart.getMonth(), selStart.getDate(), 0, 0, 0, 0).getTime();
    const endRef = selEnd ?? selStart;
    const rangeEnd = new Date(endRef.getFullYear(), endRef.getMonth(), endRef.getDate(), 23, 59, 59, 999).getTime();
    return reveals.filter((r) => r.start.getTime() < rangeEnd && r.end.getTime() > rangeStart);
  }, [reveals, selStart, selEnd]);

  // Moment aléatoire : on ne pioche QUE dans les anciens reveals (déjà passés). Le reveal
  // "en cours" (non encore révélé) est exclu → borne = début de ce reveal courant.
  const accessibleBefore = useMemo(() => {
    const current = reveals.find((r) => r.status === "current");
    return current ? current.start.getTime() : Date.now();
  }, [reveals]);
  // Y a-t-il au moins un ancien reveal contenant des moments ? (sinon : premier reveal en
  // cours → pas d'archives → bouton "Moment aléatoire" masqué).
  const hasArchivedMoments = useMemo(
    () => reveals.some((r) => r.status !== "current" && !r.empty),
    [reveals]
  );

  // Clic sur une archive : disponible → ouvre le reveal archivé ; ancienne → premium ; en cours → rien.
  const handleRevealPress = (r: Reveal) => {
    if (r.status === "available") {
      if (r.empty) { setShowEmpty(true); return; }
      setArchiveReveal({
        number: r.number,
        start: r.start,
        end: r.end,
        numberLabel: `Reveal ${pad2(r.number)}`,
        dateLabel: `${ddMM(r.start)} - ${ddMM(new Date(r.end.getTime() - DAY_MS))}`,
      });
    } else if (r.status === "locked") {
      setShowComingSoon(true);
    }
  };

  // ── Slide in / out ──
  useEffect(() => {
    if (visible) {
      setMounted(true);
      sheetAnim.setValue(SCREEN_WIDTH);
      requestAnimationFrame(() => {
        Animated.timing(sheetAnim, {
          toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }).start();
      });
    } else if (mounted) {
      Animated.timing(sheetAnim, {
        toValue: SCREEN_WIDTH, duration: 250, easing: Easing.in(Easing.quad), useNativeDriver: true,
      }).start(() => setMounted(false));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeImmediate = () => { setMounted(false); onClose(); };

  // ── Construction des reveals depuis la création du groupe ──
  useEffect(() => {
    if (!visible || !groupId) return;
    let cancelled = false;
    (async () => {
      const { data: g } = await supabase.from("groups").select("created_at").eq("id", groupId).single();
      const createdAt = g?.created_at ? new Date(g.created_at) : new Date();
      const nextReveal = computeNextRevealDate(revealConfig.day, revealConfig.hour);
      // Pendant les 24h qui suivent le reveal, le reveal "en cours" reste celui qu'on est
      // en train de révéler : on n'avance pas vers la nouvelle semaine de collecte avant
      // la fin de la fenêtre (cohérent avec le reste de l'app).
      const justRevealed = new Date(nextReveal.getTime() - WEEK_MS);
      const inRevealWindow = Date.now() - justRevealed.getTime() < DAY_MS;
      const topEnd = inRevealWindow ? justRevealed : nextReveal;

      // Tous les reveals (du plus récent au plus ancien) dont la fenêtre touche l'après-création.
      const list: Reveal[] = [];
      let end = new Date(topEnd);
      while (end.getTime() > createdAt.getTime()) {
        const start = new Date(end.getTime() - WEEK_MS);
        list.push({ number: 0, start, end: new Date(end), status: "locked", bgUrl: null, empty: true });
        end = new Date(end.getTime() - WEEK_MS);
      }
      const total = list.length;
      list.forEach((r, i) => {
        r.number = total - i;                         // le plus ancien = Reveal 01
        r.status = i === 0 ? "current" : i === 1 ? "available" : "locked";
      });

      // Fond de chaque reveal (sauf l'en-cours) : dernière vraie PHOTO de sa fenêtre.
      const { data: allPhotos } = await supabase
        .from("photos")
        .select("image_path, created_at")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });   // plus récent d'abord
      const allRows = allPhotos ?? [];
      const photoRows = allRows.filter((p: any) => isPhotoPath(p.image_path));
      for (const r of list) {
        // Vide = aucun moment (tous types) dans la fenêtre du reveal.
        r.empty = !allRows.some((p: any) => {
          const t = new Date(p.created_at).getTime();
          return t >= r.start.getTime() && t < r.end.getTime();
        });
        if (r.status === "current") { r.bgUrl = null; continue; }
        const last = photoRows.find((p: any) => {
          const t = new Date(p.created_at).getTime();
          return t >= r.start.getTime() && t < r.end.getTime();
        });
        r.bgUrl = last ? r2Storage.getPublicUrl(last.image_path) : null;
      }

      if (!cancelled) setReveals(list);
    })();
    return () => { cancelled = true; };
  }, [visible, groupId, revealConfig.day, revealConfig.hour]);

  // ── Regroupement par mois (du plus récent au plus ancien) ──
  const groups = useMemo<MonthGroup[]>(() => {
    const out: MonthGroup[] = [];
    for (const r of filteredReveals) {
      const y = r.start.getFullYear();
      const m = r.start.getMonth();
      const key = `${y}-${m}`;
      let grp = out.find((x) => x.key === key);
      if (!grp) { grp = { key, year: y, month: m, label: MONTHS[m], reveals: [] }; out.push(grp); }
      grp.reveals.push(r);
    }
    return out;
  }, [filteredReveals]);

  if (!mounted) return null;

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFillObject, { transform: [{ translateX: sheetAnim }] }]}>
          <EdgeSwipeBack
            style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.bg, paddingTop: insets.top }]}
            onBack={closeImmediate}
          >
            {/* ── Header ── */}
            <View style={styles.header}>
              <View style={styles.headerLeading}>
                <TouchableOpacity style={styles.backBtn} onPress={onClose} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Icon name="chevron-left" size={20} color={colors.icon} />
                </TouchableOpacity>
                <Text style={styles.title}>Archives</Text>
              </View>
              <TouchableOpacity style={styles.calendarBtn} onPress={() => setCalendarOpen((o) => !o)} activeOpacity={0.8}>
                <Icon name="calendar" size={20} color={colors.iconNeutral} />
                {selStart && <View style={styles.calBadge} />}
              </TouchableOpacity>
            </View>

            {/* ── Contenu ── */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
              showsVerticalScrollIndicator={false}
            >
              {/* Section : bandeau premium */}
              <View style={styles.section}>
                <TouchableOpacity style={styles.archiveReveal} activeOpacity={0.85} onPress={() => setShowComingSoon(true)}>
                  <Image source={GRADIENT_ORANGE} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={0} priority="high" />
                  <View style={styles.buttonContent}>
                    <View style={styles.titleRow}>
                      <Text style={styles.premiumText}>Premium</Text>
                      <View style={styles.keyBtn}>
                        <Icon name="key" size={16} color={colors.iconFix} />
                      </View>
                    </View>
                    <Text style={styles.unlockText}>Déverrouille toutes les archives du Reveal</Text>
                  </View>
                  <View style={styles.chevronBtn}>
                    <Icon name="chevron-right" size={20} color={colors.iconFix} />
                  </View>
                </TouchableOpacity>
              </View>

              {/* Sections : accordéons par mois */}
              {groups.map((grp, i) => {
                const showYearSep = i > 0 && grp.year !== groups[i - 1].year;
                return (
                  <Fragment key={grp.key}>
                    {showYearSep && <YearSeparator year={grp.year} styles={styles} />}
                    <MonthAccordion
                      group={grp}
                      defaultOpen={i === 0}
                      styles={styles}
                      iconColor={colors.icon}
                      iconBrandColor={colors.iconBrandOnBrand}
                      onRevealPress={handleRevealPress}
                    />
                  </Fragment>
                );
              })}
            </ScrollView>

            {/* ── Bouton fixe "Moment aléatoire" (35px au-dessus du bas) ──
                Masqué tant qu'il n'y a aucun ancien reveal avec des moments (ex: premier
                reveal en cours) : on ne propose pas de piocher dans du contenu verrouillé. */}
            {hasArchivedMoments && (
              <View style={styles.randomBtnWrap} pointerEvents="box-none">
                <TouchableOpacity style={styles.randomBtn} onPress={() => setShowRandom(true)} activeOpacity={0.85}>
                  <Text style={styles.randomBtnText}>Moment aléatoire</Text>
                  <Icon name="shuffle" size={20} color={colors.icon} />
                </TouchableOpacity>
              </View>
            )}

            {/* ── Modal : abonnement premium (bientôt disponible) ── */}
            <BottomSheet visible={showComingSoon} onClose={() => setShowComingSoon(false)}>
              <View style={styles.comingContent}>
                <View style={styles.comingTextBlock}>
                  <Text style={styles.comingTitle}>Bientôt disponible !</Text>
                  <Text style={styles.comingSubtitle}>
                    L'accès aux archives du Reveal arrivera avec l'abonnement Premium. Tu sera notifié dès son lancement.
                  </Text>
                </View>
                <TouchableOpacity style={styles.comingBtn} onPress={() => setShowComingSoon(false)} activeOpacity={0.8}>
                  <Text style={styles.comingBtnText}>OK, j'attends !</Text>
                </TouchableOpacity>
              </View>
            </BottomSheet>

            {/* ── Modal : reveal passé vide ── */}
            <BottomSheet visible={showEmpty} onClose={() => setShowEmpty(false)}>
              <View style={styles.comingContent}>
                <View style={styles.comingTextBlock}>
                  <Text style={styles.comingTitle}>Ce reveal est vide...</Text>
                  <Text style={styles.comingSubtitle}>
                    Malheureusement aucun moment n'a été partagé dans ce reveal. Choisis-en un autre pour te remémorer de bons souvenirs !
                  </Text>
                </View>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowEmpty(false)} activeOpacity={0.8}>
                  <Text style={styles.emptyBtnText}>Retourner à la liste</Text>
                </TouchableOpacity>
              </View>
            </BottomSheet>
          </EdgeSwipeBack>

          {/* ── Calendrier (popover sous le bouton, aligné à droite, 8px) ── */}
          {calendarOpen && (
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setCalendarOpen(false)} />
              <View style={[styles.calPopoverAnchor, { top: insets.top + spacing.lg + 40 + spacing.sm, right: spacing.lg }]}>
                <ArchivesCalendar
                  minDate={minDate}
                  maxDate={maxDate}
                  selStart={selStart}
                  selEnd={selEnd}
                  onChange={(s, e) => { setSelStart(s); setSelEnd(e); }}
                />
              </View>
            </View>
          )}
        </Animated.View>
      </GestureHandlerRootView>

      {/* ── Reveal archivé (read-only) ── */}
      <ArchiveRevealView
        visible={!!archiveReveal}
        onClose={() => setArchiveReveal(null)}
        groupId={groupId ?? ""}
        members={members}
        currentUserId={currentUserId}
        currentUsername={currentUsername}
        currentUserAvatarUrl={currentUserAvatarUrl}
        groupName={groupName}
        reveal={archiveReveal}
      />

      {/* ── Moment aléatoire (read-only, focus un seul moment) ── */}
      <RandomMomentView
        visible={showRandom}
        onClose={() => setShowRandom(false)}
        groupId={groupId ?? ""}
        accessibleBefore={accessibleBefore}
        members={members}
        currentUserId={currentUserId}
        currentUsername={currentUsername}
        currentUserAvatarUrl={currentUserAvatarUrl}
        groupName={groupName}
      />
    </Modal>
  );
}

// ─── Séparateur d'année ────────────────────────────────────────────────────────
function YearSeparator({ year, styles }: { year: number; styles: any }) {
  return (
    <View style={styles.yearSep}>
      <View style={styles.yearLine} />
      <Text style={styles.yearText}>{year}</Text>
      <View style={styles.yearLine} />
    </View>
  );
}

// ─── Accordéon d'un mois ───────────────────────────────────────────────────────
function MonthAccordion({
  group, defaultOpen, styles, iconColor, iconBrandColor, onRevealPress,
}: { group: MonthGroup; defaultOpen: boolean; styles: any; iconColor: string; iconBrandColor: string; onRevealPress: (r: Reveal) => void }) {
  const [open, setOpen] = useState(defaultOpen);
  const [contentHeight, setContentHeight] = useState(0);
  const progress = useSharedValue(defaultOpen ? 1 : 0);
  const allLocked = group.reveals.every((r) => r.status === "locked");

  const toggle = () => {
    const next = open ? 0 : 1;
    setOpen(!open);
    progress.value = withTiming(next, { duration: 340, easing: REasing.bezier(0.22, 1, 0.36, 1) });
  };

  // Le contenu (mesuré) est en position absolue → toujours dimensionné naturellement,
  // donc onLayout fiable même replié. La hauteur du clip est toujours explicite.
  const clipStyle = useAnimatedStyle(() => ({
    height: contentHeight * progress.value,
    opacity: progress.value,
  }));
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${progress.value * 90}deg` }] }));

  return (
    <View style={styles.accordionSection}>
      <TouchableOpacity style={styles.accordionHeader} onPress={toggle} activeOpacity={0.7}>
        <View style={styles.accordionTitleRow}>
          <Text style={styles.accordionTitle}>{group.label}</Text>
          {allLocked && (
            <View style={styles.monthLockBadge}>
              <Icon name="lock-border" size={16} color={iconBrandColor} />
            </View>
          )}
        </View>
        <Reanimated.View style={chevronStyle}>
          <Icon name="chevron-right" size={20} color={iconColor} />
        </Reanimated.View>
      </TouchableOpacity>
      <Reanimated.View style={[styles.accordeonClip, clipStyle]}>
        <View
          style={styles.accordeonMeasure}
          onLayout={(e) => { const h = e.nativeEvent.layout.height; if (h > 0 && h !== contentHeight) setContentHeight(h); }}
        >
          {group.reveals.map((r) => (
            <ArchiveRevealItem key={r.number} reveal={r} styles={styles} onPress={onRevealPress} />
          ))}
        </View>
      </Reanimated.View>
    </View>
  );
}

// ─── Une archive de reveal ─────────────────────────────────────────────────────
function ArchiveRevealItem({ reveal, styles, onPress }: { reveal: Reveal; styles: any; onPress: (r: Reveal) => void }) {
  const isCurrent = reveal.status === "current";
  const isLocked = reveal.status === "locked";
  // Tous les reveals sauf l'en-cours affichent leur dernière photo en fond.
  const showPhoto = !isCurrent && !!reveal.bgUrl;

  return (
    <TouchableOpacity
      style={[
        styles.archiveItem,
        isLocked && { opacity: 0.3 },
        // Autres reveals : stroke/025 border/default/tertiary.
        !isCurrent && { borderWidth: stroke.sm, borderColor: darkColors.borderTertiary },
        // Stroke/050 border/default/secondary sur le reveal en cours.
        isCurrent && { borderWidth: stroke.md, borderColor: darkColors.borderSecondary },
      ]}
      // Le reveal en cours n'est pas cliquable → pas d'effet d'appui.
      activeOpacity={isCurrent ? 1 : 0.85}
      disabled={isCurrent}
      onPress={() => onPress(reveal)}
    >
      {/* Fond */}
      {showPhoto ? (
        <>
          <Image
            source={{ uri: reveal.bgUrl! }}
            style={StyleSheet.absoluteFillObject as any}
            contentFit="cover"
            transition={0}
            cachePolicy="memory-disk"
            blurRadius={Platform.OS === "android" ? 20 : 0}
          />
          {Platform.OS === "ios" && <NativeBlurView style={StyleSheet.absoluteFillObject} blurType="dark" blurAmount={30} />}
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(8,8,10,0.5)" }]} pointerEvents="none" />
        </>
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: darkColors.bg }]} />
      )}

      {/* Infos */}
      <View style={styles.infos}>
        <View style={styles.revealTitleRow}>
          <Text style={styles.revealNumber}>Reveal {pad2(reveal.number)}</Text>
          {(isCurrent || isLocked) && (
            <View style={[styles.statusBadge, { backgroundColor: isCurrent ? darkColors.card : darkColors.brand }]}>
              {isCurrent
                ? <Icon name="loader" size={16} color={darkColors.icon} />
                : <Icon name="lock-border" size={16} color={darkColors.iconBrandOnBrand} />}
            </View>
          )}
        </View>
        <Text style={styles.revealDates}>
          {isCurrent ? "En cours" : `${ddMM(reveal.start)} - ${ddMM(new Date(reveal.end.getTime() - DAY_MS))}`}
        </Text>
      </View>

      {/* Sticker */}
      <StickerGraphic width={102.4} color={darkColors.icon} />
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  // ── Header ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xl,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    minHeight: 40,
  },
  headerLeading: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    ...textStyles.subtitleStrong,
    color: colors.text,
  },
  calendarBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.card,
  },
  calPopoverAnchor: {
    position: "absolute",
    width: Math.min(340, SCREEN_WIDTH - spacing.lg * 2),
  },
  // ── Bouton "Moment aléatoire" (fixe, 35px du bas, centré) ──
  randomBtnWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 35,
    alignItems: "center",
  },
  randomBtn: {
    flexDirection: "row",
    padding: spacing.md,           // space/300
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,               // space/200
    borderRadius: radii.md,        // radius/300
    backgroundColor: colors.bgNeutralTertiary,
  },
  randomBtnText: {
    ...textStyles.singleLineBodyBaseStrong,
    color: colors.text,
  },
  calBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.brand,
  },

  // ── Contenu ──
  content: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.lg,                // space/400
    marginHorizontal: spacing.lg,
    marginTop: spacing.xxl,
  },
  section: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.md,
    alignSelf: "stretch",
  },

  // ── Bandeau premium ──
  archiveReveal: {
    flexDirection: "row",
    padding: spacing.lg,
    justifyContent: "center",
    alignItems: "center",
    gap: 0,
    alignSelf: "stretch",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderBrandSecondary,
    overflow: "hidden",
  },
  buttonContent: {
    flex: 1,
    flexDirection: "column",
    alignItems: "flex-start",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "stretch",
  },
  premiumText: {
    ...textStyles.heading,
    color: colors.textFix,
  },
  keyBtn: {
    width: 24,
    height: 24,
    padding: 0,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 6,
    backgroundColor: colors.opacityLight,
  },
  unlockText: {
    ...textStyles.bodySmall,
    color: colors.textFix,
  },
  chevronBtn: {
    width: 40,
    height: 40,
    padding: 0,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    flexShrink: 0,
  },

  // ── Accordéon mois ──
  accordionSection: {
    flexDirection: "column",
    alignItems: "flex-start",
    alignSelf: "stretch",
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
    paddingVertical: spacing.xs,
  },
  accordionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs2,
  },
  accordionTitle: {
    ...textStyles.bodyBase,
    color: colors.text,
  },
  monthLockBadge: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 6,
    backgroundColor: colors.brand,
  },
  accordeonClip: {
    alignSelf: "stretch",
    overflow: "hidden",
  },
  // Contenu mesuré en position absolue (toujours dimensionné naturellement, largeur pleine)
  accordeonMeasure: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.md,               // space/300
    paddingTop: spacing.md,        // espace header → contenu (collapse avec l'accordéon)
  },

  // ── Séparateur d'année ──
  yearSep: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    alignSelf: "stretch",
  },
  yearLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.cardBorder,
  },
  yearText: {
    ...textStyles.bodySmallStrong,
    color: colors.textSecondary,
  },

  // ── Archive reveal item ──
  archiveItem: {
    flexDirection: "row",
    padding: spacing.lg,
    justifyContent: "space-between",
    alignItems: "center",
    alignSelf: "stretch",
    borderRadius: radii.md,
    overflow: "hidden",
  },
  infos: {
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: 0,
  },
  revealTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,               // 12px à droite du "Reveal XX"
  },
  revealNumber: {
    ...textStyles.heading,
    color: colors.textFix,
  },
  statusBadge: {
    width: 24,
    height: 24,
    padding: 0,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 6,
  },
  revealDates: {
    ...textStyles.bodySmall,
    color: darkColors.textSecondary,
  },

  // ── Modal "bientôt disponible" ──
  comingContent: {
    flexDirection: "column",
    gap: spacing.xl3,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  comingTextBlock: {
    flexDirection: "column",
    alignItems: "center",
    gap: spacing.sm,
  },
  comingIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    justifyContent: "center",
    alignItems: "center",
  },
  comingTitle: {
    ...textStyles.subtitleStrong,
    color: colors.text,
    textAlign: "center",
  },
  comingSubtitle: {
    ...textStyles.bodyBase,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  comingBtn: {
    alignSelf: "stretch",
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.brand,
    justifyContent: "center",
    alignItems: "center",
  },
  comingBtnText: {
    ...textStyles.singleLineSubheadingStrong,
    lineHeight: typography.size.xl + 4,
    color: colors.textBrandOnBrand,
  },

  // ── Modal "reveal vide" ──
  emptyBtn: {
    alignSelf: "stretch",
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.bgNeutralTertiary, // background/neutral/tertiary
    justifyContent: "center",
    alignItems: "center",
  },
  emptyBtnText: {
    ...textStyles.singleLineSubheadingStrong,
    lineHeight: typography.size.xl + 4,
    color: colors.textNeutral, // text/neutral/default
  },
});
