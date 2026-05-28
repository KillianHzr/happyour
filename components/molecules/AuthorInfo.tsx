import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { CrownedAvatar } from "../atoms/Avatar";
import { ExpandableNote } from "../atoms/ExpandableNote";
import { CommentIcon } from "../atoms/CommentIcon";
import { PlusIcon } from "../atoms/PlusIcon";
import { colors, spacing, radii, typography } from "../../lib/theme";

import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { AudioCaptionPlayer } from "./AudioCaptionPlayer";

interface AuthorInfoProps {
  avatar_url?: string | null;
  username: string;
  created_at: string;
  note?: string | null;
  audioPlayer?: ReturnType<typeof useAudioPlayer>;
  audioStatus?: ReturnType<typeof useAudioPlayerStatus>;
  onScrollLock?: (locked: boolean) => void;
  captionWaveform?: number[];
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
  audioPlayer,
  audioStatus,
  onScrollLock,
  captionWaveform,
  isCrown,
  isOwn,
  hasNewComments,
  onOpenComments,
  onOpenPicker,
}: AuthorInfoProps) => {
  const hasAudio = !!(audioPlayer && audioStatus);

  return (
    <View style={[styles.authorInfo, hasAudio && { alignItems: "center" }]}>
      <CrownedAvatar avatar_url={avatar_url} username={username} size={36} isCrown={isCrown} />
      <View style={{ flex: 1, gap: 4 }}>
        {!hasAudio && (
          <View style={styles.usernameLine}>
            <Text style={styles.username}>{username}</Text>
            <Text style={styles.momentTime}>{formatTime(created_at)}</Text>
          </View>
        )}
        {hasAudio ? (
          <View style={{ gap: 2 }}>
            <View style={[styles.usernameLine, { marginBottom: 2 }]}>
              <Text style={styles.username}>{username}</Text>
              <Text style={styles.momentTime}>{formatTime(created_at)}</Text>
            </View>
            <AudioCaptionPlayer player={audioPlayer!} status={audioStatus!} onScrollLock={onScrollLock} waveform={captionWaveform} />
          </View>
        ) : (
          note && <ExpandableNote text={note} maxLines={2} />
        )}
      </View>
      <View style={styles.actionsColumn}>
        {!isOwn && (
          <TouchableOpacity style={styles.reactBtnInline} onPress={onOpenPicker}>
            <PlusIcon />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.reactBtnInline} onPress={onOpenComments}>
          <CommentIcon hasBadge={hasNewComments} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  authorInfo: { 
    flexDirection: "row",
    alignItems: "flex-end",
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
    fontSize: typography.size.md,
  },
  momentTime: {
    color: colors.textMuted,
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
  },
  actionsColumn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  reactBtnInline: {
    padding: 6,
  },
});
