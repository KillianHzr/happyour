import { useEffect, useMemo, useRef } from "react";
import { View, StyleSheet } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import LottieView from "lottie-react-native";
import { BlurView } from "expo-blur";
import Reanimated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { radii } from "../../lib/theme";

/**
 * Animation d'envoi d'un moment.
 *
 * Le Lottie (`send_photo` / `send_draw` / `send_video`) est une forme verte
 * (`FOND MORPH`, #35FF02) qui se déforme — composée via un track-matte, donc la
 * seule chose *visible* du Lottie est cette forme verte. On l'utilise comme masque :
 * la capture nette n'apparaît QUE dans le vert qui se déforme puis s'envoie.
 *
 * Logique de timing ROBUSTE : au lieu de compter sur l'autoPlay du Lottie + son
 * callback `onAnimationFinish` (peu fiables dans un maskElement → anim qui ne se
 * lance pas, ou preview qui se ferme trop tôt), on PILOTE nous-mêmes la `progress`
 * du Lottie via une animation reanimated déterministe. La fin (`onFinish`) est
 * déclenchée par le callback de cette animation, et le flou du bouton est piloté
 * par la MÊME `progress` → parfaitement synchronisé, vitesse Lottie par défaut.
 */
export type SendAnimationType = "photo" | "draw" | "video";

const ReanimatedLottie = Reanimated.createAnimatedComponent(LottieView);

const SOURCES: Record<SendAnimationType, any> = {
  photo: require("../../assets/lotties/send_photo.json"),
  draw: require("../../assets/lotties/send_draw.json"),
  video: require("../../assets/lotties/send_video.json"),
};

/**
 * Calcule, pour la lecture à vitesse par défaut :
 * - `morphProgress` : la valeur de `progress` (0→1) atteinte à la fin du morph
 *   (le Lottie traîne ensuite une longue queue statique qu'on ignore) ;
 * - `durationMs` : le temps réel pour y arriver à 60fps natif.
 */
function lottieTiming(src: any): { morphProgress: number; durationMs: number } {
  const fr = src?.fr || 60;
  const ip = src?.ip ?? 0;
  const op = src?.op ?? fr;
  let last = ip;
  const walk = (o: any) => {
    if (Array.isArray(o)) {
      o.forEach(walk);
    } else if (o && typeof o === "object") {
      if (Array.isArray(o.k) && o.k.length && typeof o.k[0] === "object") {
        for (const kf of o.k) if (typeof kf.t === "number") last = Math.max(last, kf.t);
      }
      for (const key in o) walk(o[key]);
    }
  };
  walk(src?.layers ?? []);
  const span = Math.max(1, op - ip);
  // petite marge (+0.05) pour garantir que le morph est VISUELLEMENT fini avant de fermer
  const morphProgress = Math.min(1, (last - ip) / span + 0.05);
  const durationMs = Math.max(300, (morphProgress * span / fr) * 1000);
  return { morphProgress, durationMs };
}

type Props = {
  type: SendAnimationType;
  onFinish: () => void;
  /** Contenu net (média + légende) révélé dans le vert du masque. */
  children: React.ReactNode;
  /** Fond plein affiché derrière le Lottie (le reste de la preview est masqué). */
  backgroundColor?: string;
  /** Bouton (Partager) laissé en bas ; il se floute progressivement pendant l'anim. */
  footer?: React.ReactNode;
  /** Boîte (coords racine) de la frame de preview — le masque s'y cale. Plein écran si absent. */
  frame?: { top: number; left: number; width: number; height: number } | null;
};

export default function SendAnimation({ type, onFinish, children, backgroundColor = "#0A0A0A", footer, frame }: Props) {
  const source = SOURCES[type];
  const { morphProgress, durationMs } = useMemo(() => lottieTiming(source), [source]);

  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onFinish();
  };

  // progress pilote le Lottie (masque) ; fond pilote l'apparition du fond (anti-flicker).
  const progress = useSharedValue(0);
  const fond = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    fond.value = withTiming(1, { duration: 180 });
    // Lecture déterministe à vitesse par défaut (linéaire = avance des frames à 60fps).
    progress.value = withTiming(
      morphProgress,
      { duration: durationMs, easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(finish)();
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lottieProps = useAnimatedProps(() => ({ progress: progress.value }));
  const fondStyle = useAnimatedStyle(() => ({ opacity: fond.value }));
  // Le flou monte de 0→1 sur toute la durée du morph (même temps que le Lottie).
  const blurStyle = useAnimatedStyle(() => ({
    opacity: morphProgress > 0 ? Math.min(1, progress.value / morphProgress) : 1,
  }));

  const maskBoxStyle = frame
    ? {
        position: "absolute" as const,
        top: frame.top,
        left: frame.left,
        width: frame.width,
        height: frame.height,
        overflow: "hidden" as const,
        borderTopLeftRadius: radii.xl,
        borderTopRightRadius: radii.xl,
      }
    : StyleSheet.absoluteFillObject;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="auto">
      {/* Fond plein, en fondu (la preview reste visible derrière au tout début) */}
      <Reanimated.View style={[StyleSheet.absoluteFillObject, { backgroundColor }, fondStyle]} pointerEvents="none" />

      {/* La capture nette n'est visible que dans la forme verte (pilotée par progress) */}
      <MaskedView
        style={maskBoxStyle}
        pointerEvents="none"
        maskElement={
          <ReanimatedLottie
            source={source}
            animatedProps={lottieProps}
            autoPlay={false}
            loop={false}
            resizeMode="cover"
            style={StyleSheet.absoluteFillObject}
          />
        }
      >
        {children}
      </MaskedView>

      {/* Bouton en bas : se floute progressivement, synchronisé au Lottie */}
      {footer != null && (
        <View style={[StyleSheet.absoluteFillObject, { justifyContent: "flex-end" }]} pointerEvents="box-none">
          <View>
            {footer}
            <Reanimated.View style={[StyleSheet.absoluteFillObject, blurStyle]} pointerEvents="none">
              <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} />
            </Reanimated.View>
          </View>
        </View>
      )}
    </View>
  );
}
