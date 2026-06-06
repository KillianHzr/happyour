import React from "react";
import { Dimensions } from "react-native";
import Reanimated, { useAnimatedStyle, interpolate, Extrapolation, SharedValue } from "react-native-reanimated";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const FEED_HEIGHT = SCREEN_HEIGHT - 100;

interface AnimatedPageWrapperProps {
  index: number;
  scrollY: SharedValue<number>;
  children: React.ReactNode;
}

export const AnimatedPageWrapper = ({ index, scrollY, children }: AnimatedPageWrapperProps) => {
  const animStyle = useAnimatedStyle(() => {
    const inputRange = [(index - 1) * FEED_HEIGHT, index * FEED_HEIGHT, (index + 1) * FEED_HEIGHT];
    
    // Scale transition: 0.94 to 1
    const scale = interpolate(scrollY.value, inputRange, [0.94, 1, 0.94], Extrapolation.CLAMP);
    
    // Opacity transition: more pronounced fade
    const opacity = interpolate(scrollY.value, inputRange, [0.4, 1, 0.4], Extrapolation.CLAMP);
    
    // Slight vertical shift to make it feel like items are stacked
    const translateY = interpolate(scrollY.value, inputRange, [FEED_HEIGHT * 0.05, 0, -FEED_HEIGHT * 0.05], Extrapolation.CLAMP);

    return { 
      transform: [
        { scale },
        { translateY }
      ], 
      opacity 
    };
  });

  return (
    <Reanimated.View style={[{ height: FEED_HEIGHT, width: SCREEN_WIDTH }, animStyle]}>
      {children}
    </Reanimated.View>
  );
};
