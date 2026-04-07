import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Image } from "expo-image";
import { colors, theme } from "../lib/theme";

type Props = {
  totalCount: number;
  unlockDate: Date;
  lastPoster?: { avatar_url?: string | null; username: string } | null;
};

const LockIcon = () => (
  <Svg width="40" height="40" viewBox="0 0 24 24" fill="none">
    <Path
      d="M17 11H7C5.89543 11 5 11.8954 5 13V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V13C19 11.8954 18.1046 11 17 11Z"
      stroke="#FFFFFF"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M7 11V7C7 5.67392 7.52678 4.40215 8.46447 3.46447C9.40215 2.52678 10.6739 2 12 2C13.3261 2 14.5979 2.52678 15.5355 3.46447C16.4732 4.40215 17 5.67392 17 7V11"
      stroke="#FFFFFF"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export default function VaultCounter({ totalCount, unlockDate, lastPoster }: Props) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const distance = unlockDate.getTime() - now;

      if (distance < 0) {
        setTimeLeft("00:00:00");
        return;
      }

      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      const dStr = days > 0 ? `${days}j ` : "";
      setTimeLeft(`${dStr}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(timer);
  }, [unlockDate]);

  return (
    <View style={[theme.glassCard, styles.container]}>
      {lastPoster ? (
        <View style={styles.lastPosterWrap}>
          <View style={styles.crownWrap}>
            <Svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <Path d="M2 19l2-9 4.5 4L12 5l3.5 9L20 10l2 9H2z" stroke="rgba(255,215,0,0.9)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
            </Svg>
          </View>
          {lastPoster.avatar_url ? (
            <Image source={{ uri: lastPoster.avatar_url }} style={styles.lastPosterAvatar} />
          ) : (
            <View style={[styles.lastPosterAvatar, styles.lastPosterAvatarFallback]}>
              <Text style={styles.lastPosterInitial}>{lastPoster.username[0]?.toUpperCase() ?? "?"}</Text>
            </View>
          )}
          <Text style={styles.lastPosterName}>{lastPoster.username} a la couronne</Text>
          <Text style={styles.lastPosterHint}>Partage un moment pour la récupérer !</Text>
        </View>
      ) : (
        <View style={styles.iconContainer}>
          <LockIcon />
        </View>
      )}
      
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.count}>{totalCount}</Text>
          <Text style={styles.label}>Total</Text>
        </View>
      </View>

      <Text style={styles.description}>
        {totalCount <= 1 ? "moment capturé" : "moments capturés"}
      </Text>

      <View style={styles.divider} />
      
      <Text style={styles.countdownTitle}>Déverrouillage dans</Text>
      <Text style={styles.countdownValue}>{timeLeft}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: 40,
    marginTop: 8,
  },
  iconContainer: {
    marginBottom: 24,
    opacity: 0.6,
  },
  lastPosterWrap: { alignItems: "center", marginBottom: 24 },
  crownWrap: { marginBottom: -8, zIndex: 1 },
  lastPosterAvatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: "rgba(255,215,0,0.7)" },
  lastPosterAvatarFallback: { backgroundColor: "#FFF", justifyContent: "center", alignItems: "center" },
  lastPosterInitial: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#000" },
  lastPosterName: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 8 },
  lastPosterHint: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4, textAlign: "center" },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  count: { 
    fontFamily: "Inter_700Bold", 
    fontSize: 48, 
    color: colors.text,
    letterSpacing: -1,
  },
  label: { 
    fontFamily: "Inter_600SemiBold", 
    fontSize: 11, 
    color: colors.secondary, 
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: -4,
  },
  verticalDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  description: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: colors.secondary,
    opacity: 0.6,
  },
  divider: {
    width: 40,
    height: 1,
    backgroundColor: colors.cardBorder,
    marginVertical: 24,
  },
  countdownTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: colors.secondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  countdownValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: "#FFF",
    letterSpacing: 1,
  },
});
