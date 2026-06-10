import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { UserAvatar } from "../atoms/Avatar";
import { TextSticker } from "../atoms/TextSticker";
import { spacing, radii, typography, type ThemeColors } from "../../lib/theme";
import { useThemedStyles } from "../../lib/theme-context";

const STANDARD_EMOJIS = ["🤷", "🤦", "🙋", "🫶", "👌", "🤞"];

import { Reaction } from "../../lib/feed-types";

interface ReactionsRowProps {
  reactions: Reaction[];
  currentUserId?: string;
  photoId: string;
  crownWinnerId?: string | null;
  onOpenPicker?: (photoId: string) => void;
}

export const ReactionsRow = ({ reactions, currentUserId, photoId, crownWinnerId, onOpenPicker }: ReactionsRowProps) => {
  const styles = useThemedStyles(makeStyles);
  if (reactions.length === 0) return null;

  // Group by text content (emoji or custom text)
  const stickerIdsInReactions = Array.from(new Set(reactions.map((r) => r.sticker_id)));
  const groups = stickerIdsInReactions.map((sid) => ({
    id: sid,
    text: sid,
    users: reactions.filter((r) => r.sticker_id === sid),
  }));

  return (
    <View style={styles.reactionsRow}>
      {groups.map(({ id, text, users }) => {
        const iMine = users.some((r) => r.user_id === currentUserId);
        const isCrownReaction = crownWinnerId != null && users.some((r) => r.user_id === crownWinnerId);
        const emojiDetected = STANDARD_EMOJIS.includes(text);

        return (
          <TouchableOpacity
            key={id}
            style={[
              styles.reactionBubble,
              iMine && styles.reactionBubbleMine,
              isCrownReaction && styles.reactionBubbleCrown,
              !emojiDetected && styles.stickerReactionBubble
            ]}
            onPress={() => onOpenPicker?.(photoId)}
            activeOpacity={0.85}
          >
            <View style={styles.reactionAvatarStack}>
              {users.slice(0, 2).map((r, i) => (
                <View key={r.id} style={[styles.reactionAvatarWrap, { zIndex: 2 - i, marginLeft: i === 0 ? 0 : -spacing.sm }]}>
                  <UserAvatar avatar_url={r.avatar_url} username={r.username} size={20} />
                </View>
              ))}
            </View>
            <View style={styles.reactionStickerWrap}>
              {emojiDetected ? (
                <Text style={{ fontSize: typography.size.md }}>{text}</Text>
              ) : (
                <TextSticker text={text} fontSize={typography.size.xs} />
              )}
            </View>
            {users.length > 2 && (
              <Text style={styles.reactionCount}>+{users.length - 2}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  reactionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  reactionBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.opacityLight,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.cardBorder
  },
  reactionBubbleMine: {
    backgroundColor: colors.opacityDark,
    borderColor: colors.borderSecondary
  },
  reactionBubbleCrown: {
    borderColor: colors.gold,
    borderWidth: 1.5
  },
  reactionAvatarStack: {
    flexDirection: "row"
  },
  reactionAvatarWrap: {
    borderRadius: radii.full,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: colors.opacityLight
  },
  reactionStickerWrap: {
    marginLeft: 2
  },
  reactionCount: {
    color: colors.textMuted,
    fontFamily: typography.family.bold,
    fontSize: typography.size.xs,
    marginLeft: 2
  },
  stickerReactionBubble: {
    backgroundColor: "transparent",
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
});
