import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { UserAvatar } from "../atoms/Avatar";
import { TrashIcon } from "../atoms/TrashIcon";
import { radii as themeRadii, spacing as themeSpacing, typography, type ThemeColors } from "../../lib/theme";
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

const getRelativeTime = (dateStr: string) => {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return "maintenant";
  }
  if (diffMins < 60) {
    return `${diffMins}min`;
  }
  if (diffHours < 24) {
    return `${diffHours}h`;
  }
  return `${diffDays}j`;
};

export const CommentItem = ({ item, isMyComment, onDelete }: CommentItemProps) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.commentRow}>
      <View style={styles.avatarContainer}>
        <UserAvatar
          avatar_url={item.profiles.avatar_url}
          username={item.profiles.username}
          size={32}
          borderRadius={themeRadii.sm}
        />
      </View>
      <View style={styles.commentContent}>
        <View style={styles.textContainer}>
          <View style={styles.topRow}>
            <Text style={styles.username}>{item.profiles.username}</Text>
            <Text style={styles.timeText}>{getRelativeTime(item.created_at)}</Text>
          </View>
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
    alignItems: "center",
    marginBottom: themeSpacing.xl,
    gap: themeSpacing.sm, // space/200
  },
  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: themeRadii.sm, // radius/200
    overflow: "hidden",
  },
  commentContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  textContainer: {
    flex: 1,
    flexDirection: "column",
    gap: 2,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: themeSpacing.xs, // space/100
  },
  username: {
    fontFamily: typography.family.semibold, // body/font-weight-strong Semi Bold
    fontSize: typography.size.xxs, // body/size-extra-small
    lineHeight: typography.size.xxs * 1.4, // line height 140%
    color: colors.text,
  },
  timeText: {
    fontFamily: typography.family.regular, // body/font-weight-regular Regular
    fontSize: typography.size.xxs, // body/size-extra-small
    lineHeight: typography.size.xxs * 1.4, // line height 140%
    color: colors.textSecondary,
  },
  content: {
    fontFamily: typography.family.regular, // body/font-weight-regular Regular
    fontSize: typography.size.sm, // body/size-small
    lineHeight: typography.size.sm * 1.4, // line height 140%
    color: colors.text,
  },
  deleteBtn: {
    padding: themeSpacing.xs,
  },
});
