import { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  ScrollView,
  FlatList,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { CameraView, CameraType, FlashMode } from "expo-camera";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";
import { setCaptureData, clearCaptureData } from "../../../lib/capture-store";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../lib/auth-context";
import { useToast } from "../../../lib/toast-context";
import { translateError } from "../../../lib/error-messages";
import { colors, theme } from "../../../lib/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, Circle } from "react-native-svg";
import { scheduleImmediateLocalNotification, cancelAllRecapNotifications } from "../../../lib/notifications";

// Components
import VaultCounter from "../../../components/VaultCounter";
import PhotoFeed, { type PhotoEntry, type Reaction } from "../../../components/PhotoFeed";
import Loader from "../../../components/Loader";
import StandardCamera from "../../../components/StandardCamera";
import { ProfileIcon, VaultIcon, MomentIcon } from "../../../components/icons";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Icons
const GroupIcon = ({ color = "#FFF" }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0178 6.12226 19.0382 7.02425C19.0587 7.92624 18.7927 8.81409 18.2772 9.56129C17.7617 10.3085 17.0212 10.8791 16.16 11.19M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

const SendIcon = ({ color = "#000" }) => (
  <Svg width="28" height="28" viewBox="0 0 24 24" fill="none">
    <Path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

const FlipIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
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

type CameraMode = "PHOTO" | "VIDEO" | "TEXTE";

export default function MainPagerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  
  const scrollX = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const scrollRef = useRef<Animated.ScrollView>(null);

  const [groupName, setGroupName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  const [userPhotoCount, setUserPhotoCount] = useState(0);
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [dataLoaded, setDataLoaded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1); 
  const [devMode, setDevMode] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);

  // -- Camera State --
  const cameraRef = useRef<CameraView>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>("PHOTO");
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [zoom, setZoom] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimer = useRef<NodeJS.Timeout | null>(null);

  const [capturing, setCapturing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [frozenUri, setFrozenUri] = useState<string | null>(null);
  const [textModeContent, setTextModeContent] = useState("");

  const unlocked = isVaultUnlocked() || devMode;

  const fetchData = useCallback(async () => {
    if (!user || !id) return;
    try {
      const { monday } = getWeekBounds();
      const [groupRes, profileRes, photosRes, membersRes] = await Promise.all([
        supabase.from("groups").select("name").eq("id", id).single(),
        supabase.from("profiles").select("username, avatar_url, email").eq("id", user.id).single(),
        supabase.from("photos")
          .select("id, image_path, created_at, note, user_id, profiles:user_id(username, avatar_url)")
          .eq("group_id", id)
          .gte("created_at", monday.toISOString())
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
        const myMembership = membersRes.data.find((m: any) => m.user_id === user.id);
        setIsAdmin(myMembership?.role === "admin");
        setMembers(membersRes.data.map((m: any) => ({ ...m.profiles, user_id: m.user_id, role: m.role })));
      }
      
      if (photosRes.data) {
        const pData = photosRes.data;
        setPhotoCount(pData.length);
        setUserPhotoCount(pData.filter((p: any) => p.user_id === user.id).length);
        
        const entries: PhotoEntry[] = pData.map((p: any) => ({
          id: p.id,
          url: p.image_path === "text_mode" ? "" : supabase.storage.from("moments").getPublicUrl(p.image_path).data.publicUrl,
          created_at: p.created_at,
          note: p.note ?? null,
          username: p.profiles?.username ?? "Anonyme",
          avatar_url: p.profiles?.avatar_url,
          image_path: p.image_path,
          reactions: [], 
        }));
        setPhotos(entries);
      }
      setDataLoaded(true);
    } catch (e) {
      setDataLoaded(true);
    }
  }, [id, user, unlocked]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  // Realtime: nouveau membre rejoint le groupe
  useEffect(() => {
    if (!id || !user) return;
    const channel = supabase
      .channel(`group-members-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_members", filter: `group_id=eq.${id}` }, async (payload) => {
        const newUserId = payload.new.user_id;
        if (newUserId === user.id) return; // c'est moi
        const { data: profile } = await supabase.from("profiles").select("username").eq("id", newUserId).single();
        const name = profile?.username ?? "Quelqu'un";
        showToast("Nouveau membre", `${name} a rejoint le groupe !`, "info");
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, user]);

  // Realtime: nouveau moment posté par un autre membre
  useEffect(() => {
    if (!id || !user) return;
    const channel = supabase
      .channel(`group-photos-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "photos", filter: `group_id=eq.${id}` }, async (payload) => {
        const senderId = payload.new.user_id;
        if (senderId === user.id) return;
        const { data: profile } = await supabase.from("profiles").select("username").eq("id", senderId).single();
        const name = profile?.username ?? "Quelqu'un";
        showToast("Nouveau moment", `${name} a partagé un moment !`, "info");
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, user]);

  // Détection déverrouillage du coffre en temps réel
  const vaultWasLocked = useRef(!isVaultUnlocked());
  useEffect(() => {
    const interval = setInterval(() => {
      const nowUnlocked = isVaultUnlocked();
      if (vaultWasLocked.current && nowUnlocked) {
        showToast("Coffre déverrouillé", "Les moments de la semaine sont disponibles !", "success");
        vaultWasLocked.current = false;
        fetchData();
      }
    }, 30000); // check toutes les 30s
    return () => clearInterval(interval);
  }, []);

  const updateAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setUploading(true);
      try {
        const filePath = `avatars/${user?.id}_${Date.now()}.jpg`;
        await supabase.storage.from("moments").upload(filePath, decode(result.assets[0].base64), { contentType: "image/jpeg", upsert: true });
        const { data: urlData } = supabase.storage.from("moments").getPublicUrl(filePath);
        await supabase.from("profiles").update({ avatar_url: urlData.publicUrl }).eq("id", user?.id);
        setAvatarUrl(urlData.publicUrl);
        showToast("Photo de profil", "Avatar mis à jour.", "success");
      } catch (e: any) { showToast("Erreur", translateError(e.message)); } finally { setUploading(false); }
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    try {
      const { error } = await supabase.from("group_members").delete().eq("group_id", id).eq("user_id", memberId);
      if (error) throw error;
      setMembers((prev) => prev.filter((m) => m.user_id !== memberId));
      showToast("Membre retiré", `${memberName} a été retiré du groupe.`, "success");
    } catch (e: any) {
      showToast("Erreur", translateError(e.message));
    }
  };

  const jumpTo = (page: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ x: page * SCREEN_WIDTH, animated: false });
      scrollX.setValue(page * SCREEN_WIDTH);
      setCurrentPage(page);
    }
  };

  const onScrollEnd = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const page = Math.round(offsetX / SCREEN_WIDTH);
    if (page !== currentPage) setCurrentPage(page);
  };

  const handleCapture = async () => {
    if (cameraMode === "TEXTE") {
      if (!textModeContent.trim()) return;
      handleUploadText();
      return;
    }
    if (cameraMode === "VIDEO") {
      if (isRecording) { stopVideoRecording(); } else { startVideoRecording(); }
      return;
    }
    // Mode PHOTO — freeze instantané style Snapchat
    if (!cameraRef.current || isRecording || capturing) return;
    setCapturing(true);
    // Flash blanc instantané pour feedback visuel + freeze le preview
    setFrozenUri("flash");
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: true, skipProcessing: true });
      if (photo?.base64) {
        setCaptureData(photo.base64, photo.uri);
        setFrozenUri(null);
        router.push(`/(app)/groups/${id}/preview`);
      } else {
        setFrozenUri(null);
      }
    } catch (e: any) {
      setFrozenUri(null);
      showToast("Erreur", "Impossible de prendre la photo.");
    } finally {
      setCapturing(false);
    }
  };

  const startVideoRecording = async () => {
    if (!cameraRef.current || isRecording) return;
    setIsRecording(true);
    setRecordingSeconds(0);
    recordingTimer.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    try {
      const video = await cameraRef.current.recordAsync();
      if (video) {
        showToast("Info", "L'envoi de vidéos arrive bientôt.", "info");
      }
    } catch (e: any) {
      stopVideoRecording();
    }
  };

  const stopVideoRecording = () => {
    if (!isRecording) return;
    cameraRef.current?.stopRecording();
    setIsRecording(false);
    if (recordingTimer.current) clearInterval(recordingTimer.current);
  };

  const handleUploadText = async () => {
    setUploading(true);
    try {
      await supabase.from("photos").insert({ group_id: id, user_id: user?.id, image_path: "text_mode", note: textModeContent.trim() });
      setTextModeContent(""); await fetchData(); jumpTo(2);
      showToast("Moment envoyé", "Ton texte a été ajouté au coffre.", "success");
    } catch (e: any) { showToast("Erreur", translateError(e.message)); } finally { setUploading(false); }
  };

  // Interpolations pour le Stacking Effect
  const cameraTranslateX = scrollX.interpolate({ inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH], outputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH] });
  const cameraScale = scrollX.interpolate({ inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH], outputRange: [0.9, 1, 0.9] });
  const cameraOpacity = scrollX.interpolate({ inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH], outputRange: [0.4, 1, 0.4] });

  const isBlocked = capturing || uploading;

  if (!dataLoaded) return <View style={[styles.container, styles.center]}><Loader size={48} /></View>;

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        ref={scrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        scrollEnabled={!isBlocked}
        onMomentumScrollEnd={(e) => setCurrentPage(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        scrollEventThrottle={16} contentOffset={{ x: SCREEN_WIDTH, y: 0 }} style={styles.pager}
      >
        {/* PAGE 0: PROFILE (Slides over Camera) */}
        <View key="page-0" style={[styles.page, { zIndex: 10 }]}>
          <View style={[styles.pageContent, { paddingTop: insets.top + 40 }]}>
            <Text style={styles.pageTitle}>Profil</Text>
            <View style={styles.profileBody}>
              <TouchableOpacity onPress={updateAvatar} style={styles.avatarCircle} disabled={isBlocked}>
                {avatarUrl ? ( <Image source={{ uri: avatarUrl }} style={styles.avatarImg} /> ) : ( <Text style={styles.avatarText}>{(username ? username[0] : "?").toUpperCase()}</Text> )}
                <View style={styles.editBadge}><Text style={styles.editBadgeText}>{uploading ? "..." : "Modifier"}</Text></View>
              </TouchableOpacity>
              <View style={styles.infoBox}>
                <Text style={styles.infoLabel}>Identité</Text><Text style={styles.infoValue}>{username || "—"}</Text>
                <View style={styles.divider} /><Text style={styles.infoLabel}>Contact</Text><Text style={styles.infoValue}>{email || user?.email}</Text>
              </View>
              <TouchableOpacity style={styles.logoutBtn} onPress={() => logout()} disabled={isBlocked}><Text style={styles.logoutText}>Se déconnecter</Text></TouchableOpacity>
            </View>
          </View>
        </View>

        {/* PAGE 1: CAMERA (Fixed underneath) */}
        <Animated.View style={[styles.page, { transform: [{ translateX: cameraTranslateX }, { scale: cameraScale }], opacity: cameraOpacity, zIndex: 1 }]}>
          {cameraMode === "TEXTE" ? (
            <View style={styles.textModeContainer}><TextInput style={styles.textModeInput} placeholder="Écris..." placeholderTextColor="rgba(255,255,255,0.3)" multiline value={textModeContent} onChangeText={setTextModeContent} maxLength={400} autoFocus disabled={isBlocked} /></View>
          ) : (
            <>
              <StandardCamera ref={cameraRef} isActive mode={cameraMode === "VIDEO" ? "video" : "picture"} facing={facing} flash={flash} zoom={zoom} />
              {frozenUri && (
                frozenUri === "flash"
                  ? <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]} />
                  : <Image source={{ uri: frozenUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              )}
            </>
          )}

          {/* Camera UI Overlay */}
          {!frozenUri && (
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              {cameraMode !== "TEXTE" && (
                <TouchableOpacity style={[styles.topControlBtn, { top: insets.top + 20, right: 20 }]} onPress={() => setFlash(prev => prev === 'off' ? 'on' : prev === 'on' ? 'auto' : 'off')} disabled={isBlocked}>
                  <FlashIcon mode={flash} />
                </TouchableOpacity>
              )}

              {isRecording && (
                <View style={[styles.recordingTimer, { top: insets.top + 40 }]}>
                  <View style={styles.recordingDot} /><Text style={styles.recordingText}>{Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}</Text>
                </View>
              )}

              <View style={[styles.cameraFooter, { bottom: insets.bottom + 100 }]}>
                <View style={styles.modeSlider}>
                  {["PHOTO", "VIDEO", "TEXTE"].map((m: any) => (
                    <TouchableOpacity key={m} onPress={() => setCameraMode(m)} disabled={isRecording || isBlocked}><Text style={[styles.modeText, cameraMode === m && styles.modeTextActive]}>{m}</Text></TouchableOpacity>
                  ))}
                </View>
                <View style={styles.captureRow}>
                  <View style={styles.sideControlPlaceholder} />
                  <TouchableOpacity
                    style={[styles.captureBtn, (cameraMode === "VIDEO" || isRecording) && styles.captureBtnVideo, isRecording && styles.captureBtnRecording]}
                    onPress={handleCapture}
                    activeOpacity={0.8}
                    disabled={isBlocked}
                  >
                    <View style={[styles.captureInner, (cameraMode === "VIDEO" || isRecording) && styles.captureInnerVideo, isRecording && styles.captureInnerRecording]}>
                      {cameraMode === "TEXTE" && <SendIcon color="#000" />}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.flipBtn} onPress={() => setFacing(prev => prev === 'back' ? 'front' : 'back')} disabled={isRecording || isBlocked}>
                    <FlipIcon />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

        </Animated.View>

        {/* PAGE 2: VAULT (Slides over Camera) */}
        <View key="page-2" style={[styles.page, { zIndex: 10 }]}>
          {unlocked && (
            <TouchableOpacity style={[styles.closeVaultBtn, { top: insets.top + 20 }]} onPress={() => setDevMode(false)}>
              <Text style={styles.closeVaultText}>🔒 Fermer</Text>
            </TouchableOpacity>
          )}

          {unlocked ? (
            <View style={styles.vaultUnlocked}><PhotoFeed photos={photos} onReactPress={(pid) => console.log("React to", pid)} nextUnlockDate={getWeekBounds().sunday} /></View>
          ) : (
            <ScrollView style={[styles.pageContent, { paddingTop: insets.top + 40 }]} contentContainerStyle={{ paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
              <View style={styles.vaultHeader}><Text style={styles.pageTitleNoPad}>{groupName || "Groupe"}</Text><TouchableOpacity onPress={() => setShowMembersModal(true)} style={styles.groupBtn}><GroupIcon /></TouchableOpacity></View>
              <View style={styles.vaultBody}>
                <View style={styles.vaultLockedContent}><VaultCounter totalCount={photoCount} userCount={userPhotoCount} unlockDate={getWeekBounds().sunday} /></View>
                <View style={styles.debugSection}>
                  <Text style={styles.debugTitle}>Debug Tools</Text>
                  <TouchableOpacity style={[styles.devToggle, devMode && styles.devToggleActive]} onPress={() => { setDevMode(!devMode); if (!devMode) fetchData(); }}>
                    <Text style={[styles.devToggleText, devMode && styles.devToggleTextActive]}>Simuler Dimanche 20h</Text>
                  </TouchableOpacity>
                  
                  <View style={styles.debugNotifRow}>
                    <TouchableOpacity style={styles.debugBtnHalf} onPress={() => scheduleImmediateLocalNotification("TEST LOCAL", "Notification immédiate")}>
                      <Text style={styles.debugBtnText}>Notif Locale</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.debugBtnHalf} onPress={() => scheduleImmediateLocalNotification(groupName, `${username} a partagé un moment !`, { type: "new_photo", groupId: id })}>
                      <Text style={styles.debugBtnText}>Notif Photo</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.debugNotifRow}>
                    <TouchableOpacity style={styles.debugBtnHalf} onPress={() => scheduleImmediateLocalNotification("Le coffre est ouvert !", `Les moments de "${groupName}" sont disponibles`, { type: "recap", groupId: id })}>
                      <Text style={styles.debugBtnText}>Notif Coffre</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.debugBtnHalf} onPress={() => scheduleImmediateLocalNotification("Nouvelle invitation !", `Tu as été invité à rejoindre "${groupName}"`, { type: "invite", groupName })}>
                      <Text style={styles.debugBtnText}>Notif Invit</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity style={[styles.debugBtn, { borderColor: "rgba(255,0,0,0.3)" }]} onPress={() => cancelAllRecapNotifications()}>
                    <Text style={[styles.debugBtnText, { color: "#FF4444" }]}>Annuler toutes les notifs</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          )}
        </View>
      </Animated.ScrollView>

      {/* NAV BAR */}
      <View style={[styles.tabBarContainer, { paddingBottom: insets.bottom }]}>
        <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.tabBarContent}>
          <TouchableOpacity style={styles.tab} onPress={() => jumpTo(0)} disabled={isBlocked}><ProfileIcon color={currentPage === 0 ? "#FFF" : "rgba(255,255,255,0.4)"} size={24} /><Text style={[styles.tabLabel, currentPage === 0 && styles.tabLabelActive]}>Profil</Text></TouchableOpacity>
          <TouchableOpacity style={styles.tab} onPress={() => jumpTo(1)} disabled={isBlocked}><MomentIcon color={currentPage === 1 ? "#FFF" : "rgba(255,255,255,0.4)"} size={28} /><Text style={[styles.tabLabel, currentPage === 1 && styles.tabLabelActive]}>Moment</Text></TouchableOpacity>
          <TouchableOpacity style={styles.tab} onPress={() => jumpTo(2)} disabled={isBlocked}><VaultIcon color={currentPage === 2 ? "#FFF" : "rgba(255,255,255,0.4)"} size={24} /><Text style={[styles.tabLabel, currentPage === 2 && styles.tabLabelActive]}>Coffre</Text></TouchableOpacity>
        </View>
      </View>

      <Modal visible={showMembersModal} animationType="slide" transparent onRequestClose={() => setShowMembersModal(false)}>
        <View style={styles.darkModalOverlay}>
          <View style={[styles.modalContent, { paddingTop: insets.top + 40 }]}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>Membres</Text><TouchableOpacity onPress={() => setShowMembersModal(false)}><Text style={styles.closeModalText}>Fermer</Text></TouchableOpacity></View>
            <FlatList data={members} keyExtractor={(item, i) => i.toString()} renderItem={({ item }) => (
              <View style={styles.memberItem}>
                <View style={styles.memberAvatar}>{item.avatar_url ? <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} /> : <Text style={styles.memberAvatarText}>{item.username[0]?.toUpperCase()}</Text>}</View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{item.username}</Text>
                  <Text style={styles.memberRole}>{item.role === "admin" ? "Admin" : "Membre"}</Text>
                </View>
                {isAdmin && item.role !== "admin" && (
                  <TouchableOpacity style={styles.removeMemberBtn} onPress={() => handleRemoveMember(item.user_id, item.username)}>
                    <Text style={styles.removeMemberText}>Retirer</Text>
                  </TouchableOpacity>
                )}
              </View>
            )} ListFooterComponent={isAdmin ? () => ( <TouchableOpacity style={[theme.outlineButton, styles.inviteModalBtn]} onPress={() => { setShowMembersModal(false); router.push(`/(app)/groups/${id}/invite`); }}><Text style={theme.outlineButtonText}>Ajouter un membre</Text></TouchableOpacity> ) : null} />
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
  pageTitle: { fontFamily: "Inter_700Bold", fontSize: 28, color: "#FFF", marginBottom: 40, letterSpacing: -1, paddingHorizontal: 24 },
  pageTitleNoPad: { fontFamily: "Inter_700Bold", fontSize: 28, color: "#FFF", letterSpacing: -1 },
  profileBody: { flex: 1, paddingHorizontal: 24, alignItems: "center" },
  avatarCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center", marginBottom: 32, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  avatarImg: { width: "100%", height: "100%" },
  avatarText: { fontFamily: "Inter_700Bold", fontSize: 48, color: "#FFF" },
  editBadge: { position: "absolute", bottom: 0, width: "100%", backgroundColor: "rgba(0,0,0,0.7)", paddingVertical: 6, alignItems: "center" },
  editBadgeText: { color: "#FFF", fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  infoBox: { width: "100%", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 20, padding: 24, gap: 8 },
  infoLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 },
  infoValue: { fontSize: 18, fontFamily: "Inter_400Regular", color: "#FFF", marginBottom: 8 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.1)", marginVertical: 8 },
  logoutBtn: { marginTop: 40, padding: 16 },
  logoutText: { color: "#FF5555", fontFamily: "Inter_600SemiBold" },
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
  memberAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center", overflow: "hidden" },
  memberAvatarText: { color: "#FFF", fontFamily: "Inter_700Bold" },
  memberName: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 16 },
  memberRole: { color: "rgba(255,255,255,0.4)", fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  removeMemberBtn: { backgroundColor: "rgba(255,68,68,0.15)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  removeMemberText: { color: "#FF4444", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  inviteModalBtn: { marginTop: 24, marginBottom: 40 },
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
  tabBarContainer: { position: "absolute", bottom: 0, left: 0, right: 0, height: 100, overflow: "hidden", zIndex: 100, backgroundColor: "rgba(10,10,10,0.92)" },
  tabBarContent: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-evenly", paddingTop: 12 },
  tab: { alignItems: "center", justifyContent: "center", gap: 4, width: SCREEN_WIDTH / 3 },
  tabLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.4)" },
  tabLabelActive: { color: "#FFF" },
  debugSection: { marginTop: 40, paddingHorizontal: 24, gap: 12 },
  debugTitle: { color: "rgba(255,255,255,0.3)", fontSize: 12, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  debugBtn: { backgroundColor: "rgba(255,255,255,0.15)", padding: 16, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  debugBtnText: { color: "#FFF", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  debugNotifRow: { flexDirection: "row", gap: 12 },
  debugBtnHalf: { flex: 1, backgroundColor: "rgba(255,255,255,0.15)", padding: 16, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  devToggle: { borderWidth: 2, borderColor: "#FFF", borderRadius: 16, padding: 18, alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)" },
  devToggleActive: { backgroundColor: "#FFF" },
  devToggleText: { fontFamily: "Inter_700Bold", color: "#FFF", fontSize: 13, textTransform: "uppercase" },
  devToggleTextActive: { color: "#000" },
  closeVaultBtn: { position: "absolute", right: 20, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 100, zIndex: 1000 },
  closeVaultText: { color: "#FFF", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  blockingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", zIndex: 9999 },
  blockingText: { color: "#FFF", fontFamily: "Inter_600SemiBold", marginTop: 16, fontSize: 16 },
});
