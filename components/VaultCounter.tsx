import { View, Text, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors, theme } from "../lib/theme";

type Props = { 
  totalCount: number;
  userCount: number;
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

export default function VaultCounter({ totalCount, userCount }: Props) {
  return (
    <View style={[theme.glassCard, styles.container]}>
      <View style={styles.iconContainer}>
        <LockIcon />
      </View>
      
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.count}>{totalCount}</Text>
          <Text style={styles.label}>Total</Text>
        </View>
        <View style={styles.verticalDivider} />
        <View style={styles.statItem}>
          <Text style={styles.count}>{userCount}</Text>
          <Text style={styles.label}>Toi</Text>
        </View>
      </View>

      <Text style={styles.description}>
        {totalCount <= 1 ? "moment capturé" : "moments capturés"} cette semaine
      </Text>

      <View style={styles.divider} />
      <Text style={styles.hint}>Déverrouillage dimanche à 20h</Text>
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
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    paddingHorizontal: 20,
    marginBottom: 12,
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
    opacity: 0.8,
  },
  divider: {
    width: 40,
    height: 1,
    backgroundColor: colors.cardBorder,
    marginVertical: 24,
  },
  hint: { 
    fontFamily: "Inter_400Regular", 
    fontSize: 12, 
    color: colors.secondary,
    opacity: 0.5,
  },
});
