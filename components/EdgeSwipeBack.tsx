import { type ReactNode } from "react";
import { Dimensions, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const EDGE_WIDTH = 50;          // zone active depuis le bord gauche
const DISMISS_RATIO = 0.35;     // distance pour valider le retour
const DISMISS_VELOCITY = 600;   // ou vitesse de flick (px/s)

/**
 * Retour en arrière par glissement depuis le bord gauche (façon iOS/Instagram) pour les
 * vues custom (modals/overlays) qui ne sont pas des écrans de la stack native.
 *
 * Utilise react-native-gesture-handler (zone de bord via hitSlop, n'interfère pas avec le
 * scroll vertical grâce à activeOffsetX/failOffsetY) + reanimated (animation sur le thread UI).
 * NB: dans un <Modal> RN, il faut envelopper le contenu dans un <GestureHandlerRootView>.
 */
export default function EdgeSwipeBack({
  onBack,
  enabled = true,
  style,
  children,
}: {
  onBack: () => void;
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const tx = useSharedValue(0);

  const pan = Gesture.Pan()
    .enabled(enabled)
    .hitSlop({ left: 0, width: EDGE_WIDTH })
    .activeOffsetX(12)
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      tx.value = Math.max(0, e.translationX);
    })
    .onEnd((e) => {
      if (e.translationX > SCREEN_WIDTH * DISMISS_RATIO || e.velocityX > DISMISS_VELOCITY) {
        tx.value = withTiming(SCREEN_WIDTH, { duration: 180 }, (finished) => {
          if (finished) runOnJS(onBack)();
        });
      } else {
        tx.value = withSpring(0, { damping: 20, stiffness: 220 });
      }
    });

  const animStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  return (
    <GestureDetector gesture={pan}>
      <Reanimated.View style={[style, animStyle]}>{children}</Reanimated.View>
    </GestureDetector>
  );
}
