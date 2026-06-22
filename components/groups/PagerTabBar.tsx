import { Animated, View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { spacing, radii, textStyles, type ThemeColors } from "../../lib/theme";
import Icon from "../Icon";
import { FlowerIcon } from "../icons";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type Props = {
  scrollX: Animated.Value;
  colors: ThemeColors;
  backgroundColor: string;
  opacity: Animated.AnimatedInterpolation<number>;
  pointerEvents: "auto" | "none";
  onJump: (page: number) => void;
  /** Page actuellement affichée : son onglet n'a pas d'effet de press (on y est déjà). */
  currentPage: number;
};

/**
 * Barre d'onglets du pager. Thème FIXE (couleurs passées en prop) → aucun re-render
 * pour changer de couleur. L'indicateur d'onglet actif et l'opacité globale suivent
 * `scrollX` (driver natif) → transitions fluides sans clignotement.
 *
 * On en rend deux superposées : une sombre (capture) et une au thème de l'app (reste),
 * qui se croisent en fondu selon la position de scroll.
 */
export default function PagerTabBar({ scrollX, colors, backgroundColor, opacity, pointerEvents, onJump, currentPage }: Props) {
  const styles = makeStyles(colors);

  const tab0Active = scrollX.interpolate({ inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH], outputRange: [0, 1, 0], extrapolate: "clamp" });
  const tab0Inactive = scrollX.interpolate({ inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH], outputRange: [1, 0, 1], extrapolate: "clamp" });
  const tab1Active = scrollX.interpolate({ inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH], outputRange: [0, 1, 0], extrapolate: "clamp" });
  const tab1Inactive = scrollX.interpolate({ inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH], outputRange: [1, 0, 1], extrapolate: "clamp" });
  const tab2Active = scrollX.interpolate({ inputRange: [SCREEN_WIDTH, 2 * SCREEN_WIDTH, 3 * SCREEN_WIDTH], outputRange: [0, 1, 0], extrapolate: "clamp" });
  const tab2Inactive = scrollX.interpolate({ inputRange: [SCREEN_WIDTH, 2 * SCREEN_WIDTH, 3 * SCREEN_WIDTH], outputRange: [1, 0, 1], extrapolate: "clamp" });

  return (
    <Animated.View style={[styles.container, { backgroundColor, opacity }]} pointerEvents={pointerEvents}>
      <View style={styles.content}>
        {/* Groupes */}
        <TouchableOpacity style={styles.tab} onPress={() => onJump(0)} activeOpacity={currentPage === 0 ? 1 : 0.2}>
          <Animated.View style={[styles.tabStack, { opacity: tab0Inactive }]}>
            <FlowerIcon size={24} color={colors.iconSecondary} filled={false} />
            <Text style={[styles.tabLabel, { color: colors.textSecondary }]}>Groupes</Text>
          </Animated.View>
          <Animated.View style={[styles.tabStack, { opacity: tab0Active }]}>
            <FlowerIcon size={24} color={colors.icon} filled={true} />
            <Text style={[styles.tabLabel, { color: colors.text }]}>Groupes</Text>
          </Animated.View>
          <View style={styles.tabPlaceholder}>
            <FlowerIcon size={24} filled={true} />
            <Text style={styles.tabLabel}>Groupes</Text>
          </View>
        </TouchableOpacity>

        {/* Capture */}
        <TouchableOpacity style={styles.tab} onPress={() => onJump(1)} activeOpacity={currentPage === 1 ? 1 : 0.2}>
          <Animated.View style={[styles.tabStack, { opacity: tab1Inactive }]}>
            <Icon name="circle" size={24} color={colors.iconSecondary} />
            <Text style={[styles.tabLabel, { color: colors.textSecondary }]}>Capture</Text>
          </Animated.View>
          <Animated.View style={[styles.tabStack, { opacity: tab1Active }]}>
            <Icon name="circle-filled" size={24} color={colors.icon} />
            <Text style={[styles.tabLabel, { color: colors.text }]}>Capture</Text>
          </Animated.View>
          <View style={styles.tabPlaceholder}>
            <Icon name="circle-filled" size={24} />
            <Text style={styles.tabLabel}>Capture</Text>
          </View>
        </TouchableOpacity>

        {/* Profil */}
        <TouchableOpacity style={styles.tab} onPress={() => onJump(2)} activeOpacity={currentPage === 2 ? 1 : 0.2}>
          <Animated.View style={[styles.tabStack, { opacity: tab2Inactive }]}>
            <Icon name="user" size={24} color={colors.iconSecondary} />
            <Text style={[styles.tabLabel, { color: colors.textSecondary }]}>Profil</Text>
          </Animated.View>
          <Animated.View style={[styles.tabStack, { opacity: tab2Active }]}>
            <Icon name="user-filled" size={24} color={colors.icon} />
            <Text style={[styles.tabLabel, { color: colors.text }]}>Profil</Text>
          </Animated.View>
          <View style={styles.tabPlaceholder}>
            <Icon name="user-filled" size={24} />
            <Text style={styles.tabLabel}>Profil</Text>
          </View>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 26,
    left: 16,
    right: 16,
    zIndex: 100,
    paddingVertical: spacing.sm,
    paddingHorizontal: 0,
    borderRadius: radii.lg,
  },
  content: { flexDirection: "row" },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  tabStack: { position: "absolute", alignItems: "center", gap: spacing.sm },
  tabPlaceholder: { opacity: 0, alignItems: "center", gap: spacing.sm },
  tabLabel: { ...textStyles.singleLineBodyExtraSmallStrong, color: colors.text },
});
