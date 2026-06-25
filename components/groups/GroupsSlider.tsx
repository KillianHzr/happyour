import { useState, useEffect, useRef, useMemo, memo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, useWindowDimensions, Animated,
} from "react-native";
import { BlurredImageBackground } from "../atoms/BlurredImageBackground";
import {
  radii, typography, spacing, stroke, textStyles,
  type ThemeColors,
} from "../../lib/theme";
import { useTheme, useThemedStyles, ForceThemeMode } from "../../lib/theme-context";
import { NameTag } from "../atoms/NameTag";
import Shape, { type ShapeName } from "../Shape";
import Icon from "../Icon";
import { hapticSelection } from "../../lib/haptics";

/**
 * Pastille de pagination pilotée par la valeur de scroll native (UI thread) plutôt que par
 * un state React : la pastille active suit le scroll exactement comme le compteur x/x, sans
 * le lag du listener JS. Fond inactif + calque actif dont l'opacité se révèle quand la carte
 * est centrée (l'opacité est native-driver compatible).
 */
export const AnimatedDot = memo(function AnimatedDot({
  scrollX, center, snapInterval, baseStyle, activeColor,
}: {
  scrollX: Animated.Value;
  center: number;
  snapInterval: number;
  baseStyle: any;
  activeColor: string;
}) {
  const opacity = scrollX.interpolate({
    inputRange: [center - snapInterval, center, center + snapInterval],
    outputRange: [0, 1, 0],
    extrapolate: "clamp",
  });
  return (
    <View style={baseStyle}>
      <Animated.View style={[StyleSheet.absoluteFillObject, { borderRadius: 3, backgroundColor: activeColor, opacity }]} />
    </View>
  );
});

// Hauteur réservée sous le slider pour la pagination. On n'affiche plus qu'UN élément à la fois
// (les pastilles OU le compteur x/x), donc on budgète juste : marginTop + paddingVertical*2 +
// hauteur du contenu (~16, le compteur étant le plus haut). Évite l'excès d'espace sous le slider.
const DOTS_AREA_HEIGHT = spacing.sm + spacing.xs * 2 + 16; // ~32

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
  unlocked: boolean;                // reveal accessible pour CE groupe (par-groupe, pas global)
};

export type CardFrame = { x: number; y: number; width: number; height: number };

type Props = {
  cards: GroupCard[];
  revealDate: Date;
  // frame = position/taille écran de la carte tapée (pour l'anim d'agrandissement vers la single).
  onSelect: (groupId: string, frame?: CardFrame) => void;
  showActiveBorder?: boolean; // masqué quand une page groupe est ouverte
  // Transition d'ouverture : `morph` 0→1 ; le contenu de la card `morphingId` sort façon reveal.
  morph?: Animated.Value;
  morphingId?: string | null;
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
  card, width, height, marginRight, revealDate, unlocked, onSelect, borderOpacity, morph, isMorphing,
}: {
  card: GroupCard;
  width: number;
  height: number;
  marginRight: number;
  revealDate: Date;
  unlocked: boolean;
  onSelect: (groupId: string, frame?: CardFrame) => void;
  borderOpacity?: Animated.AnimatedInterpolation<number>;
  morph?: Animated.Value;
  isMorphing?: boolean;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(makeSliderStyles);
  const cardRef = useRef<any>(null);

  // Sortie façon reveal (le contenu est "aspiré derrière le mur" pendant que le fond grandit) :
  // nom ↓, bloc data ↑, countdown ↑ plus loin — masqué par le borderRadius/overflow de la card.
  // L'exit s'achève tôt (morph 0→0.4) pour laisser place à l'agrandissement du fond.
  const exitActive = !!morph && !!isMorphing;
  const fade = exitActive ? morph!.interpolate({ inputRange: [0, 0.4], outputRange: [1, 0], extrapolate: "clamp" }) : undefined;
  const nameStyle = exitActive ? { opacity: fade, transform: [{ translateY: morph!.interpolate({ inputRange: [0, 0.4], outputRange: [0, 44], extrapolate: "clamp" }) }] } : null;
  const dataStyle = exitActive ? { opacity: fade, transform: [{ translateY: morph!.interpolate({ inputRange: [0, 0.4], outputRange: [0, -44], extrapolate: "clamp" }) }] } : null;
  const bottomStyle = exitActive ? { opacity: fade, transform: [{ translateY: morph!.interpolate({ inputRange: [0, 0.4], outputRange: [0, -72], extrapolate: "clamp" }) }] } : null;
  const handlePress = () => {
    const node = cardRef.current;
    if (node?.measureInWindow) {
      node.measureInWindow((x: number, y: number, w: number, h: number) =>
        onSelect(card.id, w > 0 && h > 0 ? { x, y, width: w, height: h } : undefined)
      );
    } else {
      onSelect(card.id);
    }
  };
  return (
    <TouchableOpacity
      ref={cardRef}
      activeOpacity={0.9}
      onPress={handlePress}
      style={[s.card, { width, height, marginRight }]}
    >
      {/* Contenu clippé (coins arrondis) : fond flouté + infos. L'overflow:hidden vit ICI,
          pas sur la card, pour que la bordure de sélection (rendue par-dessus, hors clip)
          ne soit pas rognée — notamment en bas. */}
      <View style={s.cardClip}>
      {card.bgUrl ? (
        // Flou "card" unifié (token cardBlur) — statique, pas de BlurView live ×N cartes.
        <BlurredImageBackground uri={card.bgUrl} />
      ) : (
        // Aucun moment → background/default/secondary (forcé dark via ForceThemeMode)
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.card }]} />
      )}

      <View style={s.cardContent}>
        {/* Nom du groupe (texte text/default sur fond brand/default) */}
        <Animated.View style={nameStyle}>
          <NameTag text={card.name} />
        </Animated.View>

        {/* Bloc data : shape du dernier moment + nombre de moments */}
        <Animated.View style={[s.dataBlock, dataStyle]}>
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
        </Animated.View>

        {/* Countdown + cadenas (ou état "reveal disponible") */}
        <Animated.View style={[s.countdownWrap, bottomStyle]}>
          <Text style={s.unlockHint}>
            {unlocked ? "Ouvre ton groupe pour le déverrouiller" : "Encore un peu de patience..."}
          </Text>
          {/* border/default/default sur le bouton (state "disponible" comme "indisponible") */}
          <View style={s.countdown}>
            {unlocked ? (
              card.momentCount > 0 ? (
                <>
                  <Text style={s.countdownText}>Disponible</Text>
                  <Icon name="unlock" size={24} color={colors.iconBrandTertiary} />
                </>
              ) : (
                // Reveal atteint mais aucun moment → indisponible, icône cadenas (icon/neutral/default)
                <>
                  <Text style={s.countdownText}>Indisponible</Text>
                  <Icon name="lock" size={24} color={colors.iconNeutral} />
                </>
              )
            ) : (
              <>
                <RevealCountdown revealDate={revealDate} textStyle={s.countdownText} />
                <Icon name="lock" size={24} color={colors.icon} />
              </>
            )}
          </View>
        </Animated.View>
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

export default function GroupsSlider({ cards, revealDate, onSelect, showActiveBorder = true, morph, morphingId }: Props) {
  const sliderStyles = useThemedStyles(makeSliderStyles);
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  // Slider geometry — peek 1/10 sur chaque côté (identique aux défis)
  const gap = spacing.xl;
  const cardWidth = (screenWidth - 2 * gap) / 1.2 + 30; // +15px de chaque côté
  const sideMargin = (screenWidth - cardWidth) / 2;
  const snapInterval = cardWidth + gap;

  const [availableHeight, setAvailableHeight] = useState(0);

  const count = cards.length;
  const hasMultiple = count > 1;
  // ≤5 groupes → pastilles de pagination ; >5 groupes → seulement le compteur x/x.
  const showDots = hasMultiple && count <= 5;
  const cardHeight = availableHeight > 0
    ? availableHeight - (hasMultiple ? DOTS_AREA_HEIGHT : 0)
    : 0;

  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  // Pas de loop : on rend les cartes une seule fois.
  const displayItems = cards;

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

  // Index courant pour le tic haptique de sélection (dédupliqué : un seul tic par carte
  // qui passe au centre, pas un par frame).
  const hapticIdxRef = useRef(0);
  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: true,
      listener: (e: any) => {
        if (count === 0 || snapInterval === 0) return;
        const x = e.nativeEvent.contentOffset.x;
        const idx = Math.max(0, Math.min(count - 1, Math.round(x / snapInterval)));
        if (idx !== hapticIdxRef.current) {
          hapticIdxRef.current = idx;
          hapticSelection();
        }
        setActiveIndex(idx);
      },
    }
  );

  const handleMomentumScrollEnd = (e: any) => {
    if (count === 0 || snapInterval === 0) return;
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / snapInterval);
    setActiveIndex(Math.max(0, Math.min(count - 1, idx)));
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
                  key={card.id}
                  card={card}
                  width={cardWidth}
                  height={cardHeight}
                  marginRight={gap}
                  revealDate={revealDate}
                  unlocked={card.unlocked}
                  onSelect={onSelect}
                  borderOpacity={showActiveBorder ? borderOpacities[idx] : undefined}
                  morph={morph}
                  isMorphing={!!morphingId && card.id === morphingId}
                />
              ))}
            </Animated.ScrollView>

            {hasMultiple && (
              <View style={sliderStyles.paginationWrap}>
                {showDots ? (
                  // ≤5 groupes : pastilles uniquement (pas de compteur).
                  <View style={sliderStyles.dotsRow}>
                    {cards.map((_, idx) => (
                      <AnimatedDot
                        key={idx}
                        scrollX={scrollX}
                        center={idx * snapInterval}
                        snapInterval={snapInterval}
                        baseStyle={sliderStyles.dot}
                        activeColor={colors.iconBrandTertiary}
                      />
                    ))}
                  </View>
                ) : (
                  // >5 groupes : compteur x/x uniquement (pas de pastilles).
                  <Text style={sliderStyles.pageCounter}>{`${activeIndex + 1}/${count}`}</Text>
                )}
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
  },
  // Calque clippé (coins arrondis) contenant le fond + le contenu. Séparé de `card` pour
  // que la bordure de sélection, dessinée au-dessus hors de ce clip, ne soit pas rognée.
  cardClip: {
    ...StyleSheet.absoluteFillObject,
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xl4, // space/1600 = 64
    paddingHorizontal: spacing.xl, // space/600 = 24
    gap: spacing.xl3, // 48 (min entre éléments ; space-between répartit le reste)
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
    height: 72,
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
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
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
