import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Svg, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserAvatar } from "../atoms/Avatar";
import { PhotoEntry } from "../../lib/feed-types";
import { radii, spacing, typography, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";

const NAVBAR_HEIGHT = 100;

interface CrownRevealPageProps {
  winner: PhotoEntry;
  durationMs: number;
  currentUserId?: string;
  userDurationMs?: number;
}

function formatCrownDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}j`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}min`);
  return parts.join(" ");
}

export const CrownRevealPage = ({ winner, durationMs, currentUserId, userDurationMs = 0 }: CrownRevealPageProps) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const paddingTopBottom = Math.round((Math.max(insets.top, 12) + 24 + NAVBAR_HEIGHT + 24) / 2);
  const isWinner = currentUserId === winner.user_id;

  return (
    <View style={[styles.fullscreenPage, { paddingTop: paddingTopBottom, paddingBottom: paddingTopBottom }]}>
      <View style={styles.crownRevealInner}>
        <Svg width={64} height={64} viewBox="0 0 24 24" style={{ marginBottom: spacing.xs }}>
          <Path
            d="M2 19l2-9 4.5 4L12 5l3.5 9L20 10l2 9H2z"
            fill={colors.gold}
            stroke={colors.goldDark}
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
        </Svg>
        <Text style={styles.crownRevealTitle}>Couronne de la semaine</Text>
        <View style={styles.crownRevealAvatarWrap}>
          <View style={{ borderWidth: 3, borderColor: colors.gold, borderRadius: radii.full }}>
            <UserAvatar avatar_url={winner.avatar_url} username={winner.username} size={80} />
          </View>
        </View>
        <Text style={styles.crownRevealUsername}>{isWinner ? "Tu as gagné !" : winner.username}</Text>
        <Text style={styles.crownRevealDurationLabel}>
          {isWinner ? "Tu as tenu la couronne pendant" : "a tenu la couronne pendant"}
        </Text>
        <Text style={styles.crownRevealDuration}>{formatCrownDuration(durationMs)}</Text>

        {!isWinner && (
          <View style={styles.personalStatsContainer}>
            <View style={styles.statsDivider} />
            <Text style={styles.personalStatsLabel}>Tes stats</Text>
            <Text style={styles.personalDuration}>{formatCrownDuration(userDurationMs)}</Text>
            <Text style={styles.personalDurationLabel}>de règne cette semaine</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  fullscreenPage: {
    flex: 1,
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg
  },
  crownRevealInner: {
    alignItems: "center",
    paddingHorizontal: spacing.xxl
  },
  crownRevealTitle: {
    fontFamily: typography.family.bold,
    fontSize: typography.size.xs + 1, // 13
    color: colors.gold,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: spacing.xl + 4, // 28
    marginTop: spacing.sm
  },
  crownRevealAvatarWrap: {
    marginBottom: spacing.lg
  },
  crownRevealUsername: {
    fontFamily: typography.family.bold,
    fontSize: typography.size.xxl + 4, // 28
    color: colors.text,
    marginBottom: spacing.md,
    textAlign: "center"
  },
  crownRevealDurationLabel: {
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    color: colors.textMuted,
    marginBottom: spacing.xs + 2 // 6
  },
  crownRevealDuration: {
    fontFamily: typography.family.bold,
    fontSize: typography.size.xxl + 14, // 38
    color: colors.gold,
    letterSpacing: 1
  },
  personalStatsContainer: {
    marginTop: 48,
    alignItems: "center",
    width: "100%",
  },
  statsDivider: {
    width: 40,
    height: 1,
    backgroundColor: colors.cardBorder,
    marginBottom: 24,
  },
  personalStatsLabel: {
    fontFamily: typography.family.bold,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  personalDuration: {
    fontFamily: typography.family.bold,
    fontSize: typography.size.xxl,
    color: colors.text,
    marginBottom: 4,
  },
  personalDurationLabel: {
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
  },
});
