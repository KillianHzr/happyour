import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNetworkState } from "expo-network";
import { spacing, textStyles, type ThemeColors } from "../lib/theme";
import { useTheme, useThemedStyles } from "../lib/theme-context";
import Icon from "./Icon";

/**
 * Bandeau global "pas de connexion" (charte : tokens danger). Affiché en haut, par-dessus
 * tout, tant que l'appareil est hors-ligne ; se replie automatiquement au retour du réseau.
 * Non interactif (pointerEvents none) pour ne pas gêner l'écran dessous.
 */
export default function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const net = useNetworkState();
  const offline = net.isConnected === false || net.isInternetReachable === false;

  const anim = useRef(new Animated.Value(0)).current; // 0 = replié, 1 = visible

  useEffect(() => {
    Animated.timing(anim, {
      toValue: offline ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [offline]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.container, { paddingTop: insets.top, opacity: anim, transform: [{ translateY }] }]}
    >
      <View style={styles.row}>
        <Icon name="info" size={16} color={colors.iconDangerOnDanger} />
        <Text style={styles.text}>Pas de connexion internet</Text>
      </View>
    </Animated.View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: colors.bgDanger, // background/danger/default
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,        // space/200
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg, // space/400
  },
  text: {
    ...textStyles.bodySmallStrong,
    color: colors.textDangerOnDanger, // text/danger/on-danger-default
  },
});
