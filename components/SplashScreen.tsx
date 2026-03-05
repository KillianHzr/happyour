import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import { colors } from "../lib/theme";

interface SplashScreenProps {
  onFinish: () => void;
  ready: boolean;
}

export default function SplashScreen({ onFinish, ready }: SplashScreenProps) {
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const dotOpacity1 = useRef(new Animated.Value(0.1)).current;
  const dotOpacity2 = useRef(new Animated.Value(0.1)).current;
  const dotOpacity3 = useRef(new Animated.Value(0.1)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;
  const readyRef = useRef(ready);

  readyRef.current = ready;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();

    const pulseDot = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );

    pulseDot(dotOpacity1, 0).start();
    pulseDot(dotOpacity2, 200).start();
    pulseDot(dotOpacity3, 400).start();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      Animated.timing(fadeOut, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start(() => onFinish());
    }, 600);
    return () => clearTimeout(timer);
  }, [ready]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}>
      <Animated.View style={[styles.logoContainer, { transform: [{ scale: logoScale }], opacity: logoOpacity }]}>
        <View style={styles.logoMark} />
        <Text style={styles.title}>[noname]</Text>
      </Animated.View>
      <View style={styles.dots}>
        {[dotOpacity1, dotOpacity2, dotOpacity3].map((dot, i) => (
          <Animated.View key={i} style={[styles.dot, { opacity: dot }]} />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  logoContainer: { alignItems: "center" },
  logoMark: {
    width: 40,
    height: 40,
    borderWidth: 3,
    borderColor: "#fff",
    borderRadius: 8,
    marginBottom: 20,
    transform: [{ rotate: "45deg" }],
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: colors.text,
    letterSpacing: -0.5,
    textTransform: "lowercase",
  },
  dots: { flexDirection: "row", marginTop: 60, gap: 12 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#fff" },
});
