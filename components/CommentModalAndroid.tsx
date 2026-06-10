import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  ActivityIndicator,
  Modal,
  Dimensions,
  Pressable,
  TouchableOpacity,
  Animated,
  PanResponder,
  Easing,
  Keyboard,
  TouchableWithoutFeedback,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import BlurView from "./atoms/BlurView";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";

// Atomic Design Imports
import { CloseIcon } from "./atoms/CloseIcon";
import { CommentItem, Comment } from "./molecules/CommentItem";
import { DeleteCommentPopup } from "./atoms/DeleteCommentPopup";
import { CommentInput, MentionSuggestionsPopup, GroupMember } from "./molecules/CommentInput";
import { TextSticker } from "./atoms/TextSticker";
import { radii as themeRadii, spacing as themeSpacing, typography, shadows, type ThemeColors } from "../lib/theme";
import { useTheme, useThemedStyles, ForceTheme } from "../lib/theme-context";
import { Reaction } from "../lib/feed-types";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const MODAL_HEIGHT = 392;

const isEmoji = (str: string) => {
  const regexExp = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/gi;
  return regexExp.test(str);
};

interface CommentModalProps {
  visible: boolean;
  onClose: () => void;
  onSeen?: (photoId: string) => void;
  onKeyboardHeightChange?: (height: number) => void;
  photoId: string;
  photoOwnerId: string;
  reactions?: Reaction[];
  initialMode?: "comment" | "sticker";
  groupMembers?: GroupMember[];
}

export default function CommentModalAndroid(props: CommentModalProps) {
  const { visible, onClose } = props;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <CommentModalContent 
        {...props} 
        onCloseComplete={() => setMounted(false)} 
      />
    </Modal>
  );
}

function CommentModalContent({ 
  visible, 
  onClose, 
  onSeen, 
  onKeyboardHeightChange,
  photoId, 
  photoOwnerId,
  reactions = [],
  initialMode,
  onCloseComplete,
  groupMembers = [],
}: CommentModalProps & { onCloseComplete: () => void }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);

  const [mode, setMode] = useState<"comment" | "sticker">(initialMode || "comment");
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [content, setContent] = useState("");
  const [userComment, setUserComment] = useState<Comment | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const hasKeyboard = keyboardHeight > 0;
  const [fetchedGroupMembers, setFetchedGroupMembers] = useState<GroupMember[]>(groupMembers);

  // Fetch group members for mention suggestions using the photo's group
  useEffect(() => {
    if (!photoId) return;
    let active = true;
    supabase
      .from("photos")
      .select("group_id")
      .eq("id", photoId)
      .single()
      .then(({ data: photoData }) => {
        if (!active || !photoData?.group_id) return;
        supabase
          .from("group_members")
          .select("user_id, profiles:user_id(username, avatar_url)")
          .eq("group_id", photoData.group_id)
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
      });
    return () => { active = false; };
  }, [photoId]);

  // Long-press delete popup state
  // sheetTopY is measured live via measureInWindow so it adapts to any modal height
  const [deletePopup, setDeletePopup] = useState<{ commentId: string; anchorY: number; sheetTopY: number } | null>(null);
  const modalContainerRef = useRef<any>(null);

  const toggleMode = () => {
    setMode(prev => {
      if (prev === "comment") {
        const emojiRegex = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}\u{200D}\u{20E3}]/gu;
        const filtered = content.replace(emojiRegex, "").slice(0, 8).toUpperCase();
        setContent(filtered);
        return "sticker";
      } else {
        return "comment";
      }
    });
  };

  const handleContentChange = (val: string) => {
    if (mode === "sticker") {
      const emojiRegex = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}\u{200D}\u{20E3}]/gu;
      const filtered = val.replace(emojiRegex, "").slice(0, 8).toUpperCase();
      setContent(filtered);
    } else {
      setContent(val);
    }
  };
  
  const translateY = useRef(new Animated.Value(MODAL_HEIGHT)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const stickersOpacity = useRef(new Animated.Value(0)).current;
  const stickersScale = useRef(new Animated.Value(0.9)).current;
  const animGenRef = useRef(0);

  const isOwner = user?.id === photoOwnerId;

  const textReactions = useMemo(() => {
    return reactions.filter(r => !isEmoji(r.sticker_id));
  }, [reactions]);

  // SHRUNKEN POST BOUNDS (Synchronized with PhotoFeed.tsx)
  const FEED_HEIGHT = SCREEN_HEIGHT - 100;
  const currentModalHeight = MODAL_HEIGHT;
  
  const targetBottom = SCREEN_HEIGHT - currentModalHeight - 24;
  
  const targetBottomNoKeyboard = SCREEN_HEIGHT - MODAL_HEIGHT - 24;
  const OPEN_MODAL_POST_HEIGHT = Math.min(380, (targetBottomNoKeyboard - insets.top) / (1 - insets.top / FEED_HEIGHT));
  const scaleX = OPEN_MODAL_POST_HEIGHT / FEED_HEIGHT;
  
  const PREVIEW_TOP = insets.top * (scaleX);
  const POST_HEIGHT_DYNAMIC = Math.max(80, targetBottom - PREVIEW_TOP);
  const POST_WIDTH_DYNAMIC = SCREEN_WIDTH * scaleX;
  
  const postBottom = PREVIEW_TOP + POST_HEIGHT_DYNAMIC;
  const postTop = insets.top;
  const postCenterX = SCREEN_WIDTH / 2;
  const postLeft = postCenterX - (POST_WIDTH_DYNAMIC / 2);
  const postRight = postCenterX + (POST_WIDTH_DYNAMIC / 2);

  const randomFactorsRef = useRef<Record<string, { scatterY: number; rotation: number }>>({});

  const stickersData = useMemo(() => {
    return textReactions.map((reaction, index) => {
      const isLeft = index % 2 === 0;

      // Retrieve or generate stable random factors for this reaction
      if (!randomFactorsRef.current[reaction.id]) {
        randomFactorsRef.current[reaction.id] = {
          scatterY: Math.random() - 0.5,
          rotation: Math.random() - 0.5,
        };
      }
      const factors = randomFactorsRef.current[reaction.id];

      // Vertical: Distribute along the dynamic height of the post
      const centerY = postTop + (POST_HEIGHT_DYNAMIC / 2);
      const scatterY = factors.scatterY * (POST_HEIGHT_DYNAMIC * 0.7); 
      const rotation = factors.rotation * 20;

      return {
        id: reaction.id,
        reaction,
        // Anchor exactly to the post edge
        anchorX: isLeft ? postLeft : postRight,
        y: centerY + scatterY,
        rotation,
        isLeft
      };
    });
  }, [textReactions, postTop, postLeft, postRight, POST_HEIGHT_DYNAMIC]);

  const markAsSeen = useCallback(async () => {
    if (!user || !photoId) return;
    try {
      const { error } = await supabase
        .from("comment_views")
        .upsert({
          user_id: user.id,
          photo_id: photoId,
          last_viewed_at: new Date().toISOString()
        }, { onConflict: 'user_id,photo_id' });
      
      if (error) throw error;
      onSeen?.(photoId);
    } catch (e) {
      console.error("[CommentModalAndroid] Error marking as seen:", e);
    }
  }, [user?.id, photoId, onSeen]);

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
        ])
      ]).start();
    });
  }, [overlayOpacity, translateY, stickersOpacity, stickersScale]);

  const animateOut = useCallback((callback?: () => void) => {
    const isKeyboardActive = hasKeyboard;
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
        toValue: isKeyboardActive ? SCREEN_HEIGHT : MODAL_HEIGHT,
        duration: 250,
        useNativeDriver: true,
        easing: Easing.in(Easing.quad),
      }),
    ]).start(({ finished }) => {
      if (finished && animGenRef.current === myGen) {
        Keyboard.dismiss();
        setKeyboardHeight(0);
        onKeyboardHeightChange?.(0);
        onCloseComplete();
        callback?.();
      }
    });
  }, [overlayOpacity, translateY, stickersOpacity, stickersScale, onCloseComplete, hasKeyboard]);

  useEffect(() => {
    if (visible) {
      animateIn();
      fetchComments();
      markAsSeen();
    } else {
      animateOut();
    }
  }, [visible]);

  useEffect(() => {
    const showListener = Keyboard.addListener("keyboardDidShow", (e) => {
      const height = e.endCoordinates.height;
      setKeyboardHeight(height);
      onKeyboardHeightChange?.(height);
    });

    const hideListener = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
      onKeyboardHeightChange?.(0);
    });

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  const handleClose = () => {
    animateOut(onClose);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => {
        Keyboard.dismiss();
        return true;
      },
      onMoveShouldSetPanResponder: (_, { dy, dx }) => dy > 2 && Math.abs(dy) > Math.abs(dx),
      onPanResponderMove: (_, { dy }) => {
        if (dy > 0) translateY.setValue(dy);
      },
      onPanResponderRelease: (_, { dy, vy }) => {
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
      setComments(data as any || []);
      
      const existing = (data as any[] || []).find(c => c.user_id === user?.id);
      setUserComment(existing || null);
    } catch (error) {
      console.error("Error fetching comments:", error);
    } finally {
      setLoading(false);
    }
  }, [photoId, user?.id]);

  const handleSubmit = async () => {
    if (submitting || !user) return;
    const isStickerEmpty = mode === "sticker" && !content.trim();
    if (!isStickerEmpty && !content.trim()) return;

    setSubmitting(true);
    try {
      if (mode === "sticker") {
        const text = content.trim().toUpperCase();
        if (!text) {
          const { error } = await supabase
            .from("reactions")
            .delete()
            .eq("photo_id", photoId)
            .eq("user_id", user.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("reactions")
            .upsert(
              { photo_id: photoId, user_id: user.id, type: "emoji", emoji: text },
              { onConflict: "photo_id,user_id" }
            );
          if (error) throw error;
        }
        setContent("");
        setMode("comment");
        Keyboard.dismiss();
        onClose();
      } else {
        const { data, error } = await supabase
          .from("comments")
          .insert({
            photo_id: photoId,
            user_id: user.id,
            content: content.trim(),
          })
          .select(`
            id, photo_id, user_id, content, created_at,
            profiles:user_id (username, avatar_url)
          `)
          .single();

        if (error) throw error;
        setComments(prev => [...prev, data as any]);
        setUserComment(data as any);
        setContent("");
        Keyboard.dismiss();
      }
    } catch (error) {
      console.error(mode === "sticker" ? "Error posting sticker:" : "Error posting comment:", error);
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
      
      setComments(prev => prev.filter(c => c.id !== commentId));
      if (userComment?.id === commentId) {
        setUserComment(null);
      }
    } catch (error) {
      console.error("Error deleting comment:", error);
    }
  };

  const handleLongPressDelete = useCallback((commentId: string, anchorY: number) => {
    if (modalContainerRef.current) {
      modalContainerRef.current.measureInWindow((_x: number, y: number) => {
        setDeletePopup({ commentId, anchorY, sheetTopY: y });
      });
    } else {
      // Fallback: approximate from screen dimensions
      setDeletePopup({ commentId, anchorY, sheetTopY: SCREEN_HEIGHT - MODAL_HEIGHT });
    }
  }, []);

  const renderComment = ({ item }: { item: Comment }) => (
    <CommentItem
      item={item}
      isMyComment={item.user_id === user?.id}
      onLongPressDelete={handleLongPressDelete}
    />
  );

  return (
    <View style={styles.root}>
      <Animated.View 
        style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: overlayOpacity }]} 
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>


      <Animated.View 
        style={[
          styles.stickerLayer, 
          { 
            opacity: stickersOpacity,
            transform: [{ scale: stickersScale }]
          },
          hasKeyboard && { display: "none" }
        ]} 
        pointerEvents="none"
      >
        {stickersData.map((item) => {
          const stickerFontSize = 28;

          return (
            <View 
              key={item.id}
              style={[
                styles.stickerContainer,
                {
                  top: item.y,
                  // Anchor center of the sticker on the post edges
                  left: item.anchorX,
                  transform: [
                    { translateX: "-50%" },
                    { translateY: "-50%" },
                    { rotate: `${item.rotation}deg` }
                  ],
                  alignItems: "center",
                  justifyContent: "center",
                }
              ]}
            >
              <View>
                <TextSticker text={item.reaction.sticker_id} fontSize={stickerFontSize} isPostSticker={true} />
                <View style={styles.stickerAvatar}>
                  {item.reaction.avatar_url ? (
                    <Image source={{ uri: item.reaction.avatar_url }} style={StyleSheet.absoluteFill} />
                  ) : (
                    <Text style={styles.avatarFallbackText}>
                      {(item.reaction.username || "?")[0].toUpperCase()}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </Animated.View>

      <KeyboardAvoidingView
        behavior={hasKeyboard ? "padding" : undefined}
        style={styles.keyboardContainer}
      >
        <ForceTheme mode="Light">
          <Animated.View 
              ref={modalContainerRef}
              style={[
              styles.modalContainer,
              { 
                transform: [{ translateY: translateY }],
                height: mode === "sticker" ? undefined : (hasKeyboard ? undefined : MODAL_HEIGHT),
                flex: mode === "sticker" ? 0 : (hasKeyboard ? 1 : 0),
                marginTop: mode === "sticker" ? 0 : (hasKeyboard ? insets.top : 0),
              }
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
              onClose={handleClose}
              hasKeyboard={hasKeyboard}
              mode={mode}
              onStickerToggle={toggleMode}
              groupMembers={fetchedGroupMembers}
            />
          </Animated.View>
        </ForceTheme>
      </KeyboardAvoidingView>

      {/* Delete popup — rendered LAST so it paints above stickers and the comment sheet */}
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
  onClose,
  hasKeyboard,
  mode,
  onStickerToggle,
  groupMembers,
}: any) {
  const { colors } = useTheme(); 
  const styles = useThemedStyles(makeStyles);

  const paddingBottom = hasKeyboard ? 8 : Math.max(insets.bottom, 20);

  // Mention state — managed here so the popup can be rendered at this level
  const [mentionKeyword, setMentionKeyword] = useState<string | null>(null);

  const handleSuggestionSelect = useCallback((member: GroupMember) => {
    const lastAt = content.lastIndexOf("@");
    if (lastAt >= 0) {
      const before = content.slice(0, lastAt);
      setContent(`${before}@${member.username} `);
    }
    setMentionKeyword(null);
  }, [content, setContent]);

  return (
    <>
      <View style={styles.modalBackgroundFiller}>
        <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
      </View>
      
      <View style={mode === "sticker" ? { flex: 0 } : { flex: 1 }}>
        <View style={styles.header} {...panResponder.panHandlers}>
          <View style={styles.dragHandle} />

        </View>

        {mode !== "sticker" && (
          loading ? (
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
              keyboardShouldPersistTaps="handled"
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
          )
        )}
      </View>

      <View style={{ paddingBottom: paddingBottom }}>
        {mode === "sticker" && (
          <View style={styles.stickerPreviewContainer}>
            <TextSticker text={content.trim().toUpperCase() || "STICKER"} fontSize={36} />
          </View>
        )}
        {/* Mention suggestions popup — rendered here so it isn't clipped by CommentInput's layout */}
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
        />
      </View>
    </>
  );
}


const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  root: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    backgroundColor: colors.opacityLight,
  },
  modalContainer: {
    // Height & padding are static MODAL_HEIGHT
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
  header: {
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
    marginBottom: 8,
  },
  titleRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    position: "relative",
    height: 36,
  },
  headerTitle: {
    fontFamily: typography.family.bold,
    fontSize: typography.size.md,
    color: colors.text,
    textAlign: "center",
  },
  closeBtn: {
    position: "absolute",
    right: 20,
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
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
  stickerCenterContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 24,
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
    position: 'absolute',
  },
  stickerAvatar: {
    position: 'absolute',
    top: -10,
    left: -10,
    width: 24,
    height: 24,
    borderRadius: themeRadii.xs,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
    zIndex: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderNeutral,
  },
  avatarFallbackText: {
    color: colors.white,
    fontFamily: typography.family.bold,
    fontSize: 10,
  },
});
