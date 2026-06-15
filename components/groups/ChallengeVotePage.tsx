import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, Dimensions, Platform, TouchableOpacity, ScrollView, Animated, Share, KeyboardAvoidingView, LayoutAnimation } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { getChallengePrompt, type ChallengeWithData, type ChallengeResponse } from "../../lib/challenges";
import Svg, { Path } from "react-native-svg";
import { r2Storage } from "../../lib/r2";
import ChallengeAudioPlayer from "./ChallengeAudioPlayer";
import { radii, typography, shadows, spacing, textStyles, stroke, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { supabase } from "../../lib/supabase";
import CommentModal from "../CommentModal";
import { RightSlideModal } from "../atoms/RightSlideModal";
import { type Reaction } from "../../lib/feed-types";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const IS_IOS = Platform.OS === "ios";
const CAROUSEL_HEIGHT = 500;

// Géométrie du carousel — peek des cartes voisines (repris du ChallengesSlider de disclose)
const CARD_GAP = spacing.xl;
const CARD_WIDTH = (SCREEN_WIDTH - 2 * CARD_GAP) / 1.2;
const SIDE_MARGIN = (SCREEN_WIDTH - CARD_WIDTH) / 2;
const SNAP_INTERVAL = CARD_WIDTH + CARD_GAP;

function getSecondUrl(r: ChallengeResponse): string | null {
  if (!r.second_image_path || r.second_image_path === "text_mode") return null;
  return r2Storage.getPublicUrl(r.second_image_path);
}

function mediaType(path: string | null): "text" | "audio" | "drawing" | "photo" {
  if (!path || path === "text_mode") return "text";
  if (path.endsWith(".m4a")) return "audio";
  if (path.includes("_draw")) return "drawing";
  return "photo";
}

// Modal media renderer — respects exact same ratios as PhotoFeed.
// L'arrondi est porté directement par le média (expo-image clippe nativement, y compris
// sur Android pour les cartes voisines partiellement hors-cadre) plutôt que de dépendre
// de l'`overflow: hidden` du parent (qui laisse des coins noirs sur Android).
// La carte n'a plus de bordure qui rogne le contenu → le média remplit tout le conteneur
// et adopte donc le rayon plein de la carte.
const MEDIA_RADIUS = radii.xl;

function ModalMedia({ imagePath, url, note }: { imagePath: string | null; url: string | null; note: string | null }) {
  const { colors } = useTheme();
  const type = mediaType(imagePath);
  if (type === "text") {
    return (
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", padding: 28, borderRadius: MEDIA_RADIUS }]}>
        <Text style={{ color: colors.text, fontFamily: typography.family.semibold, fontSize: typography.size.xl, textAlign: "center", lineHeight: 28 }}>
          {note ?? ""}
        </Text>
      </View>
    );
  }
  if (type === "audio") {
    if (!url) return null;
    return <ChallengeAudioPlayer key={url} url={url} waveform={undefined} />;
  }
  if (type === "drawing") {
    return (
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", borderRadius: MEDIA_RADIUS }]}>
        <Image
          source={{ uri: url ?? "" }}
          style={{ width: "100%", aspectRatio: 3 / 4 }}
          contentFit="fill"
        />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: url ?? "" }}
      style={[StyleSheet.absoluteFillObject, { borderRadius: MEDIA_RADIUS }]}
      contentFit="cover"
      contentPosition={{ top: 0, left: "50%" }}
    />
  );
}

function StepperDot({ isActive, activeColor, inactiveColor, style }: { isActive: boolean, activeColor: string, inactiveColor: string, style: any }) {
  const animValue = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: isActive ? 1 : 0,
      duration: 100,
      useNativeDriver: false,
    }).start();
  }, [isActive]);

  const backgroundColor = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [inactiveColor, activeColor],
  });

  return <Animated.View style={[style, { backgroundColor }]} />;
}

// Carte de réponse mémoïsée. Module-level + React.memo → seules les cartes dont une prop
// change réellement se re-rendent : un changement d'index actif ne touche que 2 cartes.
// `swapped` est volontairement passé à false pour les cartes inactives : basculer la 2ème
// capture ne re-rend ainsi que la carte active.
const ResponseCard = React.memo(function ResponseCard({
  item,
  isActive,
  swapped,
  width,
  height,
  marginRight,
  showDetails,
  styles,
  opacity = 1,
}: {
  item: ChallengeResponse;
  isActive: boolean;
  swapped: boolean;
  width: number;
  height: number;
  marginRight: number;
  showDetails: boolean;
  styles: any;
  opacity?: number;
}) {
  const slideImagePath = swapped ? (item.second_image_path ?? item.image_path) : item.image_path;
  const slideUrl = swapped ? (getSecondUrl(item) ?? item.url) : item.url;
  const slideNote = swapped ? (item.second_note ?? null) : item.note;
  const isTextOnly = mediaType(slideImagePath) === "text";
  const isDrawing = mediaType(slideImagePath) === "drawing";
  return (
    <View 
      style={{ 
        width: CARD_WIDTH, 
        height: CAROUSEL_HEIGHT, 
        marginRight,
        opacity,
        justifyContent: "center",
        alignItems: "center",
      }}
      pointerEvents={opacity === 0 ? "none" : "auto"}
    >
      <View 
        style={[
          styles.slideCard, 
          { 
            width, 
            height,
          }
        ]}
      >
        <View style={styles.slideMediaWrapper}>
          <ModalMedia imagePath={slideImagePath} url={slideUrl} note={slideNote} />
        </View>

        <View 
          style={[
            StyleSheet.absoluteFillObject, 
            { opacity: showDetails && !isTextOnly && !isDrawing ? 1 : 0 }
          ]} 
          pointerEvents="none"
        >
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.85)"]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </View>

        <View 
          style={[
            styles.cardDetailsContainer, 
            { opacity: showDetails ? 1 : 0 }
          ]} 
          pointerEvents={showDetails ? "box-none" : "none"}
        >
          <View style={styles.authorInfoRow} pointerEvents="box-none">
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.authorAvatar} contentFit="cover" />
            ) : (
              <View style={[styles.authorAvatar, styles.authorAvatarFallback]}>
                <Text style={styles.authorAvatarLetter}>{(item.username || "?")[0].toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.authorTextSection} pointerEvents="none">
              <Text style={[styles.authorName, !isDrawing && { color: "#FFFFFF" }]}>{item.username}</Text>
              {!isTextOnly && (
                <Text style={[styles.authorNote, !isDrawing && { color: "rgba(255, 255, 255, 0.7)" }]} numberOfLines={2}>
                  {slideNote || "Sans description"}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Bordure active EN DERNIER → au-dessus du média, du gradient et des détails,
            pour qu'aucun calque (notamment le gradient) ne l'assombrisse. Overlay absolu :
            ne décale pas le contenu (pas de cadre noir, pas de clignotement au swipe). */}
        <View 
          pointerEvents="none" 
          style={[
            StyleSheet.absoluteFillObject, 
            styles.cardActiveBorder, 
            { opacity: isActive && showDetails ? 1 : 0 }
          ]} 
        />
      </View>
    </View>
  );
});

export default function ChallengeVotePage({
  challenge,
  period,
  currentUserId,
  onVote,
  members = [],
  showResponsesModal = false,
  onCloseResponsesModal,
  onCommentModalChange,
}: {
  challenge: ChallengeWithData;
  period: 1 | 2;
  currentUserId?: string;
  onVote: (challengeId: string, responseId: string) => void;
  members?: any[];
  showResponsesModal?: boolean;
  onCloseResponsesModal?: () => void;
  onCommentModalChange?: (visible: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const cvStyles = useThemedStyles(makeStyles);
  
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const [swapped, setSwapped] = useState(false);
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [commentModalMode, setCommentModalMode] = useState<"comment" | "sticker">("comment");
  const [commentActiveResponse, setCommentActiveResponse] = useState<ChallengeResponse | null>(null);
  const [reactionsMap, setReactionsMap] = useState<Record<string, Reaction[]>>({});

  useEffect(() => {
    onCommentModalChange?.(commentModalVisible);
  }, [commentModalVisible, onCommentModalChange]);

  const responsesCount = challenge.responses.length;
  const count = responsesCount;
  const isTarget = challenge.target_user_id === currentUserId;
  const myVote = challenge.votes.find((v) => v.voter_id === currentUserId);
  const canVote = !isTarget;
  const prompt = isTarget
    ? "Tu étais la cible !"
    : getChallengePrompt(challenge.target_username, challenge.theme.label);

  const fetchReactions = async () => {
    if (challenge.responses.length === 0) return;
    const responseIds = challenge.responses.map(r => r.id);
    try {
      const { data } = await supabase
        .from("reactions")
        .select("id, photo_id, user_id, emoji, created_at")
        .in("photo_id", responseIds);

      if (data) {
        const map: Record<string, Reaction[]> = {};
        data.forEach((r: any) => {
          if (!map[r.photo_id]) map[r.photo_id] = [];
          const member = members.find(m => m.user_id === r.user_id);
          map[r.photo_id].push({
            id: r.id,
            user_id: r.user_id,
            username: member?.username ?? "Anonyme",
            avatar_url: member?.avatar_url ?? null,
            sticker_id: r.emoji,
            created_at: r.created_at
          } as any);
        });
        setReactionsMap(map);
      }
    } catch (err) {
      console.error("Error fetching challenge reactions:", err);
    }
  };

  // Fetch reactions and subscribe to changes in real-time
  useEffect(() => {
    fetchReactions();

    const channel = supabase
      .channel(`challenge-reactions-${challenge.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, () => {
        fetchReactions();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [challenge.responses, members]);

  // Reset des indices + retour au début à l'ouverture du modal
  useEffect(() => {
    if (!showResponsesModal) return;
    setActiveIndex(0);
    setSwapped(false);
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: 0, animated: false });
    }, 30);
    return () => clearTimeout(t);
  }, [showResponsesModal]);

  const updateActiveFromOffset = (x: number) => {
    if (commentModalVisible) return;
    if (count === 0 || SNAP_INTERVAL === 0) return;
    const idx = Math.max(0, Math.min(count - 1, Math.round(x / SNAP_INTERVAL)));
    if (idx !== activeIndex) {
      setActiveIndex(idx);
      setSwapped(false); // Reset swap state for new slide
    }
  };
  const handleScroll = (event: any) => updateActiveFromOffset(event.nativeEvent.contentOffset.x);
  const handleMomentumScrollEnd = (event: any) => updateActiveFromOffset(event.nativeEvent.contentOffset.x);

  const activeResponse = challenge.responses[activeIndex];
  const hasSecond = activeResponse ? !!(activeResponse.second_image_path) : false;

  const [carouselLayoutHeight, setCarouselLayoutHeight] = useState(CAROUSEL_HEIGHT);
  const handleCarouselLayout = (e: any) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) {
      setCarouselLayoutHeight(h);
    }
  };

  const shrunkenHeight = Math.min(250, SCREEN_HEIGHT * 0.3);
  const cardHeight = commentModalVisible 
    ? shrunkenHeight 
    : Math.min(CAROUSEL_HEIGHT, carouselLayoutHeight - 40);
  const cardWidth = cardHeight * (CARD_WIDTH / CAROUSEL_HEIGHT);



  return (
    <View style={cvStyles.container}>
      {/* ── PART 1: Main Challenge Intro Screen ── */}
      <View style={cvStyles.titleRow}>
        <Text style={cvStyles.titleText}>Défi</Text>
        <Svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <Path d="M32 13.8502C32 9.7264 28.7574 6.33436 24.746 5.89225C24.2131 5.83127 23.7564 5.48063 23.5509 4.98516C22.3406 2.0581 19.3492 0 16 0C12.6508 0 9.65937 2.0581 8.4491 4.98516C8.24358 5.48063 7.79448 5.83889 7.25404 5.89225C3.24263 6.34198 0 9.7264 0 13.8502C0 16.0303 0.875357 18.0045 2.28354 19.4528C2.7098 19.8873 2.83159 20.5123 2.61085 21.0764C2.24548 22.014 2.04757 23.0278 2.0628 24.095C2.12369 28.4474 5.8078 32.0453 10.1541 31.9996C12.0266 31.9767 13.7393 31.3135 15.0866 30.2159C15.6118 29.789 16.373 29.789 16.8906 30.2159C18.2379 31.3135 19.9505 31.9843 21.823 31.9996C26.1694 32.0453 29.8535 28.4474 29.9144 24.095C29.9296 23.0278 29.7317 22.0064 29.3663 21.0764C29.1456 20.5123 29.275 19.8797 29.6936 19.4528C31.1094 18.0121 31.9772 16.0379 31.9772 13.8502H32Z" fill={colors.icon} />
          <Path d="M23.8554 5.84651C23.8782 5.84651 23.9087 5.84651 23.8554 5.84651V5.84651Z" fill={colors.icon} />
        </Svg>
      </View>

      <View style={cvStyles.spacer300} />

      <Text style={cvStyles.promptText}>{prompt}</Text>

      <View style={cvStyles.spacer1200} />

      {challenge.target_avatar_url ? (
        <Image source={{ uri: challenge.target_avatar_url }} style={cvStyles.targetAvatarLarge} contentFit="cover" />
      ) : (
        <View style={[cvStyles.targetAvatarLarge, cvStyles.avatarLargeFallback]}>
          <Text style={cvStyles.avatarLargeLetter}>{(challenge.target_username || "?")[0]?.toUpperCase()}</Text>
        </View>
      )}

      <View style={cvStyles.spacer400} />

      <View style={cvStyles.repliesBadge}>
        <Text style={cvStyles.repliesBadgeText}>
          {responsesCount} {responsesCount > 1 ? "réponses" : "réponse"}
        </Text>
      </View>
      
      {/* ── PART 2: Horizontally Scrollable Full-Screen Responses Modal ── */}
      <RightSlideModal
        visible={showResponsesModal}
        transparent
        onRequestClose={() => {
          if (commentModalVisible) setCommentModalVisible(false);
          else onCloseResponsesModal?.();
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={cvStyles.modalOverlay}
        >
          <View style={cvStyles.modalHeaderContainer}>
            <View style={[cvStyles.modalHeader, { paddingTop: Math.max(insets.top, 16) }]}>
              <View style={cvStyles.headerLeft}>
                <TouchableOpacity onPress={onCloseResponsesModal} activeOpacity={0.7} style={cvStyles.backBtn}>
                  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M15 19l-7-7 7-7" />
                  </Svg>
                </TouchableOpacity>
                <Text style={cvStyles.headerTitle}>Défi</Text>
              </View>
              {hasSecond && (
                <TouchableOpacity style={cvStyles.swapBtn} onPress={() => setSwapped(v => !v)} activeOpacity={0.7}>
                  <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M7 16V4m0 0L3 8m4-4l4 4" /><Path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
                  </Svg>
                  <Text style={cvStyles.swapBtnText}>{swapped ? "1ère cap." : "2ème cap."}</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={cvStyles.modalQuestionText}>
              Si{" "}
              <Text style={cvStyles.orangeText}>{challenge.target_username}</Text>
              {" était un"}{"aeiouyAEIOUY".includes(challenge.theme.label?.[0] ?? "") ? "" : "·e"}{" "}
              <Text style={cvStyles.orangeText}>{challenge.theme.label}</Text>
              {", ça serait..."}
            </Text>
          </View>

          {responsesCount > 0 ? (
            <View 
              style={cvStyles.carouselFlexContainer}
              onLayout={handleCarouselLayout}
            >
              <ScrollView
                ref={scrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={SNAP_INTERVAL}
                decelerationRate="fast"
                contentContainerStyle={{ 
                  paddingHorizontal: SIDE_MARGIN, 
                  alignItems: "center" 
                }}
                onScroll={handleScroll}
                onMomentumScrollEnd={handleMomentumScrollEnd}
                scrollEventThrottle={16}
                bounces={false}
                overScrollMode="never"
                removeClippedSubviews={false}
                keyboardShouldPersistTaps="always"
                style={{ width: SCREEN_WIDTH }}
                scrollEnabled={!commentModalVisible}
              >
                {challenge.responses.map((r, idx) => {
                  const isActive = idx === activeIndex;
                  return (
                    <ResponseCard
                      key={r.id}
                      item={r}
                      isActive={isActive}
                      swapped={isActive ? swapped : false}
                      width={commentModalVisible ? (isActive ? cardWidth : CARD_WIDTH) : CARD_WIDTH}
                      height={commentModalVisible ? (isActive ? cardHeight : CAROUSEL_HEIGHT) : CAROUSEL_HEIGHT}
                      marginRight={CARD_GAP}
                      showDetails={!commentModalVisible}
                      styles={cvStyles}
                      opacity={commentModalVisible ? (isActive ? 1 : 0) : 1}
                    />
                  );
                })}
              </ScrollView>

              <View 
                style={[
                  cvStyles.stepperContainer, 
                  { 
                    opacity: commentModalVisible ? 0 : 1,
                    height: commentModalVisible ? 0 : "auto",
                    marginTop: commentModalVisible ? 0 : 24,
                    paddingVertical: commentModalVisible ? 0 : spacing.sm,
                  }
                ]}
                pointerEvents={commentModalVisible ? "none" : "auto"}
              >
                {responsesCount > 1 && challenge.responses.map((_, index) => (
                  <StepperDot
                    key={index}
                    isActive={activeIndex === index}
                    inactiveColor={colors.iconTertiary}
                    activeColor={colors.icon}
                    style={cvStyles.stepperDot}
                  />
                ))}
              </View>
            </View>
          ) : (
            <View style={cvStyles.emptyContainer}>
              <Text style={cvStyles.emptyText}>Aucune réponse à afficher.</Text>
            </View>
          )}

          {commentActiveResponse && commentModalVisible && (
            <CommentModal
              inline
              visible={commentModalVisible}
              onClose={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setCommentModalVisible(false);
              }}
              photoId={commentActiveResponse.id}
              photoOwnerId={commentActiveResponse.user_id}
              groupId={challenge.group_id}
              reactions={reactionsMap[commentActiveResponse.id] || []}
              initialMode={commentModalMode}
              style={cvStyles.commentsFlexContainer}
            />
          )}

          {activeResponse && !commentModalVisible && (
            <View style={cvStyles.modalFooter}>
              <TouchableOpacity 
                style={cvStyles.modalReactionsBtn} 
                onPress={() => {
                  setCommentActiveResponse(activeResponse);
                  setCommentModalMode("comment");
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setCommentModalVisible(true);
                }}
                activeOpacity={0.85}
              >
                <Text style={cvStyles.modalReactionsBtnText}>Réactions</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={cvStyles.placeholderBtn} 
                activeOpacity={0.7}
                onPress={async () => {
                  const url = swapped ? (getSecondUrl(activeResponse) ?? activeResponse.url) : activeResponse.url;
                  if (!url) return;
                  try {
                    const isAvailable = await Sharing.isAvailableAsync();
                    if (!isAvailable) {
                      Share.share({ url, message: url });
                      return;
                    }
                    const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
                    const safeExt = ext && ext.length <= 5 ? ext : 'jpg';
                    const filename = `Disclose - You've never been this close!.${safeExt}`;
                    const localUri = FileSystem.cacheDirectory + filename;
                    const { uri } = await FileSystem.downloadAsync(url, localUri);
                    await Sharing.shareAsync(uri);
                  } catch (e) {
                    console.error("Share error:", e);
                    Share.share({ url, message: url });
                  }
                }}
              >
                <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <Path d="M2.75 20V12C2.75 11.3096 3.30964 10.75 4 10.75C4.69036 10.75 5.25 11.3096 5.25 12V20C5.25 20.1989 5.32907 20.3896 5.46973 20.5303C5.61038 20.6709 5.80109 20.75 6 20.75H18C18.1989 20.75 18.3896 20.6709 18.5303 20.5303C18.6709 20.3896 18.75 20.1989 18.75 20V12C18.75 11.3096 19.3096 10.75 20 10.75C20.6904 10.75 21.25 11.3096 21.25 12V20C21.25 20.862 20.9073 21.6884 20.2979 22.2979C19.6884 22.9073 18.862 23.25 18 23.25H6C5.13805 23.25 4.31164 22.9073 3.70215 22.2979C3.09266 21.6884 2.75 20.862 2.75 20ZM10.75 15V5.01758L8.88379 6.88379C8.39563 7.37194 7.60437 7.37194 7.11621 6.88379C6.62806 6.39563 6.62806 5.60437 7.11621 5.11621L11.1162 1.11621L11.2109 1.03027C11.7019 0.629789 12.4261 0.658549 12.8838 1.11621L16.8838 5.11621C17.3719 5.60437 17.3719 6.39563 16.8838 6.88379C16.3956 7.37194 15.6044 7.37194 15.1162 6.88379L13.25 5.01758V15C13.25 15.6904 12.6904 16.25 12 16.25C11.3096 16.25 10.75 15.6904 10.75 15Z" fill="#FF561A"/>
                </Svg>
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
      </RightSlideModal>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: "100%",
    backgroundColor: colors.bg,
    paddingHorizontal: 68,
    paddingTop: 140,
    paddingBottom: 108,
    justifyContent: "center",
    alignItems: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  titleText: {
    ...textStyles.titlePage,
    color: colors.text,
  },
  promptText: {
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xxl,
    lineHeight: typography.size.xxl * 1.2,
    textAlign: "center",
    color: colors.text,
  },
  targetAvatarLarge: {
    width: 160,
    height: 240,
    borderRadius: radii.md,
  },
  avatarLargeFallback: {
    width: 160,
    height: 240,
    borderRadius: radii.md,
    backgroundColor: colors.accentMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLargeLetter: {
    color: colors.text,
    fontFamily: typography.family.bold,
    fontSize: 48,
  },
  repliesBadge: {
    backgroundColor: colors.opacityLight,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignSelf: "center",
  },
  repliesBadgeText: {
    ...textStyles.singleLineBodyBaseStrong,
    color: colors.text,
  },
  spacer300: {
    height: spacing.md,
  },
  spacer1200: {
    height: spacing.xl3,
  },
  spacer400: {
    height: spacing.lg,
  },

  // Modal Layout Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0,
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  backBtn: {
    padding: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    ...textStyles.subtitleStrong,
    fontSize: 32,
    color: colors.text,
  },
  modalQuestionText: {
    ...textStyles.subheading,
    color: colors.text,
    textAlign: "center",
    paddingTop: 12,
    paddingBottom: 24,
    paddingHorizontal: 16,
  },
  orangeText: {
    color: colors.brand,
  },
  swapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.lg,
  },
  swapBtnText: {
    color: colors.text,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xxs,
  },

  // Carousel & Slides Styles
  carouselFlexContainer: {
    flex: 1,
    flexShrink: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  slideCard: {
    borderRadius: radii.xl,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#000000",
  },
  // Bordure active en overlay absolu → ne rogne pas le média (pas de cadre noir), pas de
  // changement de layout au swipe (donc pas de clignotement).
  cardActiveBorder: {
    borderWidth: stroke.md,
    borderColor: colors.borderBrandTertiary,
    borderRadius: radii.xl,
  },
  slideMediaWrapper: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  cardDetailsContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  authorInfoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  authorAvatar: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
  },
  authorAvatarFallback: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.accentMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  authorAvatarLetter: {
    color: "#FFFFFF",
    fontFamily: typography.family.bold,
    fontSize: 18,
  },
  authorTextSection: {
    flex: 1,
    gap: 2,
  },
  authorName: {
    color: colors.textNeutral,
    fontFamily: typography.family.bold,
    fontSize: 14,
  },
  authorNote: {
    color: colors.textNeutral,
    fontFamily: typography.family.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  stepperContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    gap: spacing.xs2,
    marginTop: 24,
    borderRadius: radii.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.opacityLight,
  },
  stepperDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.iconTertiary,
  },
  stepperDotActive: {
    backgroundColor: colors.icon,
  },

  // Bottom Footer Styles
  modalFooter: {
    height: 100,
    backgroundColor: colors.bg,
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
    alignItems: "flex-start",
    zIndex: 10,
  },
  modalReactionsBtn: {
    flex: 1,
    height: 52,
    backgroundColor: colors.brand,
    borderRadius: radii.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderBtn: {
    width: 52,
    height: 52,
    borderRadius: radii.lg,
    backgroundColor: colors.card,
    justifyContent: "center",
    alignItems: "center",
  },
  modalReactionsBtnText: {
    fontFamily: typography.family.bold,
    fontSize: typography.size.md,
    color: colors.textBrandOnBrandSecondary,
  },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: colors.textSecondary || colors.textMuted,
    fontFamily: typography.family.medium,
    fontSize: typography.size.sm,
  },
  modalHeaderContainer: {
    flexShrink: 0,
  },
  commentsFlexContainer: {
    flex: 1.2,
    flexShrink: 1,
  },
});
