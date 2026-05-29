import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { CloseIcon } from "../atoms/CloseIcon";
import { spacing, radii, typography, type ThemeColors } from "../../lib/theme";
import { useThemedStyles } from "../../lib/theme-context";

interface CommentModalHeaderProps {
  onClose: () => void;
}

export const CommentModalHeader = ({ onClose }: CommentModalHeaderProps) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.header}>
      <View style={styles.headerIndicator} />
      <View style={styles.headerContent}>
        <Text style={styles.headerTitle}>Commentaires</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <CloseIcon />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  header: {
    width: "100%",
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    overflow: "hidden",
  },
  headerIndicator: {
    width: 40,
    height: 4,
    backgroundColor: colors.borderSecondary,
    borderRadius: radii.xs,
    alignSelf: "center",
    marginTop: spacing.md,
  },
  headerContent: {
    width: "100%",
    paddingVertical: spacing.md,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  headerTitle: {
    fontFamily: typography.family.bold,
    fontSize: typography.size.lg,
    color: colors.text,
    letterSpacing: 0.5,
  },
  closeBtn: {
    position: "absolute",
    right: spacing.xl,
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
});
