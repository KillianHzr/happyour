import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { CrownedAvatar } from "../atoms/Avatar";
import { ExpandableNote } from "../atoms/ExpandableNote";

import { spacing, radii, typography, type ThemeColors } from "../../lib/theme";
import { useThemedStyles } from "../../lib/theme-context";

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
  const styles = useThemedStyles(makeStyles);
  const hasAudio = !!(audioPlayer && audioStatus);

  return (
    <View style={styles.authorInfo}>
      <CrownedAvatar 
        avatar_url={avatar_url} 
        username={username} 
        size={48} 
        borderRadius={radii.md} 
        isCrown={isCrown} 
      />
      <View style={styles.textSection}>
        {!hasAudio && (
          <View style={styles.usernameLine}>
            <Text style={styles.username}>{username}</Text>
          </View>
        )}
        {hasAudio ? (
          <View style={{ gap: 2 }}>
            <View style={[styles.usernameLine, { marginBottom: 2 }]}>
              <Text style={styles.username}>{username}</Text>
            </View>
            <AudioCaptionPlayer player={audioPlayer!} status={audioStatus!} onScrollLock={onScrollLock} waveform={captionWaveform} />
          </View>
        ) : (
          note && <ExpandableNote text={note} maxLines={2} />
        )}
      </View>
    </View>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  authorInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  textSection: {
    flex: 1,
    gap: 4,
  },
  usernameLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  username: {
    color: colors.text,
    fontFamily: typography.family.bold,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * 1.4,
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
    width: 42,
    height: 42,
    borderRadius: radii.full,
    backgroundColor: colors.opacityLight,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.cardBorder
  },
});
