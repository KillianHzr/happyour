import React, { useState, useEffect } from "react";
import { View, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import Icon from "../Icon";
import { UserAvatar } from "../atoms/Avatar";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";
import { spacing as themeSpacing, radii as themeRadii, stroke, typography, type ThemeColors } from "../../lib/theme";
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

  const [profile, setProfile] = useState<{ username: string; avatar_url: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    supabase
      .from("profiles")
      .select("username, avatar_url")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (active && data) {
          setProfile(data);
        }
      });
    return () => { active = false; };
  }, [user]);

  return (
    <View style={styles.inputArea}>
      <UserAvatar 
        avatar_url={profile?.avatar_url} 
        username={profile?.username || "Moi"} 
        size={themeSpacing.xl3}
        borderRadius={themeRadii.md}
      />
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Ajouter un commentaire"
          placeholderTextColor={colors.textTertiary}
          value={content}
          onChangeText={setContent}
          maxLength={500}
        />
        {content.trim().length > 0 && (
          <TouchableOpacity
            style={[styles.sendBtn, !content.trim() && styles.sendBtnDisabled]}
            onPress={onSubmit}
            disabled={isDisabled}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={colors.iconBrandOnBrand} />
            ) : (
              <Icon name="check" size={16} color={colors.iconBrandOnBrand} />
            )}
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity 
        style={styles.placeholderBtn} 
        activeOpacity={0.7}
      />
    </View>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  inputArea: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: themeSpacing.lg, // space/400
    paddingTop: themeSpacing.sm, // space/200
    paddingBottom: themeSpacing.sm, // space/200
    gap: themeSpacing.sm, // space/200 (8px)
  },
  inputContainer: {
    flex: 1,
    height: themeSpacing.xl3, // space/1200 (48px)
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card, // var(--sds-color-background-default-secondary)
    borderRadius: themeRadii.lg, // var(--sds-size-radius-400)
    paddingLeft: themeSpacing.md, // space/300 (12px)
    paddingRight: themeSpacing.sm, // space/200 (8px)
    gap: themeSpacing.lg, // space/400 (16px)
  },
  input: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.family.regular, // var(--sds-typography-body-font-family)
    fontSize: typography.size.md, // var(--sds-typography-body-size-medium)
    height: "100%",
    padding: 0,
  },
  sendBtn: {
    width: themeSpacing.xxl, // 32px (space/800)
    height: themeSpacing.xxl, // 32px (space/800)
    borderRadius: themeRadii.sm, // radius/200 (8px)
    backgroundColor: colors.brand, // background/brand/default
    justifyContent: "center",
    alignItems: "center",
    padding: 0, // space/empty
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  placeholderBtn: {
    width: themeSpacing.xl3, // space/1200 (48px)
    height: themeSpacing.xl3, // space/1200 (48px)
    borderRadius: themeRadii.md, // radius/300
    backgroundColor: colors.card, // background/default/secondary
  },
});

