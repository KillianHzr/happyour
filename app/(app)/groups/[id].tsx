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
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { CameraView, FlashMode, CameraType } from "expo-camera";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { decode } from "base64-arraybuffer";
import Svg, { Path } from "react-native-svg";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../lib/auth-context";
import { colors, theme } from "../../../lib/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Components
import VaultCounter from "../../../components/VaultCounter";
import PhotoFeed, { type PhotoEntry, type Reaction } from "../../../components/PhotoFeed";
import Loader from "../../../components/Loader";
import StandardCamera from "../../../components/StandardCamera";
import { ProfileIcon, VaultIcon, MomentIcon } from "../../../components/icons";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

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

// Icons
const FlipIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path d="M20 11C20 15.4183 16.4183 19 12 19C10.1811 19 8.51592 18.3935 7.18605 17.3721M4 13C4 8.58172 7.58172 5 12 5C13.8189 5 15.4841 5.60649 16.8139 6.62791M16.8139 6.62791V3M16.8139 6.62791H20M7.18605 17.3721V21M7.18605 17.3721H4" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

const FlashIcon = ({ active }: { active: boolean }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke={active ? "#FFD700" : "#FFF"} fill={active ? "#FFD700" : "none"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

const SendIcon = () => (
  <Svg width="32" height="32" viewBox="0 0 24 24" fill="none">
    <Path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

type CameraMode = "PHOTO" | "VIDEO" | "TEXTE";

export default function MainPagerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  
  // -- Animation States --
  const scrollX = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const scrollRef = useRef<Animated.ScrollView>(null);

  const [groupName, setGroupName] = useState("");
  const [photoCount, setPhotoCount] = useState(0);
  const [userPhotoCount, setUserPhotoCount] = useState(0);
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [dataLoaded, setDataLoaded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1); 
  const [devMode, setDevMode] = useState(false);

  // -- Camera State --
  const cameraRef = useRef<CameraView>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>("PHOTO");
  const [facing, setFacing] = useState<CameraType>("back");
  const [flash, setFlash] = useState<FlashMode>("off");
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimer = useRef<NodeJS.Timeout | null>(null);

  const [capturing, setCapturing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [textModeContent, setTextModeContent] = useState("");
  const [note, setNote] = useState("");

  const unlocked = isVaultUnlocked() || devMode;

  const fetchData = async () => {
    if (!user || !id) return;
    try {
      const [groupRes, profileRes, photosRes] = await Promise.all([
        supabase.from("groups").select("name").eq("id", id).single(),
        supabase.from("profiles").select("username").eq("id", user.id).single(),
        supabase.from("photos")
          .select("id, image_path, created_at, note, user_id, profiles:user_id(username)")
          .eq("group_id", id)
          .gte("created_at", getWeekBounds().monday.toISOString())
          .order("created_at", { ascending: true })
      ]);
      if (groupRes.data) setGroupName(groupRes.data.name);
      if (profileRes.data) setUsername(profileRes.data.username);
      if (photosRes.data) {
        const pData = photosRes.data;
        setPhotoCount(pData.length);
        setUserPhotoCount(pData.filter((p: any) => p.user_id === user.id).length);
        if (unlocked) {
          setPhotos(pData.map((p: any) => ({
            id: p.id,
            url: supabase.storage.from("moments").getPublicUrl(p.image_path).data.publicUrl,
            created_at: p.created_at,
            note: p.note ?? null,
            username: p.profiles?.username ?? "Anonyme",
            reactions: [], 
          })));
        }
      }
      setDataLoaded(true);
    } catch (e) {
      setDataLoaded(true);
    }
  };

  useEffect(() => { fetchData(); }, [id, user, unlocked]);

  const jumpTo = (page: number) => {
    scrollRef.current?.scrollTo({ x: page * SCREEN_WIDTH, animated: false });
    setCurrentPage(page);
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
    
    if (!cameraRef.current) return;

    if (cameraMode === "PHOTO") {
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
    } else if (cameraMode === "VIDEO") {
      if (isRecording) {
        cameraRef.current.stopRecording();
        setIsRecording(false);
        if (recordingTimer.current) clearInterval(recordingTimer.current);
        setRecordingSeconds(0);
      } else {
        setIsRecording(true);
        setRecordingSeconds(0);
        recordingTimer.current = setInterval(() => {
          setRecordingSeconds(prev => prev + 1);
        }, 1000);
        
        try {
          const video = await cameraRef.current.recordAsync();
          if (video) {
            setCapturedUri(video.uri);
            Alert.alert("Vidéo", "Capture réussie !");
          }
        } catch (e: any) {
          Alert.alert("Erreur Vidéo", e.message);
          setIsRecording(false);
          if (recordingTimer.current) clearInterval(recordingTimer.current);
        }
      }
    }
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

  const handleUploadPhoto = async (withNote: boolean) => {
    if (!capturedBase64 || !user) return;
    setUploading(true);
    try {
      const fileName = `${id}/${user.id}_${Date.now()}.jpg`;
      await supabase.storage.from("moments").upload(fileName, decode(capturedBase64), { contentType: "image/jpeg" });
      await supabase.from("photos").insert({
        group_id: id,
        user_id: user.id,
        image_path: fileName,
        note: withNote ? note.trim() || null : null,
      });
      setCapturedBase64(null);
      setNote("");
      await fetchData(); 
      jumpTo(2); 
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setUploading(false);
    }
  };

  const cameraTranslateX = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH],
    outputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
  });
  const cameraScale = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH],
    outputRange: [0.9, 1, 0.9],
  });
  const cameraOpacity = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH],
    outputRange: [0.4, 1, 0.4],
  });

  if (!dataLoaded) {
    return <View style={[styles.container, styles.center]}><Loader size={48} /></View>;
  }

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
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
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{(username ? username[0] : "?").toUpperCase()}</Text>
              </View>
              <View style={styles.infoBox}>
                <Text style={styles.infoLabel}>Identité</Text><Text style={styles.infoValue}>{username || "Chargement..."}</Text>
                <View style={styles.divider} /><Text style={styles.infoLabel}>Contact</Text><Text style={styles.infoValue}>{email}</Text>
              </View>
              <TouchableOpacity style={styles.logoutBtn} onPress={() => logout()}><Text style={styles.logoutText}>Se déconnecter</Text></TouchableOpacity>
            </View>
          </View>
        </View>

        {/* PAGE 1: CAMERA */}
        <Animated.View style={[styles.page, { transform: [{ translateX: cameraTranslateX }, { scale: cameraScale }], opacity: cameraOpacity, zIndex: 1 }]}>
          {cameraMode === "TEXTE" ? (
            <View style={styles.textModeContainer}>
              <TextInput style={styles.textModeInput} placeholder="Écris quelque chose..." placeholderTextColor="rgba(255,255,255,0.3)" multiline value={textModeContent} onChangeText={setTextModeContent} autoFocus />
            </View>
          ) : (
            <StandardCamera 
              ref={cameraRef} 
              isActive={currentPage === 1 && !capturedBase64} 
              facing={facing}
              flash={flash}
              mode={cameraMode === "VIDEO" ? "video" : "picture"}
            />
          )}

          {/* Camera Controls */}
          {currentPage === 1 && !capturedBase64 && cameraMode !== "TEXTE" && (
            <View style={[styles.cameraControls, { top: insets.top + 20 }]}>
              <TouchableOpacity onPress={() => setFlash(flash === "off" ? "on" : "off")} style={styles.controlBtn}>
                <FlashIcon active={flash === "on"} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setFacing(facing === "back" ? "front" : "back")} style={styles.controlBtn}>
                <FlipIcon />
              </TouchableOpacity>
            </View>
          )}

          {isRecording && (
            <View style={[styles.recordingTimer, { top: insets.top + 40 }]}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>
                {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}
              </Text>
            </View>
          )}

          {capturedBase64 ? (
            <View style={StyleSheet.absoluteFill}>
              <Image source={{ uri: capturedUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.confirmOverlay}>
                <View style={[theme.glassCard, styles.noteBox]}>
                  <TextInput style={styles.noteInput} placeholder="Note..." placeholderTextColor="rgba(255,255,255,0.4)" value={note} onChangeText={setNote} maxLength={140} multiline />
                  <View style={styles.confirmActions}>
                    <TouchableOpacity style={theme.accentButton} onPress={() => handleUploadPhoto(true)}><Text style={theme.accentButtonText}>{uploading ? "..." : "Envoyer"}</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => setCapturedBase64(null)} style={styles.cancelBtn}><Text style={styles.cancelBtnText}>Annuler</Text></TouchableOpacity>
                  </View>
                </View>
              </KeyboardAvoidingView>
            </View>
          ) : (
            <View style={[styles.cameraFooter, { bottom: insets.bottom + 100 }]}>
              <View style={styles.modeSlider}>
                {(["PHOTO", "VIDEO", "TEXTE"] as CameraMode[]).map((m) => (
                  <TouchableOpacity key={m} onPress={() => setCameraMode(m)} disabled={isRecording}>
                    <Text style={[styles.modeText, cameraMode === m && styles.modeTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity 
                style={[
                  styles.captureBtn, 
                  cameraMode === "VIDEO" && styles.captureBtnVideo,
                  isRecording && styles.captureBtnRecording
                ]} 
                onPress={handleCapture} 
                disabled={capturing} 
                activeOpacity={0.8}
              >
                <View style={[
                  styles.captureInner, 
                  cameraMode === "VIDEO" && styles.captureInnerVideo,
                  isRecording && styles.captureInnerRecording
                ]}>
                  {cameraMode === "TEXTE" && <SendIcon />}
                </View>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>

        {/* PAGE 2: VAULT */}
        <View key="page-2" style={[styles.page, { zIndex: 10 }]}>
          <View style={[styles.pageContent, { paddingTop: insets.top + 40 }]}>
            <Text style={styles.pageTitle}>{groupName || "Groupe"}</Text>
            <View style={styles.vaultBody}>
              {!unlocked ? (
                <View style={styles.vaultLockedContent}>
                  <VaultCounter totalCount={photoCount} userCount={userPhotoCount} />
                  <TouchableOpacity style={[theme.outlineButton, styles.inviteBtn]} onPress={() => router.push(`/(app)/groups/${id}/invite`)}><Text style={theme.outlineButtonText}>Inviter des amis</Text></TouchableOpacity>
                </View>
              ) : (
                <View style={styles.vaultUnlocked}><PhotoFeed photos={photos} /></View>
              )}
              <TouchableOpacity style={[styles.devToggle, devMode && styles.devToggleActive]} onPress={() => setDevMode((p) => !p)}><Text style={[styles.devToggleText, devMode && styles.devToggleTextActive]}>Simuler Dimanche 20h</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Animated.ScrollView>

      {/* NAV BAR */}
      <View style={[styles.tabBarContainer, { paddingBottom: insets.bottom }]}>
        <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.tabBarContent}>
          <TouchableOpacity style={styles.tab} onPress={() => jumpTo(0)} activeOpacity={0.7}>
            <ProfileIcon color={currentPage === 0 ? "#FFF" : "rgba(255,255,255,0.4)"} size={24} /><Text style={[styles.tabLabel, currentPage === 0 && styles.tabLabelActive]}>Profil</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tab} onPress={() => jumpTo(1)} activeOpacity={0.7}>
            <MomentIcon color={currentPage === 1 ? "#FFF" : "rgba(255,255,255,0.4)"} size={28} /><Text style={[styles.tabLabel, currentPage === 1 && styles.tabLabelActive]}>Moment</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tab} onPress={() => jumpTo(2)} activeOpacity={0.7}>
            <VaultIcon color={currentPage === 2 ? "#FFF" : "rgba(255,255,255,0.4)"} size={24} /><Text style={[styles.tabLabel, currentPage === 2 && styles.tabLabelActive]}>Coffre</Text>
          </TouchableOpacity>
        </View>
      </View>
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
  profileBody: { flex: 1, paddingHorizontal: 24, alignItems: "center" },
  vaultBody: { flex: 1 },
  vaultLockedContent: { paddingHorizontal: 24 },
  vaultUnlocked: { flex: 1 },

  tabBarContainer: { position: "absolute", bottom: 0, left: 0, right: 0, height: 90, overflow: "hidden", zIndex: 100 },
  tabBarContent: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-evenly", paddingTop: 12 },
  tab: { alignItems: "center", justifyContent: "center", gap: 4, width: SCREEN_WIDTH / 3 },
  tabLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.4)" },
  tabLabelActive: { color: "#FFF" },

  avatarCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center", marginBottom: 32, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  avatarText: { fontFamily: "Inter_700Bold", fontSize: 40, color: "#FFF" },
  infoBox: { width: "100%", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 20, padding: 24, gap: 8 },
  infoLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 },
  infoValue: { fontSize: 18, fontFamily: "Inter_400Regular", color: "#FFF", marginBottom: 8 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.1)", marginVertical: 8 },
  logoutBtn: { marginTop: 40, padding: 16 },
  logoutText: { color: "#FF5555", fontFamily: "Inter_600SemiBold" },

  cameraControls: { position: "absolute", right: 20, gap: 20, zIndex: 10 },
  controlBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center" },
  
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

  textModeContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40, backgroundColor: "#111" },
  textModeInput: { fontSize: 32, color: "#FFF", fontFamily: "Inter_700Bold", textAlign: "center", width: "100%" },

  confirmOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end", padding: 24, paddingBottom: 120 },
  noteBox: { padding: 24, gap: 20 },
  noteInput: { fontSize: 18, color: "#FFF", fontFamily: "Inter_400Regular", minHeight: 80 },
  confirmActions: { flexDirection: "row", gap: 12, alignItems: "center" },
  cancelBtn: { flex: 1, alignItems: "center" },
  cancelBtnText: { color: "rgba(255,255,255,0.6)", fontFamily: "Inter_600SemiBold" },

  inviteBtn: { marginTop: 32 },
  devToggle: { marginBottom: 120, marginHorizontal: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 16, padding: 16, alignItems: "center", opacity: 0.3, marginTop: 'auto' },
  devToggleActive: { opacity: 1, backgroundColor: "rgba(255,255,255,0.05)" },
  devToggleText: { fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.4)", fontSize: 12, textTransform: "uppercase" },
  devToggleTextActive: { color: "#FFF" },
});
