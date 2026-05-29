import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Dimensions,
  ViewToken,
  Platform,
} from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
  type SharedValue,
} from "react-native-reanimated";
import * as FileSystem from "expo-file-system/legacy";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Svg, Path } from "react-native-svg";

import CommentModal from "./CommentModal";
import { type ChallengeWithData } from "../lib/challenges";
import ChallengeVotePage from "./groups/ChallengeVotePage";

// Atomic Design Imports
import { PhotoEntry, Reaction } from "../lib/feed-types";
import { PhotoMoment } from "./organisms/PhotoMoment";
import { AudioMoment } from "./organisms/AudioMoment";
import { VideoMoment } from "./organisms/VideoMoment";
import { RevealIntroPage } from "./organisms/RevealIntroPage";
import { CrownRevealPage } from "./organisms/CrownRevealPage";
import { AnimatedPageWrapper } from "./molecules/AnimatedPageWrapper";
import { radii, typography, type ThemeColors } from "../lib/theme";
import { useTheme, useThemedStyles } from "../lib/theme-context";

export { PhotoEntry, Reaction };

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

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
};

function formatDayLabel(dateStr: string) {
  const d = new Date(dateStr);
  const day = d.toLocaleDateString("fr-FR", { weekday: "long" }).toUpperCase();
  const full = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  return { date: dateStr.slice(0, 10), label: `${day}\n${full}` };
}

const AnimatedFlatList = Reanimated.createAnimatedComponent(FlatList) as typeof FlatList<FeedItem>;

export default function PhotoFeed({
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
  onVoteChallenge
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [countdownText, setCountdownText] = useState("");
  const [revealTimeLeft, setRevealTimeLeft] = useState("");
  const [revealMsLeft, setRevealMsLeft] = useState(Infinity);
  const flatListRef = useRef<FlatList>(null);
  const [videoCache, setVideoCache] = useState<Record<string, string>>({});
  
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const [activePhotoOwnerId, setActivePhotoOwnerId] = useState<string | null>(null);

  const openComments = (photoId: string, ownerId?: string) => {
    setActivePhotoId(photoId);
    if (ownerId) setActivePhotoOwnerId(ownerId);
    setCommentModalVisible(true);
  };

  useEffect(() => {
    const videos = photos.filter((p) => p.url && p.image_path.endsWith(".mp4") && p.url.startsWith("http"));
    let cancelled = false;
    videos.forEach(async (p) => {
      const filename = "reveal_" + p.image_path.replace(/\//g, "_");
      const localUri = `${FileSystem.cacheDirectory}${filename}`;
      try {
        const info = await FileSystem.getInfoAsync(localUri);
        if (!info.exists) await FileSystem.downloadAsync(p.url!, localUri);
        if (!cancelled) setVideoCache(prev => ({ ...prev, [p.url!]: localUri }));
      } catch {
        if (!cancelled) setVideoCache(prev => ({ ...prev, [p.url!]: p.url! }));
      }
    });
    return () => { cancelled = true; };
  }, [photos]);

  useEffect(() => {
    const tick = () => {
      const distance = nextUnlockDate.getTime() - Date.now();
      if (distance < 0) { setCountdownText("00:00:00"); return; }
      const d = Math.floor(distance / 86400000);
      const h = Math.floor((distance % 86400000) / 3600000);
      const m = Math.floor((distance % 3600000) / 60000);
      const s = Math.floor((distance % 60000) / 1000);
      setCountdownText(`${d > 0 ? d + "j " : ""}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [nextUnlockDate]);

  useEffect(() => {
    if (!revealEndDate) return;
    const tick = () => {
      const ms = revealEndDate.getTime() - Date.now();
      if (ms <= 0) { setRevealTimeLeft("Expiré"); setRevealMsLeft(0); return; }
      setRevealMsLeft(ms);
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setRevealTimeLeft(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [revealEndDate]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      const idx = viewableItems[0].index;
      setVisibleIndex(idx);
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
    if (crownWinnerId && !hideIntro) result.push({ type: "crown" });
    let lastDate = "";
    let challenge1Inserted = false;
    for (const photo of photos) {
      const photoDay = new Date(photo.created_at).getDay();
      if (!challenge1Inserted && challengePeriod1 && lastDate !== "" && photoDay >= 4) {
        result.push({ type: "challenge_vote", challenge: challengePeriod1, period: 1 });
        challenge1Inserted = true;
      }
      const d = photo.created_at.slice(0, 10);
      if (d !== lastDate && !hideIntro) {
        result.push({ type: "separator", ...formatDayLabel(photo.created_at) });
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
    if (!hideEnd) result.push({ type: "end" });
    return result;
  }, [photos, crownWinnerId, challengePeriod1, challengePeriod2, hideIntro, hideEnd]);

  const renderItem = ({ item, index }: { item: FeedItem; index: number }) => {
    let content: React.ReactNode = null;

    if (item.type === "intro") {
      content = <RevealIntroPage groupName={groupName} isVisible={index === visibleIndex} customTitle={introTitle} customSubtitle={introSubtitle} />;
    } else if (item.type === "crown") {
      const winner = photos.find((p) => p.user_id === crownWinnerId);
      if (!winner) return null;
      content = (
        <CrownRevealPage 
          winner={winner} 
          durationMs={crownDurationMs} 
          currentUserId={currentUserId}
          userDurationMs={currentUserId ? (crownAllDurations[currentUserId] ?? 0) : 0}
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
          onVote={onVoteChallenge ?? (() => {})}
        />
      );
    } else if (item.type === "end") {
      content = (
        <View style={styles.fullscreenPage}>
          <View style={styles.endLogoMark} />
          <Text style={styles.endTitle}>Reveal terminé.</Text>
          <Text style={styles.endSubtitle}>Prochain rewind dans :</Text>
          <Text style={styles.countdownText}>{countdownText}</Text>
        </View>
      );
    } else {
      const moment = item.data;
      const isAudio = moment.image_path.endsWith(".m4a");
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
            onOpenPicker={onOpenPicker} 
            onOpenComments={(pid, oid) => { openComments(pid, oid); onOpenComments?.(pid, oid); }} 
          />
        );
      } else if (isVideo) {
        content = (
          <VideoMoment 
            moment={moment} 
            isVisible={index === visibleIndex} 
            currentUserId={currentUserId} 
            crownWinnerId={crownWinnerId} 
            cachedUrl={videoCache[moment.url] ?? moment.url} 
            onOpenPicker={onOpenPicker} 
            onOpenComments={(pid, oid) => { openComments(pid, oid); onOpenComments?.(pid, oid); }} 
          />
        );
      } else {
        content = (
          <PhotoMoment 
            moment={moment} 
            currentUserId={currentUserId} 
            crownWinnerId={crownWinnerId} 
            onOpenPicker={onOpenPicker} 
            onOpenComments={(pid, oid) => { openComments(pid, oid); onOpenComments?.(pid, oid); }} 
            isVisible={index === visibleIndex} 
          />
        );
      }
    }

    return <AnimatedPageWrapper index={index} scrollY={scrollY}>{content}</AnimatedPageWrapper>;
  };

  return (
    <View style={styles.list}>
      <AnimatedFlatList
        ref={flatListRef}
        data={items}
        renderItem={renderItem}
        keyExtractor={(_, i) => i.toString()}
        pagingEnabled={true}
        snapToInterval={SCREEN_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum={true}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        getItemLayout={(_, i) => ({ length: SCREEN_HEIGHT, offset: SCREEN_HEIGHT * i, index: i })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        windowSize={5}
        maxToRenderPerBatch={2}
        initialNumToRender={2}
        removeClippedSubviews={Platform.OS === "android"}
        overScrollMode="never"
        style={styles.list}
      />
      {revealEndDate && revealTimeLeft !== "" && (
        <View style={[styles.revealCountdownBar, { top: insets.top + 8 }]} pointerEvents="none">
          <View style={[styles.revealCountdownPill, revealMsLeft < 4 * 3600000 && styles.revealCountdownPillRed]}>
            <Svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginRight: 5 }}>
              <Path 
                d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" 
                stroke={revealMsLeft < 4 * 3600000 ? "#FFFFFF" : colors.secondary}
                strokeWidth="2" 
                strokeLinecap="round" 
              />
            </Svg>
            <Text style={[styles.revealCountdownText, revealMsLeft < 4 * 3600000 && styles.revealCountdownTextRed]}>
              {revealTimeLeft}
            </Text>
          </View>
        </View>
      )}
      
      {activePhotoId && activePhotoOwnerId && (
        <CommentModal
          visible={commentModalVisible}
          onClose={() => setCommentModalVisible(false)}
          onSeen={onOpenComments || openComments}
          photoId={activePhotoId}
          photoOwnerId={activePhotoOwnerId}
        />
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.bg },
  fullscreenPage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
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
