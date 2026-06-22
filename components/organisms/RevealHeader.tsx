import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Reanimated, { FadeInRight, FadeOutRight, LinearTransition, LayoutAnimationConfig } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { UserAvatar } from "../atoms/Avatar";
import { BellIcon } from "../atoms/BellIcon";
import { GlassBackground } from "../atoms/GlassBackground";
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
  /** Affiche une pastille brand en haut-droite du bouton Activité (nouvelle activité non vue). */
  hasUnseenActivity?: boolean;
  /** Mode archive : remplace timer + présence par "Reveal XX" + plage de dates. */
  archive?: { numberLabel: string; dateLabel: string };
}

// ─── Presence animations (single source of truth) ────────────────────────────
// `avatarEnter`/`avatarExit` slide each avatar in/out from the right as members
// join/leave; `layout` smoothly morphs the container width (and shifts the
// remaining avatars) when the active member list changes size.
const presenceTransitions = {
  avatarEnter: FadeInRight.duration(250),
  avatarExit: FadeOutRight.duration(200),
  layout: LinearTransition.duration(250),
};

export const RevealHeader = ({
  onClose,
  countdownText,
  revealMsLeft,
  participants = [],
  onNotificationPress,
  hasUnseenActivity = false,
  archive,
}: RevealHeaderProps) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const visibleParticipants = participants.slice(0, 3);
  const remainingCount = participants.length - 3;

  // The whole header is mounted/unmounted as a unit (e.g. it unmounts when
  // comments open). `skipEntering`/`skipExiting` make the presence avatars
  // appear/disappear instantly with the rest of the header on that mount/unmount
  // — only genuine participant joins/leaves while mounted play the slide.
  return (
    <LayoutAnimationConfig skipEntering skipExiting>
      <View style={[styles.headerContainer, { paddingTop: insets.top + 16 }]}>
      {/* 1. Leave Button */}
      <TouchableOpacity style={styles.iconButton} onPress={onClose} activeOpacity={0.7}>
        <GlassBackground radius={radii.md} />
        <Svg width="7" height="12" viewBox="0 0 7 12" fill="none">
          <Path
            d="M5.29289 0.292893C5.68342 -0.0976311 6.31643 -0.0976311 6.70696 0.292893C7.09748 0.683417 7.09748 1.31643 6.70696 1.70696L2.41399 5.99992L6.70696 10.2929C7.09748 10.6834 7.09748 11.3164 6.70696 11.707C6.31643 12.0975 5.68342 12.0975 5.29289 11.707L0.292893 6.70696C-0.0976311 6.31643 -0.0976311 5.68342 0.292893 5.29289L5.29289 0.292893Z"
            fill={colors.text}
          />
        </Svg>
      </TouchableOpacity>

      {/* Middle Group (Timer & Connected Users) */}
      {/* `layout` animates the whole group's frame as the avatar row appears/
          resizes, so the timer pill rides along smoothly and never overlaps the
          avatars (animating the pill on its own desyncs it from its sibling). */}
      <Reanimated.View style={styles.middleGroup} layout={presenceTransitions.layout}>
        {/* Mode archive : "Reveal XX" + plage de dates (ni timer ni présence) */}
        {archive && (
          <View style={styles.archiveChip}>
            <GlassBackground radius={radii.sm} />
            <Text style={styles.archiveNumber}>{archive.numberLabel}</Text>
            <Text style={styles.archiveDate}>{archive.dateLabel}</Text>
          </View>
        )}

        {/* 2. Timer Pill */}
        {!archive && countdownText !== "" && (
          <View style={styles.timerPill}>
            <GlassBackground radius={radii.sm} />
            <Text style={styles.timerText}>
              {countdownText}
            </Text>
          </View>
        )}

        {/* 3. Connected Users Row */}
        {!archive && participants.length > 0 && (
          <Reanimated.View style={styles.avatarsRow} layout={presenceTransitions.layout}>
            <GlassBackground radius={radii.sm} />
            {/* Green Connected Status Dot */}
            <View style={styles.statusDot} />

            {visibleParticipants.map((p, index) => (
              <Reanimated.View
                key={p.userId}
                entering={presenceTransitions.avatarEnter}
                exiting={presenceTransitions.avatarExit}
                layout={presenceTransitions.layout}
                // zIndex croissant : l'avatar le plus à droite (le dernier
                // entrant) reste au-dessus, sinon Reanimated empile les wrappers
                // dans l'autre sens et la bordure gauche de l'avatar entrant est
                // recouverte par son voisin de gauche.
                style={[{ zIndex: index }, index > 0 && { marginLeft: spacing.negSm }]}
              >
                <UserAvatar
                  avatar_url={p.avatarUrl}
                  username={p.username}
                  size={32}
                  borderRadius={radii.sm}
                  style={styles.avatar}
                />
              </Reanimated.View>
            ))}
            {remainingCount > 0 && (
              <Reanimated.View
                key="more"
                entering={presenceTransitions.avatarEnter}
                exiting={presenceTransitions.avatarExit}
                layout={presenceTransitions.layout}
                style={[styles.avatar, styles.avatarMore, { marginLeft: spacing.negSm, zIndex: visibleParticipants.length }]}
              >
                <Text style={styles.avatarMoreText}>+{remainingCount}</Text>
              </Reanimated.View>
            )}
          </Reanimated.View>
        )}
      </Reanimated.View>

      {/* 4. Notifications Button */}
      <TouchableOpacity style={styles.iconButton} onPress={onNotificationPress} activeOpacity={0.7}>
        <GlassBackground radius={radii.md} />
        <BellIcon size={22} color={colors.text} />
        {/* Pastille "nouvelle activité" — coin haut-droite, couleur brand (#FF561A). */}
        {hasUnseenActivity && <View style={styles.activityDot} />}
      </TouchableOpacity>
      </View>
    </LayoutAnimationConfig>
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
    height: 40, // keep the whole header content a uniform 40px
    gap: spacing.sm, // space/200 (8px)
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radii.md, // radius/300 (12px)
    justifyContent: "center",
    alignItems: "center",
  },
  activityDot: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.brand, // background/brand/default (#FF561A)
  },
  timerPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center", // center the countdown within the fixed width
    alignSelf: "stretch", // fill the 40px header height
    width: 98, // fixed so the pill doesn't resize as digits change
    borderRadius: radii.sm,        // radius/200 (8px)
    overflow: "hidden",            // garde le glass dans les coins arrondis
  },
  archiveChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",          // 40px header height
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
  },
  archiveNumber: {
    ...textStyles.singleLineBodyBaseStrong,
    color: colors.text,
  },
  archiveDate: {
    ...textStyles.singleLineBodySmall,
    color: colors.textSecondary,
  },
  timerText: {
    ...textStyles.singleLineBodyBaseStrong,
    color: colors.text,
    fontVariant: ["tabular-nums"], // equal-width digits so the countdown doesn't shift
  },
  avatarsRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch", // fill middleGroup's height to match the timer pill
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8, // radius/200 (8px)
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 100,
    backgroundColor: colors.textPositiveSecondary, // text/positive/secondary
    marginRight: 4,
    marginLeft: 6,
  },
  avatar: {
    borderWidth: stroke.sm, // stroke/025
    borderColor: colors.cardBorder, // Color/border/default/default
    borderRadius: radii.sm, // radius/200 (8px)
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
