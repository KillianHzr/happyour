import * as React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Svg, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurredImageBackground } from "../atoms/BlurredImageBackground";
import { UserAvatar } from "../atoms/Avatar";
import { CrownIcon } from "../atoms/CrownIcon";
import { PhotoEntry } from "../../lib/feed-types";
import { radii, spacing, typography, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";

const NAVBAR_HEIGHT = 100;

interface CrownRevealPageProps {
  winner: PhotoEntry;
  durationMs: number;
  currentUserId?: string;
  userDurationMs?: number;
  currentUserAvatarUrl?: string | null;
  currentUsername?: string;
}

function formatHoursMinutes(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const mm = minutes.toString().padStart(2, "0");
  return `${hours}h${mm}`;
}

export const CrownRevealPage = ({
  winner,
  durationMs,
  currentUserId,
  userDurationMs = 0,
  currentUserAvatarUrl,
  currentUsername = "Moi",
}: CrownRevealPageProps) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const paddingTopBottom = Math.round((Math.max(insets.top, 12) + 24 + NAVBAR_HEIGHT + 24) / 2);
  const isWinner = currentUserId === winner.user_id;

  return (
    <View style={[styles.fullscreenPage, { paddingTop: paddingTopBottom, paddingBottom: paddingTopBottom }]}>
      {/* Fond : photo de profil du couronné, floutée (flou "card" unifié). */}
      <BlurredImageBackground uri={winner.avatar_url} />

      <View style={styles.crownRevealInner}>
        {/* Header Section */}
        <View style={styles.titleContainer}>
          <Text style={styles.titleText}>Couronnement</Text>
          <Text style={styles.subtitleText}>de la semaine</Text>
        </View>

        {/* Stats Container */}
        <View style={styles.statsContainer}>
          {/* Card 1: Crown Winner */}
          <View style={styles.card}>
            <View style={{ position: "relative" }}>
              <View style={styles.avatarContainer}>
                <UserAvatar avatar_url={winner.avatar_url} username={winner.username} size={76} borderRadius={radii.xl - 2} />
              </View>
              <View style={styles.crownIconOverlay}>
                <CrownIcon size={32} />
              </View>
            </View>
            <View style={styles.cardTextContainer}>
              <Text style={styles.cardName}>{winner.username}</Text>
              <Text style={styles.cardScore}>{formatHoursMinutes(durationMs)}</Text>
            </View>
          </View>

          {/* Card 2: Individual Score (shown only if the current user is not the winner) */}
          {!isWinner && currentUserId && (
            <View style={styles.cardSecondPlace}>
              <View style={styles.avatarContainer56}>
                <UserAvatar avatar_url={currentUserAvatarUrl} username={currentUsername} size={56} borderRadius={radii.lg} />
              </View>
              <View style={styles.cardTextContainer}>
                <Text style={styles.cardNameSecondPlace}>Toi</Text>
                <Text style={styles.cardScoreSecondPlace}>{formatHoursMinutes(userDurationMs)}</Text>
              </View>
            </View>
          )}
        </View>
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
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    overflow: "hidden",
  },
  crownRevealInner: {
    alignItems: "center",
    width: "100%",
    paddingHorizontal: spacing.xl,
  },
  titleContainer: {
    alignItems: "center",
    gap: 0,
  },
  titleText: {
    fontFamily: typography.family.bold,
    fontSize: typography.size.subtitle,
    lineHeight: typography.size.subtitle * 1.2,
    color: colors.text,
    textAlign: "center",
  },
  subtitleText: {
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xxl,
    lineHeight: typography.size.xxl * 1.2,
    color: colors.text,
    textAlign: "center",
  },
  statsContainer: {
    width: "100%",
    marginTop: spacing.xl3,
    gap: spacing.lg,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.opacityLight,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.lg,
    alignSelf: "center",
  },
  cardSecondPlace: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.opacityLight,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.lg,
    alignSelf: "center",
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: radii.xl,
    borderWidth: 2,
    borderColor: colors.icon,
    borderStyle: "solid",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarContainer56: {
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  cardTextContainer: {
    flexDirection: "column",
    justifyContent: "center",
  },
  cardName: {
    fontFamily: typography.family.semibold,
    fontSize: typography.size.md,
    lineHeight: typography.size.md * 1.4,
    color: colors.text,
    marginBottom: 4,
  },
  cardNameSecondPlace: {
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xxs,
    lineHeight: typography.size.xxs * 1.4,
    color: colors.text,
    marginBottom: 4,
  },
  cardScore: {
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xxl,
    lineHeight: typography.size.xxl * 1.2,
    color: colors.text,
  },
  cardScoreSecondPlace: {
    fontFamily: typography.family.semibold,
    fontSize: typography.size.md,
    lineHeight: typography.size.md * 1.2,
    color: colors.text,
  },
  crownIconOverlay: {
    position: "absolute",
    top: -12,
    left: -12,
    zIndex: 10,
  },
});
