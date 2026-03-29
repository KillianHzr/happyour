import { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  ScrollView,
  FlatList,
  Modal,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { CameraView, CameraType, FlashMode } from "expo-camera";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { decode } from "base64-arraybuffer";
import { supabase } from "../../../lib/supabase";
import { r2Storage } from "../../../lib/r2";
import { useAuth } from "../../../lib/auth-context";
import { colors, theme } from "../../../lib/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, Circle } from "react-native-svg";
import { scheduleImmediateLocalNotification, cancelAllRecapNotifications } from "../../../lib/notifications";
import { setCaptureData } from "../../../lib/capture-store";
import { notifyNewPhoto } from "../../../lib/notifications";
import { useUpload } from "../../../lib/upload-context";
import { useToast } from "../../../lib/toast-context";

// Components
import VaultCounter from "../../../components/VaultCounter";
import PhotoFeed, { type PhotoEntry, type Reaction } from "../../../components/PhotoFeed";
import { type StickerId } from "../../../components/stickers";
import Loader from "../../../components/Loader";
import StandardCamera from "../../../components/StandardCamera";
import { ProfileIcon, VaultIcon, MomentIcon } from "../../../components/icons";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const NAVBAR_HEIGHT = 100;

// Icons
const GroupIcon = ({ color = "#ffffff" }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0178 6.12226 19.0382 7.02425C19.0587 7.92624 18.7927 8.81409 18.2772 9.56129C17.7617 10.3085 17.0212 10.8791 16.16 11.19M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

const GroupAddIcon = ({ color = "#ffffff" }) => (
  <Svg width="24" height="24" viewBox="0 -960 960 960">
    <Path d="M500-482q29-32 44.5-73t15.5-85q0-44-15.5-85T500-798q60 8 100 53t40 105q0 60-40 105t-100 53Zm220 322v-120q0-36-16-68.5T662-406q51 18 94.5 46.5T800-280v120h-80Zm80-280v-80h-80v-80h80v-80h80v80h80v80h-80v80h-80Zm-593-87q-47-47-47-113t47-113q47-47 113-47t113 47q47 47 47 113t-47 113q-47 47-113 47t-113-47ZM0-160v-112q0-34 17.5-62.5T64-378q62-31 126-46.5T320-440q66 0 130 15.5T576-378q29 15 46.5 43.5T640-272v112H0Zm320-400q33 0 56.5-23.5T400-640q0-33-23.5-56.5T320-720q-33 0-56.5 23.5T240-640q0 33 23.5 56.5T320-560ZM80-240h480v-32q0-11-5.5-20T540-306q-54-27-109-40.5T320-360q-56 0-111 13.5T100-306q-9 5-14.5 14T80-272v32Zm240-400Zm0 400Z" fill={color}/>
  </Svg>
);

const SendIcon = ({ color = "#000" }) => (
  <Svg width="28" height="28" viewBox="0 0 24 24" fill="none">
    <Path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

const FeatherIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h3.5l6.74-6.74z" />
    <Path d="M16 8L2 22" />
    <Path d="M17.5 15H9" />
  </Svg>
);

const FlipIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </Svg>
);

const CloseIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);

const FlashIcon = ({ mode }: { mode: FlashMode }) => {
  const color = mode === 'off' ? 'rgba(255,255,255,0.4)' : '#FFF';
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      {mode === 'off' && <Path d="M2 2l20 20" />}
      {mode === 'auto' && <Circle cx="18" cy="6" r="3" stroke="#FFF" strokeWidth="1" />}
    </Svg>
  );
};

// revealDayOfWeek : jour JS (0=dimanche, 1=lundi … 6=samedi)
function getWeekBounds(revealDayOfWeek = 0, revealHour = 20) {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const daysFromMonday = revealDayOfWeek === 0 ? 6 : revealDayOfWeek - 1;
  const revealDate = new Date(monday);
  revealDate.setDate(monday.getDate() + daysFromMonday);
  revealDate.setHours(revealHour, 0, 0, 0);
  const prevRevealDate = new Date(revealDate);
  prevRevealDate.setDate(revealDate.getDate() - 7);
  return { monday, revealDate, prevRevealDate };
}

type CameraMode = "PHOTO" | "VIDEO" | "TEXTE";

export default function MainPagerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { startUpload } = useUpload();
  const { showToast } = useToast();
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  
  const scrollX = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const scrollRef = useRef<Animated.ScrollView>(null);

  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  const [userPhotoCount, setUserPhotoCount] = useState(0);
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1); 
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // -- Camera State --
  const cameraRef = useRef<CameraView>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>("PHOTO");
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [zoom, setZoom] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isPinching, setIsPinching] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimer = useRef<NodeJS.Timeout | null>(null);
  const startTouchY = useRef<number | null>(null);

  const [capturing, setCapturing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [textModeContent, setTextModeContent] = useState("");
  const [note, setNote] = useState("");

  const [debugUnlocked, setDebugUnlocked] = useState(false);
  const [revealConfig, setRevealConfig] = useState({ day: 0, hour: 20 });
  const { revealDate } = getWeekBounds(revealConfig.day, revealConfig.hour);
  const unlocked = __DEV__ ? debugUnlocked : new Date() >= revealDate;

  const fetchData = useCallback(async () => {
    if (!user || !id) return;
    try {
      const { data: cfgRows } = await supabase
        .from("app_config")
        .select("key, value")
        .in("key", ["reveal_day", "reveal_hour"]);
      const cfgMap = Object.fromEntries((cfgRows ?? []).map((r: any) => [r.key, Number(r.value)]));
      const cfg = { reveal_day: cfgMap["reveal_day"] ?? 0, reveal_hour: cfgMap["reveal_hour"] ?? 20 };
      setRevealConfig({ day: cfg.reveal_day, hour: cfg.reveal_hour });
      const { revealDate: currentRevealDate, prevRevealDate } = getWeekBounds(cfg.reveal_day, cfg.reveal_hour);

      const [groupRes, profileRes, photosRes, membersRes] = await Promise.all([
        supabase.from("groups").select("name").eq("id", id).single(),
        supabase.from("profiles").select("username, avatar_url, email").eq("id", user.id).single(),
        supabase.from("photos")
          .select("id, image_path, created_at, note, user_id, profiles:user_id(username, avatar_url)")
          .eq("group_id", id)
          .gte("created_at", prevRevealDate.toISOString())
          .lt("created_at", currentRevealDate.toISOString())
          .order("created_at", { ascending: true }),
        supabase.from("group_members").select("user_id, role, profiles:user_id(username, avatar_url)").eq("group_id", id)
      ]);

      if (groupRes.data) setGroupName(groupRes.data.name);
      if (profileRes.data) {
        setUsername(profileRes.data.username);
        setAvatarUrl(profileRes.data.avatar_url);
        setEmail(profileRes.data.email || user.email || "");
      }
      if (membersRes.data) {
        const me = membersRes.data.find((m: any) => m.user_id === user?.id);
        if (!me) {
          router.replace("/(app)/groups");
          return;
        }
        setMembers(membersRes.data.map((m: any) => ({ ...m.profiles, user_id: m.user_id })));
        setIsAdmin(me?.role === "admin");
      }
      
      if (photosRes.data) {
        setPhotoCount(photosRes.data.length);
        setUserPhotoCount(photosRes.data.filter((p: any) => p.user_id === user.id).length);
        
        const photoIds = photosRes.data.map((p: any) => p.id);
        const reactionsRes = photoIds.length > 0
          ? await supabase
              .from("reactions")
              .select("id, photo_id, user_id, emoji, profiles:user_id(username, avatar_url)")
              .in("photo_id", photoIds)
              .eq("type", "emoji")
          : { data: [] };

        const reactionsByPhoto: Record<string, Reaction[]> = {};
        for (const r of reactionsRes.data ?? []) {
          if (!r.emoji) continue;
          if (!reactionsByPhoto[r.photo_id]) reactionsByPhoto[r.photo_id] = [];
          reactionsByPhoto[r.photo_id].push({
            id: r.id,
            user_id: r.user_id,
            username: r.profiles?.username ?? "?",
            avatar_url: r.profiles?.avatar_url ?? null,
            sticker_id: r.emoji as StickerId,
          });
        }

        const entries: PhotoEntry[] = photosRes.data.map((p: any) => ({
          id: p.id,
          url: p.image_path === "text_mode" ? "" : r2Storage.getPublicUrl(p.image_path),
          fallback_url: p.image_path === "text_mode" ? undefined : supabase.storage.from("moments").getPublicUrl(p.image_path).data.publicUrl,
          created_at: p.created_at,
          note: p.note ?? null,
          username: p.profiles?.username ?? "Anonyme",
          avatar_url: p.profiles?.avatar_url,
          image_path: p.image_path,
          user_id: p.user_id,
          reactions: reactionsByPhoto[p.id] ?? [],
        }));
        setPhotos(entries);
      }
      setDataLoaded(true);
    } catch (e) {
      setDataLoaded(true);
    }
  }, [id, user, unlocked]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const { activeUploads } = useUpload();

  useEffect(() => {
    const hasJustFinished = activeUploads.some(u => u.status === "success");
    if (hasJustFinished) {
      console.log("Upload réussi en arrière-plan, rafraîchissement des données...");
      fetchData();
    }
  }, [activeUploads, fetchData]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`group-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "photos", filter: `group_id=eq.${id}` },
        () => {
          console.log("Nouveau moment détecté, rafraîchissement...");
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, fetchData]);

  const updateAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled) {
      setUploading(true);
      try {
        const manipResult = await manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 200, height: 200 } }],
          { compress: 0.7, format: SaveFormat.JPEG, base64: true }
        );

        if (!manipResult.base64) throw new Error("Erreur de manipulation image");

        const filePath = `avatars/${user?.id}_${Date.now()}.jpg`;
        await r2Storage.upload(filePath, decode(manipResult.base64), "image/jpeg");
        const urlData = r2Storage.getPublicUrl(filePath);
        
        await supabase.from("profiles").update({ avatar_url: urlData }).eq("id", user?.id);
        setAvatarUrl(urlData);
      } catch (e: any) { Alert.alert("Erreur", e.message); } finally { setUploading(false); }
    }
  };

  const handleReact = async (photoId: string, stickerId: StickerId) => {
    if (!user) return;
    const existing = photos
      .find((p) => p.id === photoId)
      ?.reactions.find((r) => r.user_id === user.id);

    try {
      if (existing) {
        if (existing.sticker_id === stickerId) {
          const { error } = await supabase.from("reactions").delete().eq("id", existing.id);
          if (error) throw error;
          
          setPhotos((prev) => prev.map((p) =>
            p.id === photoId ? { ...p, reactions: p.reactions.filter((r) => r.id !== existing.id) } : p
          ));
        } else {
          const { error } = await supabase.from("reactions").update({ emoji: stickerId }).eq("id", existing.id);
          if (error) throw error;

          setPhotos((prev) => prev.map((p) =>
            p.id === photoId ? { ...p, reactions: p.reactions.map((r) => r.id === existing.id ? { ...r, sticker_id: stickerId } : r) } : p
          ));
        }
      } else {
        const { data, error } = await supabase
          .from("reactions")
          .insert({ photo_id: photoId, user_id: user.id, type: "emoji", emoji: stickerId })
          .select("id")
          .single();
        
        if (error) throw error;
        
        if (data) {
          setPhotos((prev) => prev.map((p) =>
            p.id === photoId ? {
              ...p,
              reactions: [...p.reactions, { id: data.id, user_id: user.id, username, avatar_url: avatarUrl, sticker_id: stickerId }],
            } : p
          ));
        }
      }
    } catch (err) {
      console.error("[handleReact] Error:", err);
      Alert.alert("Erreur", "Impossible d'enregistrer la réaction.");
    }
  };

  const saveUsername = async () => {
    const trimmed = newUsername.trim();
    if (!trimmed || trimmed === username) { setIsEditingUsername(false); return; }
    setSavingUsername(true);
    const { error } = await supabase.from("profiles").update({ username: trimmed }).eq("id", user!.id);
    if (!error) {
      setUsername(trimmed);
      showToast("Pseudo mis à jour", undefined, "success");
    } else {
      showToast("Erreur", "Impossible de modifier le pseudo", "error");
    }
    setSavingUsername(false);
    setIsEditingUsername(false);
  };

  const jumpTo = (page: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ x: page * SCREEN_WIDTH, animated: false });
      scrollX.setValue(page * SCREEN_WIDTH);
      setCurrentPage(page);
    }
  };

  const handleCapture = async () => {
    if (cameraMode === "TEXTE") {
      if (!textModeContent.trim()) return;
      handleUploadText();
      return;
    }
    if (cameraMode === "VIDEO") {
      if (isRecording) stopVideoRecording();
      else startVideoRecording();
      return;
    }
    if (!cameraRef.current || isRecording || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, skipMetadata: true });
      if (photo?.uri) {
        // --- CROPPING TO MATCH PREVIEW ---
        const paddingTop = Math.max(insets.top, 12) + 12;
        const paddingBottom = NAVBAR_HEIGHT + 12;
        
        const uiWidth = SCREEN_WIDTH - 24;
        const uiHeight = SCREEN_HEIGHT - paddingTop - paddingBottom;
        const targetRatio = uiWidth / uiHeight;

        const sensorWidth = photo.width;
        const sensorHeight = photo.height;
        const sensorRatio = sensorWidth / sensorHeight;

        let actions: any[] = [];
        if (sensorRatio > targetRatio) {
          const cropWidth = sensorHeight * targetRatio;
          const originX = (sensorWidth - cropWidth) / 2;
          actions.push({ crop: { originX, originY: 0, width: cropWidth, height: sensorHeight } });
        } else {
          const cropHeight = sensorWidth / targetRatio;
          const originY = (sensorHeight - cropHeight) / 2;
          actions.push({ crop: { originX: 0, originY, width: sensorWidth, height: cropHeight } });
        }

        actions.push({ resize: { width: 1080 } });

        const manipResult = await manipulateAsync(
          photo.uri,
          actions,
          { compress: 0.92, format: SaveFormat.JPEG, base64: false }
        );
        setCapturedUri(manipResult.uri);
      }
    } catch (e: any) {
      console.error("Capture error:", e);
      Alert.alert("Erreur", "Impossible de prendre la photo.");
    } finally {
      setCapturing(false);
    }
  };

  const startVideoRecording = async () => {
    if (!cameraRef.current || isRecording) return;
    if (cameraMode !== "VIDEO") setCameraMode("VIDEO");

    setIsRecording(true);
    setRecordingSeconds(0);
    recordingTimer.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      const video = await cameraRef.current.recordAsync({ quality: "1080p", maxDuration: 15 });
      if (video?.uri) {
        setCaptureData(null, video.uri, "video");
        router.push(`/(app)/groups/${id}/preview`);
      }
    } catch (e: any) {
      console.error("Erreur recordAsync:", e);
    } finally {
      setIsRecording(false);
      if (recordingTimer.current) clearInterval(recordingTimer.current);
      setRecordingSeconds(0);
    }
  };

  const stopVideoRecording = () => {
    if (!isRecording) return;
    cameraRef.current?.stopRecording();
  };

  const handleTouchStart = (e: any) => {
    startTouchY.current = e.nativeEvent.pageY;
  };

  const handleTouchMove = (e: any) => {
    if (!isRecording || startTouchY.current === null) return;
    const diff = startTouchY.current - e.nativeEvent.pageY;
    const newZoom = Math.min(Math.max(diff / 300, 0), 1);
    setZoom(newZoom);
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      await supabase.from("group_members").delete().eq("group_id", id).eq("user_id", memberId);
      setMembers(prev => prev.filter((m: any) => m.user_id !== memberId));
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    }
  };

  const handleUploadText = () => {
    if (!textModeContent.trim() || !user) return;
    const content = textModeContent.trim();
    const dbData = { group_id: id as string, user_id: user.id, note: content };
    startUpload(null, null, null, dbData);
    setTextModeContent(""); 
    fetchData(); 
  };

  const handleUploadPhoto = () => {
    if (!capturedUri || !user) return;
    const dbData = { group_id: id as string, user_id: user.id, note: note.trim() || null };
    const fileName = `${id}/${user.id}_${Date.now()}.jpg`;
    startUpload(fileName, capturedUri, "image/jpeg", dbData);
    setCapturedUri(null);
    setNote("");
    fetchData();
  };

  const cameraTranslateX = scrollX.interpolate({ inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH], outputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH] });
  const cameraScale = scrollX.interpolate({ inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH], outputRange: [0.9, 1, 0.9] });
  const cameraOpacity = scrollX.interpolate({ inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH], outputRange: [0.4, 1, 0.4] });

  const isBlocked = false; 
  const isEditing = !!capturedUri;

  if (!dataLoaded) return <View style={[styles.container, styles.center]}><Loader size={48} /></View>;

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        ref={scrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        bounces={false} overScrollMode="never"
        scrollEnabled={!isEditing && !isBlocked && !isPinching}
        onMomentumScrollEnd={(e) => setCurrentPage(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        scrollEventThrottle={16} contentOffset={{ x: SCREEN_WIDTH, y: 0 }} style={styles.pager}
      >
        {/* PAGE 0: PROFILE */}
        <View key="page-0" style={[styles.page, { zIndex: 10 }]}>
          <ScrollView style={styles.pageContent} contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
            <LinearGradient colors={["rgba(255,255,255,0.07)", "transparent"]} style={[styles.profileHeader, { paddingTop: insets.top + 36 }]}>
              <LinearGradient colors={["rgba(255,255,255,0.35)", "rgba(255,255,255,0.06)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatarRing}>
                <TouchableOpacity onPress={updateAvatar} style={styles.avatarWrap} disabled={uploading}>
                  {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImg} /> : <Text style={styles.avatarInitial}>{(username?.[0] ?? "?").toUpperCase()}</Text>}
                  <View style={styles.avatarOverlay}>{uploading ? <ActivityIndicator size="small" color="#FFF" /> : <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><Circle cx="12" cy="13" r="4"/></Svg>}</View>
                </TouchableOpacity>
              </LinearGradient>
              <Text style={styles.profileName}>{username || "—"}</Text>
              <TouchableOpacity style={styles.editUsernameChip} onPress={() => { setNewUsername(username); setIsEditingUsername(true); }}><Svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></Svg><Text style={styles.editUsernameChipText}>Modifier le pseudo</Text></TouchableOpacity>
            </LinearGradient>
            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionLabel}>Compte</Text>
              <View style={styles.settingsCard}>
                <TouchableOpacity style={styles.settingsRow} onPress={() => { setNewUsername(username); setIsEditingUsername(true); }}><View style={[styles.settingsIconWrap, { backgroundColor: "rgba(129,140,248,0.15)" }]}><Svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><Circle cx="12" cy="7" r="4"/></Svg></View><View style={styles.settingsTextCol}><Text style={styles.settingsLabel}>Pseudo</Text><Text style={styles.settingsSubValue}>{username}</Text></View><Svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><Path d="M9 18l6-6-6-6"/></Svg></TouchableOpacity>
                <View style={styles.settingsDivider} />
                <View style={styles.settingsRow}><View style={[styles.settingsIconWrap, { backgroundColor: "rgba(251,191,36,0.12)" }]}><Svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FBB824" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><Path d="M22 6l-10 7L2 6"/></Svg></View><View style={styles.settingsTextCol}><Text style={styles.settingsLabel}>Email</Text><Text style={styles.settingsSubValue}>{email || user?.email}</Text></View></View>
              </View>
              <Text style={[styles.settingsSectionLabel, { marginTop: 28 }]}>Session</Text>
              <View style={styles.settingsCard}><TouchableOpacity style={styles.settingsRow} onPress={() => logout()}><View style={[styles.settingsIconWrap, { backgroundColor: "rgba(255,59,48,0.12)" }]}><Svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FF3B30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><Path d="M16 17l5-5-5-5"/><Path d="M21 12H9"/></Svg></View><Text style={[styles.settingsLabel, { color: "#FF3B30" }]}>Se déconnecter</Text></TouchableOpacity></View>
            </View>
          </ScrollView>
          <Modal visible={isEditingUsername} transparent animationType="slide" onRequestClose={() => setIsEditingUsername(false)}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}><TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setIsEditingUsername(false)} /><View style={styles.editSheet}><View style={styles.editSheetHandle} /><Text style={styles.editSheetTitle}>Modifier le pseudo</Text><TextInput style={styles.editSheetInput} value={newUsername} onChangeText={setNewUsername} autoFocus maxLength={30} autoCapitalize="none" returnKeyType="done" onSubmitEditing={saveUsername} placeholder="Ton pseudo..." placeholderTextColor="rgba(255,255,255,0.3)" editable={!savingUsername} /><TouchableOpacity style={styles.editSheetBtn} onPress={saveUsername} disabled={savingUsername}>{savingUsername ? <ActivityIndicator color="#000" /> : <Text style={styles.editSheetBtnText}>Valider</Text>}</TouchableOpacity><TouchableOpacity style={styles.editSheetCancel} onPress={() => setIsEditingUsername(false)}><Text style={styles.editSheetCancelText}>Annuler</Text></TouchableOpacity></View></KeyboardAvoidingView></Modal>
        </View>

        {/* PAGE 1: CAMERA (Fixed underneath) */}
        <Animated.View style={[styles.page, { transform: [{ translateX: cameraTranslateX }, { scale: cameraScale }], opacity: cameraOpacity, zIndex: 1 }]}>
          {!capturedUri ? (
            cameraMode === "TEXTE" ? (
              <View style={styles.textModeContainer}><TextInput style={styles.textModeInput} placeholder="Écris..." placeholderTextColor="rgba(255,255,255,0.3)" multiline value={textModeContent} onChangeText={setTextModeContent} autoFocus disabled={isBlocked} /></View>
            ) : (
              <View style={[styles.cameraPageContainer, { paddingTop: Math.max(insets.top, 12) + 12, paddingBottom: NAVBAR_HEIGHT + 12, paddingHorizontal: 12 }]}>
                <StandardCamera 
                  ref={cameraRef} 
                  isActive={!capturedUri}
                  mode={cameraMode === "VIDEO" ? "video" : "picture"} 
                  facing={facing} 
                  flash={flash} 
                  zoom={zoom}
                  onZoomChange={setZoom}
                  onPinchingChange={setIsPinching}
                  onDoubleTap={() => setFacing(prev => prev === 'back' ? 'front' : 'back')}
                />
              </View>
            )
          ) : null}

          {/* Camera UI Overlay */}
          {!capturedUri && (
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              {cameraMode !== "TEXTE" && (
                <TouchableOpacity 
                  style={[styles.topControlBtn, { top: Math.max(insets.top, 28), right: 28 }]} 
                  onPress={() => setFlash(prev => prev === 'off' ? 'on' : prev === 'on' ? 'auto' : 'off')} 
                  disabled={isBlocked}
                >
                  <FlashIcon mode={flash} />
                </TouchableOpacity>
              )}

              {isRecording && (
                <View style={[styles.recordingTimer, { top: Math.max(insets.top, 40) }]}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingText}>{recordingSeconds}s / 15s</Text>
                </View>
              )}
              
              <View style={[styles.cameraFooter, { bottom: NAVBAR_HEIGHT + 24 }]}>
                <View style={styles.modeSlider}>
                  {["PHOTO", "VIDEO", "TEXTE"].map((m: any) => (
                    <TouchableOpacity key={m} onPress={() => setCameraMode(m)} disabled={isRecording || isBlocked}><Text style={[styles.modeText, cameraMode === m && styles.modeTextActive]}>{m}</Text></TouchableOpacity>
                  ))}
                </View>
                <View style={styles.captureRow}>
                  {cameraMode !== "TEXTE" && <View style={styles.sideControlPlaceholder} />}
                  <TouchableOpacity 
                    style={[styles.captureBtn, (cameraMode === "VIDEO" || isRecording) && styles.captureBtnVideo, isRecording && styles.captureBtnRecording]} 
                    onPress={handleCapture}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    activeOpacity={0.8}
                    disabled={isBlocked}
                  >
                    <View style={[styles.captureInner, (cameraMode === "VIDEO" || isRecording) && styles.captureInnerVideo, isRecording && styles.captureInnerRecording]}>
                      {cameraMode === "TEXTE" && <SendIcon color="#000" />}
                    </View>
                  </TouchableOpacity>
                  {cameraMode !== "TEXTE" && (
                    <TouchableOpacity style={styles.flipBtn} onPress={() => setFacing(prev => prev === 'back' ? 'front' : 'back')} disabled={isRecording || isBlocked}>
                      <FlipIcon />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          )}

          {capturedUri && (
            <View style={[styles.previewContainer, { paddingTop: Math.max(insets.top, 12) + 12, paddingBottom: NAVBAR_HEIGHT + 12, paddingHorizontal: 12 }]}>
              <View style={styles.previewImageWrapper}>
                <Image source={{ uri: capturedUri }} style={styles.previewImage} contentFit="cover" />
                
                <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                  <TouchableOpacity 
                    style={[styles.backCaptureBtnInside, { top: 16 }]} 
                    onPress={() => { setCapturedUri(null); setNote(""); }} 
                    disabled={isBlocked}
                  >
                    <CloseIcon />
                  </TouchableOpacity>

                  <View style={[styles.previewContent, { bottom: 120 }]}>
                    {note ? (
                      <Pressable style={styles.previewNoteBox} onPress={() => setIsEditingNote(true)} disabled={isBlocked}>
                        <Text style={styles.previewNoteText}>{note}</Text>
                      </Pressable>
                    ) : (
                      <TouchableOpacity style={styles.addNoteBtn} onPress={() => setIsEditingNote(true)} disabled={isBlocked}>
                        <FeatherIcon />
                        <Text style={styles.addNoteBtnText}>Ajouter une légende...</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={[styles.postCaptureActions, { bottom: 20 }]}>
                    <TouchableOpacity style={styles.sendCaptureBtn} onPress={handleUploadPhoto} disabled={isBlocked}>
                      <View style={styles.sendCaptureInner}>
                        {uploading ? <ActivityIndicator color="#000" /> : <SendIcon color="#000" />}
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <Modal visible={isEditingNote} transparent animationType="fade">
                <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill}>
                  <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.noteEditorContainer}>
                    <TextInput style={styles.largeNoteInput} placeholder="Note..." placeholderTextColor="rgba(255,255,255,0.3)" value={note} onChangeText={setNote} maxLength={140} multiline autoFocus />
                    <TouchableOpacity style={styles.doneNoteBtn} onPress={() => setIsEditingNote(false)}><Text style={styles.doneNoteText}>Terminé</Text></TouchableOpacity>
                  </KeyboardAvoidingView>
                </BlurView>
              </Modal>
            </View>
          )}
        </Animated.View>

        {/* PAGE 2: VAULT (Slides over Camera) */}
        <View key="page-2" style={[styles.page, { zIndex: 10 }]}>
          {unlocked ? (
            <View style={styles.vaultUnlocked}><PhotoFeed photos={photos} onReact={handleReact} currentUserId={user?.id} nextUnlockDate={revealDate} /></View>
          ) : (
            <ScrollView style={[styles.pageContent, { paddingTop: insets.top + 40 }]} contentContainerStyle={{ paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
              <View style={styles.vaultHeader}><Text style={styles.pageTitleNoPad}>{groupName || "Groupe"}</Text><TouchableOpacity onPress={() => setShowMembersModal(true)} style={styles.groupBtn}>{isAdmin ? <GroupAddIcon /> : <GroupIcon />}</TouchableOpacity></View>
              <View style={styles.vaultBody}><View style={styles.vaultLockedContent}><VaultCounter totalCount={photoCount} userCount={userPhotoCount} unlockDate={revealDate} /></View></View>
              {__DEV__ && (
                <View style={{ gap: 8, marginTop: 24, marginHorizontal: 24 }}>
                  <TouchableOpacity style={[styles.debugBtn, { marginHorizontal: 0, marginTop: 0, marginBottom: 0 }]} onPress={() => setDebugUnlocked(true)}>
                    <Text style={styles.debugBtnText}>🔓 Simuler reveal (DEV)</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.debugBtn, { marginHorizontal: 0, marginTop: 0, marginBottom: 0 }]} 
                    onPress={() => scheduleImmediateLocalNotification(
                      "Le coffre est ouvert !", 
                      `Les moments de "${groupName || "Groupe"}" sont disponibles`, 
                      { type: "recap", groupId: id }
                    )}
                  >
                    <Text style={styles.debugBtnText}>🔔 Debug Reveal (DEV)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.debugBtn, { marginHorizontal: 0, marginTop: 0, marginBottom: 0 }]} 
                    onPress={() => scheduleImmediateLocalNotification(
                      groupName || "Groupe", 
                      `Un ami a partagé un moment !`, 
                      { type: "new_photo", groupId: id }
                    )}
                  >
                    <Text style={styles.debugBtnText}>🔔 Debug Photo (DEV)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.debugBtn, { marginHorizontal: 0, marginTop: 0, marginBottom: 0 }]} 
                    onPress={() => scheduleImmediateLocalNotification(
                      "Nouvelle invitation !", 
                      `Tu as été invité à rejoindre "${groupName || "Groupe"}"`, 
                      { type: "invite", groupName: groupName || "Groupe" }
                    )}
                  >
                    <Text style={styles.debugBtnText}>🔔 Debug Invite (DEV)</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </Animated.ScrollView>

      {/* NAV BAR */}
      <View style={[styles.tabBarContainer, { paddingBottom: insets.bottom }]}>
        <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.tabBarContent}>
          <TouchableOpacity style={styles.tab} onPress={() => jumpTo(0)} disabled={isEditing}><ProfileIcon color={currentPage === 0 ? "#FFF" : "rgba(255,255,255,0.4)"} size={24} /><Text style={[styles.tabLabel, currentPage === 0 && styles.tabLabelActive]}>Profil</Text></TouchableOpacity>
          <TouchableOpacity style={styles.tab} onPress={() => jumpTo(1)} disabled={isEditing}><MomentIcon color={currentPage === 1 ? "#FFF" : "rgba(255,255,255,0.4)"} size={28} /><Text style={[styles.tabLabel, currentPage === 1 && styles.tabLabelActive]}>Moment</Text></TouchableOpacity>
          <TouchableOpacity style={styles.tab} onPress={() => jumpTo(2)} disabled={isEditing}><VaultIcon color={currentPage === 2 ? "#FFF" : "rgba(255,255,255,0.4)"} size={24} /><Text style={[styles.tabLabel, currentPage === 2 && styles.tabLabelActive]}>Coffre</Text></TouchableOpacity>
        </View>
      </View>
      <Modal visible={showMembersModal} animationType="slide" transparent onRequestClose={() => setShowMembersModal(false)}>
        <View style={styles.darkModalOverlay}>
          <View style={[styles.modalContent, { paddingTop: insets.top + 40 }]}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>Membres</Text><TouchableOpacity onPress={() => setShowMembersModal(false)}><Text style={styles.closeModalText}>Fermer</Text></TouchableOpacity></View>
            <FlatList data={members} keyExtractor={(_, i) => i.toString()} renderItem={({ item }) => (
              <View style={styles.memberItem}>
                <View style={styles.memberAvatar}>{item.avatar_url ? <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} /> : <Text style={styles.memberAvatarText}>{item.username[0]?.toUpperCase()}</Text>}</View>
                <Text style={styles.memberName}>{item.username}</Text>
                {isAdmin && item.user_id !== user?.id && (
                  <TouchableOpacity onPress={() => Alert.alert("Supprimer", `Retirer ${item.username} du groupe ?`, [{ text: "Annuler", style: "cancel" }, { text: "Supprimer", style: "destructive", onPress: () => handleRemoveMember(item.user_id) }])} style={styles.removeMemberBtn}>
                    <Text style={styles.removeMemberText}>Retirer</Text>
                  </TouchableOpacity>
                )}
              </View>
            )} ListFooterComponent={() => isAdmin ? ( <TouchableOpacity style={[theme.outlineButton, styles.inviteModalBtn]} onPress={() => { setShowMembersModal(false); router.push(`/(app)/groups/${id}/invite`); }}><Text style={theme.outlineButtonText}>Ajouter un membre</Text></TouchableOpacity> ) : null} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { justifyContent: "center", alignItems: "center" },
  pager: { flex: 1 },
  page: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor: "#000" },
  pageContent: { flex: 1 },
  avatarImg: { width: "100%", height: "100%" },
  profileHeader: { alignItems: "center", paddingHorizontal: 24, paddingBottom: 40 },
  avatarRing: { width: 114, height: 114, borderRadius: 57, padding: 2, marginBottom: 20 },
  avatarWrap: { flex: 1, borderRadius: 55, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.1)" },
  avatarInitial: { fontFamily: "Inter_700Bold", fontSize: 44, color: "#FFF", textAlign: "center", lineHeight: 110 },
  avatarOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, height: 32, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  profileName: { fontFamily: "Inter_700Bold", fontSize: 30, color: "#FFF", letterSpacing: -0.8, marginBottom: 10 },
  editUsernameChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.06)" },
  editUsernameChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.6)" },
  settingsSection: { paddingHorizontal: 20 },
  settingsSectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, paddingLeft: 4 },
  settingsCard: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 20, overflow: "hidden" },
  settingsRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  settingsIconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  settingsTextCol: { flex: 1, gap: 2 },
  settingsLabel: { fontSize: 16, color: "#FFF", fontFamily: "Inter_600SemiBold" },
  settingsSubValue: { fontSize: 13, color: "rgba(255,255,255,0.38)", fontFamily: "Inter_400Regular" },
  settingsDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.06)", marginLeft: 64 },
  editSheet: { backgroundColor: "#161616", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44 },
  editSheetHandle: { width: 36, height: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2, alignSelf: "center", marginBottom: 24 },
  editSheetTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#FFF", marginBottom: 20 },
  editSheetInput: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 15, fontSize: 17, color: "#FFF", fontFamily: "Inter_400Regular", marginBottom: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  editSheetBtn: { backgroundColor: "#FFF", borderRadius: 16, paddingVertical: 15, alignItems: "center", marginBottom: 10 },
  editSheetBtnText: { color: "#000", fontSize: 16, fontFamily: "Inter_700Bold" },
  editSheetCancel: { paddingVertical: 12, alignItems: "center" },
  editSheetCancelText: { color: "rgba(255,255,255,0.35)", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  vaultHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, marginBottom: 40 },
  groupBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center" },
  vaultBody: { flex: 1 },
  vaultLockedContent: { paddingHorizontal: 24 },
  vaultUnlocked: { flex: 1 },
  darkModalOverlay: { flex: 1, backgroundColor: "#000" },
  modalContent: { flex: 1, paddingHorizontal: 24 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 32 },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 24, color: "#FFF" },
  closeModalText: { color: colors.secondary, fontFamily: "Inter_600SemiBold" },
  memberItem: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16, backgroundColor: "rgba(255,255,255,0.08)", padding: 14, borderRadius: 18 },
  removeMemberBtn: { marginLeft: "auto", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(255,60,60,0.15)" },
  removeMemberText: { color: "#FF3C3C", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  memberAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center", overflow: "hidden" },
  memberAvatarText: { color: "#FFF", fontFamily: "Inter_700Bold" },
  memberName: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 16 },
  inviteModalBtn: { marginTop: 24, marginBottom: 40 },
  debugBtn: { marginHorizontal: 24, marginTop: 24, marginBottom: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: "rgba(255,200,0,0.15)", borderWidth: 1, borderColor: "rgba(255,200,0,0.4)", alignItems: "center" },
  debugBtnText: { color: "#FFD700", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  cameraFooter: { position: "absolute", left: 0, right: 0, alignItems: "center", gap: 24 },
  modeSlider: { flexDirection: "row", gap: 20, backgroundColor: "rgba(0,0,0,0.3)", paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, marginBottom: 12 },
  modeText: { color: "rgba(255,255,255,0.4)", fontFamily: "Inter_700Bold", fontSize: 12 },
  modeTextActive: { color: "#FFF" },
  captureRow: { flexDirection: "row", alignItems: "center", gap: 32 },
  sideControlPlaceholder: { width: 48 },
  flipBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center" },
  captureBtn: { width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: "#FFF", justifyContent: "center", alignItems: "center" },
  captureBtnVideo: { borderColor: "rgba(255,59,48,0.5)" },
  captureBtnRecording: { borderColor: "#FF3B30" },
  captureInner: { width: 66, height: 66, borderRadius: 33, backgroundColor: "#FFF", justifyContent: "center", alignItems: "center" },
  captureInnerVideo: { backgroundColor: "#FF3B30" },
  captureInnerRecording: { width: 30, height: 30, borderRadius: 6 },
  topControlBtn: { position: "absolute", width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center" },
  recordingTimer: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, gap: 8 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FF3B30" },
  recordingText: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  textModeContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40, backgroundColor: "#0A0A0A" },
  textModeInput: { fontSize: 32, color: "#FFF", fontFamily: "Inter_700Bold", textAlign: "center", width: "100%" },
  tabBarContainer: { position: "absolute", bottom: 0, left: 0, right: 0, height: NAVBAR_HEIGHT, overflow: "hidden", zIndex: 100, backgroundColor: "rgba(10,10,10,0.92)" },
  tabBarContent: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-evenly", paddingTop: 12 },
  tab: { alignItems: "center", justifyContent: "center", gap: 4, width: SCREEN_WIDTH / 3 },
  tabLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.4)" },
  tabLabelActive: { color: "#FFF" },
  cameraPageContainer: { flex: 1, backgroundColor: "#000", alignItems: "center" },
  previewContainer: { flex: 1, backgroundColor: "#000", alignItems: "center" },
  previewImageWrapper: { flex: 1, width: '100%', borderRadius: 32, overflow: "hidden", backgroundColor: "#1A1A1A" },
  previewImage: { width: "100%", height: "100%" },
  previewContent: { position: "absolute", left: 24, right: 24 },
  previewNoteBox: { backgroundColor: "rgba(0,0,0,0.5)", padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  previewNoteText: { color: "#FFF", fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  addNoteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 16, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.4)", borderStyle: "dashed", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  addNoteBtnText: { color: "rgba(255,255,255,0.6)", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  backCaptureBtnInside: { position: "absolute", left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  postCaptureActions: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  sendCaptureBtn: { width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: "#FFF", justifyContent: "center", alignItems: "center" },
  sendCaptureInner: { width: 66, height: 66, borderRadius: 33, backgroundColor: "#FFF", justifyContent: "center", alignItems: "center" },
  noteEditorContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  largeNoteInput: { width: "100%", color: "#FFF", fontSize: 28, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 40 },
  doneNoteBtn: { backgroundColor: "#FFF", paddingHorizontal: 32, paddingVertical: 14, borderRadius: 100 },
  doneNoteText: { color: "#000", fontFamily: "Inter_700Bold", fontSize: 16 },
  pageTitleNoPad: { fontFamily: "Inter_700Bold", fontSize: 28, color: "#FFF", letterSpacing: -1 },
  vaultHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, marginBottom: 40 },
  vaultBody: { flex: 1 },
  vaultLockedContent: { paddingHorizontal: 24 },
  vaultUnlocked: { flex: 1 },
  darkModalOverlay: { flex: 1, backgroundColor: "#000" },
  modalContent: { flex: 1, paddingHorizontal: 24 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 32 },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 24, color: "#FFF" },
  closeModalText: { color: colors.secondary, fontFamily: "Inter_600SemiBold" },
  memberItem: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16, backgroundColor: "rgba(255,255,255,0.08)", padding: 14, borderRadius: 18 },
  removeMemberBtn: { marginLeft: "auto", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(255,60,60,0.15)" },
  removeMemberText: { color: "#FF3C3C", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  memberAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center", overflow: "hidden" },
  memberAvatarText: { color: "#FFF", fontFamily: "Inter_700Bold" },
  memberName: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 16 },
  inviteModalBtn: { marginTop: 24, marginBottom: 40 },
  debugBtn: { marginHorizontal: 24, marginTop: 24, marginBottom: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: "rgba(255,200,0,0.15)", borderWidth: 1, borderColor: "rgba(255,200,0,0.4)", alignItems: "center" },
  debugBtnText: { color: "#FFD700", fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
