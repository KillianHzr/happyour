import { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Pressable,
  Alert,
} from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { CameraView, useCameraPermissions } from "expo-camera";
import { decode } from "base64-arraybuffer";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../lib/auth-context";
import { sendPushToTokens, getGroupMemberTokens, scheduleImmediateLocalNotification } from "../../../lib/notifications";
import VaultCounter from "../../../components/VaultCounter";
import PhotoFeed, { type PhotoEntry, type Reaction } from "../../../components/PhotoFeed";

function getWeekBounds() {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(20, 0, 0, 0);

  return { monday, sunday };
}

function isVaultUnlocked(): boolean {
  const { sunday } = getWeekBounds();
  return new Date() >= sunday;
}

const EMOJI_OPTIONS = ["❤️", "😂", "😍", "🔥", "😮", "👏"];

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [groupName, setGroupName] = useState("");
  const [photoCount, setPhotoCount] = useState(0);
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [devMode, setDevMode] = useState(false);
  const [viewerPhoto, setViewerPhoto] = useState<PhotoEntry | null>(null);

  // Reaction states
  const [reactingToPhotoId, setReactingToPhotoId] = useState<string | null>(null);
  const [reactionPhotoUrl, setReactionPhotoUrl] = useState<string | null>(null);
  const [showSelfieCamera, setShowSelfieCamera] = useState(false);
  const [capturingSelfie, setCapturingSelfie] = useState(false);
  const selfieRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const unlocked = isVaultUnlocked() || devMode;

  const fetchGroup = async () => {
    const { data } = await supabase
      .from("groups")
      .select("name")
      .eq("id", id)
      .single();
    if (data) setGroupName(data.name);
  };

  const fetchReactions = async (photoIds: string[]): Promise<Map<string, Reaction[]>> => {
    const map = new Map<string, Reaction[]>();
    if (photoIds.length === 0) return map;

    const { data, error } = await supabase
      .from("reactions")
      .select("id, photo_id, user_id, type, emoji, image_path")
      .in("photo_id", photoIds);

    if (error || !data) {
      console.error("fetchReactions error:", error);
      return map;
    }

    // Fetch usernames for all reaction authors
    const userIds = [...new Set(data.map((r: any) => r.user_id))];
    const usernameMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", userIds);
      for (const p of profiles ?? []) {
        usernameMap.set(p.id, p.username);
      }
    }

    for (const r of data as any[]) {
      const reaction: Reaction = {
        id: r.id,
        user_id: r.user_id,
        username: usernameMap.get(r.user_id) ?? "Anonyme",
        type: r.type,
        emoji: r.emoji ?? undefined,
        image_url: r.image_path
          ? supabase.storage.from("moments").getPublicUrl(r.image_path).data.publicUrl
          : undefined,
      };

      const list = map.get(r.photo_id) ?? [];
      list.push(reaction);
      map.set(r.photo_id, list);
    }

    return map;
  };

  const fetchPhotos = async (isUnlocked: boolean) => {
    const { monday } = getWeekBounds();
    const { data, error } = await supabase
      .from("photos")
      .select("id, image_path, created_at, note, user_id, profiles:user_id(username)")
      .eq("group_id", id)
      .gte("created_at", monday.toISOString())
      .order("created_at", { ascending: true });

    if (!error && data) {
      setPhotoCount(data.length);
      if (isUnlocked) {
        const photoIds = data.map((p: any) => p.id);
        const reactionsMap = await fetchReactions(photoIds);

        const entries: PhotoEntry[] = data.map((p: any) => {
          const { data: urlData } = supabase.storage
            .from("moments")
            .getPublicUrl(p.image_path);
          return {
            id: p.id,
            url: urlData.publicUrl,
            created_at: p.created_at,
            note: p.note ?? null,
            username: p.profiles?.username ?? "Anonyme",
            reactions: reactionsMap.get(p.id) ?? [],
          };
        });
        setPhotos(entries);
      } else {
        setPhotos([]);
      }
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchGroup();
      fetchPhotos(unlocked);
    }, [id, unlocked])
  );

  // ── Reaction handlers ──

  const handleEmojiReaction = async (emoji: string) => {
    if (!reactingToPhotoId || !user) return;

    const { error } = await supabase.from("reactions").upsert(
      {
        photo_id: reactingToPhotoId,
        user_id: user.id,
        type: "emoji",
        emoji,
        image_path: null,
      },
      { onConflict: "photo_id,user_id" }
    );

    if (error) {
      Alert.alert("Erreur", error.message);
      return;
    }

    setReactingToPhotoId(null);
    fetchPhotos(unlocked);
  };

  const handleSelfieCapturePress = async () => {
    if (!cameraPermission?.granted) {
      await requestCameraPermission();
      return;
    }
    setShowSelfieCamera(true);
  };

  const handleCaptureSelfie = async () => {
    if (!selfieRef.current || !reactingToPhotoId || !user) return;
    setCapturingSelfie(true);

    try {
      const photo = await selfieRef.current.takePictureAsync({ quality: 0.7, base64: true });
      if (!photo?.base64) throw new Error("Pas de photo capturée.");

      const filePath = `reactions/${reactingToPhotoId}/${user.id}.jpg`;

      const { error: uploadErr } = await supabase.storage
        .from("moments")
        .upload(filePath, decode(photo.base64), {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadErr) throw uploadErr;

      const { error: insertErr } = await supabase.from("reactions").upsert(
        {
          photo_id: reactingToPhotoId,
          user_id: user.id,
          type: "photo",
          emoji: null,
          image_path: filePath,
        },
        { onConflict: "photo_id,user_id" }
      );

      if (insertErr) throw insertErr;

      setShowSelfieCamera(false);
      setReactingToPhotoId(null);
      fetchPhotos(unlocked);
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setCapturingSelfie(false);
    }
  };

  // ── Vault verrouillé ──
  if (!unlocked) {
    return (
      <ScrollView style={styles.lockedContainer} contentContainerStyle={styles.lockedContent}>
        <Text style={styles.title}>{groupName}</Text>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push(`/(app)/groups/${id}/camera`)}
          >
            <Text style={styles.actionText}>Capturer un moment</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.outlineBtn]}
            onPress={() => router.push(`/(app)/groups/${id}/invite`)}
          >
            <Text style={styles.outlineText}>Inviter</Text>
          </TouchableOpacity>
        </View>

        <VaultCounter count={photoCount} />

        <TouchableOpacity
          style={[styles.devToggle, devMode && styles.devToggleActive]}
          onPress={() => setDevMode((p) => !p)}
        >
          <Text style={[styles.devToggleText, devMode && styles.devToggleTextActive]}>
            Simuler Dimanche 20h
          </Text>
        </TouchableOpacity>

      </ScrollView>
    );
  }

  // ── Vault déverrouillé — layout plein écran ──
  return (
    <View style={styles.fullContainer}>
      {/* Header flottant translucide */}
      <View style={styles.floatingHeader}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {groupName}
        </Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.push(`/(app)/groups/${id}/camera`)}
          >
            <Text style={styles.headerBtnText}>📷</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.push(`/(app)/groups/${id}/invite`)}
          >
            <Text style={styles.headerBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Feed TikTok */}
      <PhotoFeed
        photos={photos}
        onPhotoPress={setViewerPhoto}
        onReactPress={setReactingToPhotoId}
        onReactionPhotoPress={setReactionPhotoUrl}
      />

      {/* Dev toggle flottant */}
      <View style={styles.floatingDevArea}>
        <TouchableOpacity
          style={styles.floatingDevToggle}
          onPress={() => setDevMode((p) => !p)}
        >
          <Text style={styles.floatingDevText}>
            {devMode ? "Mode dev ON" : "Dev"}
          </Text>
        </TouchableOpacity>

        {devMode && (
          <View style={styles.floatingDevBtns}>
            <TouchableOpacity
              style={styles.floatingDevBtn}
              onPress={async () => {
                const tokens = await getGroupMemberTokens(id!);
                await sendPushToTokens(tokens, groupName, "Test: nouvelle photo dans le groupe");
                Alert.alert("Envoyé", "Notif photo simulée");
              }}
            >
              <Text style={styles.floatingDevBtnText}>Notif photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.floatingDevBtn}
              onPress={async () => {
                await scheduleImmediateLocalNotification(
                  "Le coffre est ouvert !",
                  `Les moments de "${groupName}" sont disponibles`
                );
                Alert.alert("Envoyé", "Notif récap simulée");
              }}
            >
              <Text style={styles.floatingDevBtnText}>Notif récap</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.floatingDevBtn}
              onPress={async () => {
                const tokens = await getGroupMemberTokens(id!);
                await sendPushToTokens(tokens, "Nouvelle invitation !", `Tu as été invité à rejoindre "${groupName}"`);
                Alert.alert("Envoyé", "Notif invitation simulée");
              }}
            >
              <Text style={styles.floatingDevBtnText}>Notif invite</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Modal viewer plein écran (photo du feed) */}
      <Modal
        visible={viewerPhoto !== null}
        animationType="fade"
        transparent={false}
        onRequestClose={() => setViewerPhoto(null)}
      >
        <View style={styles.viewerContainer}>
          {viewerPhoto && (
            <Image
              source={{ uri: viewerPhoto.url }}
              style={StyleSheet.absoluteFillObject}
              contentFit="contain"
              transition={200}
            />
          )}
          <Pressable
            style={styles.viewerClose}
            onPress={() => setViewerPhoto(null)}
          >
            <Text style={styles.viewerCloseText}>Fermer</Text>
          </Pressable>
        </View>
      </Modal>

      {/* Modal picker réaction (emoji + selfie) */}
      <Modal
        visible={reactingToPhotoId !== null}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setReactingToPhotoId(null);
          setShowSelfieCamera(false);
        }}
      >
        <Pressable
          style={styles.reactionModalBackdrop}
          onPress={() => {
            setReactingToPhotoId(null);
            setShowSelfieCamera(false);
          }}
        >
          <Pressable style={styles.reactionModalContent}>
            {!showSelfieCamera ? (
              <>
                <Text style={styles.reactionModalTitle}>Réagir</Text>
                <View style={styles.emojiGrid}>
                  {EMOJI_OPTIONS.map((emoji) => (
                    <Pressable
                      key={emoji}
                      style={styles.emojiButton}
                      onPress={() => handleEmojiReaction(emoji)}
                    >
                      <Text style={styles.emojiText}>{emoji}</Text>
                    </Pressable>
                  ))}
                </View>
                <TouchableOpacity
                  style={styles.selfieButton}
                  onPress={handleSelfieCapturePress}
                >
                  <Text style={styles.selfieButtonText}>📸 Prendre un selfie</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.selfieCameraContainer}>
                <CameraView
                  ref={selfieRef}
                  style={styles.selfieCamera}
                  facing="front"
                />
                <View style={styles.selfieCameraActions}>
                  <TouchableOpacity
                    style={styles.selfieCaptureBtn}
                    onPress={handleCaptureSelfie}
                    disabled={capturingSelfie}
                  >
                    <View style={styles.selfieCaptureInner} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.selfieCancelBtn}
                    onPress={() => setShowSelfieCamera(false)}
                  >
                    <Text style={styles.selfieCancelText}>Annuler</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal viewer selfie-réaction plein écran */}
      <Modal
        visible={reactionPhotoUrl !== null}
        animationType="fade"
        transparent={false}
        onRequestClose={() => setReactionPhotoUrl(null)}
      >
        <View style={styles.viewerContainer}>
          {reactionPhotoUrl && (
            <Image
              source={{ uri: reactionPhotoUrl }}
              style={StyleSheet.absoluteFillObject}
              contentFit="contain"
              transition={200}
            />
          )}
          <Pressable
            style={styles.viewerClose}
            onPress={() => setReactionPhotoUrl(null)}
          >
            <Text style={styles.viewerCloseText}>Fermer</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Locked layout ──
  lockedContainer: { flex: 1, backgroundColor: "#fff" },
  lockedContent: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 100 },
  title: { fontFamily: "Inter_700Bold", fontSize: 28, marginBottom: 20 },
  actions: { flexDirection: "row", gap: 12, marginBottom: 24 },
  actionBtn: {
    flex: 1,
    backgroundColor: "#000",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  actionText: { fontFamily: "Inter_600SemiBold", color: "#fff", fontSize: 14 },
  outlineBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#000",
  },
  outlineText: { fontFamily: "Inter_600SemiBold", color: "#000", fontSize: 14 },
  devToggle: {
    marginTop: 32,
    borderWidth: 2,
    borderColor: "#ccc",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderStyle: "dashed",
  },
  devToggleActive: { borderColor: "#000", backgroundColor: "#000" },
  devToggleText: { fontFamily: "Inter_600SemiBold", color: "#999", fontSize: 14 },
  devToggleTextActive: { color: "#fff" },

  // ── Unlocked fullscreen layout ──
  fullContainer: { flex: 1, backgroundColor: "#000" },

  floatingHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  backArrow: {
    fontSize: 24,
    color: "#fff",
    marginRight: 12,
  },
  headerTitle: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: "#fff",
  },
  headerActions: { flexDirection: "row", gap: 12 },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerBtnText: { fontSize: 16, color: "#fff" },

  // ── Floating dev area ──
  floatingDevArea: {
    position: "absolute",
    bottom: 40,
    right: 20,
    zIndex: 10,
    alignItems: "flex-end",
    gap: 8,
  },
  floatingDevToggle: {
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  floatingDevText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#fff",
  },
  floatingDevBtns: {
    gap: 6,
    alignItems: "flex-end",
  },
  floatingDevBtn: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  floatingDevBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#fff",
  },

  // ── Viewer modal ──
  viewerContainer: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  viewerClose: {
    position: "absolute",
    top: 56,
    right: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  viewerCloseText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },

  // ── Reaction picker modal ──
  reactionModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  reactionModalContent: {
    backgroundColor: "#1a1a1a",
    borderRadius: 20,
    padding: 24,
    width: "85%",
    alignItems: "center",
  },
  reactionModalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: "#fff",
    marginBottom: 20,
  },
  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginBottom: 20,
  },
  emojiButton: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  emojiText: {
    fontSize: 28,
  },
  selfieButton: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: "100%",
    alignItems: "center",
  },
  selfieButtonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },

  // ── Selfie camera inside modal ──
  selfieCameraContainer: {
    width: "100%",
    alignItems: "center",
  },
  selfieCamera: {
    width: 250,
    height: 250,
    borderRadius: 125,
    overflow: "hidden",
  },
  selfieCameraActions: {
    marginTop: 20,
    alignItems: "center",
    gap: 12,
  },
  selfieCaptureBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  selfieCaptureInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#fff",
  },
  selfieCancelBtn: {
    paddingVertical: 8,
  },
  selfieCancelText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#888",
  },
});
