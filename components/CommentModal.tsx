import React from "react";
import { Platform } from "react-native";
import CommentModalIOS from "./CommentModalIOS";
import CommentModalAndroid from "./CommentModalAndroid";
import { Reaction } from "../lib/feed-types";
import { GroupMember } from "./molecules/CommentInput";

interface CommentModalProps {
  visible: boolean;
  onClose: () => void;
  onSeen?: (photoId: string) => void;
  onKeyboardHeightChange?: (height: number) => void;
  photoId: string;
  photoOwnerId: string;
  reactions?: Reaction[];
  initialMode?: "comment" | "sticker";
  groupMembers?: GroupMember[];
}

export default function CommentModal(props: CommentModalProps) {
  if (Platform.OS === "ios") {
    return <CommentModalIOS {...props} />;
  }
  return <CommentModalAndroid {...props} />;
}
