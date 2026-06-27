import { useMemo, useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Dimensions,
  ViewToken,
  Platform,
  Share,
  Animated as RNAnimated,
  Easing as RNEasing,
} from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  Easing,
  type SharedValue,
} from "react-native-reanimated";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Svg, Path } from "react-native-svg";

import CommentModal from "./CommentModal";
import { r2Storage } from "../lib/r2";
import { type ChallengeWithData } from "../lib/challenges";
import ChallengeVotePage from "./groups/ChallengeVotePage";

// Atomic Design Imports
import { PhotoEntry, Reaction } from "../lib/feed-types";
import { PhotoMoment } from "./organisms/PhotoMoment";
import { ReactionStickers, type ReactionDisplay } from "./molecules/ReactionStickers";
import { AudioMoment } from "./organisms/AudioMoment";
import { VideoMoment } from "./organisms/VideoMoment";
import { RevealIntroPage } from "./organisms/RevealIntroPage";
import { CrownRevealPage } from "./organisms/CrownRevealPage";
import { RevealEndPage } from "./organisms/RevealEndPage";
import { ReplayIcon } from "./atoms/ReplayIcon";
import { BottomActionBar } from "./molecules/BottomActionBar";
import { AnimatedPageWrapper } from "./molecules/AnimatedPageWrapper";
import { StickerToast } from "./atoms/StickerToast";
import { radii, spacing, typography, type ThemeColors } from "../lib/theme";
import { SHEET_BASE } from "../lib/comment-sheet";
import { useTheme, useThemedStyles, ForceTheme } from "../lib/theme-context";

export { PhotoEntry, Reaction };

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const FEED_HEIGHT = SCREEN_HEIGHT - 100;
// Gap (px) between the bottom of the comment/sticker preview and the top of the drawer.
const PREVIEW_GAP = 24;



export const isEmoji = (str: string) => {
  const regexExp = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/gi;
  return regexExp.test(str);
};

type FeedItem =
  | { type: "intro" }
  | { type: "crown" }
  | { type: "moment"; data: PhotoEntry }
  | { type: "separator"; date: string; label: string }
  | { type: "challenge_vote"; challenge: ChallengeWithData; period: 1 | 2 }
  | { type: "end" };

type Props = {
  photos: PhotoEntry[];
  currentUserId?: string;
  nextUnlockDate: Date;
  revealEndDate?: Date;
  crownWinnerId?: string | null;
  crownDurationMs?: number;
  crownAllDurations?: Record<string, number>;
  groupName?: string;
  introTitle?: string;
  introSubtitle?: string;
  hideIntro?: boolean;
  hideEnd?: boolean;
  onScrollLock?: (locked: boolean) => void;
  onActiveIndexChange?: (index: number) => void;
  onOpenPicker?: (photoId: string) => void;
  onOpenComments?: (photoId: string, ownerId: string) => void;
  challengePeriod1?: ChallengeWithData | null;
  challengePeriod2?: ChallengeWithData | null;
  onVoteChallenge?: (challengeId: string, responseId: string) => void;
  onBackToCapture?: () => void;
  members?: any[];
  currentUserAvatarUrl?: string | null;
  currentUsername?: string;
  onCommentModalChange?: (visible: boolean) => void;
  /** Mode archive : réactions visibles, mais aucune interaction (sticker/commentaire). */
  readOnly?: boolean;
  /** Libellé du bouton de fin (défaut "Retour à la capture"). */
  endPrimaryLabel?: string;
  /** Désactive le cache vidéo local (évite le switch URL distant→local qui relance la vidéo). */
  disableVideoCache?: boolean;
};

function formatDayLabel(dateStr: string) {
  const d = new Date(dateStr);
  const day = d.toLocaleDateString("fr-FR", { weekday: "long" }).toUpperCase();
  const full = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  return { date: dateStr.slice(0, 10), label: `${day}\n${full}` };
}

const AnimatedFlatList = Reanimated.createAnimatedComponent(FlatList) as unknown as typeof FlatList<FeedItem>;

const PhotoFeed = forwardRef((props: Props, ref) => {
  return (
    <ForceTheme mode="Dark">
      <PhotoFeedContent ref={ref} {...props} />
    </ForceTheme>
  );
});

export default PhotoFeed;

const PhotoFeedContent = forwardRef(({
  photos,
  currentUserId,
  nextUnlockDate,
  revealEndDate,
  crownWinnerId,
  crownDurationMs = 0,
  crownAllDurations = {},
  groupName,
  introTitle,
  introSubtitle,
  hideIntro = false,
  hideEnd = false,
  onScrollLock,
  onActiveIndexChange,
  onOpenPicker,
  onOpenComments,
  challengePeriod1,
  challengePeriod2,
  onVoteChallenge,
  onBackToCapture,
  members = [],
  currentUserAvatarUrl,
  currentUsername,
  onCommentModalChange,
  readOnly = false,
  endPrimaryLabel,
  disableVideoCache = false,
}: Props, ref) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [activeChallengeResponsesVisible, setActiveChallengeResponsesVisible] = useState(false);

  useImperativeHandle(ref, () => ({
    scrollToPhoto: (photoId: string, openCommentsSection: boolean = false) => {
      const idx = items.findIndex(item => item.type === "moment" && String(item.data.id) === String(photoId));
      if (idx !== -1) {
        try {
          flatListRef.current?.scrollToOffset({ offset: FEED_HEIGHT * idx, animated: false });
        } catch (e) {
          console.warn("Failed to scroll to photo offset:", e);
          try {
            flatListRef.current?.scrollToIndex({ index: idx, animated: false });
          } catch (err) {
            console.warn("Failed fallback scrollToIndex:", err);
          }
        }
        if (openCommentsSection) {
          const photo = photos.find(p => String(p.id) === String(photoId));
          if (photo) {
            setTimeout(() => {
              openComments(String(photoId), photo.user_id);
            }, 100);
          }
        }
      } else {
        console.warn("[scrollToPhoto] Photo not found in feed items for photoId:", photoId);
      }
    },
  }));

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const [visibleIndex, setVisibleIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  // Map of remote URL → downloaded local file. Kept in a ref (not state): writing it must NOT
  // re-render the feed mid-scroll. A clip already on-screen has locked its source anyway (see
  // VideoMoment); newly mounted items read the current ref value when renderItem runs for them.
  const videoCacheRef = useRef<Record<string, string>>({});
  
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [commentModalMode, setCommentModalMode] = useState<"comment" | "sticker">("comment");
  const [activeModalMode, setActiveModalMode] = useState<"comment" | "sticker">("comment");
  // True while the keyboard is up — reaction stickers hide so they don't clutter
  // the shrunken post while typing.
  const [keyboardActive, setKeyboardActive] = useState(false);
  // Optimistic just-posted sticker, shown popping onto the post the moment the user
  // submits (before the DB round-trip / data refresh). Cleared when the sheet closes;
  // the real reaction then renders via the normal data path.
  const [poppedReaction, setPoppedReaction] = useState<Reaction | null>(null);
  // User id whose reaction is being deleted → its sticker shrinks to 0 before close.
  const [removingReactionUserId, setRemovingReactionUserId] = useState<string | null>(null);
  // Reaction toast shown on the MAIN feed (add/delete feedback). It's a top-of-screen
  // overlay (zIndex 999) so it can fire instantly — even over the open sheet — and it
  // outlives the sheet close.
  const [reactionToast, setReactionToast] = useState<string | null>(null);
  const reactionToastAnim = useRef(new RNAnimated.Value(0)).current;
  const reactionToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onCommentModalChange?.(commentModalVisible);
  }, [commentModalVisible, onCommentModalChange]);

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
  useEffect(() => {
    if (commentModalVisible) return;
    setPoppedReaction(null);
    setRemovingReactionUserId(null);
  }, [commentModalVisible]);

  const handleStickerPosted = useCallback((text: string) => {
    const me = members.find((m: any) => m.user_id === currentUserId);
    // Clear any lingering "removing" flag so a post right after a delete pops in
    // instead of being stuck in the shrink-out state.
    setRemovingReactionUserId(null);
    setPoppedReaction({
      // Unique id per post so the sticker remounts and re-plays its pop animation
      // even when reacting twice in a row without closing the sheet.
      id: `optimistic-${Date.now()}`,
      user_id: currentUserId ?? "",
      username: currentUsername ?? me?.username ?? "",
      avatar_url: currentUserAvatarUrl ?? me?.avatar_url ?? null,
      sticker_id: text,
    } as Reaction);
    showReactionToast("Réaction Ajouté"); // fire immediately (don't wait for close)
  }, [members, currentUserId, currentUsername, currentUserAvatarUrl, showReactionToast]);

  const handleStickerDeleted = useCallback(() => {
    if (currentUserId) setRemovingReactionUserId(currentUserId);
    showReactionToast("Réaction supprimé"); // fire immediately
  }, [currentUserId, showReactionToast]);

  useEffect(() => () => { if (reactionToastTimer.current) clearTimeout(reactionToastTimer.current); }, []);

  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const [activePhotoOwnerId, setActivePhotoOwnerId] = useState<string | null>(null);

  const activePhoto = useMemo(() => photos.find(p => p.id === activePhotoId), [photos, activePhotoId]);

  // Reaction stickers over the open sheet. Kept mounted whenever the sheet is open and
  // there's something to show — so typing a comment doesn't unmount them (they shrink
  // out via `stickersHidden` instead). Null = no stickers (e.g. closed feed).
  const activeReactionDisplay = useMemo<ReactionDisplay | null>(() => {
    if (!activePhoto || !commentModalVisible) return null;
    const base = activePhoto.reactions || [];
    if (poppedReaction) {
      const deduped = base.filter((r) => r.user_id !== poppedReaction.user_id);
      return { reactions: [...deduped, poppedReaction], popId: poppedReaction.id };
    }
    if (base.length > 0) return { reactions: base };
    return null;
  }, [activePhoto, poppedReaction, commentModalVisible]);

  // Hide (shrink) the stickers while typing a comment (comment mode + keyboard up).
  const stickersHidden = activeModalMode === "comment" && keyboardActive;

  // ── Comment-sheet preview scaling ──────────────────────────────────────────
  // Two shared values only:
  //  • kb     — live keyboard height (px), updated frame-by-frame by CommentModal
  //             (it lives in the modal window that owns the keyboard — on Android
  //             the main window never sees it).
  //  • progress — 0 closed → 1 open, a plain timing transition.
  // sheetSV mirrors the sheet height (a couple of discrete values) for the formula.
  const kb = useSharedValue(0);
  const progress = useSharedValue(0);
  const sheetSV = useSharedValue(SHEET_BASE);
  // 1 in sticker mode, 0 in comment mode. In comment mode the preview scale ignores the
  // keyboard (uses the keyboard-down drawer = SHEET_BASE), so the preview keeps its
  // comment-view width and the rising keyboard/sheet just crops its bottom (square-ish).
  const isStickerModeSV = useSharedValue(0);
  useEffect(() => {
    isStickerModeSV.value = withTiming(activeModalMode === "sticker" ? 1 : 0, { duration: 260 });
  }, [activeModalMode]);

  const openComments = (photoId: string, ownerId?: string, mode: "comment" | "sticker" = "comment") => {
    setActivePhotoId(photoId);
    if (ownerId) setActivePhotoOwnerId(ownerId);
    setCommentModalMode(mode);
    setActiveModalMode(mode);
    setCommentModalVisible(true);
  };

  useEffect(() => {
    progress.value = withTiming(commentModalVisible ? 1 : 0, { duration: 250 });
  }, [commentModalVisible]);

  // Scale the post to fit whatever space is left above the drawer (keyboard + sheet),
  // pinned to the top. One formula, transforms only → fluid. `progress` blends from
  // identity (closed) to the fitted scale (open).
  const animatedContentStyle = useAnimatedStyle(() => {
    const liveDrawer = kb.value + sheetSV.value;
    // UNIFORM scale → no distortion, round corners. Comment mode locks the drawer at
    // SHEET_BASE so the preview keeps its comment-view width; sticker mode tracks the
    // live drawer. isStickerModeSV blends 0→1 so toggling modes doesn't jump. The
    // preview top is anchored at the top safe-area inset, and it uses the vertical space
    // from there down to 12px above the drawer.
    const drawerTopX = SHEET_BASE + isStickerModeSV.value * (liveDrawer - SHEET_BASE);
    const availableX = SCREEN_HEIGHT - drawerTopX - insets.top - PREVIEW_GAP;
    // Divide by (FEED_HEIGHT - insets.top): the post's top padding scales too, so this
    // makes the scaled bottom land exactly PREVIEW_GAP above the drawer (real hug).
    const fitX = Math.max(0.05, Math.min(1, availableX / (FEED_HEIGHT - insets.top)));
    const scale = 1 + (fitX - 1) * progress.value;

    // Height is CROPPED via layout (not a vertical scale) so the image isn't squished
    // and the corners stay round. cropRatio 1 = full post, <1 = bottom cropped. Comment
    // mode crops to the live space above the drawer; sticker mode never crops. The
    // (1-scale)*insets.top term cancels the scaled-padding lift so the bottom truly hugs.
    const availableY = SCREEN_HEIGHT - liveDrawer - PREVIEW_GAP - (1 - scale) * insets.top;
    const fullScaledH = FEED_HEIGHT * scale;
    const cropOpen =
      (1 - isStickerModeSV.value) * Math.min(1, availableY / Math.max(fullScaledH, 1)) +
      isStickerModeSV.value * 1;
    const cropRatio = 1 + (cropOpen - 1) * progress.value; // 1 when closed
    const animatedHeight = FEED_HEIGHT * cropRatio;

    // Keep the image top at the SAME place as when closed (the post's own paddingTop is
    // insets.top). This formula accounts for that, so the top never moves on open/close.
    const translateY = (1 - scale) * (insets.top - animatedHeight / 2);

    return {
      height: animatedHeight,
      transform: [{ translateY }, { scale }],
      borderRadius: radii.xxl * progress.value,
      overflow: "hidden",
    };
  });

  // Same transform as the preview, but NOTHING that clips (no overflow/borderRadius).
  // Used by the sticker overlay so reaction stickers can spill past the post edges.
  // Matches the post's WIDTH transform (scaleX). Stickers live on the horizontal edges,
  // so they track the post width; vertical squish only happens while typing, when the
  // stickers are hidden anyway.
  const animatedStickerOverlayStyle = useAnimatedStyle(() => {
    const drawerTopX = SHEET_BASE + isStickerModeSV.value * ((kb.value + sheetSV.value) - SHEET_BASE);
    const available = SCREEN_HEIGHT - drawerTopX - insets.top - PREVIEW_GAP;
    const fit = Math.max(0.05, Math.min(1, available / (FEED_HEIGHT - insets.top)));
    const scale = 1 + (fit - 1) * progress.value;
    // Matches the post's top-anchor (full-height box: stickers only show when uncropped).
    const translateY = (1 - scale) * (insets.top - FEED_HEIGHT / 2);
    return { transform: [{ translateY }, { scale }] };
  });

  // Live preview scale, so stickers can counter-scale and keep a fixed on-screen size.
  const previewScaleSV = useDerivedValue(() => {
    const drawerTopX = SHEET_BASE + isStickerModeSV.value * ((kb.value + sheetSV.value) - SHEET_BASE);
    const available = SCREEN_HEIGHT - drawerTopX - insets.top - PREVIEW_GAP;
    const fit = Math.max(0.05, Math.min(1, available / (FEED_HEIGHT - insets.top)));
    return 1 + (fit - 1) * progress.value;
  });

  useEffect(() => {
    if (disableVideoCache) return;   // lecture directe (read-only) → pas de switch URL distant→local
    const videos = photos.filter((p) => p.url && p.image_path.endsWith(".mp4") && p.url.startsWith("http"));
    let cancelled = false;
    // Download SEQUENTIALLY, not in parallel. Parallel downloads saturate the connection and
    // starve the clip that's currently streaming → it re-buffers and stutters (worst on a
    // return visit, when the downloads are still running). One at a time leaves bandwidth for
    // playback while still warming every clip's local cache for instant, smooth replays.
    (async () => {
      for (const p of videos) {
        if (cancelled) return;
        const filename = "reveal_" + p.image_path.replace(/\//g, "_");
        const localUri = `${FileSystem.cacheDirectory}${filename}`;
        try {
          const info = await FileSystem.getInfoAsync(localUri);
          if (!info.exists) await FileSystem.downloadAsync(p.url!, localUri);
          if (!cancelled) {
            videoCacheRef.current[p.url!] = localUri;
            console.log(`[FEED] video cached LOCAL: ${p.image_path.slice(0, 16)} (was ${info.exists ? "already on disk" : "downloaded"})`);
          }
        } catch (e) {
          if (!cancelled) {
            videoCacheRef.current[p.url!] = p.url!;
            console.log(`[FEED] video cache FAILED, staying remote: ${p.image_path.slice(0, 16)}`, e);
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [photos, disableVideoCache]);

  // Warm expo-image's disk cache for every still (photo + drawing, and the swap target), so
  // scrolling onto one is instant instead of a network fetch + decode happening mid-scroll
  // (the drawing jank). Videos/audio/text are skipped (handled elsewhere / no media).
  useEffect(() => {
    const isStill = (path?: string | null) =>
      !!path && path !== "text_mode" && !path.endsWith(".mp4") && !path.endsWith(".m4a");
    const urls: string[] = [];
    for (const p of photos) {
      if (isStill(p.image_path) && p.url) urls.push(p.url);
      if (isStill(p.second_image_path)) {
        try { urls.push(r2Storage.getPublicUrl(p.second_image_path!)); } catch {}
      }
    }
    if (urls.length) Image.prefetch(urls, { cachePolicy: "disk" }).catch(() => {});
  }, [photos]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      const idx = viewableItems[0].index;
      setVisibleIndex(idx);
      setActiveChallengeResponsesVisible(false);
      onActiveIndexChange?.(idx);
    }
  }, [onActiveIndexChange]);
  
  const viewabilityConfig = useMemo(() => ({ 
    itemVisiblePercentThreshold: 80,
    minimumViewTime: 50 
  }), []);

  const items = useMemo<FeedItem[]>(() => {
    if (photos.length === 0 && !challengePeriod1 && !challengePeriod2) return [];
    const result: FeedItem[] = [];
    if (!hideIntro) result.push({ type: "intro" });
    let lastDate = "";
    let challenge1Inserted = false;
    for (const photo of photos) {
      const photoDay = new Date(photo.created_at).getDay();
      if (!challenge1Inserted && challengePeriod1 && lastDate !== "" && photoDay >= 4) {
        result.push({ type: "challenge_vote", challenge: challengePeriod1, period: 1 });
        challenge1Inserted = true;
      }
      const d = photo.created_at.slice(0, 10);
      if (d !== lastDate) {
        lastDate = d;
      }
      result.push({ type: "moment", data: photo });
    }
    if (!challenge1Inserted && challengePeriod1) {
      result.push({ type: "challenge_vote", challenge: challengePeriod1, period: 1 });
    }
    if (challengePeriod2) {
      result.push({ type: "challenge_vote", challenge: challengePeriod2, period: 2 });
    }
    if (crownWinnerId && !hideEnd) result.push({ type: "crown" });
    if (!hideEnd) result.push({ type: "end" });
    return result;
  }, [photos, crownWinnerId, challengePeriod1, challengePeriod2, hideIntro, hideEnd]);

  const currentItem = useMemo(() => items[visibleIndex] || null, [items, visibleIndex]);
  // Fond plein écran de l'intro (derrière la FlatList + le BottomActionBar) — flou statique
  // identique au filmstrip de transition. La FlatList clippe ses items à FEED_HEIGHT, donc on
  // rend ce fond hors-feed pour qu'il passe vraiment derrière la zone du bouton "Démarrer".
  const introBgUrl = (photos[0] as any)?.video_thumbnail_url ?? photos[0]?.url;

  const postCountTexts = useMemo(() => {
    const texts: Record<number, string> = {};
    const momentItems = items.filter(i => i.type === "moment");
    const total = momentItems.length;
    let count = 0;
    items.forEach((item, idx) => {
      if (item.type === "moment") {
        count++;
        texts[idx] = `${count}/${total}`;
      }
    });
    return texts;
  }, [items]);

  const showBottomSection = useMemo(() => {
    if (!currentItem) return false;
    return (
      currentItem.type === "intro" ||
      currentItem.type === "crown" ||
      currentItem.type === "moment" ||
      currentItem.type === "challenge_vote" ||
      currentItem.type === "end"
    );
  }, [currentItem]);

  const renderItem = ({ item, index }: { item: FeedItem; index: number }) => {
    let content: React.ReactNode = null;

    if (item.type === "intro") {
      content = (
        <RevealIntroPage 
          groupName={groupName} 
          isVisible={index === visibleIndex} 
          customTitle={introTitle} 
          customSubtitle={introSubtitle} 
          firstPhotoUrl={(photos[0] as any)?.video_thumbnail_url ?? photos[0]?.url}
          momentsCount={photos.length}
        />
      );
    } else if (item.type === "crown") {
      const winner = photos.find((p) => p.user_id === crownWinnerId);
      if (!winner) return null;
      const currentUserPhoto = photos.find((p) => p.user_id === currentUserId);
      content = (
        <CrownRevealPage 
          winner={winner} 
          durationMs={crownDurationMs} 
          currentUserId={currentUserId}
          userDurationMs={currentUserId ? (crownAllDurations[currentUserId] ?? 0) : 0}
          currentUserAvatarUrl={currentUserPhoto?.avatar_url}
          currentUsername={currentUserPhoto?.username || "Moi"}
        />
      );
    } else if (item.type === "separator") {
      const [day, date] = item.label.split("\n");
      content = (
        <View style={styles.fullscreenPage}>
          <Text style={styles.separatorDay}>{day}</Text>
          <Text style={styles.separatorDate}>{date}</Text>
        </View>
      );
    } else if (item.type === "challenge_vote") {
      content = (
        <ChallengeVotePage
          challenge={item.challenge}
          period={item.period}
          currentUserId={currentUserId}
          currentUserAvatarUrl={currentUserAvatarUrl}
          currentUsername={currentUsername}
          onVote={onVoteChallenge ?? (() => {})}
          members={members}
          showResponsesModal={index === visibleIndex && activeChallengeResponsesVisible}
          onCloseResponsesModal={() => setActiveChallengeResponsesVisible(false)}
          onCommentModalChange={onCommentModalChange}
        />
      );
    } else if (item.type === "end") {
      content = (
        <RevealEndPage
          photos={photos}
          isVisible={index === visibleIndex}
          firstPhotoUrl={(photos[0] as any)?.video_thumbnail_url ?? photos[0]?.url}
        />
      );
    } else {
      const moment = item.data;
      const isAudio = moment.image_path.endsWith(".m4a") || !!moment.audio_note_path;
      const isVideo = moment.image_path.endsWith(".mp4");

      if (isAudio) {
        content = (
          <AudioMoment 
            moment={moment} 
            isVisible={index === visibleIndex} 
            currentUserId={currentUserId} 
            crownWinnerId={crownWinnerId} 
            onScrollLock={(locked) => { 
              flatListRef.current?.setNativeProps({ scrollEnabled: !locked }); 
              onScrollLock?.(locked); 
            }} 
            onOpenPicker={readOnly ? undefined : onOpenPicker}
            onOpenComments={(pid, oid) => { openComments(pid, oid); onOpenComments?.(pid, oid); }}
            isShrunken={commentModalVisible}
            postCountText={postCountTexts[index]}
          />
        );
      } else if (isVideo) {
        content = (
          <VideoMoment 
            moment={moment} 
            isVisible={index === visibleIndex} 
            currentUserId={currentUserId} 
            crownWinnerId={crownWinnerId} 
            cachedUrl={videoCacheRef.current[moment.url] ?? moment.url}
            onOpenPicker={readOnly ? undefined : onOpenPicker} 
            onOpenComments={(pid, oid) => { openComments(pid, oid); onOpenComments?.(pid, oid); }} 
            isShrunken={commentModalVisible}
            postCountText={postCountTexts[index]}
          />
        );
      } else {
        content = (
          <PhotoMoment
            moment={moment}
            currentUserId={currentUserId}
            crownWinnerId={crownWinnerId}
            onOpenPicker={readOnly ? undefined : onOpenPicker}
            onOpenComments={(pid, oid) => { openComments(pid, oid); onOpenComments?.(pid, oid); }}
            isVisible={index === visibleIndex}
            isShrunken={commentModalVisible}
            postCountText={postCountTexts[index]}
          />
        );
      }
    }

    return <AnimatedPageWrapper index={index} scrollY={scrollY}>{content}</AnimatedPageWrapper>;
  };

  return (
    <View style={styles.list}>
      <Reanimated.View style={[styles.contentWrapper, animatedContentStyle]}>
        {/* Fixed full height so the cropped (shorter) contentWrapper clips it from the
            bottom instead of the FlatList re-fitting the image. */}
        <View style={{ height: FEED_HEIGHT, width: "100%" }}>
          <AnimatedFlatList
            ref={flatListRef}
            data={items}
            renderItem={renderItem}
            extraData={activeReactionDisplay}
            keyExtractor={(_, i) => i.toString()}
            pagingEnabled={true}
            snapToInterval={FEED_HEIGHT}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum={true}
            showsVerticalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
            getItemLayout={(_, i) => ({ length: FEED_HEIGHT, offset: FEED_HEIGHT * i, index: i })}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            windowSize={5}
            maxToRenderPerBatch={2}
            initialNumToRender={2}
            removeClippedSubviews={Platform.OS === "android"}
            overScrollMode="never"
            style={styles.list}
            scrollEnabled={!commentModalVisible}
            keyboardShouldPersistTaps="always"
          />
          {/* Countdown timer pill is now rendered in RevealHeader */}
        </View>
      </Reanimated.View>

      {/* Reaction stickers ride in a sibling overlay that mirrors the preview's
          transform but with overflow VISIBLE, so they can spill past the post's
          horizontal edges (the card/FlatList clip the post, so they can't live inside
          it). Same transform → it tracks the scaled post exactly. */}
      {activeReactionDisplay && (
        <Reanimated.View
          pointerEvents="none"
          style={[styles.stickerOverlay, animatedStickerOverlayStyle]}
        >
          <ReactionStickers
            reactions={activeReactionDisplay.reactions}
            previewScale={previewScaleSV}
            removingUserId={removingReactionUserId}
            hidden={stickersHidden}
          />
        </Reanimated.View>
      )}

      {showBottomSection && currentItem && !commentModalVisible && (() => {
        const item = currentItem;

        if (item.type === "end") {
          return (
            <BottomActionBar
              primaryLabel={endPrimaryLabel ?? "Retour à la capture"}
              onPrimaryPress={() => onBackToCapture?.()}
              secondary={{
                key: "replay-btn",
                icon: <ReplayIcon size={24} color={colors.brand} />,
                onPress: () => {
                  try {
                    flatListRef.current?.scrollToIndex({ index: 0, animated: true });
                  } catch (e) {
                    console.warn("Failed to scroll to start index:", e);
                  }
                },
              }}
            />
          );
        }

        if (item.type === "moment") {
          const moment = item.data;
          return (
            <BottomActionBar
              primaryLabel="Réactions"
              onPrimaryPress={() => openComments(moment.id, moment.user_id)}
              badgeCount={moment?.hasNewComments ? (moment?.newCommentsCount ?? 0) : null}
              secondary={{
                key: "share-btn",
                icon: (
                  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <Path d="M2.75 20V12C2.75 11.3096 3.30964 10.75 4 10.75C4.69036 10.75 5.25 11.3096 5.25 12V20C5.25 20.1989 5.32907 20.3896 5.46973 20.5303C5.61038 20.6709 5.80109 20.75 6 20.75H18C18.1989 20.75 18.3896 20.6709 18.5303 20.5303C18.6709 20.3896 18.75 20.1989 18.75 20V12C18.75 11.3096 19.3096 10.75 20 10.75C20.6904 10.75 21.25 11.3096 21.25 12V20C21.25 20.862 20.9073 21.6884 20.2979 22.2979C19.6884 22.9073 18.862 23.25 18 23.25H6C5.13805 23.25 4.31164 22.9073 3.70215 22.2979C3.09266 21.6884 2.75 20.862 2.75 20ZM10.75 15V5.01758L8.88379 6.88379C8.39563 7.37194 7.60437 7.37194 7.11621 6.88379C6.62806 6.39563 6.62806 5.60437 7.11621 5.11621L11.1162 1.11621L11.2109 1.03027C11.7019 0.629789 12.4261 0.658549 12.8838 1.11621L16.8838 5.11621C17.3719 5.60437 17.3719 6.39563 16.8838 6.88379C16.3956 7.37194 15.6044 7.37194 15.1162 6.88379L13.25 5.01758V15C13.25 15.6904 12.6904 16.25 12 16.25C11.3096 16.25 10.75 15.6904 10.75 15Z" fill="#FF561A"/>
                  </Svg>
                ),
                onPress: async () => {
                  const url = moment?.url;
                  if (!url) return;
                  try {
                    const isAvailable = await Sharing.isAvailableAsync();
                    if (!isAvailable) {
                      Share.share({ url, message: url });
                      return;
                    }
                    // Custom shared name (the share sheet shows the file's
                    // basename). Keep the source extension for media-type detection.
                    // Drawings are stored as PNG bytes under a "_draw.jpg" name, so the
                    // share file must be .png/image-png or the OS can't build a preview.
                    const isDrawing = (moment?.image_path ?? "").includes("_draw");
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
                    // moment, so always overwrite it with the current item's media.
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
                },
              }}
            />
          );
        }

        const primaryLabel =
          item.type === "intro" ? "Démarrer"
          : item.type === "crown" ? "Suivant"
          : item.type === "challenge_vote" ? "Voir les réponses"
          : "Participer au vote";

        // Défi sans aucune réponse → bouton "Voir les réponses" grisé et non cliquable.
        const challengeHasNoResponses =
          item.type === "challenge_vote" && item.challenge.responses.length === 0;

        return (
          <BottomActionBar
            primaryLabel={primaryLabel}
            primaryDisabled={challengeHasNoResponses}
            onPrimaryPress={() => {
              if (item.type === "intro" || item.type === "crown") {
                try {
                  flatListRef.current?.scrollToIndex({ index: visibleIndex + 1, animated: true });
                } catch (e) {
                  console.warn("Failed to scroll to next index:", e);
                }
              } else if (item.type === "challenge_vote") {
                setActiveChallengeResponsesVisible(true);
              }
            }}
          />
        );
      })()}
      
      {activePhotoId && activePhotoOwnerId && (
        <CommentModal
          embedded
          readOnly={readOnly}
          visible={commentModalVisible}
          onClose={() => setCommentModalVisible(false)}
          keyboardHeightShared={kb}
          sheetHeightShared={sheetSV}
          onKeyboardActiveChange={setKeyboardActive}
          onModeChange={(m) => setActiveModalMode(m)}
          onStickerPosted={handleStickerPosted}
          onStickerDeleted={handleStickerDeleted}
          onToast={showReactionToast}
          onSeen={(pid) => {
            if (onOpenComments) {
              onOpenComments(pid, activePhotoOwnerId);
            }
          }}
          photoId={activePhotoId}
          photoOwnerId={activePhotoOwnerId}
          reactions={activePhoto?.reactions || []}
          initialMode={commentModalMode}
          groupMembers={members}
        />
      )}

      {/* Reaction add/delete toast, on the main feed (after the sheet closes). */}
      {reactionToast !== null && (
        <StickerToast message={reactionToast} animValue={reactionToastAnim} topInset={insets.top} onClose={hideReactionToast} />
      )}
    </View>
  );
});

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.bg },
  contentWrapper: {
    height: FEED_HEIGHT,
    backgroundColor: colors.bg,
  },
  // Sticker overlay: same box as contentWrapper, laid over it, so applying the same
  // transform tracks the scaled post. Overflow visible (set inline) lets stickers spill.
  stickerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: FEED_HEIGHT,
    overflow: "visible",
    backgroundColor: "transparent",
  },
  fullscreenPage: {
    width: SCREEN_WIDTH,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
    paddingHorizontal: 12
  },
  separatorDay: {
    fontFamily: typography.family.bold,
    fontSize: typography.size.title,
    color: colors.text,
    textAlign: "center",
    letterSpacing: -2
  },
  separatorDate: {
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    textTransform: "uppercase",
    marginTop: 8
  },
  endLogoMark: {
    width: 32,
    height: 32,
    borderWidth: 2,
    borderColor: colors.text,
    borderRadius: radii.xs,
    marginBottom: 24,
    transform: [{ rotate: "45deg" }]
  },
  endTitle: {
    fontFamily: typography.family.bold,
    fontSize: typography.size.xxl,
    color: colors.text
  },
  endSubtitle: {
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginTop: 8
  },
  countdownText: {
    fontFamily: typography.family.bold,
    fontSize: typography.size.subtitle,
    color: colors.text,
    marginTop: 12,
    letterSpacing: 2
  },
  revealCountdownBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  revealCountdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.opacityLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  revealCountdownPillRed: {
    backgroundColor: 'rgba(255,59,48,0.2)',
    borderColor: 'rgba(255,59,48,0.4)',
  },
  revealCountdownText: {
    color: colors.secondary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
  },
  revealCountdownTextRed: {
    color: '#FFFFFF',
  },
});

