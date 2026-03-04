import { View, Text, StyleSheet } from "react-native";

type Props = { count: number };

export default function VaultCounter({ count }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🔒</Text>
      <Text style={styles.count}>{count}</Text>
      <Text style={styles.label}>
        {count <= 1 ? "moment capturé" : "moments capturés"}
      </Text>
      <Text style={styles.hint}>Déverrouillage dimanche à 20h</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: 48,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 20,
    marginTop: 8,
  },
  icon: { fontSize: 48, marginBottom: 12 },
  count: { fontFamily: "Inter_700Bold", fontSize: 56 },
  label: { fontFamily: "Inter_400Regular", fontSize: 16, color: "#666", marginTop: 4 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 13, color: "#aaa", marginTop: 12 },
});
