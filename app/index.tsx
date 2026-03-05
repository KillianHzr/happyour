import { Redirect } from "expo-router";
import { View, StyleSheet } from "react-native";
import { useAuth } from "../lib/auth-context";
import { colors } from "../lib/theme";
import Loader from "../components/Loader";

export default function Index() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loader}>
        <Loader size={48} />
      </View>
    );
  }

  if (session) {
    return <Redirect href="/(app)/groups" />;
  }

  return <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
  loader: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
});
