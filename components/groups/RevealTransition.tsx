import { useEffect } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import { Image } from "expo-image";
import BlurView from "../atoms/BlurView";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from "react-native-reanimated";

const { width: SW } = Dimensions.get("window");

type Props = {
  /** Images floutées, du plus récent (= fond de la card) au plus ancien (= 1er moment). */
  urls: string[];
  /** Le filmstrip a atteint le 1er moment → ouvrir le reveal. */
  onArrived: () => void;
  /** Le reveal recouvre → on peut démonter la transition. */
  onDone: () => void;
};

const STRIP_MS = 1100;

/**
 * Filmstrip de transition (plein écran) : la card réelle a déjà grandi (GroupRoom),
 * ici on défile vers la gauche du dernier moment posté (= fond de la card) au tout
 * premier, tout flouté. À l'arrivée → `onArrived` (le reveal/RevealIntroPage prend le
 * relais avec la même image floutée), puis `onDone` une fois recouvert.
 */
export default function RevealTransition({ urls, onArrived, onDone }: Props) {
  const strip = useSharedValue(0);
  const n = Math.max(1, urls.length);

  useEffect(() => {
    const arrived = () => {
      onArrived();
      setTimeout(onDone, 150);
    };
    // Démarre immédiatement (la card est déjà plein écran).
    strip.value = withTiming(1, { duration: STRIP_MS, easing: Easing.inOut(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(arrived)();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -strip.value * (n - 1) * SW }],
  }));

  return (
    <View style={styles.root} pointerEvents="none">
      <Reanimated.View style={[styles.row, { width: n * SW }, rowStyle]}>
        {urls.map((u, i) => (
          <View key={`${i}-${u}`} style={styles.frame}>
            {u ? (
              <>
                {/* Même flou que la RevealIntroPage (atoms/BlurView 75) → raccord invisible */}
                <Image source={{ uri: u }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} cachePolicy="memory-disk" />
                <BlurView intensity={75} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
              </>
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0A0A0A" }]} />
            )}
          </View>
        ))}
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 150, overflow: "hidden" },
  row: { flexDirection: "row", height: "100%" },
  frame: { width: SW, height: "100%" },
});
