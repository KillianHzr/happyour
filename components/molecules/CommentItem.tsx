import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { UserAvatar } from "../atoms/Avatar";
import { TrashIcon } from "../atoms/TrashIcon";
import { radii as themeRadii, spacing as themeSpacing, typography, type ThemeColors, type ThemeShadows } from "../../lib/theme";
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
          size={32}
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
    marginBottom: themeSpacing.xl,
    gap: themeSpacing.xxl, // var(--sds-size-space-800) = 32
  },
  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: themeRadii.sm, // var(--sds-size-radius-200)
    overflow: "hidden",
  },
  commentContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  username: {
    fontFamily: typography.family.semibold, // var(--sds-typography-body-font-weight-strong)
    fontSize: typography.size.sm,
    color: colors.text, // var(--sds-color-text-default-default)
    marginBottom: themeSpacing.xxs,
  },
  deleteBtn: {
    padding: themeSpacing.xs,
  },
  content: {
    fontFamily: typography.family.regular, // var(--sds-typography-body-font-weight-regular)
    fontSize: typography.size.md,
    color: colors.text, // var(--sds-color-text-default-default)
    lineHeight: 20,
  },
});
