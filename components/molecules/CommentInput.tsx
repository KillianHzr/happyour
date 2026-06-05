import React from "react";
import { View, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { SendIcon } from "../atoms/SendIcon";
import { UserAvatar } from "../atoms/Avatar";
import { useAuth } from "../../lib/auth-context";
import { spacing as themeSpacing, radii as themeRadii, typography, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";

interface CommentInputProps {
  content: string;
  setContent: (text: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}

export const CommentInput = ({ content, setContent, onSubmit, submitting }: CommentInputProps) => {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const isDisabled = !content.trim() || submitting;

  return (
    <View style={styles.inputArea}>
      <UserAvatar 
        avatar_url={user?.avatar_url} 
        username={user?.username || "Moi"} 
        size={32}
      />
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Ajouter un commentaire..."
          placeholderTextColor={colors.textTertiary}
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
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: themeSpacing.xl,
    paddingVertical: themeSpacing.md,
    gap: themeSpacing.lg, // var(--sds-size-space-400)
  },
  inputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card, // var(--sds-color-background-default-secondary)
    borderRadius: themeRadii.lg, // var(--sds-size-radius-400)
    paddingHorizontal: themeSpacing.lg, // var(--sds-size-space-400)
    paddingVertical: themeSpacing.sm, // var(--sds-size-space-200)
    borderWidth: 1, // var(--sds-size-stroke-border)
    borderColor: colors.cardBorder,
    gap: themeSpacing.lg, // var(--sds-size-space-400)
  },
  input: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.family.regular, // var(--sds-typography-body-font-family)
    fontSize: typography.size.md, // var(--sds-typography-body-size-medium)
    maxHeight: 100,
    padding: 0,
  },
  sendBtn: {
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
});

