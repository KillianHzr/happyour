import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated, Dimensions, Easing, LayoutAnimation, Modal, Platform, ScrollView,
  StyleSheet, Text, TouchableOpacity, UIManager, View,
} from "react-native";
import { Image } from "expo-image";
import { BlurView as NativeBlurView } from "@sbaiahmed1/react-native-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { spacing, radii, textStyles, typography, buildColors, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { supabase } from "../../lib/supabase";
import { r2Storage } from "../../lib/r2";
import Icon from "../Icon";
import EdgeSwipeBack from "../EdgeSwipeBack";
import BottomSheet from "../BottomSheet";
import StickerGraphic from "../atoms/StickerGraphic";
import ArchiveRevealView, { type ArchiveRevealMeta } from "./ArchiveRevealView";
import { GRADIENT_ORANGE } from "../../lib/assets";
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
type Reveal = { number: number; start: Date; end: Date; status: RevealStatus };
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
  const [archiveReveal, setArchiveReveal] = useState<ArchiveRevealMeta | null>(null);
  const sheetAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  const [reveals, setReveals] = useState<Reveal[]>([]);
  const [availableBgUrl, setAvailableBgUrl] = useState<string | null>(null);

  // Clic sur une archive : disponible → ouvre le reveal archivé ; ancienne → premium ; en cours → rien.
  const handleRevealPress = (r: Reveal) => {
    if (r.status === "available") {
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

      // Tous les reveals (du plus récent au plus ancien) dont la fenêtre touche l'après-création.
      const list: Reveal[] = [];
      let end = nextReveal;
      while (end.getTime() > createdAt.getTime()) {
        const start = new Date(end.getTime() - WEEK_MS);
        list.push({ number: 0, start, end: new Date(end), status: "locked" });
        end = new Date(end.getTime() - WEEK_MS);
      }
      const total = list.length;
      list.forEach((r, i) => {
        r.number = total - i;                         // le plus ancien = Reveal 01
        r.status = i === 0 ? "current" : i === 1 ? "available" : "locked";
      });

      // Fond du reveal disponible : dernière photo postée dans sa fenêtre.
      let bg: string | null = null;
      const avail = list[1];
      if (avail) {
        const { data } = await supabase
          .from("photos")
          .select("image_path, created_at")
          .eq("group_id", groupId)
          .gte("created_at", avail.start.toISOString())
          .lt("created_at", avail.end.toISOString())
          .order("created_at", { ascending: false });
        const lastPhoto = (data ?? []).find((p: any) => isPhotoPath(p.image_path));
        bg = lastPhoto ? r2Storage.getPublicUrl(lastPhoto.image_path) : null;
      }

      if (!cancelled) { setReveals(list); setAvailableBgUrl(bg); }
    })();
    return () => { cancelled = true; };
  }, [visible, groupId, revealConfig.day, revealConfig.hour]);

  // ── Regroupement par mois (du plus récent au plus ancien) ──
  const groups = useMemo<MonthGroup[]>(() => {
    const out: MonthGroup[] = [];
    for (const r of reveals) {
      const y = r.start.getFullYear();
      const m = r.start.getMonth();
      const key = `${y}-${m}`;
      let grp = out.find((x) => x.key === key);
      if (!grp) { grp = { key, year: y, month: m, label: MONTHS[m], reveals: [] }; out.push(grp); }
      grp.reveals.push(r);
    }
    return out;
  }, [reveals]);

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
              <TouchableOpacity style={styles.calendarBtn} onPress={() => {}} activeOpacity={0.8}>
                <Icon name="calendar" size={20} color={colors.iconNeutral} />
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
                      availableBgUrl={availableBgUrl}
                      styles={styles}
                      iconColor={colors.icon}
                      onRevealPress={handleRevealPress}
                    />
                  </Fragment>
                );
              })}
            </ScrollView>

            {/* ── Modal : abonnement premium (bientôt disponible) ── */}
            <BottomSheet visible={showComingSoon} onClose={() => setShowComingSoon(false)}>
              <View style={styles.comingContent}>
                <View style={styles.comingTextBlock}>
                  <View style={[styles.comingIconWrap, { backgroundColor: colors.brandTertiary }]}>
                    <Icon name="key" size={28} color={colors.brand} />
                  </View>
                  <Text style={styles.comingTitle}>Bientôt disponible</Text>
                  <Text style={styles.comingSubtitle}>
                    L'accès Premium aux archives du Reveal arrivera avec l'abonnement. Tu seras notifié dès son lancement.
                  </Text>
                </View>
                <TouchableOpacity style={styles.comingBtn} onPress={() => setShowComingSoon(false)} activeOpacity={0.8}>
                  <Text style={styles.comingBtnText}>OK, j'attends !</Text>
                </TouchableOpacity>
              </View>
            </BottomSheet>
          </EdgeSwipeBack>
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
  group, defaultOpen, availableBgUrl, styles, iconColor, onRevealPress,
}: { group: MonthGroup; defaultOpen: boolean; availableBgUrl: string | null; styles: any; iconColor: string; onRevealPress: (r: Reveal) => void }) {
  const [open, setOpen] = useState(defaultOpen);
  const rot = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.create(260, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    Animated.timing(rot, { toValue: open ? 0 : 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    setOpen((o) => !o);
  };

  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] });

  return (
    <View style={styles.accordionSection}>
      <TouchableOpacity style={styles.accordionHeader} onPress={toggle} activeOpacity={0.7}>
        <Text style={styles.accordionTitle}>{group.label}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Icon name="chevron-right" size={20} color={iconColor} />
        </Animated.View>
      </TouchableOpacity>
      {open && (
        <View style={styles.accordeon}>
          {group.reveals.map((r) => (
            <ArchiveRevealItem key={r.number} reveal={r} availableBgUrl={availableBgUrl} styles={styles} onPress={onRevealPress} />
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Loader en rotation continue ("En cours") ─────────────────────────────────
function SpinningLoader({ color }: { color: string }) {
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(rot, { toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: true })
    );
    anim.start();
    return () => anim.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Icon name="loader" size={16} color={color} />
    </Animated.View>
  );
}

// ─── Une archive de reveal ─────────────────────────────────────────────────────
function ArchiveRevealItem({ reveal, availableBgUrl, styles, onPress }: { reveal: Reveal; availableBgUrl: string | null; styles: any; onPress: (r: Reveal) => void }) {
  const isCurrent = reveal.status === "current";
  const isAvailable = reveal.status === "available";
  const isLocked = reveal.status === "locked";
  const showPhoto = isAvailable && !!availableBgUrl;

  return (
    <TouchableOpacity
      style={[styles.archiveItem, isLocked && { opacity: 0.3 }]}
      activeOpacity={0.85}
      onPress={() => onPress(reveal)}
    >
      {/* Fond */}
      {showPhoto ? (
        <>
          <Image
            source={{ uri: availableBgUrl! }}
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
                ? <SpinningLoader color={darkColors.icon} />
                : <Icon name="lock" size={16} color={darkColors.iconBrand} />}
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
    gap: spacing.md,
    alignSelf: "stretch",
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
    paddingVertical: spacing.xs,
  },
  accordionTitle: {
    ...textStyles.bodyBase,
    color: colors.text,
  },
  accordeon: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.md,               // space/300
    alignSelf: "stretch",
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
});
