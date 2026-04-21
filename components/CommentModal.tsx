import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
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
} from "react-native";
import { Image } from "expo-image";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";
import { BlurView } from "expo-blur";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const MODAL_HEIGHT = SCREEN_HEIGHT * 0.75;

interface Comment {
  id: string;
  photo_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: {
    username: string;
    avatar_url: string | null;
  };
}

interface CommentModalProps {
  visible: boolean;
  onClose: () => void;
  onSeen?: (photoId: string) => void;
  photoId: string;
  photoOwnerId: string;
}

const CloseIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);

const SendIcon = ({ disabled }: { disabled: boolean }) => (
  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={disabled ? "rgba(255,255,255,0.3)" : "#000"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </Svg>
);

const TrashIcon = () => (
  <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF3B30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
  </Svg>
);

export default function CommentModal({ visible, onClose, onSeen, photoId, photoOwnerId }: CommentModalProps) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  
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
    console.log(`[CommentModal] Attempting to mark photo ${photoId} as seen for user ${user.id}`);
    try {
      const { error } = await supabase
        .from("comment_views")
        .upsert({
          user_id: user.id,
          photo_id: photoId,
          last_viewed_at: new Date().toISOString()
        }, { onConflict: 'user_id,photo_id' });
      
      if (error) throw error;
      console.log(`[CommentModal] Successfully updated comment_views for photo ${photoId}, calling onSeen`);
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
    // We only want to trigger these actions when the 'visible' prop changes.
    // Including fetchComments or markAsSeen here causes an infinite loop 
    // because they are re-created when the parent state updates.
  }, [visible]);

  const handleClose = () => {
    animateOut(onClose);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
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

  const renderComment = ({ item }: { item: Comment }) => {
    const isMyComment = item.user_id === user?.id;
    
    return (
      <View style={styles.commentRow}>
        <View style={styles.avatarContainer}>
          {item.profiles.avatar_url ? (
            <Image source={{ uri: item.profiles.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>{item.profiles.username[0]?.toUpperCase()}</Text>
            </View>
          )}
        </View>
        <View style={styles.commentContent}>
          <View style={{ flex: 1 }}>
            <Text style={styles.username}>{item.profiles.username}</Text>
            <Text style={styles.content}>{item.content}</Text>
          </View>
          {isMyComment && (
            <TouchableOpacity 
              onPress={() => handleDeleteComment(item.id)}
              style={styles.deleteBtn}
            >
              <TrashIcon />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <View style={styles.root}>
        {/* Backdrop stays outside KeyboardAvoidingView to remain full-screen and static */}
        <Animated.View 
          style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: overlayOpacity }]} 
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>

        <View style={styles.modalOverlay}>
          <Animated.View 
            style={[
              styles.modalContainer, 
              { 
                transform: [{ translateY }],
              }
            ]}
          >
            {/* Background filler that extends downwards to stay behind the keyboard */}
            <View style={styles.modalBackgroundFiller}>
              <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
            </View>
            
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={{ flex: 1 }}
              keyboardVerticalOffset={Platform.select({ ios: 160, android: 160 })}
            >
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={{ flex: 1 }}>
                  {/* Draggable Header Area (Top Half behavior) */}
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
                      <ActivityIndicator size="large" color="#FFF" />
                    </View>
                  ) : (
                    <FlatList
                      data={comments}
                      keyExtractor={(item) => item.id}
                      renderItem={renderComment}
                      contentContainerStyle={styles.listContent}
                      showsVerticalScrollIndicator={false}
                      ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                          <Text style={styles.emptyText}>Aucun commentaire pour le moment.</Text>
                        </View>
                      }
                    />
                  )}
                </View>
              </TouchableWithoutFeedback>

              {!isOwner && (
                <View style={[styles.inputArea, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                  {userComment ? (
                    <View style={styles.alreadySharedContainer}>
                      <Text style={styles.alreadySharedText}>Vous avez déjà partagé votre avis</Text>
                    </View>
                  ) : (
                    <View style={styles.inputContainer}>
                      <TextInput
                        style={styles.input}
                        placeholder="Ajouter un commentaire..."
                        placeholderTextColor="rgba(255,255,255,0.4)"
                        value={content}
                        onChangeText={setContent}
                        multiline
                        maxLength={200}
                      />
                      <TouchableOpacity
                        onPress={handleSubmit}
                        disabled={!content.trim() || submitting}
                        style={[styles.sendBtn, !content.trim() && styles.sendBtnDisabled]}
                      >
                        {submitting ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <SendIcon disabled={!content.trim()} />
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </KeyboardAvoidingView>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.75)",
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
    backgroundColor: "rgba(25,25,25,0.75)",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
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
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 2,
    marginBottom: 8,
  },
  header: {
    width: "100%",
    paddingVertical: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#FFF",
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
  commentRow: {
    flexDirection: "row",
    marginBottom: 22,
    gap: 12,
  },
  avatarContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  avatarPlaceholder: {
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    color: "#FFF",
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  commentContent: {
    flex: 1,
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: 12,
    borderRadius: 16,
    borderTopLeftRadius: 2,
    flexDirection: "row",
    alignItems: "center",
  },
  username: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
  },
  usernameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  deleteBtn: {
    padding: 4,
  },
  content: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#FFF",
    lineHeight: 20,
  },
  emptyContainer: {
    alignItems: "center",
    marginTop: 60,
  },
  emptyText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: "rgba(255,255,255,0.3)",
  },
  inputArea: {
    padding: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 26,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  input: {
    flex: 1,
    color: "#FFF",
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    maxHeight: 100,
    paddingVertical: 8,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  sendBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  alreadySharedContainer: {
    alignItems: "center",
    paddingVertical: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
  },
  alreadySharedText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "rgba(255,255,255,0.4)",
  },
});



