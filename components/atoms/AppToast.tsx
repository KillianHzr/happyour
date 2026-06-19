import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, TouchableOpacity } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { radii, textStyles, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import Icon from "../Icon";

export type ToastType = "success" | "error" | "info";

// --- Icônes ---
const CheckIcon = () => (
  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 6L9 17l-5-5" />
  </Svg>
);

const CrossIcon = () => (
  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="10" />
    <Path d="M15 9l-6 6M9 9l6 6" />
  </Svg>
);

const InfoCircleIcon = () => (
  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="10" />
    <Path d="M12 16v-4M12 8h.01" />
  </Svg>
);

interface AppToastProps {
  title: string;
  message?: string;
  type?: ToastType;
  onDismiss?: () => void;
}

/**
 * Carte de toast réutilisable, calquée sur le toast « Photo partagée dans … »
 * de la page capture : fond plein thématisé (colors.card), icône à gauche,
 * texte bodyStrong et bouton de fermeture. L'animation d'entrée est jouée au
 * montage ; la disparition automatique est gérée par le parent.
 */
export function AppToast({ title, message, type = "info", onDismiss }: AppToastProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(opacity, { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[styles.card, { opacity, transform: [{ translateY }] }]}
      pointerEvents="box-none"
    >
      {type === "success" ? <CheckIcon /> : type === "error" ? <CrossIcon /> : <InfoCircleIcon />}
      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
      {onDismiss ? (
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="x" size={20} color={colors.icon} />
        </TouchableOpacity>
      ) : null}
    </Animated.View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 16,
      borderRadius: radii.sm,
      backgroundColor: colors.card,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 8,
    },
    textContainer: {
      flex: 1,
      gap: 2,
    },
    title: {
      ...textStyles.bodyStrong,
      color: colors.text,
    },
    message: {
      ...textStyles.bodyBase,
      color: colors.secondary,
    },
  });
