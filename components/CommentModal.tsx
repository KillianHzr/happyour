import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Dimensions,
  Pressable,
  Animated,
  PanResponder,
  Easing,
  Keyboard,
  TouchableWithoutFeedback,
  LayoutAnimation,
} from "react-native";
import { Image } from "expo-image";
import BlurView from "./atoms/BlurView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";
import { CommentItem, Comment } from "./molecules/CommentItem";
import { DeleteCommentPopup } from "./atoms/DeleteCommentPopup";
import { CommentInput, MentionSuggestionsPopup, GroupMember } from "./molecules/CommentInput";
import { TextSticker } from "./atoms/TextSticker";
import { StickerToast } from "./atoms/StickerToast";
import { radii as themeRadii, spacing as themeSpacing, typography, type ThemeColors, shadows } from "../lib/theme";
import { useTheme, useThemedStyles, ForceTheme } from "../lib/theme-context";
import { Reaction } from "../lib/feed-types";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const MODAL_HEIGHT = 392;
const IS_IOS = Platform.OS === "ios";

const isEmoji = (str: string) => {
  const regexExp = /(©|®|[ -㌀]|\ud83c[퀀-\udfff]|\ud83d[퀀-\udfff]|\ud83e[퀀-\udfff])/gi;
  return regexExp.test(str);
};

interface CommentModalProps {
  visible: boolean;
  onClose: () => void;
  onSeen?: (photoId: string) => void;
  onKeyboardHeightChange?: (height: number) => void;
  /** Reports the rendered sheet height so the parent can keep the post preview aligned. */
  onSheetHeightChange?: (height: number) => void;
  /** Reports whenever the user switches between comment/sticker mode. */
  onModeChange?: (mode: "comment" | "sticker") => void;
  photoId: string;
  photoOwnerId: string;
  reactions?: Reaction[];
  initialMode?: "comment" | "sticker";
  groupMembers?: GroupMember[];
  /** Pass directly when photoId is not a `photos` row (e.g. challenge responses). */
  groupId?: string;
  /**
   * Render as a plain full-screen overlay instead of a native `<Modal>`.
   * Use when already mounted inside another `<Modal>` (e.g. the challenge responses
   * carousel). A nested `<Modal>` does not own the keyboard's key window, so the
   * first tap on the sheet resigns first-responder (dismisses the keyboard) and is
   * swallowed before reaching the submit button. As an overlay the enclosing modal
   * stays the sole keyboard owner — matching the single-modal reveal feed.
   */
  embedded?: boolean;
}

// ── Sticker overlay item — measures itself to avoid percentage-string transforms
// that crash on Android (native bridge requires numeric values for translateX/Y).
function StickerItem({
  anchorX,
  y,
  rotation,
  avatarUrl,
  username,
  stickerText,
}: {
  anchorX: number;
  y: number;
  rotation: number;
  avatarUrl: string | null;
  username: string;
  stickerText: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      onLayout={(e) =>
        setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
      }
      style={[
        styles.stickerContainer,
        {
          top: y - size.h / 2,
          left: anchorX - size.w / 2,
          transform: [{ rotate: `${rotation}deg` }],
          alignItems: "center",
          justifyContent: "center",
        },
      ]}
    >
      <View>
        <TextSticker text={stickerText} fontSize={28} isPostSticker={true} />
        <View style={styles.stickerAvatar}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFill} />
          ) : (
            <Text style={styles.avatarFallbackText}>
              {(username || "?")[0].toUpperCase()}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Mounting shell ────────────────────────────────────────────────────────────
// Keeps the Modal in the tree until the close animation finishes, then unmounts.
export default function CommentModal(props: CommentModalProps) {
  const { visible, onClose, embedded } = props;
  const [mounted, setMounted] = useState(visible);
  // Populated by CommentModalContent so the Android back button can redirect
  // to comment mode when the sheet is in sticker mode.
  const requestCloseRef = useRef<() => void>(() => onClose());

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  if (!mounted) return null;

  const content = (
    <CommentModalContent
      {...props}
      onCloseComplete={() => setMounted(false)}
      requestCloseRef={requestCloseRef}
    />
  );

  // Embedded: render as a plain overlay (no second native modal) so the enclosing
  // modal keeps keyboard ownership. zIndex keeps it above the carousel/header/footer.
  if (embedded) {
    return <View style={[StyleSheet.absoluteFill, { zIndex: 20 }]}>{content}</View>;
  }

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={() => requestCloseRef.current()}
      statusBarTranslucent
    >
      {content}
    </Modal>
  );
}

// ── Main content ──────────────────────────────────────────────────────────────
function CommentModalContent({
  visible,
  onClose,
  onSeen,
  onKeyboardHeightChange,
  onSheetHeightChange,
  onModeChange,
  photoId,
  photoOwnerId,
  reactions = [],
  initialMode,
  onCloseComplete,
  groupMembers = [],
  groupId,
  requestCloseRef,
  embedded,
}: CommentModalProps & { onCloseComplete: () => void; requestCloseRef?: React.MutableRefObject<() => void> }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [mode, setMode] = useState<"comment" | "sticker">(initialMode || "comment");
  // Ref mirror — readable inside stable callbacks without stale-closure issues.
  const modeRef = useRef(mode);
  const prevModeRef = useRef(mode);
  // Set to true just before an intentional Keyboard.dismiss() that should NOT
  // trigger the "switch to comment mode" logic in the keyboard-hide listener.
  const intentionalCloseRef = useRef(false);

  useEffect(() => {
    const prevMode = prevModeRef.current;
    prevModeRef.current = mode;
    modeRef.current = mode;

    // Keep the Android back-button handler in sync: sticker → comment, else close.
    if (requestCloseRef) {
      requestCloseRef.current =
        mode === "sticker" ? () => setMode("comment") : () => handleClose();
    }

    // When leaving sticker mode, delay notifying the parent by 200 ms so the
    // sheet has time to re-layout and report its settled height before PhotoFeed
    // switches its preview-scale formula from sticker to comment mode.
    // Without this delay the preview bounces through an intermediate size.
    if (prevMode === "sticker" && mode === "comment") {
      const t = setTimeout(() => onModeChange?.("comment"), 200);
      return () => clearTimeout(t);
    }
    onModeChange?.(mode);
  }, [mode]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [content, setContent] = useState("");
  const [userComment, setUserComment] = useState<Comment | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [fetchedGroupMembers, setFetchedGroupMembers] = useState<GroupMember[]>(groupMembers);
  const [deletePopup, setDeletePopup] = useState<{
    commentId: string;
    anchorY: number;
    sheetTopY: number;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pendingSticker, setPendingSticker] = useState<{
    text: string;
    anchorX: number;
    y: number;
    rotation: number;
    avatarUrl: string | null;
    username: string;
  } | null>(null);
  const [pendingStickerSize, setPendingStickerSize] = useState({ w: 0, h: 0 });

  // Measured height of the rendered sheet — updated via onLayout each time the
  // sheet resizes (mode switch, keyboard appear/hide). Used to keep the post
  // preview bottom exactly 24px above the sheet top on every platform/state.
  const [sheetHeight, setSheetHeight] = useState(MODAL_HEIGHT);

  const modalContainerRef = useRef<any>(null);
  const translateY = useRef(new Animated.Value(MODAL_HEIGHT)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const stickersOpacity = useRef(new Animated.Value(0)).current;
  const stickersScale = useRef(new Animated.Value(0.9)).current;
  const toastAnim = useRef(new Animated.Value(0)).current;
  const stickerPopAnim = useRef(new Animated.Value(1)).current;
  const animGenRef = useRef(0);

  const hasKeyboard = keyboardHeight > 0;
  const isOwner = user?.id === photoOwnerId;

  // iOS shrinks the sheet when the keyboard opens; Android uses flex:1 instead
  // (handled in androidContainerStyle below) to avoid KAV padding-bottom flicker.
  const currentModalHeight = IS_IOS && hasKeyboard ? MODAL_HEIGHT / 2 : MODAL_HEIGHT;

  // ── Sticker bounds (synchronized with PhotoFeed.tsx) ─────────────────────────
  const FEED_HEIGHT = SCREEN_HEIGHT - 100;
  // In sticker mode without keyboard PhotoFeed pins the post to the comment-mode
  // position (uses MODAL_HEIGHT, not the smaller sticker modal height). Mirror that
  // here so sticker overlays land exactly on the post edges.
  const effectiveSheetHeight =
    mode === "sticker" && !hasKeyboard ? MODAL_HEIGHT : sheetHeight;
  const targetBottom =
    SCREEN_HEIGHT - effectiveSheetHeight - (hasKeyboard ? keyboardHeight : 0) - 24;
  const INNER_HEIGHT = FEED_HEIGHT - insets.top;
  const scale = Math.max(0.1, Math.min(0.95, (targetBottom - insets.top) / INNER_HEIGHT));
  const scaleX = scale;
  const PREVIEW_TOP = insets.top;
  const POST_HEIGHT_DYNAMIC = INNER_HEIGHT * scale;
  const POST_WIDTH_DYNAMIC = SCREEN_WIDTH * scale;
  const postTop = PREVIEW_TOP;
  const postCenterX = SCREEN_WIDTH / 2;
  const postLeft = postCenterX - POST_WIDTH_DYNAMIC / 2;
  const postRight = postCenterX + POST_WIDTH_DYNAMIC / 2;

  // ── Fetch group members ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!photoId && !groupId) return;
    let active = true;

    const fetchByGroupId = (gid: string) => {
      supabase
        .from("group_members")
        .select("user_id, profiles:user_id(username, avatar_url)")
        .eq("group_id", gid)
        .then(({ data: members }) => {
          if (!active || !members) return;
          setFetchedGroupMembers(
            members.map((m: any) => ({
              user_id: m.user_id,
              username: m.profiles?.username || "",
              avatar_url: m.profiles?.avatar_url ?? null,
            }))
          );
        });
    };

    if (groupId) {
      fetchByGroupId(groupId);
    } else {
      supabase
        .from("photos")
        .select("group_id")
        .eq("id", photoId)
        .single()
        .then(({ data: photoData }) => {
          if (!active || !photoData?.group_id) return;
          fetchByGroupId(photoData.group_id);
        });
    }

    return () => { active = false; };
  }, [photoId, groupId]);

  // ── Sticker data ──────────────────────────────────────────────────────────────
  const textReactions = useMemo(
    () => reactions.filter((r) => !isEmoji(r.sticker_id)),
    [reactions]
  );

  const randomFactorsRef = useRef<Record<string, { scatterY: number; rotation: number }>>({});
  const stickersData = useMemo(() => {
    return textReactions.map((reaction, index) => {
      if (!randomFactorsRef.current[reaction.id]) {
        randomFactorsRef.current[reaction.id] = {
          scatterY: Math.random() - 0.5,
          rotation: Math.random() - 0.5,
        };
      }
      const { scatterY: sy, rotation: ro } = randomFactorsRef.current[reaction.id];
      const isLeft = index % 2 === 0;
      return {
        id: reaction.id,
        reaction,
        anchorX: isLeft ? postLeft : postRight,
        y: postTop + POST_HEIGHT_DYNAMIC / 2 + sy * (POST_HEIGHT_DYNAMIC * 0.7),
        rotation: ro * 20,
      };
    });
  }, [textReactions, postTop, postLeft, postRight, POST_HEIGHT_DYNAMIC]);

  // ── Keyboard listeners ────────────────────────────────────────────────────────
  // iOS uses Will* events (fire before keyboard appears) + LayoutAnimation for
  // smooth height transitions. Android uses Did* events (fire after appearance).
  useEffect(() => {
    const showEvent = IS_IOS ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = IS_IOS ? "keyboardWillHide" : "keyboardDidHide";

    const showListener = Keyboard.addListener(showEvent, (e) => {
      if (IS_IOS) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const height = e.endCoordinates.height;
      setKeyboardHeight(height);
      onKeyboardHeightChange?.(height);
    });

    const hideListener = Keyboard.addListener(hideEvent, () => {
      // During an intentional close the slide animation is already running —
      // skip all state updates so nothing re-layouts mid-animation.
      if (intentionalCloseRef.current) return;
      if (IS_IOS) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKeyboardHeight(0);
      onKeyboardHeightChange?.(0);
      // NOTE: do NOT auto-revert sticker→comment here. The keyboard can drop for
      // many reasons (incl. tapping the send button inside a nested Modal, as in
      // the challenge responses view), and flipping the mode mid-compose makes the
      // next submit run the comment branch instead of posting the reaction.
      // Drag-to-dismiss → comment is handled explicitly in the panResponder.
    });

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  // ── markAsSeen ────────────────────────────────────────────────────────────────
  const markAsSeen = useCallback(async () => {
    if (!user || !photoId) return;
    try {
      const { error } = await supabase
        .from("comment_views")
        .upsert(
          { user_id: user.id, photo_id: photoId, last_viewed_at: new Date().toISOString() },
          { onConflict: "user_id,photo_id" }
        );
      if (error) throw error;
      onSeen?.(photoId);
    } catch (e) {
      console.error("[CommentModal] Error marking as seen:", e);
    }
  }, [user?.id, photoId, onSeen]);

  // ── Animations ────────────────────────────────────────────────────────────────
  const animateIn = useCallback(() => {
    animGenRef.current++;
    requestAnimationFrame(() => {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
      ]).start();

      Animated.sequence([
        Animated.delay(150),
        Animated.parallel([
          Animated.timing(stickersOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
            easing: Easing.out(Easing.quad),
          }),
          Animated.spring(stickersScale, {
            toValue: 1,
            useNativeDriver: true,
            tension: 50,
            friction: 7,
          }),
        ]),
      ]).start();
    });
  }, [overlayOpacity, translateY, stickersOpacity, stickersScale]);

  const animateOut = useCallback(
    (callback?: () => void) => {
      // iOS: dismiss keyboard before the slide so KAV shrinks first — no gap.
      // Android: dismiss after the slide to avoid a mid-animation layout jump
      //          when the keyboard was still up.
      if (IS_IOS) {
        intentionalCloseRef.current = true;
        Keyboard.dismiss();
      }

      // Notify the parent immediately so its un-shrink animation starts in
      // parallel with the sheet slide — avoids the 2-step "empty gap then expand"
      // that happens when the callback fires after the animation completes.
      callback?.();

      const capturedHasKeyboard = hasKeyboard; // capture before any async state change
      const myGen = ++animGenRef.current;

      stickersOpacity.setValue(0);
      stickersScale.setValue(0.9);

      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
          easing: Easing.in(Easing.quad),
        }),
        Animated.timing(translateY, {
          // Android: slide to full screen height when keyboard was open so the
          // sheet doesn't leave a visible gap where the keyboard used to be.
          toValue: !IS_IOS && capturedHasKeyboard ? SCREEN_HEIGHT : MODAL_HEIGHT,
          duration: 250,
          useNativeDriver: true,
          easing: Easing.in(Easing.quad),
        }),
      ]).start(({ finished }) => {
        if (finished && animGenRef.current === myGen) {
          if (!IS_IOS) {
            intentionalCloseRef.current = true;
            Keyboard.dismiss();
            setKeyboardHeight(0);
          }
          onKeyboardHeightChange?.(0);
          onCloseComplete();
        }
      });
    },
    [overlayOpacity, translateY, stickersOpacity, stickersScale, onCloseComplete, hasKeyboard]
  );

  useEffect(() => {
    if (visible) {
      animateIn();
      fetchComments();
      markAsSeen();
    } else {
      animateOut();
    }
  }, [visible]);

  const handleClose = () => animateOut(onClose);

  // Shows the toast in place (no modal close) and auto-dismisses it. Used for
  // actions that stay inside the sheet, e.g. deleting a comment.
  const toastHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (message: string) => {
    if (toastHideTimer.current) clearTimeout(toastHideTimer.current);
    setToastMessage(message);
    toastAnim.setValue(0);
    Animated.spring(toastAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }).start();
    toastHideTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
        easing: Easing.in(Easing.quad),
      }).start(({ finished }) => {
        if (finished) setToastMessage(null);
      });
    }, 2000);
  };

  const showToastAndClose = (message: string, submittedText?: string) => {
    setToastMessage(message);
    toastAnim.setValue(0);
    Animated.spring(toastAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }).start();
    if (submittedText) {
      // If the user already has a sticker, reuse its exact position so the
      // animation plays in-place rather than spawning a second sticker.
      const existing = stickersData.find((s) => s.reaction.user_id === user?.id);
      let anchorX: number, y: number, rotation: number;
      let avatarUrl: string | null = null;
      let username = "";
      if (existing) {
        ({ anchorX, y, rotation } = existing);
        avatarUrl = existing.reaction.avatar_url ?? null;
        username = existing.reaction.username ?? "";
      } else {
        const nextIndex = textReactions.length;
        const isLeft = nextIndex % 2 === 0;
        const sy = Math.random() - 0.5;
        const ro = Math.random() - 0.5;
        anchorX = isLeft ? postLeft : postRight;
        y = postTop + POST_HEIGHT_DYNAMIC / 2 + sy * (POST_HEIGHT_DYNAMIC * 0.7);
        rotation = ro * 20;
        const member = fetchedGroupMembers.find((m) => m.user_id === user?.id);
        avatarUrl = member?.avatar_url ?? null;
        username = member?.username ?? "";
      }
      setPendingSticker({ text: submittedText, anchorX, y, rotation, avatarUrl, username });
      stickerPopAnim.setValue(0);
      Animated.spring(stickerPopAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 180,
        friction: 7,
      }).start(() => handleClose());
    } else {
      setTimeout(() => handleClose(), 500);
    }
  };

  // ── Pan responder (drag to dismiss) ──────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => {
        if (modeRef.current !== "sticker") Keyboard.dismiss();
        return true;
      },
      onMoveShouldSetPanResponder: (_, { dy, dx }) =>
        dy > 2 && Math.abs(dy) > Math.abs(dx),
      onPanResponderMove: (_, { dy }) => {
        if (dy > 0) translateY.setValue(dy);
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (modeRef.current === "sticker") {
          if (dy > 80 || vy > 0.3) setMode("comment");
          // Always spring back so the sheet returns to its resting position.
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 80,
            friction: 12,
          }).start();
          return;
        }
        if (dy > 120 || vy > 0.5) {
          handleClose();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 80,
            friction: 12,
          }).start();
        }
      },
    })
  ).current;

  // ── Data ──────────────────────────────────────────────────────────────────────
  const fetchComments = useCallback(async () => {
    if (!photoId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("comments")
        .select(`
          id, photo_id, user_id, content, created_at,
          profiles:user_id (username, avatar_url)
        `)
        .eq("photo_id", photoId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setComments((data as any) || []);
      const existing = (data as any[] || []).find((c) => c.user_id === user?.id);
      setUserComment(existing || null);
    } catch (err) {
      console.error("Error fetching comments:", err);
    } finally {
      setLoading(false);
    }
  }, [photoId, user?.id]);

  const handleSubmit = async () => {
    if (submitting || !user) return;

    if (mode === "sticker") {
      const text = content.trim().toUpperCase();
      const isDelete = !text;
      if (isDelete) {
        supabase
          .from("reactions")
          .delete()
          .eq("photo_id", photoId)
          .eq("user_id", user.id)
          .then(({ error }) => { if (error) console.error("Error deleting reaction:", error); });
      } else {
        supabase
          .from("reactions")
          .upsert(
            { photo_id: photoId, user_id: user.id, type: "emoji", emoji: text },
            { onConflict: "photo_id,user_id" }
          )
          .then(({ error }) => { if (error) console.error("Error posting sticker:", error); });
      }
      setContent("");
      intentionalCloseRef.current = true;
      showToastAndClose(isDelete ? "Réaction supprimé" : "Réaction ajouté", isDelete ? undefined : text);
      return;
    }

    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("comments")
        .insert({ photo_id: photoId, user_id: user.id, content: content.trim() })
        .select(`
          id, photo_id, user_id, content, created_at,
          profiles:user_id (username, avatar_url)
        `)
        .single();

      if (error) throw error;
      setComments((prev) => [...prev, data as any]);
      setUserComment(data as any);
      setContent("");
      Keyboard.dismiss();
    } catch (err) {
      console.error("Error posting comment:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from("comments")
        .delete()
        .eq("id", commentId)
        .eq("user_id", user.id);

      if (error) throw error;
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      if (userComment?.id === commentId) setUserComment(null);
      showToast("Commentaire supprimé");
    } catch (err) {
      console.error("Error deleting comment:", err);
    }
  };

  const handleLongPressDelete = useCallback(
    (commentId: string, anchorY: number) => {
      if (modalContainerRef.current) {
        modalContainerRef.current.measureInWindow((_x: number, y: number) => {
          setDeletePopup({ commentId, anchorY, sheetTopY: y });
        });
      } else {
        setDeletePopup({
          commentId,
          anchorY,
          sheetTopY: SCREEN_HEIGHT - sheetHeight - (IS_IOS && hasKeyboard ? keyboardHeight : 0),
        });
      }
    },
    [sheetHeight, hasKeyboard, keyboardHeight]
  );

  // ── Sheet height measurement ──────────────────────────────────────────────────
  const handleSheetLayout = useCallback(
    (e: any) => {
      const h = e.nativeEvent.layout.height;
      if (h <= 0) return;
      // Skip the flex:1 expansion that happens on Android when the keyboard is
      // open in comment mode — in that state the sheet fills the available space
      // above the keyboard, not its natural content height. The sticker layer is
      // hidden in this state anyway, so we just leave sheetHeight at its last
      // valid value (MODAL_HEIGHT or the sticker content height).
      if (!IS_IOS && hasKeyboard && mode !== "sticker") return;
      setSheetHeight(h);
      onSheetHeightChange?.(h);
    },
    [hasKeyboard, mode, onSheetHeightChange]
  );

  // ── Content helpers ───────────────────────────────────────────────────────────
  const emojiRegex = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}\u{200D}\u{20E3}]/gu;

  const toggleMode = () => {
    setMode((prev) => {
      if (prev === "comment") {
        setContent(content.replace(emojiRegex, "").slice(0, 8).toUpperCase());
        return "sticker";
      }
      return "comment";
    });
  };

  const handleContentChange = (val: string) => {
    if (mode === "sticker") {
      setContent(val.replace(emojiRegex, "").slice(0, 8).toUpperCase());
    } else {
      setContent(val);
    }
  };

  const renderComment = ({ item }: { item: Comment }) => (
    <CommentItem
      item={item}
      isMyComment={item.user_id === user?.id}
      onLongPressDelete={handleLongPressDelete}
      groupMembers={fetchedGroupMembers}
    />
  );

  // ── Android-specific container style ─────────────────────────────────────────
  // When the keyboard is open, switching to flex:1 lets the sheet naturally fill
  // the space above the keyboard instead of relying on KAV's padding adjustment,
  // which avoids the padding-bottom flicker/jump on close.
  const androidContainerStyle = {
    transform: [{ translateY }],
    height: mode === "sticker" ? undefined : hasKeyboard ? undefined : MODAL_HEIGHT,
    flex: mode === "sticker" ? 0 : hasKeyboard ? 1 : 0,
    marginTop: mode === "sticker" ? 0 : hasKeyboard ? insets.top : 0,
  };

  return (
    <View style={styles.root}>
      {/* Tappable backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: overlayOpacity }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>

      {/* Sticker layer — hidden when typing a comment (keyboard up, comment mode) */}
      <Animated.View
        style={[
          styles.stickerLayer,
          { opacity: stickersOpacity, transform: [{ scale: stickersScale }] },
          hasKeyboard && mode !== "sticker" && { display: "none" },
        ]}
        pointerEvents="none"
      >
        {stickersData.filter((item) => !pendingSticker || item.reaction.user_id !== user?.id).map((item) => (
          <StickerItem
            key={item.id}
            anchorX={item.anchorX}
            y={item.y}
            rotation={item.rotation}
            stickerText={item.reaction.sticker_id}
            avatarUrl={item.reaction.avatar_url ?? null}
            username={item.reaction.username ?? ""}
          />
        ))}
        {pendingSticker && (
          <View
            onLayout={(e) =>
              setPendingStickerSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
            }
            style={[
              styles.stickerContainer,
              {
                top: pendingSticker.y - pendingStickerSize.h / 2,
                left: pendingSticker.anchorX - pendingStickerSize.w / 2,
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <Animated.View
              style={{
                transform: [
                  { rotate: `${pendingSticker.rotation}deg` },
                  { scale: stickerPopAnim },
                ],
              }}
            >
              <View>
                <TextSticker text={pendingSticker.text} fontSize={28} isPostSticker={true} />
                <View style={styles.stickerAvatar}>
                  {pendingSticker.avatarUrl ? (
                    <Image source={{ uri: pendingSticker.avatarUrl }} style={StyleSheet.absoluteFill} />
                  ) : (
                    <Text style={styles.avatarFallbackText}>
                      {(pendingSticker.username || "?")[0].toUpperCase()}
                    </Text>
                  )}
                </View>
              </View>
            </Animated.View>
          </View>
        )}
      </Animated.View>

      {/* Sheet + keyboard avoidance */}
      <KeyboardAvoidingView
        behavior={hasKeyboard ? "padding" : undefined}
        style={styles.kbdContainer}
      >
        <ForceTheme mode="Light">
          {IS_IOS ? (
            // iOS: outer wrapper carries the slide transform; inner view owns the
            // height so LayoutAnimation can animate height changes independently
            // when the keyboard appears/disappears.
            <Animated.View style={{ transform: [{ translateY }], width: "100%" }}>
              <Animated.View
                ref={modalContainerRef}
                onLayout={handleSheetLayout}
                style={[
                  styles.modalContainer,
                  { height: mode === "sticker" ? undefined : currentModalHeight },
                ]}
              >
                <CommentModalBody
                  loading={loading}
                  comments={comments}
                  renderComment={renderComment}
                  isOwner={isOwner}
                  userComment={userComment}
                  insets={insets}
                  panResponder={panResponder}
                  content={content}
                  setContent={handleContentChange}
                  handleSubmit={handleSubmit}
                  submitting={submitting}
                  hasKeyboard={hasKeyboard}
                  mode={mode}
                  onStickerToggle={toggleMode}
                  groupMembers={fetchedGroupMembers}
                  embedded={embedded}
                />
              </Animated.View>
            </Animated.View>
          ) : (
            // Android: translateY lives on the same element as height/flex so that
            // the flex:1 switch and the slide animation remain in sync.
            <Animated.View
              ref={modalContainerRef}
              onLayout={handleSheetLayout}
              style={[styles.modalContainer, androidContainerStyle]}
            >
              <CommentModalBody
                loading={loading}
                comments={comments}
                renderComment={renderComment}
                isOwner={isOwner}
                userComment={userComment}
                insets={insets}
                panResponder={panResponder}
                content={content}
                setContent={handleContentChange}
                handleSubmit={handleSubmit}
                submitting={submitting}
                hasKeyboard={hasKeyboard}
                mode={mode}
                onStickerToggle={toggleMode}
                groupMembers={fetchedGroupMembers}
                stickerPopAnim={stickerPopAnim}
                embedded={embedded}
              />
            </Animated.View>
          )}
        </ForceTheme>
      </KeyboardAvoidingView>

      {toastMessage !== null && (
        <StickerToast message={toastMessage} animValue={toastAnim} topInset={insets.top} />
      )}

      {/* Delete popup — rendered last so it paints above stickers and the sheet */}
      {deletePopup && (
        <DeleteCommentPopup
          anchorY={deletePopup.anchorY}
          sheetTopY={deletePopup.sheetTopY}
          onConfirm={() => handleDeleteComment(deletePopup.commentId)}
          onDismiss={() => setDeletePopup(null)}
        />
      )}
    </View>
  );
}

// ── Shared body ───────────────────────────────────────────────────────────────
function CommentModalBody({
  loading,
  comments,
  renderComment,
  isOwner,
  userComment,
  insets,
  panResponder,
  content,
  setContent,
  handleSubmit,
  submitting,
  hasKeyboard,
  mode,
  onStickerToggle,
  groupMembers,
  embedded,
}: any) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const paddingBottom = hasKeyboard ? 8 : Math.max(insets.bottom, 20);
  const [mentionKeyword, setMentionKeyword] = useState<string | null>(null);
  // Cleared when the input blurs so the popup never lingers without focus.
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSuggestionSelect = useCallback(
    (member: GroupMember) => {
      const lastAt = content.lastIndexOf("@");
      if (lastAt >= 0) {
        setContent(`${content.slice(0, lastAt)}@${member.username} `);
      }
      setMentionKeyword(null);
    },
    [content, setContent]
  );

  const handleInputFocus = useCallback(() => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }, []);

  // Delay so a tap on a suggestion (which blurs the input first) still registers
  // before the popup unmounts.
  const handleInputBlur = useCallback(() => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => setMentionKeyword(null), 120);
  }, []);

  return (
    <>
      <View style={styles.modalBackgroundFiller}>
        <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
      </View>

      <View style={mode === "sticker" ? { flex: 0 } : { flex: 1 }}>
        <View style={styles.dragArea} {...panResponder.panHandlers}>
          <View style={styles.dragHandle} />
        </View>

        {mode !== "sticker" &&
          (loading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color={colors.text} />
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              renderItem={renderComment}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="on-drag"
              style={{ flex: 1 }}
              ListEmptyComponent={
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>Aucun commentaire pour le moment.</Text>
                  </View>
                </TouchableWithoutFeedback>
              }
            />
          ))}
      </View>

      <View style={{ paddingBottom }}>
        {mode === "sticker" && (
          <View style={styles.stickerPreviewContainer}>
            <TextSticker text={content.trim().toUpperCase() || "STICKER"} fontSize={36} />
          </View>
        )}
        {mode !== "sticker" && (
          <MentionSuggestionsPopup
            keyword={mentionKeyword}
            members={groupMembers}
            onSelect={handleSuggestionSelect}
          />
        )}
        <CommentInput
          content={content}
          setContent={setContent}
          onSubmit={handleSubmit}
          submitting={submitting}
          maxLength={mode === "sticker" ? 8 : undefined}
          placeholder={mode === "sticker" ? "Ton message..." : undefined}
          autoCapitalize={mode === "sticker" ? "characters" : undefined}
          isStickerMode={mode === "sticker"}
          onStickerToggle={onStickerToggle}
          onMentionSearch={setMentionKeyword}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
        />
      </View>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
    },
    kbdContainer: {
      flex: 1,
      justifyContent: "flex-end",
      zIndex: 10,
    },
    backdrop: {
      backgroundColor: colors.opacityLight,
    },
    modalContainer: {
      // Dimensions are driven dynamically by platform logic above
    },
    modalBackgroundFiller: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: -SCREEN_HEIGHT,
      backgroundColor: colors.card,
      borderTopLeftRadius: themeRadii.xl,
      borderTopRightRadius: themeRadii.xl,
      overflow: "hidden",
    },
    dragArea: {
      width: "100%",
      alignItems: "center",
      paddingTop: 12,
      paddingBottom: 8,
      zIndex: 10,
    },
    dragHandle: {
      width: 38,
      height: 4,
      backgroundColor: colors.borderSecondary,
      borderRadius: themeRadii.xs,
    },
    loaderContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    listContent: {
      padding: themeSpacing.xl,
      paddingBottom: themeSpacing.xl4,
    },
    stickerPreviewContainer: {
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 20,
      paddingBottom: 16,
      backgroundColor: "transparent",
      overflow: "visible",
    },
    emptyContainer: {
      alignItems: "center",
      marginTop: themeSpacing.xl4,
    },
    emptyText: {
      fontFamily: typography.family.medium,
      fontSize: typography.size.sm,
      color: colors.textMuted || colors.textTertiary,
    },
    stickerLayer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 5,
    },
    stickerContainer: {
      position: "absolute",
    },
    stickerAvatar: {
      position: "absolute",
      top: -10,
      left: -10,
      width: 24,
      height: 24,
      borderRadius: themeRadii.xs,
      backgroundColor: colors.brand,
      justifyContent: "center",
      alignItems: "center",
      ...shadows.sm,
      zIndex: 10,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.borderNeutral,
    },
    avatarFallbackText: {
      color: colors.white,
      fontFamily: typography.family.bold,
      fontSize: 10,
    },
  });
