import { useState, useEffect, useRef, useMemo, memo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Platform, Animated, PanResponder,
} from "react-native";
import { Image } from "expo-image";
import { BlurView as NativeBlurView } from "@sbaiahmed1/react-native-blur";
import LottieView from "lottie-react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Extrapolation,
  Easing,
  runOnJS,
  type SharedValue,
} from "react-native-reanimated";
import { radii, spacing, stroke, textStyles, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles, ForceThemeMode } from "../../lib/theme-context";
import Shape, { type ShapeName } from "../Shape";
import Icon from "../Icon";
import { getRevealLottie } from "./revealLottie";
import type { GroupCard } from "./GroupsSlider";
import { hapticUnlockStart, hapticUnlockUpdate, hapticUnlockStop } from "../../lib/haptics";

const ReanimatedLottie = Reanimated.createAnimatedComponent(LottieView);

/** "Xj HH:MM:SS" — "0j" masqué s'il reste moins d'un jour (sauf si forcé). */
function formatCountdown(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${days}j ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

const RevealCountdown = memo(function RevealCountdown({ revealDate, textStyle }: { revealDate: Date; textStyle: any }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <Text style={textStyle}>{formatCountdown(revealDate.getTime() - now)}</Text>;
});

/** Slider de déverrouillage : le nob s'agrandit en largeur sous le doigt quand on le tire
 *  vers la droite, et déverrouille dès qu'il remplit le bouton — sans relâcher le doigt. */
function UnlockSlider({ onUnlock }: { onUnlock: () => void }) {
  const s = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const NOB_MIN = 66;
  const PAD = spacing.sm; // 8
  const widthAnim = useRef(new Animated.Value(NOB_MIN)).current;
  // maxWidth lue depuis une ref pour que le PanResponder (créé une seule fois)
  // utilise la largeur réelle mesurée au layout, et pas la valeur initiale (0).
  const maxWidthRef = useRef(NOB_MIN);
  const firedRef = useRef(false);

  // Sécurité : si le slider se démonte alors que le doigt est encore posé (release/terminate
  // non émis), on coupe le retour haptique continu pour ne pas le laisser tourner.
  useEffect(() => () => hapticUnlockStop(), []);

  // Progression 0→1 du nob (pour piloter l'intensité haptique).
  const progressFor = (w: number) => {
    const maxW = maxWidthRef.current;
    const span = Math.max(1, maxW - NOB_MIN);
    return Math.max(0, Math.min(1, (w - NOB_MIN) / span));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 2,
      onPanResponderGrant: () => {
        firedRef.current = false;
        // Démarre le retour haptique continu dès la prise du nob (intensité = progression).
        hapticUnlockStart(progressFor(NOB_MIN));
      },
      onPanResponderMove: (_e, g) => {
        if (firedRef.current) return;
        const maxW = maxWidthRef.current;
        const w = Math.min(maxW, Math.max(NOB_MIN, NOB_MIN + g.dx));
        // Déverrouille dès que le nob remplit la piste, sans attendre le relâchement.
        // On garde le nob plein, puis on le réinitialise après que le reveal ait
        // recouvert l'écran (≈ durée de son anim d'ouverture), pour ne pas voir le
        // retour à 0 avant que le reveal s'affiche.
        if (w >= maxW - 2) {
          firedRef.current = true;
          widthAnim.setValue(maxW);
          hapticUnlockStop(); // le déverrouillage joue sa propre vibration (hapticReveal)
          onUnlock();
          setTimeout(() => widthAnim.setValue(NOB_MIN), 800);
          return;
        }
        widthAnim.setValue(w);
        // Ajuste l'intensité en direct selon la progression (continue même doigt immobile).
        hapticUnlockUpdate(progressFor(w));
      },
      onPanResponderRelease: () => {
        hapticUnlockStop();
        if (firedRef.current) return; // reset géré par le timeout après l'ouverture du reveal
        Animated.spring(widthAnim, { toValue: NOB_MIN, useNativeDriver: false }).start();
      },
      onPanResponderTerminate: () => {
        hapticUnlockStop();
        if (firedRef.current) return;
        Animated.spring(widthAnim, { toValue: NOB_MIN, useNativeDriver: false }).start();
      },
    })
  ).current;

  return (
    <View
      style={s.unlockTrack}
      onLayout={(e) => { maxWidthRef.current = Math.max(NOB_MIN, e.nativeEvent.layout.width - PAD * 2); }}
    >
      {/* Texte derrière (le nob passe par-dessus quand il s'agrandit) */}
      <View style={s.unlockTextWrap} pointerEvents="none">
        <Text style={s.unlockText}>Déverrouiller</Text>
        <Icon name="arrow-right" size={16} color={colors.iconTertiary} />
      </View>
      <Animated.View style={[s.unlockNob, { width: widthAnim }]} {...pan.panHandlers} />
    </View>
  );
}

type Props = {
  card: GroupCard;
  revealDate: Date;
  unlocked: boolean;
  showBack: boolean;
  showAddButton: boolean;
  topInset: number;
  onBack: () => void;
  onAddGroup: () => void;
  onSettings: () => void;
  onArchive: () => void;
  onCapture: () => void;
  /** Clic sur l'encart "Défi @… " → ouvre la capture de ce défi. */
  onOpenChallenge?: () => void;
  onUnlock: () => void;
  /** Appelé dès le slide (début de la transition reveal) → sortie du menu/header parent. */
  onRevealStart?: () => void;
  /** Frame de la card (coords fenêtre) — point de départ de la transition reveal. */
  onCardFrame?: (frame: { x: number; y: number; width: number; height: number }) => void;
  /** Frame du Lottie (coords fenêtre) — pour le re-rendre AU-DESSUS de la transition. */
  onLottieFrame?: (frame: { x: number; y: number; width: number; height: number }) => void;
  onDebugNamePress?: () => void;
};

export default function GroupRoom(props: Props) {
  const { colors } = useTheme();
  const headerStyles = useThemedStyles(makeHeaderStyles);
  const { card, showBack, showAddButton, topInset, onBack, onAddGroup, onSettings, onArchive, onDebugNamePress, onRevealStart, onUnlock } = props;

  // ── État de la transition reveal (partagé carte + header) ──
  const reveal = useMemo(
    () => getRevealLottie(card.shape, card.momentCount),
    [card.shape, card.momentCount]
  );
  const revealProgress = useSharedValue(reveal.freezeProgress);
  const exit = useSharedValue(0); // 0 = repos, 1 = chrome disparu
  const animatingRef = useRef(false);
  const lottieProps = useAnimatedProps(() => ({ progress: revealProgress.value }));

  // Fondu du Lottie sur ses ~0,2s finales (sinon il disparaît d'un coup).
  const lottieFadeStart = reveal.endProgress - (reveal.endProgress - reveal.freezeProgress) * 200 / reveal.durationMs;
  const lottieOpacityStyle = useAnimatedStyle(() => ({
    opacity: interpolate(revealProgress.value, [lottieFadeStart, reveal.endProgress], [1, 0], Extrapolation.CLAMP),
  }));

  // Recale la frame figée si le Lottie change (type/nombre de moments).
  useEffect(() => {
    if (!animatingRef.current) revealProgress.value = reveal.freezeProgress;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal]);

  // Fin de l'aspiration du chrome (1,7s) → ouvre la transition reveal (l'overlay fait
  // grandir la card plein écran puis défile), puis réarme tout sous le reveal (invisible).
  const finishReveal = () => {
    onUnlock();
    setTimeout(() => {
      revealProgress.value = reveal.freezeProgress;
      exit.value = 0;
      animatingRef.current = false;
    }, 600);
  };

  // Slide → Lottie (1s→fin) + sortie du chrome (0,7s) + menu, puis ouverture du reveal.
  const startReveal = () => {
    if (animatingRef.current) return;
    animatingRef.current = true;
    onRevealStart?.();
    revealProgress.value = withTiming(reveal.endProgress, { duration: reveal.durationMs, easing: Easing.linear });
    exit.value = withTiming(1, { duration: 700, easing: Easing.bezier(0.7, 0, 0.84, 0) }, (finExit) => {
      if (finExit) runOnJS(finishReveal)();
    });
  };

  // Header : nom (+ retour) part à gauche, boutons à droite. Déplacement court +
  // fondu accéléré (transparent dès ~exit 0,55) → plus discret que le chrome de la carte.
  const leftExitStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - exit.value * 1.8), transform: [{ translateX: -exit.value * 60 }] }));
  const rightExitStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - exit.value * 1.8), transform: [{ translateX: exit.value * 60 }] }));

  return (
    <View style={[headerStyles.container, { paddingTop: topInset }]}>
      {/* Header (thème app) */}
      <View style={headerStyles.header}>
        <View style={headerStyles.headerRow}>
          <Reanimated.View style={[headerStyles.headerLeft, leftExitStyle]}>
            {showBack && (
              <TouchableOpacity style={headerStyles.iconBtn} onPress={onBack} activeOpacity={0.7}>
                <Icon name="chevron-left" size={20} color={colors.icon} />
              </TouchableOpacity>
            )}
            {onDebugNamePress ? (
              <TouchableOpacity style={{ flexShrink: 1 }} onPress={onDebugNamePress} activeOpacity={0.6} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={headerStyles.title} numberOfLines={1} ellipsizeMode="tail">{card.name}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={headerStyles.title} numberOfLines={1} ellipsizeMode="tail">{card.name}</Text>
            )}
          </Reanimated.View>
          <Reanimated.View style={[headerStyles.headerActions, rightExitStyle]}>
            <TouchableOpacity style={headerStyles.addBtn} onPress={onArchive} activeOpacity={0.8}>
              <Icon name="archive" size={20} color={colors.iconNeutral} />
            </TouchableOpacity>
            <TouchableOpacity style={headerStyles.addBtn} onPress={onSettings} activeOpacity={0.8}>
              <Icon name="settings" size={20} color={colors.iconNeutral} />
            </TouchableOpacity>
            {showAddButton && (
              <TouchableOpacity style={headerStyles.addBtn} onPress={onAddGroup} activeOpacity={0.8}>
                <Icon name="plus" size={20} color={colors.iconNeutral} />
              </TouchableOpacity>
            )}
          </Reanimated.View>
        </View>
      </View>

      {/* Carte plein écran (forcée sombre) */}
      <View style={headerStyles.cardWrap}>
        <ForceThemeMode mode="Dark">
          <RoomCard {...props} lottieProps={lottieProps} lottieOpacityStyle={lottieOpacityStyle} exit={exit} startReveal={startReveal} lottieSource={reveal.source} />
        </ForceThemeMode>
      </View>
    </View>
  );
}

type RoomCardProps = Props & {
  lottieProps: any;
  lottieOpacityStyle: any;
  lottieSource: any;
  exit: SharedValue<number>;
  startReveal: () => void;
  onCardFrame?: (frame: { x: number; y: number; width: number; height: number }) => void;
  onLottieFrame?: (frame: { x: number; y: number; width: number; height: number }) => void;
};

function RoomCard({ card, revealDate, unlocked, onCapture, onOpenChallenge, lottieProps, lottieOpacityStyle, lottieSource, exit, startReveal, onCardFrame, onLottieFrame }: RoomCardProps) {
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const hasMoments = card.momentCount > 0;
  const postedThisWeek = card.postedThisWeek ?? false;
  const cardRef = useRef<View>(null);
  const lottieRef = useRef<any>(null);
  // Frames (coords fenêtre) → départ du grow de l'overlay + repositionnement du Lottie au-dessus.
  const measureCard = () => {
    requestAnimationFrame(() => {
      cardRef.current?.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) onCardFrame?.({ x, y, width, height });
      });
      lottieRef.current?.measureInWindow?.((x: number, y: number, width: number, height: number) => {
        if (width > 0 && height > 0) onLottieFrame?.({ x, y, width, height });
      });
    });
  };

  // Sorties du chrome de la carte pendant la transition reveal (exit 0→1).
  const topExitStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.value, transform: [{ translateY: exit.value * 48 }] }));   // couronne/défi ↓
  const countExitStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.value, transform: [{ translateY: -exit.value * 48 }] })); // nb moments ↑
  const bottomExitStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.value, transform: [{ translateY: -exit.value * 80 }] })); // slider ↑

  return (
    <View ref={cardRef} style={s.card} onLayout={measureCard} collapsable={false}>
      {card.bgUrl ? (
        <>
          {/* Flou STATIQUE (blurRadius) + voile sombre — léger (pas de BlurView live) et
              identique au filmstrip → raccord card↔transition propre. */}
          <Image source={{ uri: card.bgUrl }} style={StyleSheet.absoluteFillObject as any} contentFit="cover" transition={0} cachePolicy="memory-disk" blurRadius={90} />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.45)" }]} pointerEvents="none" />
        </>
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.bg }]} />
      )}

      <View style={s.cardContent}>
        {/* ── Haut : no-capture (0 moment) ou top-infos (≥1 moment) ── */}
        {!hasMoments ? (
          <View style={s.noCapture}>
            <Text style={s.noCaptureText}>Partage ton premier moment !</Text>
            <TouchableOpacity style={s.captureBtn} activeOpacity={0.85} onPress={onCapture}>
              <Text style={s.captureBtnText}>Capturer un moment</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.topInfosMask}>
          <Reanimated.View style={[s.topInfos, topExitStyle]}>
            {!!card.challengeLabel && (
              <TouchableOpacity style={s.challengeBtn} activeOpacity={0.85} onPress={onOpenChallenge} disabled={!onOpenChallenge}>
                {Platform.OS === "ios"
                  ? <NativeBlurView style={StyleSheet.absoluteFillObject} blurType="dark" blurAmount={20} />
                  : null}
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.opacityLight }]} pointerEvents="none" />
                <Text style={s.challengeText}>Défi @{card.challengeLabel}</Text>
                {card.challengeShape && <Shape name={card.challengeShape} size={20} color={colors.icon} />}
              </TouchableOpacity>
            )}
            <View style={s.tagQueenKing}>
              <View style={s.avatar}>
                {card.crownAvatarUrl ? (
                  <Image source={{ uri: card.crownAvatarUrl }} style={s.avatarImg as any} contentFit="cover" />
                ) : (
                  <View style={[s.avatarImg, { backgroundColor: colors.card }]} />
                )}
                <View style={s.crownWrap} pointerEvents="none">
                  <Icon name="crown" size={20} color={colors.icon} />
                </View>
              </View>
              <View style={s.queenKingTexts}>
                <Text style={s.queenKingName} numberOfLines={1} ellipsizeMode="tail">{card.crownUsername ?? "—"}</Text>
                <Text style={s.queenKingLabel}>Couronne</Text>
              </View>
            </View>
          </Reanimated.View>
          </View>
        )}

        {/* ── Bloc data : shape 136 + nombre de moments ── */}
        <View style={s.dataBlock}>
          {!card.loaded ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <>
              {hasMoments ? (
                <Reanimated.View ref={lottieRef} style={[s.lottieWrap, lottieOpacityStyle]} pointerEvents="none">
                  <ReanimatedLottie
                    source={lottieSource}
                    animatedProps={lottieProps}
                    autoPlay={false}
                    loop={false}
                    resizeMode="contain"
                    style={s.lottie}
                  />
                </Reanimated.View>
              ) : (
                <Icon name="circle-filled" size={136} color={colors.icon} />
              )}
              <View style={s.countMask}>
                <Reanimated.View style={[s.dataTextRow, countExitStyle]}>
                  <Text style={s.momentCount}>{card.momentCount}</Text>
                  <Text style={s.momentLabel}>Moments</Text>
                </Reanimated.View>
              </View>
            </>
          )}
        </View>

        {/* ── Bas : compte à rebours / slider de déverrouillage ── */}
        <View style={s.bottomMask}>
        <Reanimated.View style={[s.bottomBlock, bottomExitStyle]}>
          {!postedThisWeek && !unlocked && (
            <Text style={s.captureFirstText}>Capture un moment d'abord</Text>
          )}
          {postedThisWeek && !unlocked && (
            <Text style={s.captureFirstText}>Encore un peu de patience...</Text>
          )}
          {unlocked && hasMoments && (
            <Text style={s.captureFirstText}>Fin du suspens, accèdes à ton Reveal !</Text>
          )}
          {unlocked && !hasMoments && (
            <Text style={s.captureFirstText}>Zut, tu n’a rien posté...</Text>
          )}
          {unlocked ? (
            hasMoments ? (
              <UnlockSlider onUnlock={startReveal} />
            ) : (
              // Reveal atteint mais aucun moment → indisponible, cadenas (icon/neutral/default)
              <View style={s.countdown}>
                <Text style={s.countdownText}>Indisponible</Text>
                <Icon name="lock" size={24} color={colors.iconNeutral} />
              </View>
            )
          ) : (
            <View style={s.countdown}>
              <RevealCountdown revealDate={revealDate} textStyle={s.countdownText} />
              <Icon name="lock" size={24} color={colors.icon} />
            </View>
          )}
        </Reanimated.View>
        </View>
      </View>
    </View>
  );
}

const makeHeaderStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 40 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginLeft: "auto" },
  iconBtn: { width: 40, height: 40, borderRadius: radii.md, justifyContent: "center", alignItems: "center" },
  addBtn: { width: 40, height: 40, borderRadius: radii.md, justifyContent: "center", alignItems: "center", backgroundColor: colors.card },
  title: { ...textStyles.subtitleStrong, color: colors.text, lineHeight: undefined, fontSize: 32, flexShrink: 1 },
  cardWrap: { flex: 1, marginTop: spacing.xl, paddingHorizontal: spacing.lg, paddingBottom: 110 },
});

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { flex: 1, borderRadius: radii.xl, overflow: "hidden", backgroundColor: "#0A0A0A" },
  cardContent: {
    flex: 1, justifyContent: "space-between", alignItems: "center",
    paddingVertical: spacing.xl3, paddingHorizontal: spacing.xl,
  },
  // ── no-capture ──
  noCapture: { flexDirection: "column", alignItems: "center", gap: spacing.sm },
  noCaptureText: { ...textStyles.bodySmall, color: colors.textSecondary, lineHeight: undefined },
  captureBtn: {
    flexDirection: "row", padding: spacing.md, justifyContent: "center", alignItems: "center",
    gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.brand,
  },
  captureBtnText: { ...textStyles.singleLineBodyBaseStrong, color: "#FFFFFF" },
  // ── masques de sortie ("aspiré derrière un mur") : clippent le chrome de la carte
  //    pendant la transition reveal. paddingTop/marginTop sur topInfos pour ne pas
  //    rogner la couronne (qui dépasse en haut) au repos.
  // Masque de sortie (clippe le chrome pendant la transition reveal). Le padding/-margin (haut
  // ET côtés) crée une zone non-rognée pour la couronne, qui déborde de l'avatar (top:-13,
  // left:-9.5) → elle ne doit JAMAIS être croppée. alignSelf stretch : le masque prend toute la
  // largeur, donc la rangée (centrée) garde la couronne loin du bord même avec un pseudo long.
  topInfosMask: { alignSelf: "stretch", overflow: "hidden", paddingTop: 20, marginTop: -20, paddingHorizontal: 16, marginHorizontal: -16 },
  countMask: { overflow: "hidden" },
  bottomMask: { alignSelf: "stretch", overflow: "hidden" },
  // ── top-infos ──
  topInfos: { flexDirection: "column", alignItems: "center", gap: spacing.lg },
  challengeBtn: {
    flexDirection: "row", padding: spacing.sm, justifyContent: "center", alignItems: "center",
    gap: spacing.sm, borderRadius: radii.sm, overflow: "hidden",
  },
  challengeText: { ...textStyles.singleLineBodyBaseStrong, color: colors.text },
  tagQueenKing: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: spacing.sm, maxWidth: "100%" },
  avatar: {
    width: 48, height: 48, alignItems: "center", borderRadius: radii.md,
    borderWidth: stroke.md, borderColor: colors.icon, overflow: "visible",
  },
  avatarImg: { width: "100%", height: "100%", borderRadius: radii.md },
  crownWrap: { position: "absolute", left: -9.5, top: -13 },
  queenKingTexts: { flexDirection: "column", justifyContent: "center", alignItems: "flex-start", flexShrink: 1 },
  queenKingName: { ...textStyles.heading, color: colors.text, lineHeight: undefined },
  // gap: space/neg-100 entre le user et le label — via marginTop négatif car RN clampe le gap négatif à 0.
  queenKingLabel: { ...textStyles.bodySmall, color: colors.text, lineHeight: undefined, marginTop: spacing.negXs },
  // ── data block ──
  dataBlock: { alignSelf: "stretch", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: spacing.lg },
  // Lottie central : le canvas (402×874) est rendu plein-largeur via aspectRatio
  // (donc plus haut que la boîte) puis centré verticalement et clippé, pour montrer
  // la bande centrale où vit la shape. Joue au déverrouillage, le reveal recouvre ensuite.
  // height 180 = espace réservé dans le layout (taille de la pose au repos) ; pas
  // d'overflow:hidden → la vue Lottie (~plein écran) peut déborder pour l'envol final.
  lottieWrap: { width: "120%", height: 180, alignItems: "center", justifyContent: "center" },
  // La shape n'est pas au centre exact du canvas → on la descend via translateY (px, ajustable).
  lottie: { width: "100%", aspectRatio: 402 / 874, transform: [{ translateY: 50 }] },
  dataTextRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  momentCount: { ...textStyles.titlePage, color: colors.text, lineHeight: undefined },
  momentLabel: { ...textStyles.subheading, color: colors.text, lineHeight: undefined },
  // ── bas ──
  bottomBlock: { alignSelf: "stretch", alignItems: "center", gap: spacing.sm },
  captureFirstText: { ...textStyles.bodySmall, color: colors.textSecondary, lineHeight: undefined },
  countdown: {
    height: 80, padding: spacing.xs, flexDirection: "row", justifyContent: "center", alignItems: "center",
    gap: spacing.xl, alignSelf: "stretch", borderRadius: radii.xl,
    borderWidth: stroke.sm, borderColor: colors.cardBorder, backgroundColor: colors.bg,
  },
  countdownText: { ...textStyles.heading, color: colors.text, lineHeight: undefined },
  // ── unlock slider ──
  unlockTrack: {
    height: 80, padding: spacing.sm, flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", alignSelf: "stretch", borderRadius: radii.xl, backgroundColor: colors.bg,
  },
  unlockNob: { alignSelf: "stretch", borderRadius: radii.xl, backgroundColor: colors.brand, zIndex: 2 },
  unlockTextWrap: { position: "absolute", right: 24, top: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: spacing.xs, zIndex: 1 },
  unlockText: { ...textStyles.bodyBase, color: colors.textTertiary, lineHeight: undefined },
});
