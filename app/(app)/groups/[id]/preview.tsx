import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  BackHandler,
  Dimensions,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { BlurView } from "expo-blur";
import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../../../../lib/supabase";
import { useAuth } from "../../../../lib/auth-context";
import { useToast } from "../../../../lib/toast-context";
import { translateError } from "../../../../lib/error-messages";
import { getCaptureData, clearCaptureData, type CaptureType } from "../../../../lib/capture-store";
import { notifyNewPhoto } from "../../../../lib/notifications";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

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

const CloseIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);

export default function PreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();

  const [base64, setBase64] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [captureType, setCaptureType] = useState<CaptureType>("photo");
  const [note, setNote] = useState("");
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [uploading, setUploading] = useState(false);

  const player = useVideoPlayer(captureType === "video" && uri ? uri : null, (p) => {
    p.loop = true;
    p.play();
  });

  useEffect(() => {
    const data = getCaptureData();
    if (!data.uri) {
      router.back();
      return;
    }
    setBase64(data.base64);
    setUri(data.uri);
    setCaptureType(data.type);
  }, []);

  // Android back button
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (isEditingNote) {
        setIsEditingNote(false);
        return true;
      }
      clearCaptureData();
      return false;
    });
    return () => sub.remove();
  }, [isEditingNote]);

  const handleDiscard = () => {
    clearCaptureData();
    router.back();
  };

  const handleSend = async () => {
    if (!user || uploading || !uri) return;
    setUploading(true);
    try {
      const [groupRes, profileRes] = await Promise.all([
        supabase.from("groups").select("name").eq("id", id).single(),
        supabase.from("profiles").select("username").eq("id", user.id).single(),
      ]);
      const groupName = groupRes.data?.name ?? "";
      const username = profileRes.data?.username ?? "";

      if (captureType === "video") {
        // Upload video from file URI
        const fileInfo = await FileSystem.getInfoAsync(uri);
        if (!fileInfo.exists) throw new Error("Fichier vidéo introuvable.");
        const videoBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        const fileName = `${id}/${user.id}_${Date.now()}.mp4`;
        await supabase.storage.from("moments").upload(fileName, decode(videoBase64), { contentType: "video/mp4" });
        await supabase.from("photos").insert({ group_id: id, user_id: user.id, image_path: fileName, note: note.trim() || null });
        clearCaptureData();
        notifyNewPhoto(id as string, groupName, username, user.id);
        showToast("Moment envoyé", "Ta vidéo a été ajoutée au coffre.", "success");
      } else {
        if (!base64) return;
        const fileName = `${id}/${user.id}_${Date.now()}.jpg`;
        await supabase.storage.from("moments").upload(fileName, decode(base64), { contentType: "image/jpeg" });
        await supabase.from("photos").insert({ group_id: id, user_id: user.id, image_path: fileName, note: note.trim() || null });
        clearCaptureData();
        notifyNewPhoto(id as string, groupName, username, user.id);
        showToast("Moment envoyé", "Ta photo a été ajoutée au coffre.", "success");
      }
      router.back();
    } catch (e: any) {
      showToast("Erreur", translateError(e.message));
    } finally {
      setUploading(false);
    }
  };

  if (!uri) return null;

  return (
    <View style={styles.container}>
      {captureType === "video" ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
        />
      ) : (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      )}

      <TouchableOpacity style={[styles.backBtn, { top: insets.top + 20 }]} onPress={handleDiscard} disabled={uploading}>
        <CloseIcon />
      </TouchableOpacity>

      {note ? (
        <TouchableOpacity style={styles.centeredNotePreview} onPress={() => setIsEditingNote(true)} disabled={uploading} activeOpacity={0.8}>
          <View style={styles.noteTag}><Text style={styles.noteTagText}>{note}</Text></View>
        </TouchableOpacity>
      ) : null}

      <View style={[styles.actions, { bottom: insets.bottom + 120 }]}>
        <TouchableOpacity style={styles.sideActionBtn} onPress={() => setIsEditingNote(true)} disabled={uploading}>
          <FeatherIcon />
        </TouchableOpacity>
        <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={uploading}>
          <View style={styles.sendInner}>
            {uploading ? <ActivityIndicator color="#000" /> : <SendIcon color="#000" />}
          </View>
        </TouchableOpacity>
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  backBtn: { position: "absolute", left: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", zIndex: 10 },
  centeredNotePreview: { position: "absolute", top: "40%", left: 0, right: 0, alignItems: "center", paddingHorizontal: 40 },
  noteTag: { backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  noteTagText: { color: "#FFF", fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  actions: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 40 },
  sideActionBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  sendBtn: { width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: "#FFF", justifyContent: "center", alignItems: "center" },
  sendInner: { width: 66, height: 66, borderRadius: 33, backgroundColor: "#FFF", justifyContent: "center", alignItems: "center" },
  noteEditorContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  largeNoteInput: { width: "100%", color: "#FFF", fontSize: 28, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 40 },
  doneNoteBtn: { backgroundColor: "#FFF", paddingHorizontal: 32, paddingVertical: 14, borderRadius: 100 },
  doneNoteText: { color: "#000", fontFamily: "Inter_700Bold", fontSize: 16 },
});
