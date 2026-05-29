import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { UserAvatar } from "../atoms/Avatar";
import { TrashIcon } from "../atoms/TrashIcon";
import { radii, spacing, typography, type ThemeColors } from "../../lib/theme";
import { useThemedStyles } from "../../lib/theme-context";

export interface Comment {
  id: string;
  photo_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: {
    username: string;
    avatar_url: string | null;
  };
}

interface CommentItemProps {
  item: Comment;
  isMyComment: boolean;
  onDelete: (id: string) => void;
}

export const CommentItem = ({ item, isMyComment, onDelete }: CommentItemProps) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.commentRow}>
      <View style={styles.avatarContainer}>
        <UserAvatar
          avatar_url={item.profiles.avatar_url}
          username={item.profiles.username}
          size={38}
        />
      </View>
      <View style={styles.commentContent}>
        <View style={{ flex: 1 }}>
          <Text style={styles.username}>{item.profiles.username}</Text>
          <Text style={styles.content}>{item.content}</Text>
        </View>
        {isMyComment && (
          <TouchableOpacity
            onPress={() => onDelete(item.id)}
            style={styles.deleteBtn}
          >
            <TrashIcon />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  commentRow: {
    flexDirection: "row",
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  avatarContainer: {
    width: 38,
    height: 38,
    borderRadius: radii.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  commentContent: {
    flex: 1,
    gap: spacing.xs,
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderTopLeftRadius: radii.xs,
    flexDirection: "row",
    alignItems: "center",
  },
  username: {
    fontFamily: typography.family.bold,
    fontSize: typography.size.sm,
    color: colors.textMuted,
  },
  deleteBtn: {
    padding: spacing.xs,
  },
  content: {
    fontFamily: typography.family.regular,
    fontSize: typography.size.md,
    color: colors.text,
    lineHeight: 20,
  },
});
