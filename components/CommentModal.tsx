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
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";

// Atomic Design Imports
import { CloseIcon } from "./atoms/CloseIcon";
import { CommentItem, Comment } from "./molecules/CommentItem";
import { CommentInput } from "./molecules/CommentInput";
import { radii, typography, type ThemeColors } from "../lib/theme";
import { useTheme, useThemedStyles } from "../lib/theme-context";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const MODAL_HEIGHT = SCREEN_HEIGHT * 0.75;

interface CommentModalProps {
  visible: boolean;
  onClose: () => void;
  onSeen?: (photoId: string) => void;
  photoId: string;
  photoOwnerId: string;
}

export default function CommentModal({ visible, onClose, onSeen, photoId, photoOwnerId }: CommentModalProps) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { colors, mode } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [content, setContent] = useState("");
  const [userComment, setUserComment] = useState<Comment | null>(null);
  
  const [mounted, setMounted] = useState(visible);
  const translateY = useRef(new Animated.Value(MODAL_HEIGHT)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const animGenRef = useRef(0);

  const isOwner = user?.id === photoOwnerId;

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
    setMounted(true);
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
    });
  }, [overlayOpacity, translateY]);

  const animateOut = useCallback((callback?: () => void) => {
    Keyboard.dismiss();
    const myGen = ++animGenRef.current;
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
        setMounted(false);
        callback?.();
      }
    });
  }, [overlayOpacity, translateY]);

  useEffect(() => {
    if (visible) {
      animateIn();
      fetchComments();
      markAsSeen();
    } else if (mounted) {
      animateOut();
    }
  }, [visible]);

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

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <View style={styles.root}>
        <Animated.View 
          style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: overlayOpacity }]} 
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>

        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "padding"}
            style={{ width: "100%" }} 
          >
            <Animated.View 
              style={[
                styles.modalContainer, 
                { 
                  transform: [{ translateY }],
                }
              ]}
            >
              <View style={styles.modalBackgroundFiller}>
                <BlurView intensity={80} tint={mode === "Dark" ? "dark" : "light"} style={StyleSheet.absoluteFill} />
              </View>
              
              <View style={{ flex: 1 }}>
                <View style={styles.dragArea} {...panResponder.panHandlers}>
                  <View style={styles.dragHandle} />
                  <View style={styles.header}>
                    <Text style={styles.headerTitle}>Commentaires</Text>
                    <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                      <CloseIcon />
                    </TouchableOpacity>
                  </View>
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
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  root: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
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
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    overflow: "hidden",
  },
  dragArea: {
    width: "100%",
    alignItems: "center",
    paddingTop: 12,
    zIndex: 10,
  },
  dragHandle: {
    width: 38,
    height: 4,
    backgroundColor: colors.borderSecondary,
    borderRadius: radii.xs,
    marginBottom: 8,
  },
  header: {
    width: "100%",
    paddingVertical: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  headerTitle: {
    fontFamily: typography.family.bold,
    fontSize: typography.size.md,
    color: colors.text,
    letterSpacing: 0.5,
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
    padding: 20,
    paddingBottom: 40,
  },
  emptyContainer: {
    alignItems: "center",
    marginTop: 60,
  },
  emptyText: {
    fontFamily: typography.family.medium,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
  inputArea: {
    padding: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  alreadySharedContainer: {
    alignItems: "center",
    paddingVertical: 14,
    backgroundColor: colors.accentMuted,
    borderRadius: radii.lg,
  },
  alreadySharedText: {
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
});
