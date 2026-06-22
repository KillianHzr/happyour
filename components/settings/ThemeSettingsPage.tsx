import { useRef } from "react";
import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { Circle, Mask, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, useThemedStyles, type ThemePreference } from "../../lib/theme-context";
import { spacing, textStyles, type ThemeColors } from "../../lib/theme";

// ─── Radio SVG atoms ──────────────────────────────────────────────────────────

const RADIO_BORDER = "M12 24V22.5C6.20101 22.5 1.5 17.799 1.5 12H0H-1.5C-1.5 19.4558 4.54416 25.5 12 25.5V24ZM24 12H22.5C22.5 17.799 17.799 22.5 12 22.5V24V25.5C19.4558 25.5 25.5 19.4558 25.5 12H24ZM12 0V1.5C17.799 1.5 22.5 6.20101 22.5 12H24H25.5C25.5 4.54416 19.4558 -1.5 12 -1.5V0ZM12 0V-1.5C4.54416 -1.5 -1.5 4.54416 -1.5 12H0H1.5C1.5 6.20101 6.20101 1.5 12 1.5V0Z";
const RADIO_FILL  = "M0 12C0 5.37258 5.37258 0 12 0C18.6274 0 24 5.37258 24 12C24 18.6274 18.6274 24 12 24C5.37258 24 0 18.6274 0 12Z";

function RadioIcon({ checked, color, disabledColor }: { checked: boolean; color: string; disabledColor: string }) {
  const borderColor = disabledColor ?? color;
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Mask id="m" fill="white">
        <Path d={RADIO_FILL} />
      </Mask>
      <Path d={RADIO_FILL} fill="white" fillOpacity={0} />
      <Path d={RADIO_BORDER} fill={borderColor} mask="url(#m)" />
      {checked && <Circle cx={12} cy={12} r={7.5} fill={color} />}
    </Svg>
  );
}

// ─── Radio row ────────────────────────────────────────────────────────────────

type Option = { value: ThemePreference; label: string };

const OPTIONS: Option[] = [
  { value: "system", label: "Automatique" },
  { value: "dark",   label: "Mode sombre" },
  { value: "light",  label: "Mode clair"  },
];

function RadioRow({
  label, checked, onPress, disabled,
}: { label: string; checked: boolean; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    if (disabled) return;
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 200 }),
    ]).start();
    onPress();
  };

  const radioColor   = disabled ? colors.borderDisabled : colors.iconBrandTertiary;
  const labelColor   = disabled ? colors.textDisabled   : colors.text;

  return (
    <TouchableOpacity style={styles.row} onPress={handlePress} activeOpacity={disabled ? 1 : 0.7}>
      <Text style={[styles.rowLabel, { color: labelColor }]}>{label}</Text>
      <Animated.View style={{ transform: [{ scale }] }}>
        <RadioIcon checked={checked} color={radioColor} disabledColor={radioColor} />
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ThemeSettingsPage() {
  const { preference, setPreference } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      showsVerticalScrollIndicator={false}
      alwaysBounceVertical={false}
    >
      <View style={styles.section}>
        <View style={styles.itemsList}>
          {OPTIONS.map(opt => (
            <RadioRow
              key={opt.value}
              label={opt.label}
              checked={preference === opt.value}
              onPress={() => setPreference(opt.value)}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (_colors: ThemeColors) => StyleSheet.create({
  content: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xxl,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xxl,
  },
  section: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.md,
    alignSelf: "stretch",
  },
  itemsList: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xs2,
    alignSelf: "stretch",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
    paddingVertical: spacing.xs2,
  },
  rowLabel: {
    ...textStyles.bodyBase,
    flex: 1,
  },
});
