import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
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
} from "react-native";
import {
  KeyboardProvider,
  useKeyboardHandler,
} from "react-native-keyboard-controller";
import Reanimated, {
  runOnJS,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  useDerivedValue,
  type SharedValue,
} from "react-native-reanimated";
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
import { SHEET_BASE, SHEET_KB, SHEET_STICKER, SHEET_TIMING } from "../lib/comment-sheet";
import { useTheme, useThemedStyles, ForceTheme } from "../lib/theme-context";
import { Reaction } from "../lib/feed-types";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const IS_IOS = Platform.OS === "ios";
// How long the just-posted sticker stays visible (popping on the post) before the sheet
// closes — long enough to clearly see the pop animation.
const STICKER_POP_MS = 1100;
// How long a deleted sticker shrinks out before the sheet closes.
const STICKER_DELETE_MS = 500;

const isEmoji = (str: string) => {
  const regexExp = /(©|®|[ -㌀]|\ud83c[퀀-\udfff]|\ud83d[퀀-\udfff]|\ud83e[퀀-\udfff])/gi;
  return regexExp.test(str);
};

interface CommentModalProps {
  visible: boolean;
  onClose: () => void;
  onSeen?: (photoId: string) => void;
  onKeyboardHeightChange?: (height: number) => void;
  /**
   * Shared value the parent (PhotoFeed) reads to scale its preview frame-by-frame.
   * Updated here because the keyboard belongs to *this* (modal) window — on Android
   * the parent's window never receives the modal's keyboard events.
   */
  keyboardHeightShared?: SharedValue<number>;
  /** Shared value to animate and report sheet height in real-time. */
  sheetHeightShared?: SharedValue<number>;
  /** Notifies the parent when the keyboard opens/closes so it can hide the stickers. */
  onKeyboardActiveChange?: (active: boolean) => void;
  /** Reports the rendered sheet height so the parent can keep the post preview aligned. */
  onSheetHeightChange?: (height: number) => void;
  /** Reports whenever the user switches between comment/sticker mode. */
  onModeChange?: (mode: "comment" | "sticker") => void;
  /** Fires when a text sticker is posted, with the sticker text — lets the parent
   *  pop it onto the post before the sheet closes. */
  onStickerPosted?: (text: string) => void;
  /** Fires when the user's text sticker is deleted (empty submit) — lets the parent
   *  shrink it out + show the toast before the sheet closes. */
  onStickerDeleted?: () => void;
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
  inline?: boolean;
  style?: any;
}

// ── Mounting shell ────────────────────────────────────────────────────────────
// Keeps the Modal in the tree until the close animation finishes, then unmounts.
export default function CommentModal(props: CommentModalProps) {
  const { visible, onClose, embedded, inline, style, sheetHeightShared } = props;
  const { colors } = useTheme();
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

  // Inline: render as an in-flow component with styling and background
  if (inline) {
    return (
      <View
        style={[
          style,
          {
            backgroundColor: colors.card,
            borderTopLeftRadius: themeRadii.xl,
            borderTopRightRadius: themeRadii.xl,
            overflow: "hidden",
          },
        ]}
      >
        {content}
      </View>
    );
  }

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
      {/* A native Modal is a separate window; keyboard-controller events only fire
          inside a KeyboardProvider mounted in that window. (embedded/inline render
          in the main window and rely on the root provider.) */}
      <KeyboardProvider>{content}</KeyboardProvider>
    </Modal>
  );
}

// ── Main content ──────────────────────────────────────────────────────────────
function CommentModalContent({
  visible,
  onClose,
  onSeen,
  onKeyboardHeightChange,
  keyboardHeightShared,
  sheetHeightShared,
  onKeyboardActiveChange,
  onSheetHeightChange,
  onModeChange,
  onStickerPosted,
  onStickerDeleted,
  photoId,
  photoOwnerId,
  reactions = [],
  initialMode,
  onCloseComplete,
  groupMembers = [],
  groupId,
  requestCloseRef,
  embedded,
  inline,
  style,
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
  // True when gracefulClose has already kicked off all exit animations directly,
  // so the useEffect([visible]) close path skips re-starting them.
  const isGracefulClosingRef = useRef(false);

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
  // True while the keyboard is up; set at keyboard-start so the sheet shrinks and
  // the parent hides the stickers immediately (not after the keyboard settles).
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const modalContainerRef = useRef<any>(null);
  // One Reanimated pass drives the whole sheet (open/close slide + drag + keyboard
  // lift) using transforms only — no per-frame layout, no competing animators.
  const sheetProgress = useSharedValue(0); // 0 = closed (off-screen), 1 = open
  const dragY = useSharedValue(0); // drag-to-dismiss offset
  const localKb = useSharedValue(0);
  const kbSV = keyboardHeightShared ?? localKb; // live keyboard height (px)
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const toastAnim = useRef(new Animated.Value(0)).current;

  const hasKeyboard = keyboardVisible;
  const isOwner = user?.id === photoOwnerId;
  // Collapsed (keyboard-up) target height: sticker mode gets its own value so it can
  // be tuned independently of the comment-mode keyboard height.
  const collapsedH = mode === "sticker" ? SHEET_STICKER : SHEET_KB;
  const sheetH = keyboardVisible || mode === "sticker" ? collapsedH : SHEET_BASE;

  const targetKbHeight = useSharedValue(290);
  const localSheetHeight = useSharedValue(SHEET_BASE);
  const sheetHeightSV = sheetHeightShared ?? localSheetHeight;
  // Shared mirror of `collapsedH` so the height worklet (which can't read React
  // state) interpolates toward the right floor for the current mode. Animated with
  // withTiming: on a mode switch the keyboard often stays up (the input keeps
  // focus), so the worklet sits at `floor` — a plain assignment would snap the
  // sheet (and PhotoFeed's preview, which reads the same value) between
  // SHEET_STICKER and SHEET_KB. Easing the floor makes the resize smooth.
  const collapsedHeightSV = useSharedValue(collapsedH);
  useEffect(() => {
    collapsedHeightSV.value = withTiming(collapsedH, SHEET_TIMING);
  }, [collapsedH]);
  // 1 while gracefully closing from a keyboard-up state: freezes the sheet height so
  // it doesn't expand to SHEET_BASE (leaving empty padding) as the keyboard retracts
  // ahead of the slide-out. Reset on open.
  const closingSV = useSharedValue(0);

  useDerivedValue(() => {
    if (closingSV.value > 0) return; // hold last height while closing
    const floor = collapsedHeightSV.value;
    if (targetKbHeight.value <= 0) {
      sheetHeightSV.value = SHEET_BASE;
      return;
    }
    const h = SHEET_BASE - (kbSV.value / targetKbHeight.value) * (SHEET_BASE - floor);
    sheetHeightSV.value = Math.max(floor, Math.min(SHEET_BASE, h));
  }, [SHEET_BASE]);

  // Sheet transform: slide in from below + drag offset − keyboard lift. Height comes
  // from Reanimated `sheetHeightSV` for frame-by-frame smoothness.
  const sheetStyle = useAnimatedStyle(() => ({
    height: sheetHeightSV.value,
    transform: [
      { translateY: (1 - sheetProgress.value) * SHEET_BASE + dragY.value - kbSV.value },
    ],
  }));

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

  // Report the (discrete) sheet height + keyboard state up to the parent so it can
  // fit/hide the preview stickers.
  useEffect(() => {
    onSheetHeightChange?.(sheetH);
  }, [sheetH]);
  useEffect(() => {
    onKeyboardActiveChange?.(keyboardVisible);
  }, [keyboardVisible]);

  // ── Keyboard ─────────────────────────────────────────────────────────────────
  // `onStart` flips keyboardVisible immediately (sheet shrinks, parent hides
  // stickers); `onMove` feeds the live height to the shared value driving the sheet
  // + preview every frame; `onEnd` mirrors the settled height for the delete popup.
  const setKbVisible = useCallback(
    (active: boolean) => {
      if (!active && intentionalCloseRef.current) return;
      setKeyboardVisible(active);
    },
    []
  );
  const applyKeyboardHeight = useCallback(
    (height: number) => {
      if (height === 0 && intentionalCloseRef.current) return;
      setKeyboardHeight(height);
      onKeyboardHeightChange?.(height);
    },
    [onKeyboardHeightChange]
  );

  useKeyboardHandler(
    {
      onStart: (e) => {
        "worklet";
        if (e.height > 0) {
          targetKbHeight.value = e.height;
        }
        runOnJS(setKbVisible)(e.height > 0);
      },
      onMove: (e) => {
        "worklet";
        kbSV.value = e.height;
      },
      onEnd: (e) => {
        "worklet";
        kbSV.value = e.height;
        runOnJS(applyKeyboardHeight)(e.height);
      },
    },
    [applyKeyboardHeight, setKbVisible]
  );

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

  // ── Open / close ──────────────────────────────────────────────────────────────
  // One Reanimated `sheetProgress` transition for the slide; a parallel RN Animated
  // fade for the backdrop. No layout animation, nothing else competing.
  const finishClose = useCallback(() => {
    intentionalCloseRef.current = true;
    Keyboard.dismiss();
    onKeyboardHeightChange?.(0);
    // The keyboard shared value is owned by the parent (PhotoFeed) and survives this
    // modal's unmount. On Android the modal window can tear down before the
    // keyboard-hide worklet fires (esp. on the sticker-submit auto-close), leaving
    // kbSV stuck at the last height — which lifts the sheet on the next open. Reset
    // it here so the next open starts with the keyboard considered closed.
    kbSV.value = 0;
    onCloseComplete();
  }, [onKeyboardHeightChange, onCloseComplete]);

  useEffect(() => {
    if (inline) {
      // Inline has no slide/overlay; just drive data + unmount.
      if (visible) {
        fetchComments();
        markAsSeen();
      } else {
        onCloseComplete();
      }
      return;
    }

    if (visible) {
      intentionalCloseRef.current = false;
      isGracefulClosingRef.current = false;
      dragY.value = 0;
      // Defensive: the keyboard is never up at open time, but kbSV (owned by the
      // parent) may be stale from a prior Android teardown — clear it before the
      // first frame so the sheet doesn't open pre-lifted with empty space below.
      kbSV.value = 0;
      closingSV.value = 0;
      sheetProgress.value = withTiming(1, SHEET_TIMING);
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
        easing: Easing.out(Easing.quad),
      }).start();
      fetchComments();
      markAsSeen();
    } else if (!isGracefulClosingRef.current) {
      // Normal close (tap backdrop, drag to dismiss): animate everything now.
      // gracefulClose() skips this block — it starts all animations synchronously
      // to avoid the React-render-cycle gap that causes a two-part exit.
      if (IS_IOS) Keyboard.dismiss();
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
        easing: Easing.in(Easing.quad),
      }).start();
      // `finished` is false if reopened mid-close, so finishClose won't unmount.
      sheetProgress.value = withTiming(0, SHEET_TIMING, (fin) => {
        "worklet";
        if (fin) runOnJS(finishClose)();
      });
    }
  }, [visible]);

  const handleClose = () => onClose();

  // Closes from a keyboard-up state (sticker submit, or dragging the sticker nudge)
  // in ONE smooth motion: freeze the sheet height (no growth → no empty padding),
  // then retract the keyboard and slide the sheet off simultaneously. They stay in
  // sync because the sheet's translateY subtracts kbSV — as the keyboard retracts the
  // sheet rides just above it the whole way down, so it never lands behind the
  // keyboard window (the old jank) and there's no two-part dock-then-slide.
  const gracefulCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gracefulClose = useCallback(() => {
    intentionalCloseRef.current = true;
    isGracefulClosingRef.current = true;
    closingSV.value = 1;
    dragY.value = withTiming(0, SHEET_TIMING);
    // Start all exit animations synchronously — no React render cycle gap between
    // Keyboard.dismiss() and the sheet slide-out, so the two move as one.
    sheetProgress.value = withTiming(0, SHEET_TIMING, (fin) => {
      "worklet";
      if (fin) runOnJS(finishClose)();
    });
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
      easing: Easing.in(Easing.quad),
    }).start();
    Keyboard.dismiss();
    handleClose();
  }, [finishClose]);
  useEffect(() => () => {
    if (gracefulCloseTimer.current) clearTimeout(gracefulCloseTimer.current);
    if (toastHideTimer.current) clearTimeout(toastHideTimer.current);
  }, []);

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
        if (dy > 0) dragY.value = dy;
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (modeRef.current === "sticker") {
          // Dragging the sticker nudge down exits all the way to the full view
          // (closes the modal + keyboard together), not back to the comments.
          if (dy > 80 || vy > 0.3) {
            gracefulClose();
          } else {
            // Ease back (no spring) so the sheet doesn't wobble on a small drag.
            dragY.value = withTiming(0, SHEET_TIMING);
          }
          return;
        }
        if (dy > 120 || vy > 0.5) {
          // onClose flips `visible`; the close effect slides the sheet out.
          handleClose();
        } else {
          dragY.value = withSpring(0, { stiffness: 220, damping: 26 });
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
      // Reveal feed: the parent (PhotoFeed) handles the on-post animation (pop / shrink)
      // and a toast on the MAIN feed once the sheet closes. Other contexts (no callbacks)
      // fall back to an in-modal toast. Keyboard stays up during the wait.
      if (isDelete) {
        if (onStickerDeleted) onStickerDeleted();
        else showToast("Réaction supprimé");
        if (gracefulCloseTimer.current) clearTimeout(gracefulCloseTimer.current);
        gracefulCloseTimer.current = setTimeout(() => gracefulClose(), STICKER_DELETE_MS);
      } else {
        if (onStickerPosted) onStickerPosted(text);
        else showToast("Réaction Ajouté");
        if (gracefulCloseTimer.current) clearTimeout(gracefulCloseTimer.current);
        gracefulCloseTimer.current = setTimeout(() => gracefulClose(), STICKER_POP_MS);
      }
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
      showToast("Commentaire Ajouté");
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
          // The sheet bottom sits at the keyboard top; its top is sheetH above that.
          sheetTopY: SCREEN_HEIGHT - sheetH - (hasKeyboard ? keyboardHeight : 0),
        });
      }
    },
    [sheetH, hasKeyboard, keyboardHeight]
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

  if (inline) {
    return (
      <ForceTheme mode="Light">
        <View style={{ flex: 1 }}>
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
            closingRef={intentionalCloseRef}
          />

          {toastMessage !== null && (
            <StickerToast message={toastMessage} animValue={toastAnim} topInset={insets.top} />
          )}

          {deletePopup && (
            <DeleteCommentPopup
              anchorY={deletePopup.anchorY}
              sheetTopY={deletePopup.sheetTopY}
              onConfirm={() => handleDeleteComment(deletePopup.commentId)}
              onDismiss={() => setDeletePopup(null)}
            />
          )}
        </View>
      </ForceTheme>
    );
  }

  return (
    <View style={styles.root}>
      {/* Tappable backdrop. In the reveal (embedded) we don't darken the preview —
          transparent fill, but still tap-to-close. */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.backdrop,
          embedded && { backgroundColor: "transparent" },
          { opacity: overlayOpacity },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>

      {/* (Reaction stickers now render on the post itself in PhotoFeed, so they scale
          with it — no overlay/positioning math here.) */}

      {/* Sheet — a single Reanimated transition handles open/close slide, drag, AND
          the keyboard lift (translateY -keyboard), transforms only → fluid. Its
          height is a couple of discrete values so the drawer stays near mid-screen
          when the keyboard is up. */}
      <View style={styles.kbdContainer} pointerEvents="box-none">
        <ForceTheme mode="Light">
          <Reanimated.View
            ref={modalContainerRef}
            style={[styles.modalContainer, { width: "100%" }, sheetStyle]}
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
              closingRef={intentionalCloseRef}
            />
          </Reanimated.View>
        </ForceTheme>
      </View>

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
  closingRef,
}: any) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  // Sticker mode always opens the keyboard (autofocus) and the sheet rides above it,
  // so keep a fixed 8px — flipping insets.bottom → 8 at keyboard-settle caused a
  // visible bottom-padding jump at the end of the open animation.
  const paddingBottom = mode === "sticker" ? 8 : hasKeyboard ? 8 : themeRadii.lg;
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

  // ── Custom scrollbar ──────────────────────────────────────────────────────────
  // RN's native scroll indicator can't be styled (width/radius), so we track the
  // FlatList's scroll offset + sizes and drive our own 4px pill thumb on the right.
  const [scrollViewHeight, setScrollViewHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const scrollY = useRef(new Animated.Value(0)).current;

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
      }),
    [scrollY]
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

      <View style={{ flex: 1 }}>
        <View style={styles.dragArea} {...panResponder.panHandlers}>
          <View style={styles.dragHandle} />
        </View>

        {mode !== "sticker" &&
          (loading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color={colors.text} />
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <Animated.FlatList
                data={comments}
                keyExtractor={(item) => item.id}
                renderItem={renderComment}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                keyboardDismissMode="on-drag"
                style={{ flex: 1 }}
                scrollEventThrottle={16}
                onScroll={onScroll}
                onLayout={(e) => setScrollViewHeight(e.nativeEvent.layout.height)}
                onContentSizeChange={(_w, h) => setContentHeight(h)}
                ListEmptyComponent={
                  <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>Aucun commentaire pour le moment.</Text>
                    </View>
                  </TouchableWithoutFeedback>
                }
              />
              <CommentScrollbar
                scrollY={scrollY}
                viewportHeight={scrollViewHeight}
                contentHeight={contentHeight}
              />
            </View>
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
          closingRef={closingRef}
        />
      </View>
    </>
  );
}

// ── Custom scrollbar ──────────────────────────────────────────────────────────
// A 4px pill thumb pinned to the right edge. Hidden when content fits. The thumb
// height is proportional to the visible/content ratio; its offset is driven by the
// list's scrollY (native driver) so it tracks scrolling frame-by-frame.
const SCROLLBAR_MIN_THUMB = 24;
function CommentScrollbar({
  scrollY,
  viewportHeight,
  contentHeight,
}: {
  scrollY: Animated.Value;
  viewportHeight: number;
  contentHeight: number;
}) {
  const styles = useThemedStyles(makeStyles);

  // Nothing to scroll → no scrollbar.
  if (contentHeight <= viewportHeight || viewportHeight === 0) return null;

  const ratio = viewportHeight / contentHeight;
  const thumbHeight = Math.max(viewportHeight * ratio, SCROLLBAR_MIN_THUMB);
  const scrollableDistance = contentHeight - viewportHeight;
  const thumbTravel = viewportHeight - thumbHeight;

  const translateY = scrollY.interpolate({
    inputRange: [0, scrollableDistance],
    outputRange: [0, thumbTravel],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.scrollbarTrack} pointerEvents="none">
      <Animated.View
        style={[styles.scrollbarThumb, { height: thumbHeight, transform: [{ translateY }] }]}
      />
    </View>
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
      height: themeSpacing.xxl,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 10,
    },
    dragHandle: {
      width: 48,
      height: 4,
      backgroundColor: colors.borderSecondary,
      borderRadius: themeRadii.xs,
    },
    loaderContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    scrollbarTrack: {
      position: "absolute",
      top: 0,
      bottom: 0,
      right: 6,
      width: 4,
    },
    scrollbarThumb: {
      width: 4,
      borderRadius: themeRadii.full,
      backgroundColor: colors.borderSecondary,
    },
    listContent: {
      paddingHorizontal: themeSpacing.xl,
      paddingTop: 0,
      paddingBottom: themeSpacing.xl4,
    },
    stickerPreviewContainer: {
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
      paddingTop: themeSpacing.sm,
      paddingBottom: themeSpacing.sm,
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
