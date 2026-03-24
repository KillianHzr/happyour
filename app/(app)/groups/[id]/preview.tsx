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
  Pressable,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { BlurView } from "expo-blur";
import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../../../../lib/supabase";
import { r2Storage } from "../../../../lib/r2";
import { useAuth } from "../../../../lib/auth-context";
import { useToast } from "../../../../lib/toast-context";
import { translateError } from "../../../../lib/error-messages";
import { getCaptureData, clearCaptureData, type CaptureType } from "../../../../lib/capture-store";
import { notifyNewPhoto } from "../../../../lib/notifications";
import { useUpload } from "../../../../lib/upload-context";
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
  const { startUpload } = useUpload();
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

  const handleSend = () => {
    if (!user || uploading || !uri) return;
    setUploading(true);
    
    const dbData = {
      group_id: id as string,
      user_id: user.id,
      note: note.trim() || null,
    };

    const fileName = `${id}/${user.id}_${Date.now()}.${captureType === "video" ? "mp4" : "jpg"}`;
    const contentType = captureType === "video" ? "video/mp4" : "image/jpeg";

    // ON LANCE TOUT EN ARRIÈRE-PLAN SANS ATTENDRE
    startUpload(fileName, uri, contentType, dbData);
    
    // ON FERME L'INTERFACE IMMÉDIATEMENT
    clearCaptureData();
    router.back();
  };

  if (!uri) return null;

  return (
    <View style={styles.container}>
      <View style={[styles.previewContainer, { paddingTop: insets.top + 20 }]}>
        <View style={styles.previewImageWrapper}>
          {captureType === "video" ? (
            <VideoView
              player={player}
              style={styles.previewImage}
              contentFit="cover"
              nativeControls={false}
            />
          ) : (
            <Image source={{ uri }} style={styles.previewImage} contentFit="cover" />
          )}
          <TouchableOpacity 
            style={styles.backCaptureBtnInside} 
            onPress={handleDiscard} 
            disabled={uploading}
          >
            <CloseIcon />
          </TouchableOpacity>
        </View>

        <View style={styles.previewContent}>
          {note ? (
            <Pressable 
              style={styles.previewNoteBox} 
              onPress={() => setIsEditingNote(true)} 
              disabled={uploading}
            >
              <Text style={styles.previewNoteText}>{note}</Text>
            </Pressable>
          ) : (
            <TouchableOpacity 
              style={styles.addNoteBtn} 
              onPress={() => setIsEditingNote(true)} 
              disabled={uploading}
            >
              <FeatherIcon />
              <Text style={styles.addNoteBtnText}>Ajouter une légende...</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.postCaptureActions, { marginBottom: insets.bottom + 100 }]}>
          <TouchableOpacity 
            style={styles.sendCaptureBtn} 
            onPress={handleSend} 
            disabled={uploading}
          >
            <View style={styles.sendCaptureInner}>
              {uploading ? <ActivityIndicator color="#000" /> : <SendIcon color="#000" />}
            </View>
          </TouchableOpacity>
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  previewContainer: { flex: 1, backgroundColor: "#000", alignItems: "center" },
  previewImageWrapper: { width: SCREEN_WIDTH - 40, height: (SCREEN_WIDTH - 40) * 1.33, borderRadius: 32, overflow: "hidden", backgroundColor: "#1A1A1A" },
  previewImage: { width: "100%", height: "100%" },
  previewContent: { width: SCREEN_WIDTH - 40, marginTop: 20 },
  previewNoteBox: { backgroundColor: "rgba(255,255,255,0.1)", padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  previewNoteText: { color: "#FFF", fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  addNoteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 16, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.05)", borderStyle: "dashed", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  addNoteBtnText: { color: "rgba(255,255,255,0.6)", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  backCaptureBtnInside: { position: "absolute", top: 16, left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  postCaptureActions: { flex: 1, width: SCREEN_WIDTH, justifyContent: "center", alignItems: "center" },
  sendCaptureBtn: { width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: "#FFF", justifyContent: "center", alignItems: "center" },
  sendCaptureInner: { width: 66, height: 66, borderRadius: 33, backgroundColor: "#FFF", justifyContent: "center", alignItems: "center" },
  noteEditorContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  largeNoteInput: { width: "100%", color: "#FFF", fontSize: 28, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 40 },
  doneNoteBtn: { backgroundColor: "#FFF", paddingHorizontal: 32, paddingVertical: 14, borderRadius: 100 },
  doneNoteText: { color: "#000", fontFamily: "Inter_700Bold", fontSize: 16 },
});
