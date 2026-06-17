import { useState, useEffect, useRef, memo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Platform, Animated, PanResponder,
} from "react-native";
import { Image } from "expo-image";
import { BlurView as NativeBlurView } from "@sbaiahmed1/react-native-blur";
import { radii, spacing, stroke, textStyles, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles, ForceThemeMode } from "../../lib/theme-context";
import Shape, { type ShapeName } from "../Shape";
import Icon from "../Icon";
import type { GroupCard } from "./GroupsSlider";

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

/** Slider de déverrouillage : le nob s'agrandit en largeur quand on le tire vers la droite. */
function UnlockSlider({ onUnlock }: { onUnlock: () => void }) {
  const s = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const [trackW, setTrackW] = useState(0);
  const NOB_MIN = 66;
  const PAD = spacing.sm; // 8
  const widthAnim = useRef(new Animated.Value(NOB_MIN)).current;
  const maxWidth = Math.max(NOB_MIN, trackW - PAD * 2);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 4,
      onPanResponderMove: (_e, g) => {
        const w = Math.min(maxWidth, Math.max(NOB_MIN, NOB_MIN + g.dx));
        widthAnim.setValue(w);
      },
      onPanResponderRelease: (_e, g) => {
        const w = Math.min(maxWidth, Math.max(NOB_MIN, NOB_MIN + g.dx));
        if (w >= maxWidth - 8) {
          Animated.timing(widthAnim, { toValue: maxWidth, duration: 120, useNativeDriver: false }).start(() => onUnlock());
        } else {
          Animated.spring(widthAnim, { toValue: NOB_MIN, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

  return (
    <View style={s.unlockTrack} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
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
  onUnlock: () => void;
};

export default function GroupRoom(props: Props) {
  const { colors } = useTheme();
  const headerStyles = useThemedStyles(makeHeaderStyles);
  const { card, showBack, showAddButton, topInset, onBack, onAddGroup, onSettings, onArchive } = props;

  return (
    <View style={[headerStyles.container, { paddingTop: topInset }]}>
      {/* Header (thème app) */}
      <View style={headerStyles.header}>
        <View style={headerStyles.headerRow}>
          {showBack && (
            <TouchableOpacity style={headerStyles.iconBtn} onPress={onBack} activeOpacity={0.7}>
              <Icon name="chevron-left" size={20} color={colors.icon} />
            </TouchableOpacity>
          )}
          <Text style={headerStyles.title} numberOfLines={1} ellipsizeMode="tail">{card.name}</Text>
          <View style={headerStyles.headerActions}>
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
          </View>
        </View>
      </View>

      {/* Carte plein écran (forcée sombre) */}
      <View style={headerStyles.cardWrap}>
        <ForceThemeMode mode="Dark">
          <RoomCard {...props} />
        </ForceThemeMode>
      </View>
    </View>
  );
}

function RoomCard({ card, revealDate, unlocked, onCapture, onUnlock }: Props) {
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const hasMoments = card.momentCount > 0;
  const postedThisWeek = card.postedThisWeek ?? false;

  return (
    <View style={s.card}>
      {card.bgUrl ? (
        <>
          <Image source={{ uri: card.bgUrl }} style={StyleSheet.absoluteFillObject as any} contentFit="cover" transition={0} cachePolicy="memory-disk" blurRadius={Platform.OS === "android" ? 20 : 0} />
          {Platform.OS === "ios" && <NativeBlurView style={StyleSheet.absoluteFillObject} blurType="dark" blurAmount={30} />}
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: Platform.OS === "android" ? "rgba(8,8,10,0.7)" : "rgba(8,8,10,0.5)" }]} pointerEvents="none" />
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
          <View style={s.topInfos}>
            {!!card.challengeLabel && (
              <View style={s.challengeBtn}>
                {Platform.OS === "ios"
                  ? <NativeBlurView style={StyleSheet.absoluteFillObject} blurType="dark" blurAmount={20} />
                  : null}
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.opacityLight }]} pointerEvents="none" />
                <Text style={s.challengeText}>Défi @{card.challengeLabel}</Text>
                {card.challengeShape && <Shape name={card.challengeShape} size={20} color={colors.icon} />}
              </View>
            )}
            <View style={s.tagQueenKing}>
              <View style={s.avatar}>
                {card.crownAvatarUrl ? (
                  <Image source={{ uri: card.crownAvatarUrl }} style={s.avatarImg as any} contentFit="cover" />
                ) : (
                  <View style={[s.avatarImg, { backgroundColor: colors.bgNeutralTertiary }]} />
                )}
                <View style={s.crownWrap} pointerEvents="none">
                  <Icon name="crown" size={20} color={colors.icon} />
                </View>
              </View>
              <View style={s.queenKingTexts}>
                <Text style={s.queenKingName}>{card.crownUsername ?? "—"}</Text>
                <Text style={s.queenKingLabel}>Légende</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Bloc data : shape 136 + nombre de moments ── */}
        <View style={s.dataBlock}>
          {!card.loaded ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <>
              {hasMoments && card.shape ? (
                <Shape name={card.shape} size={136} color={colors.icon} />
              ) : (
                <Icon name="circle-filled" size={136} color={colors.icon} />
              )}
              <View style={s.dataTextRow}>
                <Text style={s.momentCount}>{card.momentCount}</Text>
                <Text style={s.momentLabel}>Moments</Text>
              </View>
            </>
          )}
        </View>

        {/* ── Bas : compte à rebours / slider de déverrouillage ── */}
        <View style={s.bottomBlock}>
          {!postedThisWeek && !unlocked && (
            <Text style={s.captureFirstText}>Capture un moment d'abord</Text>
          )}
          {unlocked ? (
            <UnlockSlider onUnlock={onUnlock} />
          ) : (
            <View style={s.countdown}>
              <RevealCountdown revealDate={revealDate} textStyle={s.countdownText} />
              <Icon name="lock" size={24} color={colors.icon} />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const makeHeaderStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 40 },
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
  // ── top-infos ──
  topInfos: { flexDirection: "column", alignItems: "center", gap: spacing.lg },
  challengeBtn: {
    flexDirection: "row", padding: spacing.sm, justifyContent: "center", alignItems: "center",
    gap: spacing.sm, borderRadius: radii.sm, overflow: "hidden",
  },
  challengeText: { ...textStyles.bodyBase, color: colors.text, lineHeight: undefined },
  tagQueenKing: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: spacing.sm },
  avatar: {
    width: 48, height: 48, alignItems: "center", borderRadius: radii.md,
    borderWidth: stroke.md, borderColor: colors.icon, overflow: "visible",
  },
  avatarImg: { width: "100%", height: "100%", borderRadius: radii.md },
  crownWrap: { position: "absolute", left: -9.5, top: -13 },
  queenKingTexts: { flexDirection: "column", justifyContent: "center", alignItems: "flex-start", gap: spacing.negXs },
  queenKingName: { ...textStyles.heading, color: colors.textSecondary, lineHeight: undefined },
  queenKingLabel: { ...textStyles.bodySmall, color: colors.textSecondary, lineHeight: undefined },
  // ── data block ──
  dataBlock: { flexDirection: "column", justifyContent: "center", alignItems: "center", gap: spacing.lg },
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
