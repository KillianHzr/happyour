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
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { CameraView, CameraType, FlashMode } from "expo-camera";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../lib/auth-context";
import { colors, theme } from "../../../lib/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
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

const FeatherIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h3.5l6.74-6.74z" />
    <Path d="M16 8L2 22" />
    <Path d="M17.5 15H9" />
  </Svg>
);

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
  const [dataLoaded, setDataLoaded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1); 
  const [devMode, setDevMode] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);

  const [cameraMode, setCameraMode] = useState<CameraMode>("PHOTO");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimer = useRef<NodeJS.Timeout | null>(null);

  const [capturing, setCapturing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [textModeContent, setTextModeContent] = useState("");
  const [note, setNote] = useState("");

  const unlocked = isVaultUnlocked() || devMode;
  const cameraRef = useRef<CameraView>(null);

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
        supabase.from("group_members").select("profiles:user_id(username, avatar_url)").eq("group_id", id)
      ]);

      if (groupRes.data) setGroupName(groupRes.data.name);
      if (profileRes.data) {
        setUsername(profileRes.data.username);
        setAvatarUrl(profileRes.data.avatar_url);
        setEmail(profileRes.data.email || user.email || "");
      }
      if (membersRes.data) setMembers(membersRes.data.map((m: any) => m.profiles));
      
      if (photosRes.data) {
        const pData = photosRes.data;
        setPhotoCount(pData.length);
        setUserPhotoCount(pData.filter((p: any) => p.user_id === user.id).length);
        
        if (unlocked) {
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
      }
      setDataLoaded(true);
    } catch (e) {
      console.error("fetchData error:", e);
      setDataLoaded(true);
    }
  }, [id, user, unlocked]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
        await supabase.storage.from("moments").upload(filePath, decode(result.assets[0].base64), { 
          contentType: "image/jpeg", 
          upsert: true 
        });
        
        const { data: urlData } = supabase.storage.from("moments").getPublicUrl(filePath);
        const newUrl = urlData.publicUrl;
        
        const { error: upErr } = await supabase.from("profiles").update({ avatar_url: newUrl }).eq("id", user?.id);
        if (upErr) throw upErr;
        
        setAvatarUrl(newUrl);
        Alert.alert("Succès", "Photo de profil mise à jour.");
      } catch (e: any) {
        Alert.alert("Erreur", e.message);
      } finally {
        setUploading(false);
      }
    }
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
    if (!cameraRef.current) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: true });
      if (photo?.base64) {
        setCapturedBase64(photo.base64);
        setCapturedUri(photo.uri);
      }
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
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
        setCapturedUri(video.uri);
        Alert.alert("Succès", "Vidéo capturée !");
      }
    } catch (e: any) {
      console.error(e);
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
      await supabase.from("photos").insert({
        group_id: id,
        user_id: user?.id,
        image_path: "text_mode",
        note: textModeContent.trim(),
      });
      setTextModeContent("");
      await fetchData();
      jumpTo(2);
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleUploadPhoto = async () => {
    if (!capturedBase64 || !user) return;
    setUploading(true);
    try {
      const fileName = `${id}/${user.id}_${Date.now()}.jpg`;
      await supabase.storage.from("moments").upload(fileName, decode(capturedBase64), { contentType: "image/jpeg" });
      await supabase.from("photos").insert({
        group_id: id,
        user_id: user.id,
        image_path: fileName,
        note: note.trim() || null,
      });
      setCapturedBase64(null); setNote(""); await fetchData(); jumpTo(2); 
    } catch (e: any) { Alert.alert("Erreur", e.message); } finally { setUploading(false); }
  };

  const cameraTranslateX = scrollX.interpolate({ inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH], outputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH] });
  const cameraScale = scrollX.interpolate({ inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH], outputRange: [0.9, 1, 0.9] });
  const cameraOpacity = scrollX.interpolate({ inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH], outputRange: [0.4, 1, 0.4] });

  if (!dataLoaded) return <View style={[styles.container, styles.center]}><Loader size={48} /></View>;

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setCurrentPage(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        contentOffset={{ x: SCREEN_WIDTH, y: 0 }} 
        style={styles.pager}
      >
        {/* PAGE 0: PROFILE */}
        <View key="page-0" style={[styles.page, { zIndex: 10 }]}>
          <View style={[styles.pageContent, { paddingTop: insets.top + 40 }]}>
            <Text style={styles.pageTitle}>Profil</Text>
            <View style={styles.profileBody}>
              <TouchableOpacity onPress={updateAvatar} style={styles.avatarCircle} activeOpacity={0.8}>
                {avatarUrl ? ( <Image source={{ uri: avatarUrl }} style={styles.avatarImg} /> ) : ( <Text style={styles.avatarText}>{(username ? username[0] : "?").toUpperCase()}</Text> )}
                <View style={styles.editBadge}><Text style={styles.editBadgeText}>{uploading ? "..." : "Modifier"}</Text></View>
              </TouchableOpacity>
              <View style={styles.infoBox}>
                <Text style={styles.infoLabel}>Identité</Text><Text style={styles.infoValue}>{username || "—"}</Text>
                <View style={styles.divider} /><Text style={styles.infoLabel}>Contact</Text><Text style={styles.infoValue}>{email || user?.email}</Text>
              </View>
              <TouchableOpacity style={styles.logoutBtn} onPress={() => logout()}><Text style={styles.logoutText}>Se déconnecter</Text></TouchableOpacity>
            </View>
          </View>
        </View>

        {/* PAGE 1: CAMERA */}
        <Animated.View style={[styles.page, { transform: [{ translateX: cameraTranslateX }, { scale: cameraScale }], opacity: cameraOpacity, zIndex: 1 }]}>
          {cameraMode === "TEXTE" ? (
            <View style={styles.textModeContainer}>
              <TextInput style={styles.textModeInput} placeholder="Écris..." placeholderTextColor="rgba(255,255,255,0.3)" multiline value={textModeContent} onChangeText={setTextModeContent} autoFocus />
            </View>
          ) : (
            <StandardCamera ref={cameraRef} isActive={currentPage === 1 && !capturedBase64} mode={cameraMode === "VIDEO" ? "video" : "picture"} />
          )}

          {isRecording && (
            <View style={[styles.recordingTimer, { top: insets.top + 40 }]}>
              <View style={styles.recordingDot} /><Text style={styles.recordingText}>{Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}</Text>
            </View>
          )}

          {capturedBase64 ? (
            <View style={StyleSheet.absoluteFill}>
              <Image source={{ uri: capturedUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <TouchableOpacity style={[styles.backCaptureBtn, { top: insets.top + 20 }]} onPress={() => setCapturedBase64(null)}><Text style={styles.backCaptureText}>×</Text></TouchableOpacity>
              {note ? ( <Pressable style={styles.centeredNotePreview} onPress={() => setIsEditingNote(true)}><View style={styles.noteTag}><Text style={styles.noteTagText}>{note}</Text></View></Pressable> ) : null}
              <View style={[styles.postCaptureActions, { bottom: insets.bottom + 40 }]}>
                <TouchableOpacity style={styles.sideActionBtn} onPress={() => setIsEditingNote(true)}><FeatherIcon /></TouchableOpacity>
                <TouchableOpacity style={styles.sendCaptureBtn} onPress={handleUploadPhoto} disabled={uploading}><View style={styles.sendCaptureInner}>{uploading ? <Loader size={24} /> : <SendIcon color="#000" />}</View></TouchableOpacity>
              </View>
              <Modal visible={isEditingNote} transparent animationType="fade" onRequestClose={() => setIsEditingNote(false)}>
                <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill}>
                  <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.noteEditorContainer}>
                    <TextInput style={styles.largeNoteInput} placeholder="Note..." placeholderTextColor="rgba(255,255,255,0.3)" value={note} onChangeText={setNote} maxLength={140} multiline autoFocus />
                    <TouchableOpacity style={styles.doneNoteBtn} onPress={() => setIsEditingNote(false)}><Text style={styles.doneNoteText}>Terminé</Text></TouchableOpacity>
                  </KeyboardAvoidingView>
                </BlurView>
              </Modal>
            </View>
          ) : (
            <View style={[styles.cameraFooter, { bottom: insets.bottom + 100 }]}>
              <View style={styles.modeSlider}>
                {["PHOTO", "VIDEO", "TEXTE"].map((m: any) => (
                  <TouchableOpacity key={m} onPress={() => setCameraMode(m)} disabled={isRecording}><Text style={[styles.modeText, cameraMode === m && styles.modeTextActive]}>{m}</Text></TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity 
                style={[styles.captureBtn, cameraMode === "VIDEO" && styles.captureBtnVideo, isRecording && styles.captureBtnRecording]} 
                onPress={handleCapture}
                onLongPress={() => cameraMode !== "TEXTE" && startVideoRecording()}
                onPressOut={() => isRecording && stopVideoRecording()}
                disabled={capturing} 
                activeOpacity={0.8}
              >
                <View style={[styles.captureInner, (cameraMode === "VIDEO" || isRecording) && styles.captureInnerVideo, isRecording && styles.captureInnerRecording]}>
                  {cameraMode === "TEXTE" && <SendIcon color="#000" />}
                </View>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>

        {/* PAGE 2: VAULT */}
        <View key="page-2" style={[styles.page, { zIndex: 10 }]}>
          {unlocked ? (
            <View style={styles.vaultUnlocked}><PhotoFeed photos={photos} onReactPress={(pid) => console.log("React to", pid)} /></View>
          ) : (
            <ScrollView style={[styles.pageContent, { paddingTop: insets.top + 40 }]} contentContainerStyle={{ paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
              <View style={styles.vaultHeader}>
                <Text style={styles.pageTitleNoPad}>{groupName || "Groupe"}</Text>
                <TouchableOpacity onPress={() => setShowMembersModal(true)} style={styles.groupBtn}><GroupIcon /></TouchableOpacity>
              </View>
              <View style={styles.vaultBody}>
                <View style={styles.vaultLockedContent}><VaultCounter totalCount={photoCount} userCount={userPhotoCount} unlockDate={getWeekBounds().sunday} /></View>
                <View style={styles.debugSection}>
                  <Text style={styles.debugTitle}>Debug Tools</Text>
                  <TouchableOpacity style={[styles.devToggle, devMode && styles.devToggleActive]} onPress={() => { setDevMode(!devMode); if (!devMode) fetchData(); }}>
                    <Text style={[styles.devToggleText, devMode && styles.devToggleTextActive]}>Simuler Dimanche 20h</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.debugBtn} onPress={() => scheduleImmediateLocalNotification("Test !", "Ceci est une notification de test.")}><Text style={styles.debugBtnText}>Tester Notification Locale</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.debugBtn} onPress={() => cancelAllRecapNotifications()}><Text style={styles.debugBtnText}>Annuler toutes les notifs</Text></TouchableOpacity>
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
          <TouchableOpacity style={styles.tab} onPress={() => jumpTo(0)} activeOpacity={0.7}><ProfileIcon color={currentPage === 0 ? "#FFF" : "rgba(255,255,255,0.4)"} size={24} /><Text style={[styles.tabLabel, currentPage === 0 && styles.tabLabelActive]}>Profil</Text></TouchableOpacity>
          <TouchableOpacity style={styles.tab} onPress={() => jumpTo(1)} activeOpacity={0.7}><MomentIcon color={currentPage === 1 ? "#FFF" : "rgba(255,255,255,0.4)"} size={28} /><Text style={[styles.tabLabel, currentPage === 1 && styles.tabLabelActive]}>Moment</Text></TouchableOpacity>
          <TouchableOpacity style={styles.tab} onPress={() => jumpTo(2)} activeOpacity={0.7}><VaultIcon color={currentPage === 2 ? "#FFF" : "rgba(255,255,255,0.4)"} size={24} /><Text style={[styles.tabLabel, currentPage === 2 && styles.tabLabelActive]}>Coffre</Text></TouchableOpacity>
        </View>
      </View>

      {/* MEMBERS MODAL */}
      <Modal visible={showMembersModal} animationType="slide" transparent onRequestClose={() => setShowMembersModal(false)}>
        <View style={styles.darkModalOverlay}>
          <View style={[styles.modalContent, { paddingTop: insets.top + 40 }]}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>Membres</Text><TouchableOpacity onPress={() => setShowMembersModal(false)}><Text style={styles.closeModalText}>Fermer</Text></TouchableOpacity></View>
            <FlatList data={members} keyExtractor={(item, i) => i.toString()} renderItem={({ item }) => (
              <View style={styles.memberItem}><View style={styles.memberAvatar}>{item.avatar_url ? <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} /> : <Text style={styles.memberAvatarText}>{item.username[0]?.toUpperCase()}</Text>}</View><Text style={styles.memberName}>{item.username}</Text></View>
            )} ListFooterComponent={() => ( <TouchableOpacity style={[theme.outlineButton, styles.inviteModalBtn]} onPress={() => { setShowMembersModal(false); router.push(`/(app)/groups/${id}/invite`); }}><Text style={theme.outlineButtonText}>Ajouter un membre</Text></TouchableOpacity> )} />
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
  inviteModalBtn: { marginTop: 24, marginBottom: 40 },
  cameraFooter: { position: "absolute", left: 0, right: 0, alignItems: "center", gap: 24 },
  modeSlider: { flexDirection: "row", gap: 20, backgroundColor: "rgba(0,0,0,0.3)", paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
  modeText: { color: "rgba(255,255,255,0.4)", fontFamily: "Inter_700Bold", fontSize: 12 },
  modeTextActive: { color: "#FFF" },
  captureBtn: { width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: "#FFF", justifyContent: "center", alignItems: "center" },
  captureBtnVideo: { borderColor: "rgba(255,59,48,0.5)" },
  captureBtnRecording: { borderColor: "#FF3B30" },
  captureInner: { width: 66, height: 66, borderRadius: 33, backgroundColor: "#FFF", justifyContent: "center", alignItems: "center" },
  captureInnerVideo: { backgroundColor: "#FF3B30" },
  captureInnerRecording: { width: 30, height: 30, borderRadius: 6 },
  recordingTimer: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, gap: 8 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FF3B30" },
  recordingText: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  textModeContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40, backgroundColor: "#0A0A0A" },
  textModeInput: { fontSize: 32, color: "#FFF", fontFamily: "Inter_700Bold", textAlign: "center", width: "100%" },
  confirmOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end", padding: 24, paddingBottom: 120 },
  noteBox: { padding: 24, gap: 20 },
  noteInput: { fontSize: 18, color: "#FFF", fontFamily: "Inter_400Regular", minHeight: 80 },
  confirmActions: { flexDirection: "row", gap: 12, alignItems: "center" },
  cancelBtn: { flex: 1, alignItems: "center" },
  cancelBtnText: { color: "rgba(255,255,255,0.6)", fontFamily: "Inter_600SemiBold" },
  tabBarContainer: { position: "absolute", bottom: 0, left: 0, right: 0, height: 100, overflow: "hidden", zIndex: 100, backgroundColor: "rgba(10,10,10,0.92)" },
  tabBarContent: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-evenly", paddingTop: 12 },
  tab: { alignItems: "center", justifyContent: "center", gap: 4, width: SCREEN_WIDTH / 3 },
  tabLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.4)" },
  tabLabelActive: { color: "#FFF" },
  debugSection: { marginTop: 40, paddingHorizontal: 24, gap: 12 },
  debugTitle: { color: "rgba(255,255,255,0.3)", fontSize: 12, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  debugBtn: { backgroundColor: "rgba(255,255,255,0.15)", padding: 16, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  debugBtnText: { color: "#FFF", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  devToggle: { borderWidth: 2, borderColor: "#FFF", borderRadius: 16, padding: 18, alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)" },
  devToggleActive: { backgroundColor: "#FFF" },
  devToggleText: { fontFamily: "Inter_700Bold", color: "#FFF", fontSize: 13, textTransform: "uppercase" },
  devToggleTextActive: { color: "#000" },
  backCaptureBtn: { position: "absolute", left: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  backCaptureText: { color: "#FFF", fontSize: 32, fontWeight: "300" },
  postCaptureActions: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 40 },
  sideActionBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  sendCaptureBtn: { width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: "#FFF", justifyContent: "center", alignItems: "center" },
  sendCaptureInner: { width: 66, height: 66, borderRadius: 33, backgroundColor: "#FFF", justifyContent: "center", alignItems: "center" },
  noteEditorContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  largeNoteInput: { width: "100%", color: "#FFF", fontSize: 28, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 40 },
  doneNoteBtn: { backgroundColor: "#FFF", paddingHorizontal: 32, paddingVertical: 14, borderRadius: 100 },
  doneNoteText: { color: "#000", fontFamily: "Inter_700Bold", fontSize: 16 },
  centeredNotePreview: { position: "absolute", top: "40%", left: 0, right: 0, alignItems: "center", paddingHorizontal: 40 },
  noteTag: { backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  noteTagText: { color: "#FFF", fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
});
