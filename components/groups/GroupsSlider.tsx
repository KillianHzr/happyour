import { useState, useEffect, useRef, useMemo, memo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, useWindowDimensions, Animated,
} from "react-native";
import { Image } from "expo-image";
import {
  radii, typography, spacing, stroke, textStyles,
  type ThemeColors,
} from "../../lib/theme";
import { useTheme, useThemedStyles, ForceThemeMode } from "../../lib/theme-context";
import { NameTag } from "../atoms/NameTag";
import Shape, { type ShapeName } from "../Shape";
import Icon from "../Icon";

// Hauteur de la zone pagination : marginTop + paddingVertical*2 + dot + (gap + compteur ~16)
const DOTS_AREA_HEIGHT = 16 + spacing.sm * 2 + 6 + spacing.xxs + 16; // ~56

export type GroupCard = {
  id: string;
  name: string;
  momentCount: number;
  shape: ShapeName | null;   // shape du dernier moment partagé
  bgUrl: string | null;      // dernière photo postée, sinon avatar du chef
  lastMomentAt: number;      // pour l'ordre d'affichage
  loaded: boolean;           // données (count/shape/bg) chargées
  // ── Champs utilisés par la single (GroupRoom) ──
  crownUsername?: string | null;    // surnom du porteur de couronne
  crownAvatarUrl?: string | null;   // avatar du porteur de couronne
  challengeLabel?: string | null;   // surnom cible du défi en cours
  challengeShape?: ShapeName | null;// shape du type de média du défi
  postedThisWeek?: boolean;         // l'utilisateur a posté cette semaine dans ce groupe
};

type Props = {
  cards: GroupCard[];
  revealDate: Date;
  onSelect: (groupId: string) => void;
  showActiveBorder?: boolean; // masqué quand une page groupe est ouverte
  unlocked?: boolean;         // reveal disponible → countdown 0j + cadenas ouvert
};

/** Formate un délai en ms → "Xj HH:MM:SS" (le "0j" est masqué s'il reste moins d'un jour). */
function formatCountdown(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return days > 0 ? `${days}j ${time}` : time;
}

/** Compte à rebours qui tick seul (n'entraîne pas le re-render de toute la carte). */
const RevealCountdown = memo(function RevealCountdown({ revealDate, textStyle }: { revealDate: Date; textStyle: any }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <Text style={textStyle}>{formatCountdown(revealDate.getTime() - now)}</Text>;
});

/**
 * Une carte du slider. Mémoïsée → ne re-render pas au changement de page ni au tick
 * du countdown (qui est isolé dans RevealCountdown). Rendue dans un sous-arbre forcé
 * en mode sombre, donc `useTheme()` ici renvoie toujours les couleurs dark.
 */
const SliderCard = memo(function SliderCard({
  card, width, height, marginRight, revealDate, unlocked, onSelect, borderOpacity,
}: {
  card: GroupCard;
  width: number;
  height: number;
  marginRight: number;
  revealDate: Date;
  unlocked: boolean;
  onSelect: (groupId: string) => void;
  borderOpacity?: Animated.AnimatedInterpolation<number>;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(makeSliderStyles);
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => onSelect(card.id)}
      style={[s.card, { width, height, marginRight }]}
    >
      {card.bgUrl ? (
        <>
          {/* Flou STATIQUE (blurRadius) + voile sombre — léger (pas de BlurView live ×N cartes) */}
          <Image
            source={{ uri: card.bgUrl }}
            style={StyleSheet.absoluteFillObject as any}
            contentFit="cover"
            transition={0}
            cachePolicy="memory-disk"
            blurRadius={38}
          />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.45)" }]} pointerEvents="none" />
        </>
      ) : (
        // Aucun moment → background/default/default (forcé dark via ForceThemeMode)
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.bg }]} />
      )}

      <View style={s.cardContent}>
        {/* Nom du groupe (texte text/default sur fond brand/default) */}
        <NameTag text={card.name} />

        {/* Bloc data : shape du dernier moment + nombre de moments */}
        <View style={s.dataBlock}>
          {!card.loaded ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <>
              {card.momentCount > 0 && card.shape ? (
                <Shape name={card.shape} size={80} color={colors.icon} />
              ) : (
                // Aucun moment depuis le reveal → cercle plein (comme l'onglet capture actif)
                <Icon name="circle-filled" size={80} color={colors.icon} />
              )}
              <View style={s.dataTextRow}>
                <Text style={s.momentCount}>{card.momentCount}</Text>
                <Text style={s.momentLabel}>Moments</Text>
              </View>
            </>
          )}
        </View>

        {/* Countdown + cadenas (ou état "reveal disponible") */}
        <View style={s.countdownWrap}>
          <Text style={s.unlockHint}>
            {unlocked ? "Ouvre ton groupe pour le déverrouiller" : "Encore un peu de patience..."}
          </Text>
          <View style={[s.countdown, unlocked && { borderColor: colors.borderBrandTertiary }]}>
            {unlocked ? (
              <Text style={s.countdownText}>Disponible</Text>
            ) : (
              <RevealCountdown revealDate={revealDate} textStyle={s.countdownText} />
            )}
            <Icon name={unlocked ? "unlock" : "lock"} size={24} color={unlocked ? colors.iconBrandTertiary : colors.icon} />
          </View>
        </View>
      </View>
      {borderOpacity && (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, s.cardActive, { borderRadius: radii.xl, opacity: borderOpacity }]}
        />
      )}
    </TouchableOpacity>
  );
});

export default function GroupsSlider({ cards, revealDate, onSelect, showActiveBorder = true, unlocked = false }: Props) {
  const sliderStyles = useThemedStyles(makeSliderStyles);
  const { width: screenWidth } = useWindowDimensions();

  // Slider geometry — peek 1/10 sur chaque côté (identique aux défis)
  const gap = spacing.xl;
  const cardWidth = (screenWidth - 2 * gap) / 1.2;
  const sideMargin = (screenWidth - cardWidth) / 2;
  const snapInterval = cardWidth + gap;

  const [availableHeight, setAvailableHeight] = useState(0);

  const count = cards.length;
  const needsLoop = count > 1;
  const cardHeight = availableHeight > 0
    ? availableHeight - (needsLoop ? DOTS_AREA_HEIGHT : 0)
    : 0;

  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  // 20 copies → "infiniment" scrollable (même technique que le slider des défis)
  const LOOP_COUNT = 20;
  const startIdx = needsLoop && count > 0 ? Math.floor(LOOP_COUNT / 2) * count : 0;

  const displayItems = useMemo(() => {
    if (!needsLoop || count === 0) return cards;
    return Array.from({ length: LOOP_COUNT * count }, (_, i) => cards[i % count]);
  }, [cards, needsLoop, count]);

  // Scroll vers le milieu au premier rendu
  useEffect(() => {
    if (count === 0 || availableHeight === 0 || !needsLoop) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: startIdx * snapInterval, animated: false });
    }, 30);
    return () => clearTimeout(t);
  }, [count, availableHeight, snapInterval, needsLoop, startIdx]);

  // Bordure de sélection animée par carte : opacité 1 quand centrée, fondu vers 0
  // en s'éloignant. Nœuds stables (useMemo) pour ne pas casser le memo de SliderCard.
  const borderOpacities = useMemo(
    () => displayItems.map((_, idx) => {
      const center = idx * snapInterval;
      return scrollX.interpolate({
        inputRange: [center - snapInterval, center, center + snapInterval],
        outputRange: [0, 1, 0],
        extrapolate: "clamp",
      });
    }),
    [displayItems.length, snapInterval, scrollX]
  );

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: true,
      listener: (e: any) => {
        if (count === 0 || snapInterval === 0) return;
        const x = e.nativeEvent.contentOffset.x;
        const idx = Math.round(x / snapInterval);
        setActiveIndex(((idx % count) + count) % count);
      },
    }
  );

  const handleMomentumScrollEnd = (e: any) => {
    if (count === 0 || snapInterval === 0) return;
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / snapInterval);
    setActiveIndex(((idx % count) + count) % count);
  };

  return (
    <ForceThemeMode mode="Dark">
      <View style={{ flex: 1 }} onLayout={(e) => setAvailableHeight(e.nativeEvent.layout.height)}>
        {cardHeight > 0 && count > 0 && (
          <>
            <Animated.ScrollView
              ref={scrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={snapInterval}
              decelerationRate="fast"
              contentContainerStyle={{ paddingHorizontal: sideMargin }}
              onScroll={handleScroll}
              onMomentumScrollEnd={handleMomentumScrollEnd}
              scrollEventThrottle={16}
              bounces={false}
              overScrollMode="never"
            >
              {displayItems.map((card, idx) => (
                <SliderCard
                  key={idx}
                  card={card}
                  width={cardWidth}
                  height={cardHeight}
                  marginRight={gap}
                  revealDate={revealDate}
                  unlocked={unlocked}
                  onSelect={onSelect}
                  borderOpacity={showActiveBorder ? borderOpacities[idx] : undefined}
                />
              ))}
            </Animated.ScrollView>

            {needsLoop && (
              <View style={sliderStyles.paginationWrap}>
                <View style={sliderStyles.dotsRow}>
                  {cards.map((_, idx) => (
                    <View key={idx} style={[sliderStyles.dot, idx === activeIndex && sliderStyles.dotActive]} />
                  ))}
                </View>
                <Text style={sliderStyles.pageCounter}>{`${activeIndex + 1}/${count}`}</Text>
              </View>
            )}
          </>
        )}
      </View>
    </ForceThemeMode>
  );
}

const makeSliderStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    overflow: "hidden",
    backgroundColor: "#0A0A0A",
  },
  // 3px = valeur custom : stroke/050 (2px) est le token le plus épais mais rend la bordure
  // un peu fine ici.
  cardActive: {
    borderWidth: 3,
    borderColor: colors.borderBrandTertiary,
  },
  cardContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: spacing.xl6, // space/2400 = 96
    paddingHorizontal: spacing.xl, // space/600 = 24
    gap: spacing.xl3, // 48
  },
  dataBlock: {
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.lg, // space/400
  },
  dataTextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm, // space/200
  },
  momentCount: {
    ...textStyles.subtitleStrong,
    color: colors.text,
  },
  momentLabel: {
    ...textStyles.bodyStrong,
    color: colors.text,
  },
  countdownWrap: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: spacing.sm, // 8px entre le hint et le countdown
  },
  unlockHint: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    lineHeight: undefined,
    textAlign: "center",
  },
  countdown: {
    height: 80,
    padding: spacing.xs, // space/100
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xl, // space/600
    flexShrink: 0,
    alignSelf: "stretch",
    borderRadius: radii.xl, // radius/600
    borderWidth: stroke.sm, // stroke/025
    borderColor: colors.cardBorder, // border/default/default
    backgroundColor: colors.bg, // background/default/default
  },
  countdownText: {
    ...textStyles.heading,
    color: colors.text,
    lineHeight: undefined,
  },
  paginationWrap: {
    alignItems: "center",
    paddingVertical: spacing.sm,
    marginTop: 16,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.iconTertiary,
  },
  dotActive: {
    backgroundColor: colors.iconBrandTertiary, // icon/brand/tertiary
  },
  pageCounter: {
    ...textStyles.bodyExtraSmallStrong,
    color: colors.textTertiary, // text/default/tertiary
    marginTop: spacing.xxs, // collé sous la pagination
  },
});
