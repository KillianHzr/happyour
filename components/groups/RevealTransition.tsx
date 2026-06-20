import { useEffect } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import { Image } from "expo-image";
import LottieView from "lottie-react-native";
import { radii } from "../../lib/theme";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  interpolate,
  Extrapolation,
  Easing,
  runOnJS,
} from "react-native-reanimated";

const { width: SW, height: SH } = Dimensions.get("window");
const TARGET_H = SH;
const GROW_MS = 420;
const STRIP_MS = 1100;
const BLUR_RADIUS = 38;
// = durée de l'aspiration du chrome (GroupRoom) : la transition (et donc CE composant) monte
// à la fin de l'aspiration → le Lottie reprend ici, exactement où la card en était.
const EXIT_MS = 700;

const ReanimatedLottie = Reanimated.createAnimatedComponent(LottieView);

type Frame = { x: number; y: number; width: number; height: number };
type Lottie = { source: any; freezeProgress: number; endProgress: number; durationMs: number };

type Props = {
  cardFrame: Frame; // x ignoré (faussé par le scroll horizontal du pager) → on recentre
  urls: string[];   // du plus récent (= fond de la card) au plus ancien (= 1er moment)
  lottie?: Lottie;
  lottieFrame?: Frame | null; // frame du lottieWrap de la card (x recentré)
  /** false = monté mais invisible (préchauffe textures/Lottie pendant l'aspiration) ;
   *  true = on lance le grow + scroll. Découple le montage (coûteux) du démarrage de l'anim. */
  active: boolean;
  onArrived: () => void;
  onDone: () => void;
};

/**
 * Transition single → reveal, performante (transform + flou statique), avec le LOTTIE
 * re-rendu AU-DESSUS du filmstrip (la card du pager ne peut pas dépasser l'overlay en
 * z-index → on le rejoue ici, à l'identique : même source, même vitesse, en continuant
 * exactement là où la card en était à la fin de l'aspiration).
 */
export default function RevealTransition({ cardFrame, urls, lottie, lottieFrame, active, onArrived, onDone }: Props) {
  const grow = useSharedValue(0);
  const strip = useSharedValue(0);
  const n = Math.max(1, urls.length);

  const sx0 = cardFrame.width / SW;
  const sy0 = cardFrame.height / TARGET_H;
  const ty0 = cardFrame.y + cardFrame.height / 2 - TARGET_H / 2;

  // Lottie : reprend à la progression atteinte à EXIT_MS et finit à endProgress, même vitesse.
  const lottieStart = lottie ? lottie.freezeProgress + (EXIT_MS / lottie.durationMs) * (lottie.endProgress - lottie.freezeProgress) : 0;
  const lottieRemaining = lottie ? Math.max(1, lottie.durationMs - EXIT_MS) : 1;
  const lottieFadeStart = lottie ? lottie.endProgress - (lottie.endProgress - lottie.freezeProgress) * 200 / lottie.durationMs : 0;
  const lottieProgress = useSharedValue(lottieStart);

  // L'anim ne démarre QUE quand active=true (le montage a déjà préchauffé textures/Lottie).
  useEffect(() => {
    if (!active) return;
    const arrived = () => {
      onArrived();
      setTimeout(onDone, 150);
    };
    grow.value = withTiming(1, { duration: GROW_MS, easing: Easing.bezier(0.5, 0, 0.75, 0) }, (finGrow) => {
      if (finGrow) {
        strip.value = withTiming(1, { duration: STRIP_MS, easing: Easing.inOut(Easing.cubic) }, (finStrip) => {
          if (finStrip) runOnJS(arrived)();
        });
      }
    });
    if (lottie) {
      lottieProgress.value = withTiming(lottie.endProgress, { duration: lottieRemaining, easing: Easing.linear });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const containerStyle = useAnimatedStyle(() => {
    const g = grow.value;
    return {
      borderRadius: radii.xl * (1 - g),
      transform: [
        { translateY: ty0 * (1 - g) },
        { scaleX: sx0 + (1 - sx0) * g },
        { scaleY: sy0 + (1 - sy0) * g },
      ],
    };
  });
  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -strip.value * (n - 1) * SW }],
  }));
  const lottieAnimProps = useAnimatedProps(() => ({ progress: lottieProgress.value }));
  const lottieOpacity = useAnimatedStyle(() => ({
    opacity: lottie ? interpolate(lottieProgress.value, [lottieFadeStart, lottie.endProgress], [1, 0], Extrapolation.CLAMP) : 0,
  }));

  return (
    // opacity 0 tant que !active : monté (préchauffe) mais invisible, la card/aspiration reste visible.
    <View style={[styles.root, { opacity: active ? 1 : 0 }]} pointerEvents="none">
      <Reanimated.View style={[styles.card, containerStyle]}>
        <Reanimated.View style={[styles.row, { width: n * SW }, rowStyle]}>
          {urls.map((u, i) => (
            <View key={`${i}-${u}`} style={styles.frame}>
              {u ? (
                <>
                  <Image
                    source={{ uri: u }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={0}
                    cachePolicy="memory-disk"
                    blurRadius={BLUR_RADIUS}
                  />
                  <View style={styles.veil} pointerEvents="none" />
                </>
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0A0A0A" }]} />
              )}
            </View>
          ))}
        </Reanimated.View>
      </Reanimated.View>

      {/* Lottie AU-DESSUS du filmstrip, fixe à sa position d'origine, qui continue + fond */}
      {lottie?.source && lottieFrame ? (
        <Reanimated.View
          style={[
            {
              position: "absolute",
              left: (SW - lottieFrame.width) / 2,
              top: lottieFrame.y,
              width: lottieFrame.width,
              height: lottieFrame.height,
              alignItems: "center",
              justifyContent: "center",
            },
            lottieOpacity,
          ]}
          pointerEvents="none"
        >
          <ReanimatedLottie
            source={lottie.source}
            animatedProps={lottieAnimProps}
            autoPlay={false}
            loop={false}
            resizeMode="contain"
            style={{ width: "100%", aspectRatio: 402 / 874, transform: [{ translateY: 50 }] }}
          />
        </Reanimated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 150 },
  card: { position: "absolute", top: 0, left: 0, width: SW, height: TARGET_H, overflow: "hidden", backgroundColor: "#0A0A0A" },
  row: { flexDirection: "row", height: "100%" },
  frame: { width: SW, height: "100%" },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
});
