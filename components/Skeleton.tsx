import { useEffect, useRef } from "react";
import { Animated, StyleSheet, type ViewStyle } from "react-native";

type Props = {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
};

export default function Skeleton({ width, height, borderRadius = 8, style }: Props) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width, height, borderRadius, opacity },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
});
