import { Stack } from "expo-router";
import { View, StyleSheet } from "react-native";
import { type ThemeColors } from "../../../lib/theme";
import { useTheme, useThemedStyles } from "../../../lib/theme-context";

export default function GroupsLayout() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.container}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "none",
        }}
      />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
