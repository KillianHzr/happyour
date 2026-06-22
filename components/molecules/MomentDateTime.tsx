import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { spacing, typography, textStyles, type ThemeColors } from "../../lib/theme";
import { useThemedStyles } from "../../lib/theme-context";

// Jour (ex. "Lundi") du moment, première lettre en majuscule.
const getDayText = (dateStr: string) => {
  const d = new Date(dateStr);
  const day = d.toLocaleDateString("fr-FR", { weekday: "long" });
  return day.charAt(0).toUpperCase() + day.slice(1);
};

// Heure du moment au format "HH:MM".
const getTimeText = (dateStr: string) => {
  const d = new Date(dateStr);
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

interface MomentDateTimeProps {
  /** Date ISO du moment (`moment.created_at`). */
  created_at: string;
}

// Jour + heure d'un post (en-tête des moments du reveal). Partagé par PhotoMoment,
// VideoMoment et AudioMoment pour un style unique à maintenir au même endroit.
export const MomentDateTime = ({ created_at }: MomentDateTimeProps) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.container}>
      <Text style={styles.dayText}>{getDayText(created_at)}</Text>
      <Text style={styles.timeText}>{getTimeText(created_at)}</Text>
    </View>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dayText: {
    color: colors.text,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.md,
    lineHeight: typography.size.md * 1.4,
  },
  timeText: {
    ...textStyles.bodySmall,
    color: colors.text,
    marginTop: 2,
  },
});
