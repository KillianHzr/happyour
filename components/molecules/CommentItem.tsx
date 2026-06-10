import React from "react";
import { View, Text, StyleSheet, Pressable, GestureResponderEvent } from "react-native";
import { UserAvatar } from "../atoms/Avatar";
import { radii as themeRadii, spacing as themeSpacing, typography, type ThemeColors } from "../../lib/theme";
import { useThemedStyles, useTheme } from "../../lib/theme-context";

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
  /** Fired after 800 ms hold — only for the current user's own comments */
  onLongPressDelete: (id: string, pageY: number) => void;
}

const getRelativeTime = (dateStr: string) => {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "maintenant";
  if (diffMins < 60) return `${diffMins}min`;
  if (diffHours < 24) return `${diffHours}h`;
  return `${diffDays}j`;
};

/**
 * Split a comment string into plain text and @mention parts.
 * Mentions are stored as plain "@username" — matched via word boundary regex.
 */
function parseMentionContent(
  content: string
): Array<{ text: string; isMention: boolean }> {
  const parts: Array<{ text: string; isMention: boolean }> = [];
  // Match @username (letters, digits, underscores — no space)
  const regex = /@[\w.]+/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: content.slice(lastIndex, match.index), isMention: false });
    }
    parts.push({ text: match[0], isMention: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ text: content.slice(lastIndex), isMention: false });
  }

  return parts.length > 0 ? parts : [{ text: content, isMention: false }];
}

export const CommentItem = ({ item, isMyComment, onLongPressDelete }: CommentItemProps) => {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();

  const contentParts = parseMentionContent(item.content);

  return (
    // Pressable handles long-press natively on both iOS and Android — avoids
    // gesture-handler conflicts with the parent FlatList's scroll recognizer.
    <Pressable
      onLongPress={(e: GestureResponderEvent) => {
        if (isMyComment) {
          onLongPressDelete(item.id, e.nativeEvent.pageY);
        }
      }}
      delayLongPress={800}
      style={styles.commentRow}
    >
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
          <Text style={styles.content}>
            {contentParts.map((part, index) =>
              part.isMention ? (
                <Text
                  key={index}
                  style={[
                    styles.content,
                    {
                      color: colors.brand,
                      fontFamily: typography.family.semibold,
                    },
                  ]}
                >
                  {part.text}
                </Text>
              ) : (
                <Text key={index} style={styles.content}>
                  {part.text}
                </Text>
              )
            )}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    commentRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: themeSpacing.xl,
      gap: themeSpacing.sm,
    },
    avatarContainer: {
      width: 32,
      height: 32,
      borderRadius: themeRadii.sm,
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
      gap: themeSpacing.xs,
    },
    username: {
      fontFamily: typography.family.semibold,
      fontSize: typography.size.xxs,
      lineHeight: typography.size.xxs * 1.4,
      color: colors.text,
    },
    timeText: {
      fontFamily: typography.family.regular,
      fontSize: typography.size.xxs,
      lineHeight: typography.size.xxs * 1.4,
      color: colors.textSecondary,
    },
    content: {
      fontFamily: typography.family.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.size.sm * 1.4,
      color: colors.text,
    },
  });
