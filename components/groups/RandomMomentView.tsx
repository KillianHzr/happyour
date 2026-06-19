import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, BackHandler, Dimensions, Easing, Modal,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, Easing as REasing } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { supabase } from "../../lib/supabase";
import { r2Storage } from "../../lib/r2";
import { mediaCache } from "../../lib/media-cache";
import { spacing, radii, textStyles, buildColors, type ThemeColors } from "../../lib/theme";
import { ForceTheme } from "../../lib/theme-context";
import EdgeSwipeBack from "../EdgeSwipeBack";
import PhotoFeed, { type PhotoEntry, type Reaction } from "../PhotoFeed";
import Icon from "../Icon";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const darkColors = buildColors("Dark");

type Member = { user_id: string; username: string; avatar_url?: string | null };

type Props = {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  members: Member[];
  currentUserId?: string;
  currentUsername?: string;
  currentUserAvatarUrl?: string | null;
  groupName?: string;
};

function pickDifferent(current: number, n: number): number {
  if (n <= 1) return 0;
  let next = Math.floor(Math.random() * n);
  while (next === current) next = Math.floor(Math.random() * n);
  return next;
}

export default function RandomMomentView({
  visible, onClose, groupId, members, currentUserId, currentUsername, currentUserAvatarUrl, groupName,
}: Props) {
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(darkColors), []);

  const [mounted, setMounted] = useState(visible);
  const sheetAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  const [moments, setMoments] = useState<PhotoEntry[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  // Anim de changement de moment (fondu + léger zoom)
  const fade = useSharedValue(1);
  const scale = useSharedValue(1);
  const momentStyle = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ scale: scale.value }] }));

  // ── Slide in / out ──
  useEffect(() => {
    if (visible) {
      setMounted(true);
      sheetAnim.setValue(SCREEN_WIDTH);
      requestAnimationFrame(() => {
        Animated.timing(sheetAnim, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      });
    } else if (mounted) {
      Animated.timing(sheetAnim, { toValue: SCREEN_WIDTH, duration: 250, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeImmediate = () => { setMounted(false); onClose(); };

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { onClose(); return true; });
    return () => sub.remove();
  }, [visible, onClose]);

  // ── Chargement de tous les moments du groupe (depuis toujours) ──
  useEffect(() => {
    if (!visible || !groupId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      await mediaCache.load();
      const { data: photosRes } = await supabase
        .from("photos")
        .select("id, image_path, second_image_path, audio_note_path, waveform, caption_waveform, created_at, note, user_id, video_thumbnail_path, second_video_thumbnail_path, profiles:user_id(username, avatar_url)")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true });

      const rows = photosRes ?? [];
      const photoIds = rows.map((p: any) => p.id);

      const reactionsByPhoto: Record<string, Reaction[]> = {};
      if (photoIds.length > 0) {
        const { data: rx } = await supabase
          .from("reactions")
          .select("id, photo_id, user_id, emoji, created_at")
          .in("photo_id", photoIds);
        for (const r of rx ?? []) {
          const member = members.find((m) => m.user_id === r.user_id);
          (reactionsByPhoto[r.photo_id] ??= []).push({
            id: r.id, user_id: r.user_id,
            username: member?.username ?? "Anonyme",
            avatar_url: member?.avatar_url ?? null,
            sticker_id: r.emoji, created_at: r.created_at,
          } as any);
        }
      }

      const built = rows.map((p: any) => {
        const r2Url = p.image_path === "text_mode" ? "" : r2Storage.getPublicUrl(p.image_path);
        const url = mediaCache.getLocalUri(p.image_path) ?? r2Url;
        const videoThumbnailUrl = p.video_thumbnail_path ? (mediaCache.getLocalUri(p.video_thumbnail_path) ?? r2Storage.getPublicUrl(p.video_thumbnail_path)) : null;
        const secondVideoThumbnailUrl = p.second_video_thumbnail_path ? (mediaCache.getLocalUri(p.second_video_thumbnail_path) ?? r2Storage.getPublicUrl(p.second_video_thumbnail_path)) : null;
        return {
          id: p.id, url,
          fallback_url: p.image_path === "text_mode" ? undefined : supabase.storage.from("moments").getPublicUrl(p.image_path).data.publicUrl,
          created_at: p.created_at,
          note: p.note ?? null,
          username: p.profiles?.username ?? "Anonyme",
          avatar_url: p.profiles?.avatar_url,
          image_path: p.image_path,
          second_image_path: p.second_image_path ?? null,
          second_note: p.second_note ?? null,
          audio_note_path: p.audio_note_path ?? null,
          waveform: p.waveform ?? null,
          caption_waveform: p.caption_waveform ?? null,
          user_id: p.user_id,
          reactions: reactionsByPhoto[p.id] ?? [],
          hasNewComments: false,
          newCommentsCount: 0,
          video_thumbnail_path: p.video_thumbnail_path ?? null,
          second_video_thumbnail_path: p.second_video_thumbnail_path ?? null,
          video_thumbnail_url: videoThumbnailUrl,
          second_video_thumbnail_url: secondVideoThumbnailUrl,
        } as PhotoEntry;
      });

      if (!cancelled) {
        setMoments(built);
        setIdx(built.length > 0 ? Math.floor(Math.random() * built.length) : 0);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, groupId, members]);

  const applyNext = (next: number) => {
    setIdx(next);
    fade.value = withTiming(1, { duration: 240, easing: REasing.out(REasing.cubic) });
    scale.value = withTiming(1, { duration: 240, easing: REasing.out(REasing.cubic) });
  };

  const reshuffle = () => {
    if (moments.length <= 1) return;
    const next = pickDifferent(idx, moments.length);
    fade.value = withTiming(0, { duration: 160, easing: REasing.in(REasing.quad) });
    scale.value = withTiming(0.96, { duration: 160 }, (fin) => {
      if (fin) runOnJS(applyNext)(next);
    });
  };

  if (!mounted) return null;

  const current = moments[idx] ?? null;

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ForceTheme mode="Dark">
          <Animated.View style={[StyleSheet.absoluteFillObject, { transform: [{ translateX: sheetAnim }] }]}>
            <EdgeSwipeBack style={[StyleSheet.absoluteFillObject, { backgroundColor: darkColors.bg }]} onBack={closeImmediate}>
              {/* Le moment (fondu + zoom au changement) */}
              <Reanimated.View style={[StyleSheet.absoluteFillObject, momentStyle]}>
                {current && (
                  <PhotoFeed
                    key={current.id}
                    photos={[current]}
                    currentUserId={currentUserId}
                    members={members}
                    nextUnlockDate={new Date()}
                    groupName={groupName}
                    currentUserAvatarUrl={currentUserAvatarUrl ?? null}
                    currentUsername={currentUsername}
                    hideIntro
                    hideEnd
                    readOnly
                    disableVideoCache
                    onScrollLock={() => {}}
                    onCommentModalChange={() => {}}
                  />
                )}
              </Reanimated.View>

              {/* Loader */}
              {loading && (
                <View style={styles.loaderWrap} pointerEvents="none">
                  <ActivityIndicator color={darkColors.text} />
                </View>
              )}

              {/* Header : bouton fermer + bouton Relancer */}
              <View style={[styles.topBar, { paddingTop: insets.top + spacing.lg }]}>
                <TouchableOpacity style={styles.iconBtn} onPress={onClose} activeOpacity={0.7}>
                  <Icon name="chevron-left" size={20} color={darkColors.text} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.relancerBtn} onPress={reshuffle} activeOpacity={0.85}>
                  <Text style={styles.relancerText}>Relancer</Text>
                  <Icon name="shuffle" size={20} color={darkColors.iconFix} />
                </TouchableOpacity>
                <View style={{ width: 40 }} />
              </View>
            </EdgeSwipeBack>
          </Animated.View>
        </ForceTheme>
      </GestureHandlerRootView>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  loaderWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.opacityLight,
    justifyContent: "center",
    alignItems: "center",
  },
  relancerBtn: {
    flexDirection: "row",
    padding: spacing.sm,            // space/200
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.brand,
    borderRadius: radii.sm,         // radius/200
  },
  relancerText: {
    ...textStyles.singleLineBodyBaseStrong,
    color: colors.textFix,
  },
});
