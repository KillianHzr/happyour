import { useState, useEffect, useRef, useMemo } from "react";
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, FlatList, ScrollView,
  ActivityIndicator, Platform, useWindowDimensions, Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Svg, { Path } from "react-native-svg";
import { supabase } from "../../lib/supabase";
import {
  radii, typography, spacing, textStyles, blur, blurIntensity, glassBlurIntensity,
  type ThemeColors,
} from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import {
  getCurrentChallengePeriod, getChallengeWeekStart,
  fetchOrGenerateChallenge, getChallengePrompt,
  mapChallenge, CHALLENGE_SELECT, TARGET_CHALLENGE_PROMPT,
  type WeeklyChallenge, type ChallengeCapture, type ActiveChallenge,
} from "../../lib/challenges";
import BlurView from "../atoms/BlurView";
import { BlurView as NativeBlurView } from "@sbaiahmed1/react-native-blur";
import { NameTag } from "../atoms/NameTag";
import Shape, { type ShapeName } from "../Shape";

// Hauteur occupée par les dots (marginTop + paddingVertical*2 + dot)
const DOTS_AREA_HEIGHT = 16 + spacing.sm * 2 + 6; // 16 + 16 + 6 = 38

type GroupInfo = { id: string; name: string };

type GroupChallenge = {
  groupId: string;
  groupName: string;
  challenge: WeeklyChallenge | null;
  hasResponded: boolean;
  loading: boolean;
  responseCount?: number;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  allGroups: GroupInfo[];
  currentUserId: string;
  onSelectChallenge: (challenge: ActiveChallenge) => void;
};

type ChallengesContentProps = {
  allGroups: GroupInfo[];
  currentUserId: string;
  onSelectChallenge: (challenge: ActiveChallenge) => void;
  onClose: () => void;
};

const CAPTURE_TO_SHAPE: Record<ChallengeCapture, ShapeName> = {
  PHOTO: "photo",
  VIDEO: "video",
  TEXTE: "texte",
  AUDIO: "audio",
  DESSIN: "dessin",
};

export function ChallengePromptText({
  targetUsername,
  themeLabel,
  colors,
  textStyle,
  accentColor,
}: {
  targetUsername: string;
  themeLabel: string;
  colors: ThemeColors;
  textStyle?: any;
  // Couleur des parties surnom/thème. Brand par défaut (capture du défi),
  // forcé en blanc (text/default) dans les cards du slider.
  accentColor?: string;
}) {
  const accent = accentColor ?? colors.textBrandTertiary;
  return (
    <Text style={[{ ...textStyles.heading, color: colors.text, lineHeight: undefined, textAlign: "center" }, textStyle]}>
      {"Si "}
      <Text style={{ color: accent }}>{targetUsername}</Text>
      {" était "}
      <Text style={{ color: accent }}>{themeLabel}</Text>
      {", ce serait..."}
    </Text>
  );
}

type ChallengesSliderProps = ChallengesContentProps & {
  chooseRef?: React.MutableRefObject<(() => void) | null>;
  // Remonte l'état de la carte active (notamment si l'utilisateur a déjà participé),
  // pour piloter le bouton « Choisir » qui vit dans le parent (CameraPage).
  onActiveChange?: (info: { hasResponded: boolean }) => void;
  // Visibilité de la vue (le slider reste monté, l'opacité est togglée). À chaque
  // ouverture on rafraîchit silencieusement les réponses (participation, compteur).
  visible?: boolean;
};

export function ChallengesSlider({
  allGroups,
  currentUserId,
  onSelectChallenge,
  onClose,
  chooseRef,
  onActiveChange,
  visible,
}: ChallengesSliderProps) {
  const { colors } = useTheme();
  const sliderStyles = useThemedStyles(makeSliderStyles);
  const { width: screenWidth } = useWindowDimensions();

  const [groupChallenges, setGroupChallenges] = useState<GroupChallenge[]>(
    allGroups.map((g) => ({ groupId: g.id, groupName: g.name, challenge: null, hasResponded: false, loading: true }))
  );
  const [isGap, setIsGap] = useState(false);

  const groupIdsStr = allGroups.map((g) => g.id).join(",");

  // Ref vers l'état courant pour le refresh silencieux (évite des deps inutiles).
  const groupChallengesRef = useRef(groupChallenges);
  groupChallengesRef.current = groupChallenges;

  // Rafraîchit uniquement participation + compteur de réponses des défis déjà chargés,
  // en patchant en place (pas de spinner / reset de scroll).
  const refreshResponses = async () => {
    await Promise.all(groupChallengesRef.current.map(async (gc) => {
      if (!gc.challenge) return;
      const challengeId = gc.challenge.id;
      const [{ data: resp }, { count }] = await Promise.all([
        supabase.from("challenge_responses").select("id")
          .eq("challenge_id", challengeId).eq("user_id", currentUserId).maybeSingle(),
        supabase.from("challenge_responses").select("id", { count: "exact", head: true })
          .eq("challenge_id", challengeId),
      ]);
      setGroupChallenges((prev) => prev.map((p) =>
        p.groupId === gc.groupId ? { ...p, hasResponded: !!resp, responseCount: count ?? 0 } : p
      ));
    }));
  };

  // À chaque ouverture de la vue (visible false → true), refresh silencieux.
  const prevVisibleRef = useRef(false);
  useEffect(() => {
    if (visible && !prevVisibleRef.current) refreshResponses();
    prevVisibleRef.current = !!visible;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    const period = getCurrentChallengePeriod();
    setIsGap(period === null);
    loadChallenges(period, allGroups);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIdsStr, currentUserId]);

  const loadChallenges = async (period: 1 | 2 | null, currentGroups: GroupInfo[]) => {
    const effectivePeriod = period ?? 2;
    const weekStart = getChallengeWeekStart();

    setGroupChallenges(currentGroups.map((g) => ({
      groupId: g.id, groupName: g.name, challenge: null, hasResponded: false, loading: true,
    })));

    await Promise.all(currentGroups.map(async (g) => {
      try {
        const { data: membersData } = await supabase.from("group_members").select("user_id").eq("group_id", g.id);
        const members = (membersData ?? []).map((m: any) => ({ user_id: m.user_id }));
        let challenge: WeeklyChallenge | null = null;
        if (period === null) {
          const { data } = await supabase.from("weekly_challenges").select(CHALLENGE_SELECT)
            .eq("group_id", g.id).eq("period", effectivePeriod).eq("week_start", weekStart).maybeSingle();
          if (data) challenge = mapChallenge(data);
        } else {
          challenge = await fetchOrGenerateChallenge(g.id, effectivePeriod, weekStart, members, new Date(), false);
        }
        let hasResponded = false;
        let responseCount = 0;
        if (challenge) {
          const [{ data: resp }, { count }] = await Promise.all([
            supabase.from("challenge_responses").select("id")
              .eq("challenge_id", challenge.id).eq("user_id", currentUserId).maybeSingle(),
            supabase.from("challenge_responses").select("id", { count: "exact", head: true })
              .eq("challenge_id", challenge.id),
          ]);
          hasResponded = !!resp;
          responseCount = count ?? 0;
        }
        setGroupChallenges((prev) => prev.map((gc) =>
          gc.groupId === g.id ? { ...gc, challenge, hasResponded, responseCount, loading: false } : gc
        ));
      } catch {
        setGroupChallenges((prev) => prev.map((gc) =>
          gc.groupId === g.id ? { ...gc, loading: false } : gc
        ));
      }
    }));
  };

  const handleSelect = (gc: GroupChallenge) => {
    if (!gc.challenge || gc.hasResponded || isGap) return;
    const isTarget = gc.challenge.target_user_id === currentUserId;
    const captureType: ChallengeCapture = isTarget ? "PHOTO" : gc.challenge.theme.capture_type;
    const promptText = isTarget ? TARGET_CHALLENGE_PROMPT
      : getChallengePrompt(gc.challenge.target_username, gc.challenge.theme.label);
    onSelectChallenge({
      challengeId: gc.challenge.id,
      captureType,
      promptText,
      groupId: gc.groupId,
      isTarget,
      proposedByUsername: gc.challenge.proposed_by_username ?? null,
      targetUsername: gc.challenge.target_username,
      themeLabel: gc.challenge.theme.label,
    });
    onClose();
  };

  // Synchronise chooseRef à chaque render pour toujours avoir les dernières valeurs
  useEffect(() => {
    if (!chooseRef) return;
    chooseRef.current = () => {
      const gc = groupChallenges[activeIndex];
      if (gc) handleSelect(gc);
    };
  });

  // Slider geometry — peek 1/10 sur chaque côté
  const gap = spacing.xl;
  const cardWidth = (screenWidth - 2 * gap) / 1.2;
  const sideMargin = (screenWidth - cardWidth) / 2;
  const snapInterval = cardWidth + gap;

  const [availableHeight, setAvailableHeight] = useState(0);

  const count = groupChallenges.length;
  const showDots = count > 1;
  const cardHeight = availableHeight > 0
    ? availableHeight - (showDots ? DOTS_AREA_HEIGHT : 0)
    : 0;

  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  // Remonte au parent l'état de la carte active. Piloté à la fin du scroll (callbacks JS
  // directs, instantanés) et après refresh des données — PAS via le listener natif de
  // handleScroll qui lag de plusieurs secondes en scroll rapide. Dédupliqué : on ne notifie
  // le parent (→ re-render de CameraPage) que quand le booléen change réellement.
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;
  const activeIndexRef = useRef(0);
  const lastRespondedRef = useRef<boolean | null>(null);
  const reportActive = (realIdx: number) => {
    activeIndexRef.current = realIdx;
    const responded = !!groupChallengesRef.current[realIdx]?.hasResponded;
    if (lastRespondedRef.current !== responded) {
      lastRespondedRef.current = responded;
      onActiveChangeRef.current?.({ hasResponded: responded });
    }
  };
  // Après chargement/refresh des données, réévalue la carte courante (participation à jour).
  useEffect(() => {
    reportActive(activeIndexRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupChallenges]);

  // Pas de loop : on rend les défis une seule fois.
  const displayItems = groupChallenges;

  // Listener ULTRA-léger : il ne fait QUE reportActive (calcul d'index + compare booléenne
  // dédupliquée → ne re-render le parent qu'au flip). Surtout PAS de setActiveIndex ici :
  // ça re-renderait toutes les cartes à chaque frame et créait le backlog de ~2s.
  // Le bouton se met ainsi à jour dès le passage de la moitié (pendant le scroll), sans
  // attendre la fin du momentum.
  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: true,
      listener: (e: any) => {
        if (count === 0 || snapInterval === 0) return;
        const x = e.nativeEvent.contentOffset.x;
        const realIdx = Math.max(0, Math.min(count - 1, Math.round(x / snapInterval)));
        reportActive(realIdx);
      },
    }
  );

  // Fin de scroll (settle) : met à jour l'index ET notifie le parent immédiatement.
  // Math.round prédit l'index de snap même au lâcher (avant l'anim de snap).
  const handleScrollSettle = (e: any) => {
    if (count === 0 || snapInterval === 0) return;
    const x = e.nativeEvent.contentOffset.x;
    const realIdx = Math.max(0, Math.min(count - 1, Math.round(x / snapInterval)));
    setActiveIndex(realIdx);
    reportActive(realIdx);
  };



  const renderCard = (gc: GroupChallenge, idx: number) => {
    const isTarget = gc.challenge?.target_user_id === currentUserId;
    const captureType: ChallengeCapture = isTarget ? "PHOTO" : (gc.challenge?.theme.capture_type ?? "PHOTO");
    // Bordure de sélection animée : opacité 1 quand la carte est centrée, fondu vers 0
    // dès qu'elle s'éloigne (la bordure de la carte qui arrive apparaît proportionnellement).
    const center = idx * snapInterval;
    const borderOpacity = scrollX.interpolate({
      inputRange: [center - snapInterval, center, center + snapInterval],
      outputRange: [0, 1, 0],
      extrapolate: "clamp",
    });
    return (
      <View
        key={idx}
        style={[
          sliderStyles.card,
          { width: cardWidth, height: cardHeight, marginRight: gap },
        ]}
      >
        {gc.challenge?.target_avatar_url ? (
          <Image 
            source={{ uri: gc.challenge.target_avatar_url }} 
            style={StyleSheet.absoluteFillObject as any} 
            contentFit="cover" 
            transition={0} 
            cachePolicy="memory-disk" 
            blurRadius={Platform.OS === "android" ? 20 : 0}
          />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.card }]} />
        )}
        {Platform.OS === "ios" && (
          <NativeBlurView style={StyleSheet.absoluteFillObject} blurType="dark" blurAmount={30} />
        )}
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: Platform.OS === "android" ? "rgba(8, 8, 10, 0.7)" : "rgba(8, 8, 10, 0.5)" }]} pointerEvents="none" />
        <View style={sliderStyles.cardContent}>
          <NameTag text={gc.groupName} />
          {gc.loading ? (
            <ActivityIndicator color={colors.text} size="large" />
          ) : gc.challenge ? (
            <View style={sliderStyles.challengeDetails}>
              <View style={[sliderStyles.captureBadge, { backgroundColor: colors.bgInverse }]}>
                <Text style={[sliderStyles.captureBadgeText, { color: colors.textInverse }]}>{CAPTURE_LABEL[captureType]} obligatoire</Text>
                <Shape name={CAPTURE_TO_SHAPE[captureType]} size={16} color={colors.bg} />
              </View>
              {isTarget ? (
                <Text style={sliderStyles.challengeText}>{TARGET_CHALLENGE_PROMPT}</Text>
              ) : (
                <ChallengePromptText targetUsername={gc.challenge.target_username} themeLabel={gc.challenge.theme.label} colors={colors} accentColor={colors.text} />
              )}
              {gc.challenge.target_avatar_url ? (
                <Image source={{ uri: gc.challenge.target_avatar_url }} style={sliderStyles.targetAvatar} contentFit="cover" transition={0} cachePolicy="memory-disk" />
              ) : (
                <View style={[sliderStyles.targetAvatar, { backgroundColor: colors.card, justifyContent: "center", alignItems: "center" }]}>
                  <Text style={{ color: colors.text, fontFamily: typography.family.bold, fontSize: 24 }}>
                    {gc.challenge.target_username[0]?.toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={sliderStyles.responsesBadge}>
                <Text style={sliderStyles.responsesText}>
                  {(gc.responseCount ?? 0)} {(gc.responseCount ?? 0) > 1 ? "réponses" : "réponse"}
                </Text>
              </View>
              {gc.hasResponded && (
                <Text style={sliderStyles.respondedText}>Tu as déjà participé ✓</Text>
              )}
            </View>
          ) : (
            <Text style={sliderStyles.noChallengeText}>Aucun défi configuré</Text>
          )}
        </View>
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, sliderStyles.cardActive, { borderRadius: radii.xl, opacity: borderOpacity }]}
        />
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setAvailableHeight(e.nativeEvent.layout.height)}>
      {cardHeight > 0 && (
        <>
          {groupChallenges.length === 0 ? (
            <View style={sliderStyles.emptyContainer}>
              <ActivityIndicator color={colors.text} size="large" />
            </View>
          ) : isGap ? (
            <View style={[sliderStyles.card, { width: cardWidth, height: cardHeight, left: sideMargin, justifyContent: "center", alignItems: "center", padding: 32 }]}>
              <Text style={{ color: colors.text, fontFamily: typography.family.bold, fontSize: typography.size.lg, textAlign: "center", lineHeight: 28 }}>
                Reviens demain pour de nouveaux défis !
              </Text>
            </View>
          ) : (
            <>
              <Animated.ScrollView
                ref={scrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={snapInterval}
                decelerationRate="fast"
                contentContainerStyle={{ paddingHorizontal: sideMargin }}
                onScroll={handleScroll}
                onMomentumScrollEnd={handleScrollSettle}
                onScrollEndDrag={handleScrollSettle}
                scrollEventThrottle={16}
                bounces={false}
                overScrollMode="never"
              >
                {displayItems.map((gc, idx) => renderCard(gc, idx))}
              </Animated.ScrollView>
              {showDots && (
                <View style={sliderStyles.dotsContainer}>
                  {groupChallenges.map((_, idx) => (
                    <View key={idx} style={[sliderStyles.dot, idx === activeIndex && sliderStyles.dotActive]} />
                  ))}
                </View>
              )}
            </>
          )}
        </>
      )}
    </View>
  );
}

const makeSliderStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    overflow: "hidden",
    backgroundColor: "#0A0A0A",
  },
  // border/brand/tertiary sur la carte sélectionnée. 3px = valeur custom : stroke/050 (2px)
  // est le token le plus épais du design system mais rend la bordure un peu fine ici.
  cardActive: {
    borderWidth: 3,
    borderColor: colors.borderBrandTertiary,
  },
  cardContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 20,
    paddingHorizontal: spacing.lg,
    gap: 48,
  },
  challengeDetails: {
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.lg,
  },
  captureBadge: {
    overflow: "hidden",
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  captureBadgeText: {
    ...textStyles.singleLineBodyBaseStrong,
    color: colors.text,
    lineHeight: undefined,
  },
  responsesBadge: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xs,               // space/100
    paddingVertical: spacing.sm,   // space/200
    paddingHorizontal: spacing.md, // space/300
    borderRadius: radii.sm,        // radius/200
    backgroundColor: colors.bgDefaultOpacity,
  },
  responsesText: {
    ...textStyles.singleLineBodyBaseStrong,
    color: colors.text,
    lineHeight: undefined,
  },
  respondedText: {
    ...textStyles.singleLineBodyBaseStrong,
    color: colors.textBrandTertiary,
    lineHeight: undefined,
    textAlign: "center",
  },
  challengeText: {
    ...textStyles.heading,
    color: colors.text,
    lineHeight: undefined,
    textAlign: "center",
  },
  targetAvatar: {
    width: 80,
    height: 80,
    borderRadius: radii.xl,
  },
  noChallengeText: {
    color: colors.textSecondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    textAlign: "center",
  },
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.sm,
    gap: spacing.xs2,
    marginTop: 16,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.iconTertiary,
  },
  dotActive: {
    backgroundColor: colors.icon,
  },
});

function CaptureTypeIcon({ type }: { type: ChallengeCapture }) {
  const { colors } = useTheme();
  const strokeColor = colors.secondary;
  const icons: Record<ChallengeCapture, React.ReactNode> = {
    PHOTO: (
      <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <Path d="M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
      </Svg>
    ),
    TEXTE: (
      <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M17 6H3" /><Path d="M21 12H3" /><Path d="M15 18H3" />
      </Svg>
    ),
    AUDIO: (
      <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <Path d="M19 10v2a7 7 0 0 1-14 0v-2" /><Path d="M12 19v4" /><Path d="M8 23h8" />
      </Svg>
    ),
    DESSIN: (
      <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 20h9" /><Path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </Svg>
    ),
    VIDEO: (
      <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M23 7l-7 5 7 5V7z" /><Path d="M1 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H1a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
      </Svg>
    ),
  };
  return <>{icons[type]}</>;
}

const CAPTURE_LABEL: Record<ChallengeCapture, string> = {
  PHOTO: "Photo",
  VIDEO: "Vidéo",
  TEXTE: "Texte",
  AUDIO: "Audio",
  DESSIN: "Dessin",
};

export function ChallengesContent({ allGroups, currentUserId, onSelectChallenge, onClose }: ChallengesContentProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [groupChallenges, setGroupChallenges] = useState<GroupChallenge[]>([]);
  const [isGap, setIsGap] = useState(false);
  const [devPeriodOverride, setDevPeriodOverride] = useState<1 | 2 | "auto">("auto");

  useEffect(() => {
    const period = __DEV__ && devPeriodOverride !== "auto"
      ? devPeriodOverride
      : getCurrentChallengePeriod();
    setIsGap(__DEV__ && devPeriodOverride !== "auto" ? false : period === null);
    loadChallenges(period);
  }, [allGroups, currentUserId, devPeriodOverride]);

  const loadChallenges = async (period: 1 | 2 | null) => {
    const effectivePeriod = period ?? 2;
    const weekStart = getChallengeWeekStart();

    setGroupChallenges(allGroups.map((g) => ({
      groupId: g.id,
      groupName: g.name,
      challenge: null,
      hasResponded: false,
      loading: true,
    })));

    await Promise.all(
      allGroups.map(async (g) => {
        try {
          const { data: membersData } = await supabase
            .from("group_members")
            .select("user_id")
            .eq("group_id", g.id);
          const members = (membersData ?? []).map((m: any) => ({ user_id: m.user_id }));

          let challenge: WeeklyChallenge | null = null;
          if (period === null) {
            const { data } = await supabase
              .from("weekly_challenges")
              .select(CHALLENGE_SELECT)
              .eq("group_id", g.id)
              .eq("period", effectivePeriod)
              .eq("week_start", weekStart)
              .maybeSingle();
            if (data) challenge = mapChallenge(data);
          } else {
            const isDevOverride = __DEV__ && devPeriodOverride !== "auto";
            let devNow: Date | undefined;
            if (isDevOverride && effectivePeriod === 2) {
              const d = new Date();
              const daysToThursday = (4 - d.getDay() + 7) % 7;
              if (daysToThursday > 0) {
                d.setDate(d.getDate() + daysToThursday);
                devNow = d;
              }
            }
            challenge = await fetchOrGenerateChallenge(
              g.id, effectivePeriod, weekStart, members,
              devNow ?? new Date(),
              isDevOverride,
            );
          }

          let hasResponded = false;
          if (challenge) {
            const { data: resp } = await supabase
              .from("challenge_responses")
              .select("id")
              .eq("challenge_id", challenge.id)
              .eq("user_id", currentUserId)
              .maybeSingle();
            hasResponded = !!resp;
          }

          setGroupChallenges((prev) =>
            prev.map((gc) =>
              gc.groupId === g.id ? { ...gc, challenge, hasResponded, loading: false } : gc
            )
          );
        } catch {
          setGroupChallenges((prev) =>
            prev.map((gc) => gc.groupId === g.id ? { ...gc, loading: false } : gc)
          );
        }
      })
    );
  };

  const handleSelect = (gc: GroupChallenge) => {
    if (!gc.challenge || gc.hasResponded || isGap) return;
    const isTarget = gc.challenge.target_user_id === currentUserId;
    const captureType: ChallengeCapture = isTarget ? "PHOTO" : gc.challenge.theme.capture_type;
    const promptText = isTarget
      ? TARGET_CHALLENGE_PROMPT
      : getChallengePrompt(gc.challenge.target_username, gc.challenge.theme.label);

    onSelectChallenge({
      challengeId: gc.challenge.id,
      captureType,
      promptText,
      groupId: gc.groupId,
      isTarget,
      proposedByUsername: gc.challenge.proposed_by_username ?? null,
      targetUsername: gc.challenge.target_username,
      themeLabel: gc.challenge.theme.label,
    });
    onClose();
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      {isGap ? (
        <View style={styles.gapBanner}>
          <Text style={styles.gapBannerText}>Reviens demain pour de nouveaux défis !</Text>
        </View>
      ) : (
        groupChallenges.map((gc) => (
          <View key={gc.groupId} style={styles.groupBlock}>
            <Text style={[styles.groupName, { transform: [{ rotate: "2deg" }] }]}>{gc.groupName}</Text>

          {gc.loading ? (
            <View style={styles.card}>
              <ActivityIndicator color={colors.textSecondary} />
            </View>
          ) : !gc.challenge ? (
            <View style={[styles.card, styles.cardDisabled]}>
              <Text style={styles.noThemeText}>Aucun thème configuré</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.card,
                (gc.hasResponded || isGap) && styles.cardDisabled,
              ]}
              onPress={() => handleSelect(gc)}
              activeOpacity={gc.hasResponded || isGap ? 1 : 0.75}
              disabled={gc.hasResponded || isGap}
            >
              <View style={styles.cardRow}>
                {gc.challenge.target_avatar_url ? (
                  <Image
                    source={{ uri: gc.challenge.target_avatar_url }}
                    style={styles.avatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarLetter}>
                      {gc.challenge.target_username[0]?.toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.promptText} numberOfLines={3}>
                    {gc.challenge.target_user_id === currentUserId
                      ? TARGET_CHALLENGE_PROMPT
                      : getChallengePrompt(gc.challenge.target_username, gc.challenge.theme.label)}
                  </Text>
                  <View style={styles.badgeRow}>
                    <View style={styles.captureBadge}>
                      <CaptureTypeIcon type={gc.challenge.target_user_id === currentUserId ? "PHOTO" : gc.challenge.theme.capture_type} />
                      <Text style={styles.captureBadgeText}>
                        {gc.challenge.target_user_id === currentUserId ? "Photo" : CAPTURE_LABEL[gc.challenge.theme.capture_type]}
                      </Text>
                    </View>
                    {gc.challenge.proposed_by_username && (
                      <View style={styles.proposerBadge}>
                        <Text style={styles.proposerBadgeText}>✦ {gc.challenge.proposed_by_username}</Text>
                      </View>
                    )}
                  </View>
                </View>

                {gc.hasResponded ? (
                  <View style={styles.doneTag}>
                    <Text style={styles.doneTagText}>✓</Text>
                  </View>
                ) : isGap ? (
                  <View style={styles.gapTag}>
                    <Text style={styles.gapTagText}>Terminé</Text>
                  </View>
                ) : (
                  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <Path d="M9 18l6-6-6-6" stroke={colors.textSecondary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                )}
                </View>
              </TouchableOpacity>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

export default function ChallengesModal({ visible, onClose, allGroups, currentUserId, onSelectChallenge }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const period = getCurrentChallengePeriod();
  const isGap = period === null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <Path d="M19 12H5M12 5l-7 7 7 7" stroke={colors.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Défis</Text>
            {isGap ? (
              <Text style={styles.subtitle}>Défis terminés, prochain défi lundi</Text>
            ) : (
              <Text style={styles.subtitle}>
                {period === 1 ? "Défi 1 · Lundi → Mercredi" : "Défi 2 · Jeudi → Dimanche"}
              </Text>
            )}
          </View>
        </View>

        {visible && (
          <ChallengesContent
            allGroups={allGroups}
            currentUserId={currentUserId}
            onSelectChallenge={onSelectChallenge}
            onClose={onClose}
          />
        )}
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  backBtn: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  title: {
    color: colors.text,
    fontFamily: typography.family.bold,
    fontSize: typography.size.xl,
  },
  subtitle: {
    color: colors.textTertiary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
    marginTop: 1,
  },
  scrollContent: {
    paddingTop: 20,
    paddingHorizontal: 20,
    gap: 24,
  },
  groupBlock: {
    gap: 8,
  },
  groupName: {
    color: colors.textSecondary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    overflow: "hidden",
  },
  cardDisabled: {
    opacity: 0.5,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.xl,
  },
  avatarFallback: {
    backgroundColor: colors.card,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLetter: {
    color: colors.text,
    fontFamily: typography.family.bold,
    fontSize: typography.size.lg,
  },
  promptText: {
    color: colors.text,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
    lineHeight: 21,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 8,
  },
  captureBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.accentMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.lg,
  },
  captureBadgeText: {
    color: colors.secondary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
  },
  doneTag: {
    width: 28,
    height: 28,
    borderRadius: radii.md,
    backgroundColor: "rgba(52,199,89,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  doneTagText: {
    color: "#34C759",
    fontFamily: typography.family.bold,
    fontSize: typography.size.sm,
  },
  gapTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.md,
    backgroundColor: colors.accentMuted,
  },
  gapTagText: {
    color: colors.textTertiary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
  },
  proposerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,200,80,0.12)",
    borderRadius: radii.lg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(255,200,80,0.25)",
  },
  proposerBadgeText: {
    color: "rgba(255,200,80,0.85)",
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
  },
  noThemeText: {
    color: colors.textTertiary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    textAlign: "center",
    paddingVertical: 4,
  },
  gapBanner: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 20,
    alignItems: "center",
  },
  gapBannerText: {
    color: colors.text,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
  },
});
