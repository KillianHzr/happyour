import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Svg, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserAvatar } from "../atoms/Avatar";
import { PhotoEntry } from "../../lib/feed-types";

const NAVBAR_HEIGHT = 100;

interface CrownRevealPageProps {
  winner: PhotoEntry;
  durationMs: number;
  currentUserId?: string;
  userDurationMs?: number;
}

function formatCrownDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}j`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}min`);
  return parts.join(" ");
}

export const CrownRevealPage = ({ winner, durationMs, currentUserId, userDurationMs = 0 }: CrownRevealPageProps) => {
  const insets = useSafeAreaInsets();
  const paddingTopBottom = Math.round((Math.max(insets.top, 12) + 24 + NAVBAR_HEIGHT + 24) / 2);
  const isWinner = currentUserId === winner.user_id;

  return (
    <View style={[styles.fullscreenPage, { paddingTop: paddingTopBottom, paddingBottom: paddingTopBottom }]}>
      <View style={styles.crownRevealInner}>
        <Svg width={64} height={64} viewBox="0 0 24 24" style={{ marginBottom: 4 }}>
          <Path 
            d="M2 19l2-9 4.5 4L12 5l3.5 9L20 10l2 9H2z" 
            fill="#FFD700" 
            stroke="#B8860B" 
            strokeWidth="0.8" 
            strokeLinejoin="round" 
          />
        </Svg>
        <Text style={styles.crownRevealTitle}>Couronne de la semaine</Text>
        <View style={styles.crownRevealAvatarWrap}>
          <View style={{ borderWidth: 3, borderColor: "#FFD700", borderRadius: 44 }}>
            <UserAvatar avatar_url={winner.avatar_url} username={winner.username} size={80} />
          </View>
        </View>
        <Text style={styles.crownRevealUsername}>{isWinner ? "Tu as gagné !" : winner.username}</Text>
        <Text style={styles.crownRevealDurationLabel}>
          {isWinner ? "Tu as tenu la couronne pendant" : "a tenu la couronne pendant"}
        </Text>
        <Text style={styles.crownRevealDuration}>{formatCrownDuration(durationMs)}</Text>

        {!isWinner && (
          <View style={styles.personalStatsContainer}>
            <View style={styles.statsDivider} />
            <Text style={styles.personalStatsLabel}>Tes stats</Text>
            <Text style={styles.personalDuration}>{formatCrownDuration(userDurationMs)}</Text>
            <Text style={styles.personalDurationLabel}>de règne cette semaine</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fullscreenPage: { 
    flex: 1,
    width: "100%", 
    height: "100%", 
    justifyContent: "center", 
    alignItems: "center", 
    backgroundColor: "#0A0A0A" 
  },
  crownRevealInner: { 
    alignItems: "center", 
    paddingHorizontal: 32 
  },
  crownRevealTitle: { 
    fontFamily: "Inter_700Bold", 
    fontSize: 13, 
    color: "#FFD700", 
    letterSpacing: 2, 
    textTransform: "uppercase", 
    marginBottom: 28, 
    marginTop: 8 
  },
  crownRevealAvatarWrap: { 
    marginBottom: 20 
  },
  crownRevealUsername: { 
    fontFamily: "Inter_700Bold", 
    fontSize: 28, 
    color: "#FFF", 
    marginBottom: 12, 
    textAlign: "center" 
  },
  crownRevealDurationLabel: { 
    fontFamily: "Inter_400Regular", 
    fontSize: 14, 
    color: "rgba(255,255,255,0.5)", 
    marginBottom: 6 
  },
  crownRevealDuration: { 
    fontFamily: "Inter_700Bold", 
    fontSize: 38, 
    color: "#FFD700", 
    letterSpacing: 1 
  },
  personalStatsContainer: {
    marginTop: 48,
    alignItems: "center",
    width: "100%",
  },
  statsDivider: {
    width: 40,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginBottom: 24,
  },
  personalStatsLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: "rgba(255,255,255,0.3)",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  personalDuration: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: "#FFF",
    marginBottom: 4,
  },
  personalDurationLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
  },
});
