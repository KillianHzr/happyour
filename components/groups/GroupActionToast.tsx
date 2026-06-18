import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { spacing, radii, textStyles, type ThemeColors } from "../../lib/theme";

export type GroupAction = { type: "left" | "deleted"; name: string };

type Props = {
  action: GroupAction | null;
  onDismiss: () => void;
};

/**
 * Toast (sans shape) affiché sur la liste des groupes après avoir quitté ou supprimé
 * un groupe : « Tu as quitté/supprimé le groupe [nom] », le nom étant dans un span
 * coloré (fond brand, texte inverse). Pour la suppression, le nom est tronqué par « … ».
 */
export default function GroupActionToast({ action, onDismiss }: Props) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!action) return;
    opacity.setValue(0);
    translateY.setValue(-12);
    Animated.parallel([
      Animated.spring(opacity, { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }),
    ]).start();
    timer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -12, duration: 220, useNativeDriver: true }),
      ]).start(() => onDismiss());
    }, 3000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [action]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!action) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { top: insets.top + 16, opacity, transform: [{ translateY }] }]}
    >
      <View style={styles.row}>
        <Text style={styles.text}>
          {action.type === "left" ? "Tu as quitté le groupe" : "Tu as supprimé le groupe"}
        </Text>
        <View style={styles.pill}>
          <Text style={styles.pillText} numberOfLines={1} ellipsizeMode="tail">{action.name}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  wrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 9999,
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  text: {
    ...textStyles.bodyStrong,
    color: colors.text,
  },
  pill: {
    flexDirection: "row",
    paddingVertical: spacing.xs2,
    paddingHorizontal: spacing.xs2,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radii.xs,
    backgroundColor: colors.brand,
    maxWidth: 180,
  },
  pillText: {
    ...textStyles.bodyStrong,
    color: colors.textInverse,
  },
});
