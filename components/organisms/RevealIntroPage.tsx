import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { Svg, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const NAVBAR_HEIGHT = 100;

interface RevealIntroPageProps {
  groupName?: string;
  isVisible: boolean;
  customTitle?: string;
  customSubtitle?: string;
}

export const RevealIntroPage = ({ 
  groupName, 
  isVisible, 
  customTitle, 
  customSubtitle 
}: RevealIntroPageProps) => {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  const hintOpacity = useRef(new Animated.Value(0)).current;
  const hintY = useRef(new Animated.Value(0)).current;
  const hasPlayed = useRef(false);

  useEffect(() => {
    if (!isVisible || hasPlayed.current) return;
    hasPlayed.current = true;
    opacity.setValue(0);
    scale.setValue(0.9);
    hintOpacity.setValue(0);
    hintY.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, tension: 55, friction: 9, useNativeDriver: true }),
      ]),
      Animated.delay(300),
      Animated.timing(hintOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(hintY, { toValue: 8, duration: 600, useNativeDriver: true }),
          Animated.timing(hintY, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    });
  }, [isVisible]);

  return (
    <View style={styles.fullscreenPage}>
      <Animated.View style={{ alignItems: "center", opacity, transform: [{ scale }] }}>
        {!customTitle && <Text style={styles.revealIntroEyebrow}>cette semaine</Text>}
        <Text style={styles.revealIntroTitle}>{customTitle ?? "Le Reveal"}</Text>
        {customSubtitle
          ? <Text style={styles.revealIntroGroup}>{customSubtitle}</Text>
          : groupName ? <Text style={styles.revealIntroGroup}>{groupName}</Text> : null}
      </Animated.View>
      <Animated.View 
        style={[
          styles.revealIntroHint, 
          { 
            bottom: Math.round((Math.max(insets.top, 12) + 24 + NAVBAR_HEIGHT + 24) / 2), 
            opacity: hintOpacity, 
            transform: [{ translateY: hintY }] 
          }
        ]}
      >
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Path 
            d="M12 5v14M5 12l7 7 7-7" 
            stroke="rgba(255,255,255,0.35)" 
            strokeWidth="1.5" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />
        </Svg>
        <Text style={styles.revealIntroHintText}>Scroll</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  fullscreenPage: { 
    flex: 1,
    width: "100%", 
    height: "100%", 
    justifyContent: "center", 
    alignItems: "center", 
    backgroundColor: "#000" 
  },
  revealIntroEyebrow: { 
    fontFamily: "Inter_400Regular", 
    fontSize: 13, 
    color: "rgba(255,255,255,0.4)", 
    letterSpacing: 4, 
    textTransform: "uppercase", 
    marginBottom: 10 
  },
  revealIntroTitle: { 
    fontFamily: "Inter_700Bold", 
    fontSize: 58, 
    color: "#FFF", 
    letterSpacing: -1.5, 
    lineHeight: 62, 
    textAlign: "center" 
  },
  revealIntroGroup: { 
    fontFamily: "Inter_400Regular", 
    fontSize: 18, 
    color: "rgba(255,255,255,0.4)", 
    marginTop: 10, 
    textAlign: "center" 
  },
  revealIntroHint: { 
    position: "absolute", 
    alignItems: "center", 
    gap: 6 
  },
  revealIntroHintText: { 
    fontFamily: "Inter_400Regular", 
    fontSize: 11, 
    color: "rgba(255,255,255,0.3)", 
    letterSpacing: 2, 
    textTransform: "uppercase" 
  },
});
