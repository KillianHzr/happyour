import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { UserAvatar } from "../atoms/Avatar";
import { BellIcon } from "../atoms/BellIcon";
import { spacing, typography, radii, stroke, textStyles, type ThemeColors, type ThemeShadows } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";

export interface Participant {
  userId: string;
  username: string;
  avatarUrl: string | null;
}

interface RevealHeaderProps {
  onClose: () => void;
  countdownText: string;
  revealMsLeft: number;
  participants: Participant[];
  onNotificationPress?: () => void;
}

export const RevealHeader = ({
  onClose,
  countdownText,
  revealMsLeft,
  participants = [],
  onNotificationPress,
}: RevealHeaderProps) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const isLowTime = revealMsLeft < 4 * 3600000;
  const visibleParticipants = participants.slice(0, 3);
  const remainingCount = participants.length - 3;

  return (
    <View style={[styles.headerContainer, { paddingTop: insets.top + 16 }]}>
      {/* 1. Leave Button */}
      <TouchableOpacity style={styles.iconButton} onPress={onClose} activeOpacity={0.7}>
        <Svg width="7" height="12" viewBox="0 0 7 12" fill="none">
          <Path
            d="M5.29289 0.292893C5.68342 -0.0976311 6.31643 -0.0976311 6.70696 0.292893C7.09748 0.683417 7.09748 1.31643 6.70696 1.70696L2.41399 5.99992L6.70696 10.2929C7.09748 10.6834 7.09748 11.3164 6.70696 11.707C6.31643 12.0975 5.68342 12.0975 5.29289 11.707L0.292893 6.70696C-0.0976311 6.31643 -0.0976311 5.68342 0.292893 5.29289L5.29289 0.292893Z"
            fill={colors.text}
          />
        </Svg>
      </TouchableOpacity>

      {/* Middle Group (Timer & Connected Users) */}
      <View style={styles.middleGroup}>
        {/* 2. Timer Pill */}
        {countdownText !== "" && (
          <View style={[styles.timerPill, isLowTime && styles.timerPillRed]}>
            <Text style={[styles.timerText, isLowTime && styles.timerTextRed]}>
              {countdownText}
            </Text>
          </View>
        )}

        {/* 3. Connected Users Row */}
        {participants.length > 0 && (
          <View style={styles.avatarsRow}>
            {/* Green Connected Status Dot */}
            <View style={styles.statusDot} />

            {visibleParticipants.map((p, index) => (
              <View key={p.userId} style={[styles.avatarWrapper, index > 0 && { marginLeft: spacing.negSm }]}>
                <UserAvatar avatar_url={p.avatarUrl} username={p.username} size={32} borderRadius={radii.sm} />
              </View>
            ))}
            {remainingCount > 0 && (
              <View style={[styles.avatarWrapper, styles.avatarMore, { marginLeft: spacing.negSm }]}>
                <Text style={styles.avatarMoreText}>+{remainingCount}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* 4. Notifications Button */}
      <TouchableOpacity style={styles.iconButton} onPress={onNotificationPress} activeOpacity={0.7}>
        <BellIcon size={22} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
};

const makeStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
  headerContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  middleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm, // space/200 (8px)
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radii.md, // radius/300 (12px)
    backgroundColor: colors.opacityLight, // background/default/default-opacity
    justifyContent: "center",
    alignItems: "center",
  },
  timerPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.opacityLight,
    paddingHorizontal: spacing.lg, // space/400 (16px)
    paddingVertical: spacing.md,   // space/300 (12px)
    borderRadius: radii.sm,        // radius/200 (8px)
  },
  timerPillRed: {
    backgroundColor: "#EC221F",
  },
  timerText: {
    ...textStyles.singleLineBodyBaseStrong,
    color: colors.text,
  },
  timerTextRed: {
    color: "#FFFFFF",
  },
  avatarsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.opacityLight,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: radii.sm, // radius/200 (8px)
    height: 40,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textPositiveSecondary, // text/positive/secondary
    marginRight: spacing.sm, // gap to first avatar
    marginLeft: 4,
  },
  avatarWrapper: {
    width: 32,
    height: 32,
    borderWidth: stroke.sm, // var(--sds-size-stroke-border)
    borderColor: colors.bg,
    borderRadius: radii.sm, // var(--sds-size-radius-200)
    backgroundColor: colors.bg,
    ...shadows.shadow200, // drop-shadow/200
  },
  avatarMore: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.card,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarMoreText: {
    color: colors.textSecondary,
    fontFamily: typography.family.bold,
    fontSize: 10,
  },
});
