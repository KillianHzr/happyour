import { useEffect, useRef, useState } from "react";
import { Animated, BackHandler, Dimensions, Easing, Modal, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { supabase } from "../../lib/supabase";
import { r2Storage } from "../../lib/r2";
import { mediaCache } from "../../lib/media-cache";
import { computeCrownWinner } from "../../lib/crown";
import { ForceTheme, useTheme } from "../../lib/theme-context";
import EdgeSwipeBack from "../EdgeSwipeBack";
import PhotoFeed, { type PhotoEntry, type Reaction } from "../PhotoFeed";
import { RevealHeader } from "../organisms/RevealHeader";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type Member = { user_id: string; username: string; avatar_url?: string | null };

export type ArchiveRevealMeta = {
  number: number;
  start: Date;
  end: Date;
  numberLabel: string;   // "Reveal 07"
  dateLabel: string;     // "25/05 - 31/05"
};

type Props = {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  members: Member[];
  currentUserId?: string;
  currentUsername?: string;
  currentUserAvatarUrl?: string | null;
  groupName?: string;
  reveal: ArchiveRevealMeta | null;
};

export default function ArchiveRevealView({
  visible, onClose, groupId, members, currentUserId, currentUsername, currentUserAvatarUrl, groupName, reveal,
}: Props) {
  const { colors } = useTheme();
  const [mounted, setMounted] = useState(visible);
  const sheetAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [crown, setCrown] = useState<{ winnerId: string | null; durationMs: number; allDurations: Record<string, number> }>({ winnerId: null, durationMs: 0, allDurations: {} });

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

  // ── Retour Android ──
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { onClose(); return true; });
    return () => sub.remove();
  }, [visible, onClose]);

  // ── Chargement des moments de la fenêtre du reveal archivé ──
  useEffect(() => {
    if (!visible || !reveal || !groupId) return;
    let cancelled = false;
    (async () => {
      await mediaCache.load();
      const { data: photosRes } = await supabase
        .from("photos")
        .select("id, image_path, second_image_path, audio_note_path, waveform, caption_waveform, created_at, note, user_id, video_thumbnail_path, second_video_thumbnail_path, profiles:user_id(username, avatar_url)")
        .eq("group_id", groupId)
        .gte("created_at", reveal.start.toISOString())
        .lt("created_at", reveal.end.toISOString())
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
            id: r.id,
            user_id: r.user_id,
            username: member?.username ?? "Anonyme",
            avatar_url: member?.avatar_url ?? null,
            sticker_id: r.emoji,
            created_at: r.created_at,
          } as any);
        }
      }

      const built = rows.map((p: any) => {
        const r2Url = p.image_path === "text_mode" ? "" : r2Storage.getPublicUrl(p.image_path);
        const url = mediaCache.getLocalUri(p.image_path) ?? r2Url;
        const videoThumbnailUrl = p.video_thumbnail_path ? (mediaCache.getLocalUri(p.video_thumbnail_path) ?? r2Storage.getPublicUrl(p.video_thumbnail_path)) : null;
        const secondVideoThumbnailUrl = p.second_video_thumbnail_path ? (mediaCache.getLocalUri(p.second_video_thumbnail_path) ?? r2Storage.getPublicUrl(p.second_video_thumbnail_path)) : null;
        return {
          id: p.id,
          url,
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

      const c = computeCrownWinner(built, reveal.start, reveal.end);
      if (!cancelled) {
        setPhotos(built);
        setCrown({ winnerId: c?.winnerId ?? null, durationMs: c?.durationMs ?? 0, allDurations: c?.allDurations ?? {} });
      }
    })();
    return () => { cancelled = true; };
  }, [visible, reveal, groupId, members]);

  if (!mounted || !reveal) return null;

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ForceTheme mode="Dark">
          <Animated.View style={[StyleSheet.absoluteFillObject, { transform: [{ translateX: sheetAnim }] }]}>
            <EdgeSwipeBack style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.bg }]} onBack={closeImmediate}>
              <PhotoFeed
                photos={photos}
                currentUserId={currentUserId}
                members={members}
                nextUnlockDate={reveal.end}
                revealEndDate={reveal.end}
                crownWinnerId={crown.winnerId}
                crownDurationMs={crown.durationMs}
                crownAllDurations={crown.allDurations}
                groupName={groupName}
                currentUserAvatarUrl={currentUserAvatarUrl ?? null}
                currentUsername={currentUsername}
                introTitle="ARCHIVE"
                introSubtitle={`du ${reveal.numberLabel.toLowerCase()}`}
                endPrimaryLabel="Fermer l'archive"
                onBackToCapture={onClose}
                readOnly
                disableVideoCache
                onScrollLock={() => {}}
                onCommentModalChange={() => {}}
              />
              <RevealHeader
                onClose={onClose}
                countdownText=""
                revealMsLeft={Infinity}
                participants={[]}
                archive={{ numberLabel: reveal.numberLabel, dateLabel: reveal.dateLabel }}
              />
            </EdgeSwipeBack>
          </Animated.View>
        </ForceTheme>
      </GestureHandlerRootView>
    </Modal>
  );
}
