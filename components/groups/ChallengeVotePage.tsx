import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Pressable,
  Animated as RNAnimated,
  Easing as RNEasing,
  Share
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { getChallengePrompt, type ChallengeWithData, type ChallengeResponse } from "../../lib/challenges";
import Svg, { Path } from "react-native-svg";
import { r2Storage } from "../../lib/r2";
import ChallengeAudioPlayer from "./ChallengeAudioPlayer";
import { AudioCaptionPlayer } from "../molecules/AudioCaptionPlayer";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useVideoPlayer, VideoView } from "expo-video";
import { radii, typography, spacing, textStyles, stroke, buildColors, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { supabase } from "../../lib/supabase";
import CommentModal from "../CommentModal";
import { RightSlideModal } from "../atoms/RightSlideModal";
import { type Reaction } from "../../lib/feed-types";

// Reanimated and Reactions
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { ReactionStickers, type ReactionDisplay } from "../molecules/ReactionStickers";
import { StickerToast } from "../atoms/StickerToast";
import { SHEET_BASE } from "../../lib/comment-sheet";
import Carousel, { Pagination, ICarouselInstance } from "react-native-reanimated-carousel";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const CAROUSEL_HEIGHT = 500;
const PREVIEW_GAP = 0; // Gap (px) between the bottom of the card preview and the top of the comments sheet
const PREVIEW_TOP_GAP = 40; // Gap (px) between the bottom of the question text and the top of the card preview
const HEADER_SHIFT = 52; // How many pixels the header translates upward when comments are open

// Drawing responses always render on a light (white) canvas, so their details (author name,
// description, audio player) must stay dark regardless of the active app theme — unlike the
// reveal, which relies on a dark scrim. These are fixed, theme-independent token values.
const DRAWING_DETAIL_COLOR = buildColors("Light").textNeutral; // #303030 · --sds-color-text-neutral-default
const DRAWING_WAVE_COLOR = buildColors("Dark").bg;             // #1E1E1E · --sds-color-background-default-default (black)

function getSecondUrl(r: ChallengeResponse): string | null {
  if (!r.second_image_path || r.second_image_path === "text_mode") return null;
  return r2Storage.getPublicUrl(r.second_image_path);
}

function mediaType(path: string | null): "text" | "audio" | "drawing" | "video" | "photo" {
  if (!path || path === "text_mode") return "text";
  if (path.endsWith(".m4a")) return "audio";
  if (path.endsWith(".mp4")) return "video";
  if (path.includes("_draw")) return "drawing";
  return "photo";
}

// Modal media renderer — respects exact same ratios as PhotoFeed
function ModalMedia({ imagePath, url, note, isActive, isPaused }: { imagePath: string | null; url: string | null; note: string | null; isActive?: boolean; isPaused?: boolean }) {
  const { colors } = useTheme();
  const type = mediaType(imagePath);

  // Video player — only loaded when this media is a video. Plays/loops while the slide
  // is the active (centered) one, pauses otherwise.
  const videoPlayer = useVideoPlayer(type === "video" ? (url ?? null) : null, (p) => {
    p.loop = true;
    p.muted = false;
  });

  // Playback is controlled by the parent slide: play only when this is the active
  // (centered) slide and the user hasn't tapped to pause it.
  const shouldPlayRef = useRef(false);
  shouldPlayRef.current = type === "video" && !!isActive && !isPaused;

  useEffect(() => {
    try {
      if (shouldPlayRef.current) videoPlayer.play();
      else videoPlayer.pause();
    } catch (_) {}
  }, [type, isActive, isPaused, url, videoPlayer]);

  // Remote .mp4 streams emit a spurious `isPlaying = false` (buffering stall) right
  // after starting, which otherwise leaves the video paused after ~1s. Re-assert play
  // when that happens while the slide should be playing. Mirrors VideoMoment in the reveal.
  useEffect(() => {
    if (type !== "video" || !videoPlayer) return;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    const sub = videoPlayer.addListener("playingChange", ({ isPlaying }) => {
      if (!isPlaying && shouldPlayRef.current) {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          stallTimer = null;
          if (shouldPlayRef.current) { try { videoPlayer.play(); } catch (_) {} }
        }, 200);
      }
    });
    if (shouldPlayRef.current) { try { videoPlayer.play(); } catch (_) {} }
    return () => {
      if (stallTimer) clearTimeout(stallTimer);
      sub.remove();
    };
  }, [type, videoPlayer]);

  if (type === "text") {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", padding: 28 }]}>
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
  if (type === "video") {
    if (!url) return null;
    return (
      <View style={StyleSheet.absoluteFill}>
        <VideoView
          player={videoPlayer}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
        />
        {isActive && isPaused && (
          <View
            style={[StyleSheet.absoluteFill, { justifyContent: "center", alignItems: "center" }]}
            pointerEvents="none"
          >
            <View style={{ width: 64, height: 64, borderRadius: radii.xl, backgroundColor: colors.opacityLight, justifyContent: "center", alignItems: "center" }}>
              <Svg width="24" height="24" viewBox="0 0 24 24" fill={colors.text}>
                <Path d="M8 5v14l11-7z" />
              </Svg>
            </View>
          </View>
        )}
      </View>
    );
  }
  if (type === "drawing") {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}>
        <Image
          source={{ uri: url ?? "" }}
          style={StyleSheet.absoluteFill}
          contentFit="fill"
        />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: url ?? "" }}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      contentPosition={{ top: 0, left: "50%" }}
    />
  );
}



// Slide component utilizing Reanimated for smooth per-card animations.
// Memoized so reaction/keyboard/toast state changes on the parent don't re-render
// (and re-mount the expo-image of) every slide in the carousel.
const ChallengeResponseSlide = React.memo(function ChallengeResponseSlide({
  item,
  index,
  activeIndex,
  progress,
  scrollProgress,
  swapped,
  commentsOpen,
  cvStyles,
}: {
  item: ChallengeResponse;
  index: number;
  activeIndex: number;
  progress: SharedValue<number>;
  scrollProgress: SharedValue<number>;
  swapped: boolean;
  commentsOpen: boolean;
  cvStyles: any;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const opacity = index === activeIndex ? 1 : 1 - progress.value;
    return {
      opacity,
    };
  });

  const gradientStyle = useAnimatedStyle(() => {
    return {
      opacity: 1 - progress.value,
    };
  });

  // Focus ring opacity fades gradually with the scroll (mirrors GroupsSlider): full when
  // this card is centered (progress === index), fading linearly to 0 one card away. So the
  // current card's border fades out while the next card's fades in during a swipe.
  // `commentsFactor` smoothly fades the ring out (timed) when comments open, independent of scroll.
  const commentsFactor = useSharedValue(commentsOpen ? 0 : 1);
  useEffect(() => {
    commentsFactor.value = withTiming(commentsOpen ? 0 : 1, { duration: 250 });
  }, [commentsOpen]);

  const focusRingStyle = useAnimatedStyle(() => {
    const proximity = Math.max(0, 1 - Math.abs(scrollProgress.value - index));
    return { opacity: proximity * commentsFactor.value };
  });

  const slideImagePath = swapped ? (item.second_image_path ?? item.image_path) : item.image_path;
  const slideUrl = swapped ? (getSecondUrl(item) ?? item.url) : item.url;
  const slideNote = swapped ? (item.second_note ?? null) : item.note;
  const isTextOnly = mediaType(slideImagePath) === "text";
  const isDrawing = mediaType(slideImagePath) === "drawing";
  const isVideo = mediaType(slideImagePath) === "video";
  const hasAudioNote = !swapped && !!item.audio_note_path && !!item.audio_note_url;

  const audioPlayer = useAudioPlayer(item.audio_note_url ?? "");
  const audioStatus = useAudioPlayerStatus(audioPlayer);

  // Tap-to-pause for video. Reset to "playing" whenever the slide stops being the
  // active one so a swiped-away video resumes when you come back to it.
  const [isPaused, setIsPaused] = useState(false);

  // Pause the note when this slide isn't the active one (carousel keeps slides mounted).
  useEffect(() => {
    if (index !== activeIndex) {
      try { audioPlayer.pause(); } catch (_) {}
      setIsPaused(false);
    }
  }, [index, activeIndex]);

  return (
    <Reanimated.View style={[
      cvStyles.slideCard,
      animatedStyle,
    ]}>
      {/* Top-level tap target so tapping anywhere on the card toggles video
          pause/play. Overlays (gradient, details, focus ring) sit inside it;
          their interactive children (audio caption) still capture their own taps. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={isVideo ? () => setIsPaused((v) => !v) : undefined}>
      <View style={cvStyles.slideMediaWrapper}>
        <ModalMedia imagePath={slideImagePath} url={slideUrl} note={slideNote} isActive={index === activeIndex} isPaused={isPaused} />
      </View>

      {!isTextOnly && !isDrawing && (
        <Reanimated.View style={[StyleSheet.absoluteFillObject, gradientStyle]} pointerEvents="none">
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.85)"]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </Reanimated.View>
      )}

      <Reanimated.View style={[cvStyles.cardDetailsContainer, gradientStyle]} pointerEvents="box-none">
        <View style={cvStyles.authorInfoRow} pointerEvents="box-none">
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={cvStyles.authorAvatar} contentFit="cover" />
          ) : (
            <View style={[cvStyles.authorAvatar, cvStyles.authorAvatarFallback]}>
              <Text style={cvStyles.authorAvatarLetter}>{(item.username || "?")[0].toUpperCase()}</Text>
            </View>
          )}
          <View style={cvStyles.authorTextSection} pointerEvents={hasAudioNote ? "box-none" : "none"}>
            <Text style={[
              cvStyles.authorName,
              isDrawing ? { color: DRAWING_DETAIL_COLOR } : { color: "#FFFFFF" }
            ]}>{item.username}</Text>
            {hasAudioNote ? (
              <AudioCaptionPlayer
                player={audioPlayer}
                status={audioStatus}
                waveform={item.waveform ?? undefined}
                iconColor={isDrawing ? DRAWING_DETAIL_COLOR : undefined}
                waveColor={isDrawing ? DRAWING_WAVE_COLOR : undefined}
              />
            ) : !isTextOnly && (
              <Text style={[
                cvStyles.authorNote,
                isDrawing ? { color: DRAWING_DETAIL_COLOR } : { color: "rgba(255, 255, 255, 0.7)" }
              ]} numberOfLines={2}>{slideNote || "Sans description"}</Text>
            )}
          </View>
        </View>
      </Reanimated.View>

      {/* Focus ring drawn as an absolute overlay so toggling it never insets the
          media (a real borderWidth shrinks the content box → layout shift).
          Rendered LAST so it sits above the bottom shadow gradient — otherwise the
          gradient darkens the lower part of the border.
          Always mounted; its opacity (focusRingStyle) fades gradually with the carousel
          scroll — out on the card you swipe away from, in on the one you swipe toward. */}
      <Reanimated.View
        pointerEvents="none"
        style={[
          cvStyles.slideFocusRing,
          focusRingStyle,
        ]}
      />
      </Pressable>
    </Reanimated.View>
  );
});

export default function ChallengeVotePage({
  challenge,
  period,
  currentUserId,
  currentUserAvatarUrl,
  currentUsername,
  onVote,
  members = [],
  showResponsesModal = false,
  onCloseResponsesModal,
  onCommentModalChange,
}: {
  challenge: ChallengeWithData;
  period: 1 | 2;
  currentUserId?: string;
  currentUserAvatarUrl?: string | null;
  currentUsername?: string;
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
  const [swapped, setSwapped] = useState(false);
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [commentModalMode, setCommentModalMode] = useState<"comment" | "sticker">("comment");
  const [commentActiveResponse, setCommentActiveResponse] = useState<ChallengeResponse | null>(null);
  const [reactionsMap, setReactionsMap] = useState<Record<string, Reaction[]>>({});
  // Per-response count of comments from *others* added since the user last opened that
  // response's comments. Drives the unseen-comments badge on the "Réactions" button,
  // mirroring the reveal (see [id].tsx newCommentsCountMap / BottomActionBar badge).
  const [unseenMap, setUnseenMap] = useState<Record<string, number>>({});

  useEffect(() => {
    onCommentModalChange?.(commentModalVisible);
  }, [commentModalVisible, onCommentModalChange]);

  const responsesCount = challenge.responses.length;
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
      // removeChannel (not just unsubscribe) so the channel is also dropped from the
      // Supabase client's registry — otherwise channels accumulate if this re-runs.
      supabase.removeChannel(channel);
    };
  }, [challenge.responses, members]);

  // Count, per response, comments from *others* added since the user last opened that
  // response's comments (its comment_views.last_viewed_at). Own comments never count as
  // unseen. Challenge-response comments are stored under photo_id = response.id, same as
  // the reveal, so this reuses the comments / comment_views tables directly.
  const fetchUnseenComments = async () => {
    if (!currentUserId || challenge.responses.length === 0) return;
    const responseIds = challenge.responses.map(r => r.id);
    try {
      const [viewsRes, commentsRes] = await Promise.all([
        supabase.from("comment_views").select("photo_id, last_viewed_at").eq("user_id", currentUserId).in("photo_id", responseIds),
        supabase.from("comments").select("photo_id, user_id, created_at").in("photo_id", responseIds),
      ]);

      const viewsMap = Object.fromEntries((viewsRes.data ?? []).map((v: any) => [v.photo_id, v.last_viewed_at]));
      const counts: Record<string, number> = {};
      for (const c of commentsRes.data ?? []) {
        if (c.user_id === currentUserId) continue;
        const lastViewedAt = viewsMap[c.photo_id];
        if (!lastViewedAt || new Date(c.created_at) > new Date(lastViewedAt)) {
          counts[c.photo_id] = (counts[c.photo_id] || 0) + 1;
        }
      }
      setUnseenMap(counts);
    } catch (err) {
      console.error("Error fetching challenge unseen comments:", err);
    }
  };

  // Fetch unseen-comment counts and keep them live as comments arrive.
  useEffect(() => {
    fetchUnseenComments();

    const channel = supabase
      .channel(`challenge-comments-${challenge.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, () => {
        fetchUnseenComments();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [challenge.responses, currentUserId]);

  // Recompute when the responses modal opens, so the badge is correct on arrival
  // (mirrors the reveal-open sync in [id].tsx).
  useEffect(() => {
    if (showResponsesModal) fetchUnseenComments();
  }, [showResponsesModal]);

  // Reset indices on modal close/open
  useEffect(() => {
    if (showResponsesModal) {
      setActiveIndex(0);
      setSwapped(false);
    }
  }, [showResponsesModal]);

  const carouselRef = useRef<ICarouselInstance>(null);
  const carouselProgress = useSharedValue<number>(0);

  const onPressPagination = (index: number) => {
    carouselRef.current?.scrollTo({
      count: index - carouselProgress.value,
      animated: true,
    });
  };

  const activeResponse = challenge.responses[activeIndex];
  const hasSecond = activeResponse ? !!(activeResponse.second_image_path) : false;

  // Reanimated states for responsiveness (exact same structure as PhotoFeed)
  const kb = useSharedValue(0);
  // True on-screen coverage of the comment sheet (folds in slide-in, keyboard & drag),
  // written by CommentModal. The preview pins its bottom to this so it tracks the sheet
  // frame-by-frame on open/close — same smoothness as the keyboard lift.
  const drawerCoverage = useSharedValue(0);
  const keyboardActiveSV = useSharedValue(0); // set in CommentModal's onStart (UI thread)
  const progress = useSharedValue(0);
  const sheetSV = useSharedValue(SHEET_BASE);
  const isStickerModeSV = useSharedValue(0);
  const headerHeightSV = useSharedValue(150);

  const [activeModalMode, setActiveModalMode] = useState<"comment" | "sticker">("comment");
  // True while the keyboard is up — reaction stickers hide so they don't clutter while typing.
  const [keyboardActive, setKeyboardActive] = useState(false);

  // Optimistic/reaction states for stickers (exact same structure as PhotoFeed)
  const [poppedReaction, setPoppedReaction] = useState<Reaction | null>(null);
  const [removingReactionUserId, setRemovingReactionUserId] = useState<string | null>(null);
  const [reactionToast, setReactionToast] = useState<string | null>(null);
  const reactionToastAnim = useRef(new RNAnimated.Value(0)).current;
  const reactionToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showReactionToast = useCallback((message: string) => {
    if (reactionToastTimer.current) clearTimeout(reactionToastTimer.current);
    setReactionToast(message);
    reactionToastAnim.setValue(0);
    RNAnimated.spring(reactionToastAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }).start();
    reactionToastTimer.current = setTimeout(() => {
      hideReactionToast();
    }, 2200);
  }, [reactionToastAnim]);

  // Animates the reaction toast out + clears it. Reused by the auto-dismiss timer
  // and the toast's X close button.
  const hideReactionToast = useCallback(() => {
    if (reactionToastTimer.current) clearTimeout(reactionToastTimer.current);
    RNAnimated.timing(reactionToastAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
      easing: RNEasing.in(RNEasing.quad),
    }).start(({ finished }) => {
      if (finished) setReactionToast(null);
    });
  }, [reactionToastAnim]);

  // On close: hide the stickers (no lingering) and reset the delete state.
  // Also clear the keyboard-active flag — an intentional close (sticker submit)
  // leaves it at 1, which would wrongly hide stickers on the next open.
  useEffect(() => {
    if (commentModalVisible) return;
    setPoppedReaction(null);
    setRemovingReactionUserId(null);
    keyboardActiveSV.value = 0;
  }, [commentModalVisible]);

  const handleStickerPosted = useCallback((text: string) => {
    const me = members.find((m: any) => m.user_id === currentUserId);
    setPoppedReaction({
      id: "optimistic-sticker",
      user_id: currentUserId ?? "",
      username: currentUsername ?? me?.username ?? "Anonyme",
      avatar_url: currentUserAvatarUrl ?? me?.avatar_url ?? null,
      sticker_id: text,
    } as Reaction);
    showReactionToast("Réaction ajoutée");
  }, [members, currentUserId, currentUsername, currentUserAvatarUrl, showReactionToast]);

  const handleStickerDeleted = useCallback(() => {
    if (currentUserId) setRemovingReactionUserId(currentUserId);
    showReactionToast("Réaction supprimée");
  }, [currentUserId, showReactionToast]);

  useEffect(() => () => { if (reactionToastTimer.current) clearTimeout(reactionToastTimer.current); }, []);

  // Sync mode changes and visibility changes to shared values
  useEffect(() => {
    isStickerModeSV.value = withTiming(activeModalMode === "sticker" ? 1 : 0, { duration: 260 });
  }, [activeModalMode]);

  useEffect(() => {
    progress.value = withTiming(commentModalVisible ? 1 : 0, { duration: 250 });
  }, [commentModalVisible]);

  // Reaction stickers over the open comments modal
  const activeReactionDisplay = useMemo<ReactionDisplay | null>(() => {
    if (!activeResponse || !commentModalVisible) return null;
    const base = reactionsMap[activeResponse.id] || [];
    if (poppedReaction) {
      const deduped = base.filter((r) => r.user_id !== poppedReaction.user_id);
      return { reactions: [...deduped, poppedReaction], popId: poppedReaction.id };
    }
    if (base.length > 0) return { reactions: base };
    return null;
  }, [activeResponse, poppedReaction, commentModalVisible, reactionsMap]);

  // Shrink the floating stickers by 20% only while the custom-sticker view is up
  // (isStickerModeSV → 1), where the preview is smallest and space is tight. Normal
  // size in comment mode. Driven off isStickerModeSV so it eases with the mode switch.
  const stickerSizeFactor = useDerivedValue(() => 1 - 0.2 * isStickerModeSV.value);

  const stickersHidden = activeModalMode === "comment" && keyboardActive;
  // 1 when the keyboard is up in comment mode, 0 otherwise. keyboardActiveSV is
  // set once in CommentModal's onStart worklet, so this flips on the UI thread the
  // instant the keyboard starts — FloatingSticker reacts without a JS round-trip.
  const stickersHiddenSV = useDerivedValue<number>(() =>
    keyboardActiveSV.value > 0 && isStickerModeSV.value < 0.5 ? 1 : 0
  );

  // Responsive derived formulas
  const layoutCenter = useDerivedValue(() => {
    // The layout of the carousel flex container (which has flex: 1 and the footer below it)
    // is constant in height (SCREEN_HEIGHT - headerHeightSV.value - 100).
    // The center of this space relative to the screen top is:
    return headerHeightSV.value + (SCREEN_HEIGHT - headerHeightSV.value - 100) / 2;
  });

  const targetTop = useDerivedValue(() => {
    const closedTop = layoutCenter.value - CAROUSEL_HEIGHT / 2;
    const openTop = headerHeightSV.value - HEADER_SHIFT + PREVIEW_TOP_GAP; // visual top with top padding gap
    return (1 - progress.value) * closedTop + progress.value * openTop;
  });

  const scale = useDerivedValue(() => {
    const liveDrawer = drawerCoverage.value;
    const drawerTopX = SHEET_BASE + isStickerModeSV.value * (liveDrawer - SHEET_BASE);
    const availableX = SCREEN_HEIGHT - drawerTopX - targetTop.value - PREVIEW_GAP;
    const fitX = Math.max(0.05, Math.min(1, availableX / CAROUSEL_HEIGHT));
    return 1 + (fitX - 1) * progress.value;
  });

  const animatedHeight = useDerivedValue(() => {
    const liveDrawer = drawerCoverage.value;
    const availableY = SCREEN_HEIGHT - liveDrawer - PREVIEW_GAP - targetTop.value;
    const fullScaledH = CAROUSEL_HEIGHT * scale.value;
    const cropOpen =
      (1 - isStickerModeSV.value) * Math.min(1, availableY / Math.max(fullScaledH, 1)) +
      isStickerModeSV.value * 1;
    const cropRatio = 1 + (cropOpen - 1) * progress.value;
    return CAROUSEL_HEIGHT * cropRatio;
  });

  const translateY = useDerivedValue(() => {
    return targetTop.value - layoutCenter.value + (animatedHeight.value * scale.value) / 2;
  });

  // Reanimated style objects
  // This wrapper is the view that gets cropped/scaled, so it must ALSO be the one that
  // carries the border radius (radii.md, via carouselWrapper) — that's how the bottom
  // stays rounded when the height shrinks in the comment-input state (same trick PhotoFeed
  // uses). When open it hugs the card (340) so the radius frames the card; when browsing
  // it's full-width and the radius sits off-screen (the slideCard rounds the cards then).
  // Uniform `scale` (one entry) so the corners can't distort.
  const animatedContentStyle = useAnimatedStyle(() => {
    return {
      height: animatedHeight.value,
      width: commentModalVisible ? 340 : SCREEN_WIDTH,
      // Radius only while the image is shrunk for comments (progress 1). At full
      // width (progress 0) it stays square so the edges sit flush off-screen.
      borderRadius: radii.md * progress.value,
      transform: [
        { translateY: translateY.value },
        { scale: scale.value },
      ],
      overflow: "hidden",
    };
  });

  const animatedHeaderStyle = useAnimatedStyle(() => {
    const ty = -HEADER_SHIFT * progress.value;
    return {
      transform: [{ translateY: ty }],
    };
  });

  const animatedModalHeaderStyle = useAnimatedStyle(() => {
    return {
      opacity: 1 - progress.value,
    };
  });

  const animatedStepperStyle = useAnimatedStyle(() => {
    return {
      opacity: 1 - progress.value,
    };
  });

  const animatedModalFooterStyle = useAnimatedStyle(() => {
    return {
      opacity: 1 - progress.value,
    };
  });

  const animatedStickerOverlayStyle = useAnimatedStyle(() => {
    const targetTY = targetTop.value - layoutCenter.value + (CAROUSEL_HEIGHT * scale.value) / 2;
    return {
      transform: [
        { translateY: targetTY },
        { scale: scale.value }
      ]
    };
  });

  const renderResponseSlide = useCallback(({ item, index }: { item: ChallengeResponse, index: number }) => {
    return (
      <ChallengeResponseSlide
        item={item}
        index={index}
        activeIndex={activeIndex}
        progress={progress}
        scrollProgress={carouselProgress}
        swapped={swapped}
        commentsOpen={commentModalVisible}
        cvStyles={cvStyles}
      />
    );
  }, [activeIndex, progress, carouselProgress, swapped, commentModalVisible, cvStyles]);

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
          // The embedded CommentModal has no native Modal of its own, so Android back
          // lands here — close the comment sheet first if it's open.
          if (commentModalVisible) setCommentModalVisible(false);
          else onCloseResponsesModal?.();
        }}
      >
        <View style={cvStyles.modalOverlay}>
          {/* Top Bar / Header */}
          <View
            style={{ paddingTop: Math.max(insets.top, 16), zIndex: 10 }}
            onLayout={(e) => {
              headerHeightSV.value = e.nativeEvent.layout.height;
            }}
          >
            <Reanimated.View style={animatedHeaderStyle}>
              <Reanimated.View style={[cvStyles.modalHeader, { paddingTop: 0 }, animatedModalHeaderStyle]}>
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
              </Reanimated.View>

              {/* Fixed 2-line height so the header (and thus the preview top) doesn't
                  shift when the question wraps to 1 vs 2 lines — keeps the gap above
                  the preview constant. */}
              <View style={cvStyles.modalQuestionContainer}>
                <Text style={[cvStyles.modalQuestionText, commentModalVisible ? cvStyles.modalQuestionTextCentered : cvStyles.modalQuestionTextLeft]} numberOfLines={2}>
                  Si{" "}
                  <Text style={cvStyles.orangeText}>{challenge.target_username}</Text>
                  {" était un"}{"aeiouyAEIOUY".includes(challenge.theme.label?.[0] ?? "") ? "" : "·e"}{" "}
                  <Text style={cvStyles.orangeText}>{challenge.theme.label}</Text>
                  {", ça serait..."}
                </Text>
              </View>
            </Reanimated.View>
          </View>

          {/* Horizontally Scrollable Carousel */}
          {responsesCount > 0 ? (
            <View style={cvStyles.carouselFlexContainer}>
              <Reanimated.View
                style={[
                  cvStyles.carouselWrapper,
                  animatedContentStyle,
                ]}
              >
                <Reanimated.View
                  style={{
                    width: "100%",
                    height: "100%",
                  }}
                >
                  <Carousel
                    ref={carouselRef}
                    width={356}
                    height={CAROUSEL_HEIGHT}
                    style={{
                      width: 356,
                      height: "100%",
                      alignSelf: "center",
                      overflow: "visible",
                    }}
                    loop={false}
                    enabled={!commentModalVisible}
                    data={challenge.responses}
                    renderItem={renderResponseSlide}
                    onSnapToItem={(index) => {
                      setActiveIndex(index);
                      setSwapped(false);
                    }}
                    onProgressChange={carouselProgress}
                  />
                </Reanimated.View>
              </Reanimated.View>

              {/* Reaction stickers overlay */}
              {activeReactionDisplay && (
                <Reanimated.View
                  pointerEvents="none"
                  style={[cvStyles.stickerOverlay, animatedStickerOverlayStyle]}
                >
                  <ReactionStickers
                    reactions={activeReactionDisplay.reactions}
                    previewScale={scale}
                    sizeFactor={stickerSizeFactor}
                    removingUserId={removingReactionUserId}
                    hidden={stickersHidden}
                    hiddenSV={stickersHiddenSV}
                  />
                </Reanimated.View>
              )}

              {/* Stepper Dot Page Indicators */}
              {responsesCount > 1 && (
                <Reanimated.View
                  style={animatedStepperStyle}
                  pointerEvents={commentModalVisible ? "none" : "auto"}
                >
                  <Pagination.Basic
                    progress={carouselProgress}
                    data={challenge.responses}
                    dotStyle={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      backgroundColor: colors.iconTertiary,
                    }}
                    activeDotStyle={{
                      backgroundColor: colors.icon,
                    }}
                    containerStyle={{
                      gap: spacing.xs2,
                      borderRadius: radii.full,
                      paddingVertical: spacing.sm,
                      paddingHorizontal: spacing.md,
                      backgroundColor: colors.opacityLight,
                      marginTop: 24,
                    }}
                    onPress={onPressPagination}
                  />
                </Reanimated.View>
              )}
            </View>
          ) : (
            <View style={cvStyles.emptyContainer}>
              <Text style={cvStyles.emptyText}>Aucune réponse à afficher.</Text>
            </View>
          )}

          {/* Bottom Control Bar */}
          {activeResponse && (
            <Reanimated.View
              style={[cvStyles.modalFooter, animatedModalFooterStyle]}
              pointerEvents={commentModalVisible ? "none" : "auto"}
            >
              <TouchableOpacity
                style={cvStyles.modalReactionsBtn}
                onPress={() => {
                  setCommentActiveResponse(activeResponse);
                  setCommentModalMode("comment");
                  setCommentModalVisible(true);
                  // Optimistically clear the badge — CommentModal marks it seen in DB on open.
                  setUnseenMap((prev) => ({ ...prev, [activeResponse.id]: 0 }));
                }}
                activeOpacity={0.85}
              >
                <Text style={cvStyles.modalReactionsBtnText}>Réactions</Text>
                {(unseenMap[activeResponse.id] ?? 0) > 0 && (
                  <View style={cvStyles.reactionsBtnBadge}>
                    <Text style={cvStyles.reactionsBtnBadgeText}>{unseenMap[activeResponse.id]}</Text>
                  </View>
                )}
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
                    // Share with a custom shared name (the share sheet shows the file's
                    // basename). Keep the source extension so the OS detects the media type.
                    // Drawings are stored as PNG bytes under a "_draw.jpg" name, so the
                    // share file must be .png/image-png or the OS can't build a preview.
                    const sharePath = swapped ? (activeResponse.second_image_path ?? activeResponse.image_path) : activeResponse.image_path;
                    const isDrawing = (sharePath ?? "").includes("_draw");
                    const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
                    const safeExt = isDrawing ? 'png' : (ext && ext.length <= 5 ? ext : 'jpg');
                    const shareMimeType = isDrawing ? 'image/png' : undefined;
                    const shareUTI = isDrawing ? 'public.png' : undefined;
                    const filename = `Disclose - You've never been this close!.${safeExt}`;
                    const localUri = FileSystem.cacheDirectory + filename;

                    // The media is already on the device from being displayed, so prefer a
                    // local copy over re-downloading it from R2 (the slow part). Photos live
                    // in expo-image's disk cache; videos/audio are already local file:// URIs.
                    let sourceUri: string | null = url.startsWith("file://") ? url : null;
                    if (!sourceUri) {
                      try {
                        const cached = await Image.getCachePathAsync(url);
                        if (cached) sourceUri = cached.startsWith("file://") ? cached : "file://" + cached;
                      } catch {}
                    }

                    // The friendly-named file is reused as the share basename for every
                    // item, so always overwrite it with the current item's media.
                    await FileSystem.deleteAsync(localUri, { idempotent: true });
                    if (sourceUri) {
                      await FileSystem.copyAsync({ from: sourceUri, to: localUri });
                    } else {
                      await FileSystem.downloadAsync(url, localUri);
                    }
                    await Sharing.shareAsync(localUri, { mimeType: shareMimeType, UTI: shareUTI });
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
            </Reanimated.View>
          )}

          {/* ── Comment / Reactions Modal for Active Slide ── */}
          {/* Mount on commentActiveResponse (mirrors PhotoFeed's activePhotoId) and
              drive open/close via the `visible` prop only. Keeping it mounted while
              closing lets CommentModal play its own slide-out, sticker pop and toast
              animations — instead of being torn down instantly — matching the reveal. */}
          {commentActiveResponse && (
            <CommentModal
              embedded
              visible={commentModalVisible}
              onClose={() => {
                setCommentModalVisible(false);
              }}
              keyboardHeightShared={kb}
              keyboardActiveShared={keyboardActiveSV}
              sheetHeightShared={sheetSV}
              drawerCoverageShared={drawerCoverage}
              onKeyboardActiveChange={setKeyboardActive}
              onModeChange={(m) => setActiveModalMode(m)}
              onSeen={() => {
                // CommentModal calls this after writing comment_views (last_viewed_at) to
                // the DB on open. Re-fetch every response's comments + views to recompute
                // all badges — same as the reveal's syncUnseenCommentCounts on open.
                fetchUnseenComments();
              }}
              onStickerPosted={handleStickerPosted}
              onStickerDeleted={handleStickerDeleted}
              onToast={showReactionToast}
              photoId={commentActiveResponse.id}
              photoOwnerId={commentActiveResponse.user_id}
              groupId={challenge.group_id}
              reactions={reactionsMap[commentActiveResponse.id] || []}
              initialMode={commentModalMode}
              groupMembers={members}
            />
          )}

          {/* Reaction add/delete toast. Rendered INSIDE the responses modal (and last, so
              it sits above the CommentModal) — placing it on the main screen would draw it
              behind this full-screen RightSlideModal, where it's never visible. */}
          {reactionToast !== null && (
            <StickerToast message={reactionToast} animValue={reactionToastAnim} topInset={insets.top} onClose={hideReactionToast} />
          )}
        </View>
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
    backgroundColor: colors.card,
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
  // Reserves exactly two lines of question text so the header height (measured via
  // onLayout → headerHeightSV) is identical for 1- and 2-line questions, keeping the
  // preview's top position — and the gap above it — constant.
  modalQuestionContainer: {
    width: "100%",
    height: 12 + textStyles.subheading.lineHeight * 2, // paddingTop + 2 lines
    paddingTop: 12,
    paddingHorizontal: 16,
    justifyContent: "flex-start",
  },
  modalQuestionText: {
    ...textStyles.subheading,
    color: colors.text,
  },
  // Vue défi classique : question alignée à gauche.
  modalQuestionTextLeft: {
    textAlign: "left",
    paddingLeft: 10,
  },
  // Commentaires ouverts : question recentrée.
  modalQuestionTextCentered: {
    textAlign: "center",
    paddingRight: 16,
    paddingLeft: 16,
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
    justifyContent: "center",
    alignItems: "center",
  },
  carouselWrapper: {
    width: SCREEN_WIDTH,
    height: 500,
    backgroundColor: "transparent",
    // borderRadius is applied dynamically in animatedContentStyle (radii.md * progress)
    // so it only rounds while the height shrinks for comments; at full width it stays
    // square. Matches slideCard.borderRadius so the two are concentric when open.
  },
  slideCard: {
    width: 340,
    height: 500,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#000000",
    marginHorizontal: spacing.lg / 2,
    borderRadius: radii.md,
  },
  // Orange focus ring around the slide currently centered in the carousel.
  // Toggled via activeIndex (set in onSnapToItem) so it follows the active card.
  // Rendered as an absolute overlay (not a border on slideCard) so showing/hiding
  // it never reflows the media inside the card.
  slideFocusRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii.md,        // concentric with slideCard
    borderWidth: stroke.md,        // --sds-size-stroke-focus-ring (2)
    borderColor: colors.borderBrandTertiary, // --sds-color-border-brand-tertiary
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
    backgroundColor: colors.card,
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
  reactionsBtnBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: radii.full,
    backgroundColor: colors.bgInverse,
    justifyContent: "center",
    alignItems: "center",
  },
  reactionsBtnBadgeText: {
    ...textStyles.bodySmall,
    color: colors.textBrandTertiary,
    textAlign: "center",
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
  stickerOverlay: {
    position: "absolute",
    width: 340,
    height: CAROUSEL_HEIGHT,
    overflow: "visible",
    backgroundColor: "transparent",
    zIndex: 15,
  },
});
