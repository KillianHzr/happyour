import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { UserAvatar } from "../atoms/Avatar";
import { TrashIcon } from "../atoms/TrashIcon";

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

const styles = StyleSheet.create({
  commentRow: {
    flexDirection: "row",
    marginBottom: 22,
    gap: 12,
  },
  avatarContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  commentContent: {
    flex: 1,
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: 12,
    borderRadius: 16,
    borderTopLeftRadius: 2,
    flexDirection: "row",
    alignItems: "center",
  },
  username: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
  },
  deleteBtn: {
    padding: 4,
  },
  content: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#FFF",
    lineHeight: 20,
  },
});
