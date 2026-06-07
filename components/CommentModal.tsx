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
  LayoutAnimation,
  UIManager,
} from "react-native";
import { Image } from "expo-image";
import BlurView from "./atoms/BlurView";
import { useSafeAreaInsets } from "react-native-safe-area-context";

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

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
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  
  const translateY = useRef(new Animated.Value(MODAL_HEIGHT)).current;
  const modalHeightAnim = useRef(new Animated.Value(MODAL_HEIGHT)).current;
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
  const hasKeyboard = keyboardHeight > 0;
  const currentModalHeight = hasKeyboard ? MODAL_HEIGHT / 2 : MODAL_HEIGHT;
  
  const targetBottom = SCREEN_HEIGHT - currentModalHeight - (hasKeyboard ? keyboardHeight + 4 : 24);
  
  const targetBottomNoKeyboard = SCREEN_HEIGHT - MODAL_HEIGHT - 24;
  const OPEN_MODAL_POST_HEIGHT = Math.min(380, (targetBottomNoKeyboard - insets.top) / (1 - insets.top / FEED_HEIGHT));
  const scaleX = OPEN_MODAL_POST_HEIGHT / FEED_HEIGHT;
  
  const PREVIEW_TOP = insets.top * (1 - scaleX);
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
    if (Platform.OS === "android") {
      Animated.timing(modalHeightAnim, {
        toValue: hasKeyboard ? MODAL_HEIGHT / 2 : MODAL_HEIGHT,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
  }, [hasKeyboard]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showListener = Keyboard.addListener(showEvent, (e) => {
      if (Platform.OS === "ios") {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      setKeyboardHeight(e.endCoordinates.height);
    });

    const hideListener = Keyboard.addListener(hideEvent, (e) => {
      if (Platform.OS === "ios") {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      setKeyboardHeight(0);
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
    if (!content.trim() || submitting || !user) return;
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

  const animatedModalHeight = Platform.OS === "ios" ? currentModalHeight : modalHeightAnim;

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

      <KeyboardAvoidingView
        behavior={hasKeyboard ? "padding" : undefined}
        style={styles.modalOverlay}
      >
        <ForceTheme mode="Light">
          <Animated.View 
            style={{ 
              transform: [{ translateY: translateY }],
              width: "100%"
            }}
          >
            <Animated.View 
              style={[
                styles.modalContainer, 
                { 
                  height: animatedModalHeight,
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
              setContent={setContent}
              handleSubmit={handleSubmit}
              submitting={submitting}
              hasKeyboard={hasKeyboard}
            />
            </Animated.View>
          </Animated.View>
        </ForceTheme>
      </KeyboardAvoidingView>
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
  hasKeyboard,
}: any) {
  const { colors } = useTheme(); 
  const styles = useThemedStyles(makeStyles);

  const paddingBottom = hasKeyboard ? 8 : Math.max(insets.bottom, 20);

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

      <View style={{ paddingBottom: paddingBottom }}>
        <CommentInput 
          content={content} 
          setContent={setContent} 
          onSubmit={handleSubmit} 
          submitting={submitting} 
        />
      </View>
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
    // Height is driven dynamically by modalHeightAnim in the component
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
