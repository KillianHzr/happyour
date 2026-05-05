import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { UserAvatar } from "../atoms/Avatar";
import { TextSticker } from "../atoms/TextSticker";

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
            style={[styles.reactionBubble, iMine && styles.reactionBubbleMine, isCrownReaction && styles.reactionBubbleCrown]}
            onPress={() => onOpenPicker?.(photoId)}
            activeOpacity={0.75}
          >
            <View style={styles.reactionAvatarStack}>
              {users.slice(0, 2).map((r, i) => (
                <View key={r.id} style={[styles.reactionAvatarWrap, { zIndex: 2 - i, marginLeft: i === 0 ? 0 : -8 }]}>
                  <UserAvatar avatar_url={r.avatar_url} username={r.username} size={20} />
                </View>
              ))}
            </View>
            <View style={styles.reactionStickerWrap}>
              {emojiDetected ? (
                <Text style={{ fontSize: 14 }}>{text}</Text>
              ) : (
                <TextSticker text={text} fontSize={12} />
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

const styles = StyleSheet.create({
  reactionsRow: { 
    flexDirection: "row", 
    flexWrap: "wrap", 
    gap: 8 
  },
  reactionBubble: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 4, 
    backgroundColor: "rgba(255,255,255,0.15)", 
    borderRadius: 20, 
    paddingHorizontal: 8, 
    paddingVertical: 5, 
    borderWidth: 1, 
    borderColor: "rgba(255,255,255,0.1)" 
  },
  reactionBubbleMine: { 
    backgroundColor: "rgba(255,255,255,0.28)", 
    borderColor: "rgba(255,255,255,0.4)" 
  },
  reactionBubbleCrown: { 
    borderColor: "#FFF065", 
    borderWidth: 1.5 
  },
  reactionAvatarStack: { 
    flexDirection: "row" 
  },
  reactionAvatarWrap: { 
    borderRadius: 10, 
    overflow: "hidden", 
    borderWidth: 1.5, 
    borderColor: "rgba(0,0,0,0.3)" 
  },
  reactionStickerWrap: { 
    marginLeft: 2 
  },
  reactionCount: { 
    color: "rgba(255,255,255,0.7)", 
    fontFamily: "Inter_700Bold", 
    fontSize: 11, 
    marginLeft: 2 
  },
});
