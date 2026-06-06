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
  TouchableOpacity,
  Animated,
  PanResponder,
  Easing,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { Image } from "expo-image";
import BlurView from "./atoms/BlurView";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";

// Atomic Design Imports
import { CloseIcon } from "./atoms/CloseIcon";
import { CommentItem, Comment } from "./molecules/CommentItem";
import { CommentInput } from "./molecules/CommentInput";
import { TextSticker } from "./atoms/TextSticker";
import { radii as themeRadii, spacing as themeSpacing, typography, type ThemeColors, shadows } from "../lib/theme";
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
  photoId: string;
  photoOwnerId: string;
  reactions?: Reaction[];
}

export default function CommentModal(props: CommentModalProps) {
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
  photoId, 
  photoOwnerId, 
  reactions = [],
  onCloseComplete
}: CommentModalProps & { onCloseComplete: () => void }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { colors, mode } = useTheme(); 
  const styles = useThemedStyles(makeStyles);

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [content, setContent] = useState("");
  const [userComment, setUserComment] = useState<Comment | null>(null);
  
  const translateY = useRef(new Animated.Value(MODAL_HEIGHT)).current;
  const keyboardTranslateY = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const stickersOpacity = useRef(new Animated.Value(0)).current;
  const stickersScale = useRef(new Animated.Value(0.9)).current;
  const animGenRef = useRef(0);

  const isOwner = user?.id === photoOwnerId;

  const textReactions = useMemo(() => {
    return reactions.filter(r => !isEmoji(r.sticker_id));
  }, [reactions]);

  // SHRUNKEN POST BOUNDS (Synchronized with PhotoFeed.tsx)
  const POST_HEIGHT = 380;
  const POST_WIDTH = SCREEN_WIDTH * (POST_HEIGHT / SCREEN_HEIGHT);
  const POST_BOTTOM_GAP = 40;

  const postBottom = SCREEN_HEIGHT - MODAL_HEIGHT - POST_BOTTOM_GAP;
  const postTop = postBottom - POST_HEIGHT;
  const postCenterX = SCREEN_WIDTH / 2;
  const postLeft = postCenterX - (POST_WIDTH / 2);
  const postRight = postCenterX + (POST_WIDTH / 2);

  const stickersData = useMemo(() => {
    return textReactions.map((reaction, index) => {
      const isLeft = index % 2 === 0;

      // Vertical: Distribute along the 380px height of the post
      const centerY = postTop + (POST_HEIGHT / 2);
      const scatterY = (Math.random() - 0.5) * (POST_HEIGHT * 0.7); 
      const rotation = (Math.random() - 0.5) * 20;

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
  }, [textReactions, postTop, postLeft, postRight]);


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
      console.error("[CommentModal] Error marking as seen:", e);
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
    Keyboard.dismiss();
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
        toValue: MODAL_HEIGHT,
        duration: 250,
        useNativeDriver: true,
        easing: Easing.in(Easing.quad),
      }),
    ]).start(({ finished }) => {
      if (finished && animGenRef.current === myGen) {
        onCloseComplete();
        callback?.();
      }
    });
  }, [overlayOpacity, translateY, stickersOpacity, stickersScale, onCloseComplete]);

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
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showListener = Keyboard.addListener(showEvent, (e) => {
      Animated.timing(keyboardTranslateY, {
        toValue: -e.endCoordinates.height,
        duration: e.duration || 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });

    const hideListener = Keyboard.addListener(hideEvent, (e) => {
      Animated.timing(keyboardTranslateY, {
        toValue: 0,
        duration: e.duration || 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, [keyboardTranslateY]);

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
    if (!content.trim() || submitting || !user || isOwner) return;
    setSubmitting(true);
    try {
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
    } catch (error) {
      console.error("Error posting comment:", error);
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

  const renderComment = ({ item }: { item: Comment }) => (
    <CommentItem 
      item={item} 
      isMyComment={item.user_id === user?.id} 
      onDelete={handleDeleteComment} 
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
          }
        ]} 
        pointerEvents="none"
      >
        {stickersData.map((item) => {
          const displayValue = (item.reaction.sticker_id || "—").toUpperCase();
          const stickerFontSize = 28;
          const stickerHeight = stickerFontSize * 1.05;
          const rawStickerWidth = (displayValue.length * stickerFontSize * 0.6) + 8;
          const stickerWidth = Math.max(rawStickerWidth, stickerFontSize * 2.2);

          return (
            <View 
              key={item.id}
              style={[
                styles.stickerContainer,
                {
                  top: item.y,
                  // Anchor center of the sticker on the post edges
                  left: item.anchorX,
                  width: stickerWidth,
                  height: stickerHeight,
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
              <View style={{ width: stickerWidth, height: stickerHeight }}>
                <TextSticker text={item.reaction.sticker_id} fontSize={stickerFontSize} />
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

      <View style={styles.modalOverlay}>
        <ForceTheme mode="Light">
          <Animated.View 
            style={[
              styles.modalContainer, 
              { 
                transform: [
                  { translateY: Animated.add(translateY, keyboardTranslateY) }
                ],
              }
            ]}
          >
            <CommentModalBody 
              loading={loading}
              comments={comments}
              renderComment={renderComment}
              isOwner={isOwner}
              userComment={userComment}
              content={content}
              setContent={setContent}
              handleSubmit={handleSubmit}
              submitting={submitting}
              insets={insets}
              panResponder={panResponder}
            />
          </Animated.View>
        </ForceTheme>
      </View>
    </View>
  );
}

function CommentModalBody({
  loading,
  comments,
  renderComment,
  isOwner,
  userComment,
  content,
  setContent,
  handleSubmit,
  submitting,
  insets,
  panResponder
}: any) {
  const { colors } = useTheme(); 
  const styles = useThemedStyles(makeStyles);

  return (
    <>
      <View style={styles.modalBackgroundFiller}>
        <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
      </View>
      
      <View style={{ flex: 1 }}>
        <View style={styles.dragArea} {...panResponder.panHandlers}>
          <View style={styles.dragHandle} />
        </View>

        {loading ? (
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
        )}
      </View>

      {!isOwner && (
        <View style={{ paddingBottom: Math.max(insets.bottom, 20) }}>
          {userComment ? (
            <View style={styles.inputArea}>
              <View style={styles.alreadySharedContainer}>
                <Text style={styles.alreadySharedText}>Vous avez déjà partagé votre avis</Text>
              </View>
            </View>
          ) : (
            <CommentInput 
              content={content} 
              setContent={setContent} 
              onSubmit={handleSubmit} 
              submitting={submitting} 
            />
          )}
        </View>
      )}
    </>
  );
}


const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  root: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    zIndex: 10,
  },
  backdrop: {
    backgroundColor: colors.opacityLight,
  },
  modalContainer: {
    height: MODAL_HEIGHT,
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
  emptyContainer: {
    alignItems: "center",
    marginTop: themeSpacing.xl4,
  },
  emptyText: {
    fontFamily: typography.family.medium,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
  inputArea: {
    padding: themeSpacing.xl,
    paddingTop: themeSpacing.md,
  },
  alreadySharedContainer: {
    alignItems: "center",
    paddingVertical: 14,
    backgroundColor: colors.accentMuted,
    borderRadius: themeRadii.lg,
  },
  alreadySharedText: {
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
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
  },
  avatarFallbackText: {
    color: colors.white,
    fontFamily: typography.family.bold,
    fontSize: 10,
  },
});
