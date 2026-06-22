import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Text,
  Pressable,
  Animated,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import Icon from "../Icon";
import { UserAvatar } from "../atoms/Avatar";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";
import {
  spacing as themeSpacing,
  radii as themeRadii,
  typography,
  textStyles,
  stroke,
  type ThemeColors,
  shadows,
} from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { Image } from "expo-image";
import BlurView from "../atoms/BlurView";

const profileCache: Record<string, { username: string; avatar_url: string | null }> = {};

export interface GroupMember {
  user_id: string;
  username: string;
  avatar_url?: string | null;
}

interface CommentInputProps {
  content: string;
  setContent: (text: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  maxLength?: number;
  placeholder?: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  isStickerMode?: boolean;
  onStickerToggle?: () => void;
  /** Called whenever the @ mention search keyword changes (null = no active mention) */
  onMentionSearch?: (keyword: string | null) => void;
  /** Ref from CommentModal set to true when the sheet is intentionally closing — suppresses sticker-mode re-focus. */
  closingRef?: React.MutableRefObject<boolean>;
  /** True when the user's existing sticker is pre-filled and unmodified — shows trash instead of checkmark. */
  stickerDeleteMode?: boolean;
  onStickerDelete?: () => void;
}

export const CommentInput = ({
  content,
  setContent,
  onSubmit,
  submitting,
  onFocus,
  onBlur,
  maxLength,
  placeholder,
  autoCapitalize,
  isStickerMode = false,
  onStickerToggle,
  onMentionSearch,
  closingRef,
  stickerDeleteMode = false,
  onStickerDelete,
}: CommentInputProps) => {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const isDisabled = (!isStickerMode && !content.trim()) || submitting;

  const [isFocused, setIsFocused] = useState(false);
  const borderOpacity = useRef(new Animated.Value(0)).current;
  const isStickerModeRef = useRef(isStickerMode);
  useEffect(() => { isStickerModeRef.current = isStickerMode; }, [isStickerMode]);
  const [profile, setProfile] = useState<{
    username: string;
    avatar_url: string | null;
  } | null>(() => (user?.id ? profileCache[user.id] ?? null : null));
  const inputRef = useRef<TextInput>(null);

  // Auto-focus when switching to sticker mode
  useEffect(() => {
    if (isStickerMode) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isStickerMode]);

  // Leaving sticker mode (e.g. returning to the comments view after posting/deleting
  // a reaction): the input is still flagged focused from sticker mode, which keeps the
  // sticker button hidden. Blur it and clear the focus flag so the button reappears.
  useEffect(() => {
    if (!isStickerMode) {
      inputRef.current?.blur();
      setIsFocused(false);
    }
  }, [isStickerMode]);

  useEffect(() => {
    if (!user) return;
    if (profileCache[user.id]) {
      setProfile(profileCache[user.id]);
      return;
    }
    let active = true;
    supabase
      .from("profiles")
      .select("username, avatar_url")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (active && data) {
          profileCache[user.id] = data;
          setProfile(data);
        }
      });
    return () => {
      active = false;
    };
  }, [user]);

  const handleTextChange = useCallback(
    (text: string) => {
      // Detect @ trigger — notify parent so it can show/hide the popup
      if (!isStickerMode && onMentionSearch) {
        const lastAt = text.lastIndexOf("@");
        if (lastAt >= 0) {
          const afterAt = text.slice(lastAt + 1);
          // Still typing the mention (no space/newline yet)
          if (!afterAt.includes(" ") && !afterAt.includes("\n")) {
            onMentionSearch(afterAt);
          } else {
            onMentionSearch(null);
          }
        } else {
          onMentionSearch(null);
        }
      }

      if (isStickerMode) {
        const emojiRegex =
          /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}\u{200D}\u{20E3}]/gu;
        setContent(text.replace(emojiRegex, "").slice(0, 8));
      } else {
        setContent(text);
      }
    },
    [isStickerMode, setContent, onMentionSearch]
  );

  return (
    <View style={styles.inputArea}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.focusBorder, { opacity: borderOpacity }]}
      />
      <UserAvatar
        avatar_url={profile?.avatar_url}
        username={profile?.username || "Moi"}
        size={themeSpacing.xl3}
        borderRadius={themeRadii.md}
      />
      <View style={styles.inputContainer}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder={placeholder || "Ajouter un commentaire"}
          placeholderTextColor={colors.textSecondary}
          value={content}
          onChangeText={handleTextChange}
          maxLength={maxLength !== undefined ? maxLength : 500}
          multiline={maxLength === undefined}
          textAlignVertical="center"
          autoCapitalize={autoCapitalize || "sentences"}
          autoCorrect={!isStickerMode}
          spellCheck={!isStickerMode}
          blurOnSubmit={!isStickerMode}
          onFocus={() => {
            setIsFocused(true);
            Animated.timing(borderOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
            onFocus?.();
          }}
          onBlur={() => {
            setIsFocused(false);
            Animated.timing(borderOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start();
            onBlur?.();
            // Re-focus immediately so Android back / iOS return can't escape the sticker input.
            // Skip when the sheet is intentionally closing so we don't fight the exit animation.
            if (isStickerModeRef.current && !closingRef?.current) {
              setTimeout(() => {
                if (isStickerModeRef.current && !closingRef?.current) {
                  inputRef.current?.focus();
                }
              }, 50);
            }
          }}
        />
        {stickerDeleteMode ? (
          <TouchableOpacity
            style={[styles.sendBtn, styles.sendBtnDelete]}
            onPressIn={onStickerDelete}
          >
            <Icon name="trash" size={16} color={colors.iconDangerTertiary} />
          </TouchableOpacity>
        ) : content.trim().length > 0 ? (
          <TouchableOpacity
            style={[styles.sendBtn, isDisabled && styles.sendBtnDisabled]}
            // Submit on touch-DOWN, not release. When the comment sheet is
            // embedded inside another modal (challenge responses), the keyboard
            // is owned by the parent modal's window; the first tap on this button
            // resigns first-responder (dismisses the keyboard) and that gesture
            // swallows the touch before `onPress` (touch-release) can fire — so
            // the input would just blur instead of sending. `onPressIn` fires on
            // touch-down, before the dismissal can cancel the gesture, matching
            // the single-modal reveal feed behaviour. We intentionally do NOT also
            // pass `onPress` to avoid a double submit (which in sticker mode would
            // re-run with empty content and delete the sticker we just posted).
            onPressIn={onSubmit}
            disabled={isDisabled}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={colors.iconBrandOnBrand} />
            ) : (
              <Icon name="check" size={16} color={colors.iconBrandOnBrand} />
            )}
          </TouchableOpacity>
        ) : null}
      </View>
      {!isStickerMode && !isFocused && (
        <TouchableOpacity
          style={[
            styles.placeholderBtn,
            { justifyContent: "center", alignItems: "center" },
          ]}
          onPress={onStickerToggle}
          activeOpacity={0.7}
        >
          <Svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <Path
              d="M16.6436 9.99902C16.6435 9.82387 16.5741 9.6559 16.4512 9.53125L9.58594 2.66602H2.66699V9.58398L9.5332 16.4424C9.59503 16.5043 9.66824 16.5534 9.74902 16.5869C9.82995 16.6205 9.91727 16.6377 10.0049 16.6377C10.0924 16.6376 10.179 16.6204 10.2598 16.5869C10.3406 16.5534 10.4147 16.5043 10.4766 16.4424L16.4512 10.4668C16.574 10.3421 16.6436 10.1741 16.6436 9.99902ZM5.8418 4.83301C6.39408 4.83301 6.8418 5.28072 6.8418 5.83301C6.84162 6.38514 6.39397 6.83301 5.8418 6.83301H5.83398C5.28181 6.83301 4.83416 6.38514 4.83398 5.83301C4.83398 5.28072 5.2817 4.83301 5.83398 4.83301H5.8418ZM18.6436 9.99902C18.6436 10.7033 18.3646 11.3793 17.8682 11.8789L17.8662 11.8818L11.8906 17.8555C11.643 18.1034 11.3491 18.3004 11.0254 18.4346C10.7018 18.5687 10.3551 18.6376 10.0049 18.6377C9.65444 18.6377 9.30713 18.5688 8.9834 18.4346C8.74073 18.334 8.51479 18.1983 8.3125 18.0322L8.11816 17.8564L0.959961 10.707C0.772227 10.5195 0.666992 10.2644 0.666992 9.99902V1.66602C0.666992 1.11373 1.11471 0.666016 1.66699 0.666016H10C10.2651 0.666016 10.5195 0.77155 10.707 0.958984L17.8682 8.11914C18.3647 8.61869 18.6435 9.29467 18.6436 9.99902Z"
              fill={isStickerMode ? colors.brand : colors.text}
            />
          </Svg>
        </TouchableOpacity>
      )}
    </View>
  );
};

// ── Suggestion popup (rendered at the CommentModalBody level) ─────────────────
interface MentionSuggestionsPopupProps {
  keyword: string | null;
  members: GroupMember[];
  onSelect: (member: GroupMember) => void;
}

export const MentionSuggestionsPopup = ({
  keyword,
  members,
  onSelect,
}: MentionSuggestionsPopupProps) => {
  const styles = useThemedStyles(makeSuggestionStyles);

  if (keyword === null || members.length === 0) return null;

  // Cap at 3 suggestions so the popup stays compact and never clutters the UI.
  const filtered = members
    .filter((m) =>
      m.username.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())
    )
    .slice(0, 3);

  if (filtered.length === 0) return null;

  return (
    <View style={styles.popup}>
      {/* Fond glass : flou clair pur (pas d'overlay sombre). */}
      <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} pointerEvents="none" />
      {filtered.map((member) => (
        <Pressable
          key={member.user_id}
          style={({ pressed }) => [
            styles.item,
            pressed && styles.itemPressed,
          ]}
          onPress={() => onSelect(member)}
        >
          <View style={styles.avatar}>
            {member.avatar_url ? (
              <Image
                source={{ uri: member.avatar_url }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            ) : (
              <Text style={styles.avatarText}>
                {(member.username || "?")[0].toUpperCase()}
              </Text>
            )}
          </View>
          <Text style={styles.name}>{member.username}</Text>
        </Pressable>
      ))}
    </View>
  );
};

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    inputArea: {
      flexDirection: "row",
      alignItems: "flex-end",
      paddingHorizontal: themeSpacing.lg,
      paddingTop: themeSpacing.lg,
      paddingBottom: themeSpacing.lg,
      gap: themeSpacing.md,
      backgroundColor: "#FFFFFF",
    },
    // Border top visible uniquement au focus (animée) : 1px (stroke/025), border/default/default
    focusBorder: {
      borderTopWidth: stroke.sm,
      borderTopColor: colors.cardBorder,
    },
    inputContainer: {
      flex: 1,
      minHeight: themeSpacing.xl3,
      flexDirection: "row",
      alignItems: "flex-end",
      backgroundColor: colors.card,
      borderRadius: themeRadii.lg,
      paddingLeft: themeSpacing.md,
      paddingRight: themeSpacing.md,
      paddingTop: 8,
      paddingBottom: 8,
      gap: themeSpacing.lg,

    },
    input: {
      flex: 1,
      color: colors.text,
      fontFamily: typography.family.regular,
      fontSize: typography.size.md,
      paddingTop: 4,
      paddingBottom: 4,
      maxHeight: 70,
    },
    sendBtn: {
      width: themeSpacing.xxl,
      height: themeSpacing.xxl,
      borderRadius: themeRadii.sm,
      backgroundColor: colors.brand,
      justifyContent: "center",
      alignItems: "center",
      padding: 0,
      marginBottom: 0,
    },
    sendBtnDisabled: {
      opacity: 0.5,
    },
    sendBtnDelete: {
      backgroundColor: colors.bgDangerTertiary,
    },
    placeholderBtn: {
      width: themeSpacing.xl3,
      height: themeSpacing.xl3,
      borderRadius: themeRadii.md,
      backgroundColor: colors.card,
    },
  });

const makeSuggestionStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    popup: {
      // Flotte au-dessus de la liste de commentaires. Aligné à gauche sur le champ
      // de texte (padding + avatar + gap), et étendu à droite jusqu'à 16px du bord
      // de l'écran. Son bas est positionné 8px au-dessus du champ de saisie (donc un
      // peu en dessous de la border top de la zone d'input : marginBottom négatif).
      position: "absolute",
      bottom: "100%",
      left: themeSpacing.lg + themeSpacing.xl3 + themeSpacing.sm,
      right: themeSpacing.lg, // 16px du bord droit de l'écran
      marginBottom: -(themeSpacing.lg - 8), // descend le bas du popup à 8px au-dessus du champ
      borderRadius: themeRadii.lg,
      borderWidth: stroke.sm, // stroke/025
      borderColor: colors.cardBorder, // border/default/default
      overflow: "hidden",
      // Keep the popup above the comment list so comments don't bleed through it.
      zIndex: 50,
      elevation: 24,
      ...shadows.md,
    },
    item: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: themeSpacing.md,
      paddingVertical: themeSpacing.sm,
      gap: themeSpacing.sm,
    },
    itemPressed: {
      backgroundColor: colors.borderSecondary,
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: themeRadii.sm,
      backgroundColor: colors.brand,
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
    },
    avatarText: {
      color: colors.white,
      fontFamily: typography.family.bold,
      fontSize: typography.size.sm,
    },
    name: {
      ...textStyles.bodySmall,
      color: colors.text,
    },
  });
