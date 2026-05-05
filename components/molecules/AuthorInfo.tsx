import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { CrownedAvatar } from "../atoms/Avatar";
import { ExpandableNote } from "../atoms/ExpandableNote";
import { CommentIcon } from "../atoms/CommentIcon";
import { PlusIcon } from "../atoms/PlusIcon";
import { colors, spacing, radii, typography } from "../../lib/theme";

interface AuthorInfoProps {
  avatar_url?: string | null;
  username: string;
  created_at: string;
  note?: string | null;
  isCrown: boolean;
  isOwn: boolean;
  hasNewComments?: boolean;
  onOpenComments?: () => void;
  onOpenPicker?: () => void;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const day = d.toLocaleDateString("fr-FR", { weekday: "long" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

export const AuthorInfo = ({
  avatar_url,
  username,
  created_at,
  note,
  isCrown,
  isOwn,
  hasNewComments,
  onOpenComments,
  onOpenPicker,
}: AuthorInfoProps) => {
  return (
    <View style={styles.authorInfo}>
      <CrownedAvatar avatar_url={avatar_url} username={username} size={36} isCrown={isCrown} />
      <View style={{ flex: 1 }}>
        <View style={styles.usernameLine}>
          <Text style={styles.username}>{username}</Text>
          <Text style={styles.momentTime}>{formatTime(created_at)}</Text>
        </View>
        {note && <ExpandableNote text={note} maxLines={2} />}
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <TouchableOpacity style={styles.reactBtnInline} onPress={onOpenComments}>
          <CommentIcon hasBadge={hasNewComments} />
        </TouchableOpacity>
        {!isOwn && (
          <TouchableOpacity style={styles.reactBtnInline} onPress={onOpenPicker}>
            <PlusIcon />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  authorInfo: { 
    flexDirection: "row", 
    alignItems: "flex-start", 
    gap: spacing.md 
  },
  usernameLine: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: spacing.sm 
  },
  username: { 
    color: colors.white, 
    fontFamily: typography.family.bold, 
    fontSize: typography.size.md 
  },
  momentTime: { 
    color: colors.textMuted, 
    fontFamily: typography.family.semibold, 
    fontSize: typography.size.xs 
  },
  reactBtnInline: { 
    width: 36, 
    height: 36, 
    borderRadius: radii.full, 
    backgroundColor: colors.glass, 
    justifyContent: "center", 
    alignItems: "center", 
    borderWidth: 1, 
    borderColor: colors.glassBorder 
  },
});
