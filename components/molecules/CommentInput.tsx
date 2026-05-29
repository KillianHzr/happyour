import React from "react";
import { View, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { SendIcon } from "../atoms/SendIcon";
import { spacing, radii, typography, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";

interface CommentInputProps {
  content: string;
  setContent: (text: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}

export const CommentInput = ({ content, setContent, onSubmit, submitting }: CommentInputProps) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const isDisabled = !content.trim() || submitting;

  return (
    <View style={styles.inputArea}>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Ajouter un commentaire..."
          placeholderTextColor={colors.textMuted}
          value={content}
          onChangeText={setContent}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !content.trim() && styles.sendBtnDisabled]}
          onPress={onSubmit}
          disabled={isDisabled}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.bg} />
          ) : (
            <SendIcon disabled={!content.trim()} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  inputArea: {
    padding: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    borderRadius: radii.full,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.family.regular,
    fontSize: typography.size.lg,
    maxHeight: 100,
    paddingVertical: spacing.sm,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors.text,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: spacing.sm,
  },
  sendBtnDisabled: {
    backgroundColor: colors.accentMuted,
  },
});
