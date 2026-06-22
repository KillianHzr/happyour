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
import BlurView from "../../../../components/atoms/BlurView";
import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../../../../lib/supabase";
import { r2Storage } from "../../../../lib/r2";
import { useAuth } from "../../../../lib/auth-context";
import { useToast } from "../../../../lib/toast-context";
import { translateError } from "../../../../lib/error-messages";
import { getCaptureData, clearCaptureData, type CaptureType } from "../../../../lib/capture-store";
import { useUpload } from "../../../../lib/upload-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { radii, typography, type ThemeColors } from "../../../../lib/theme";
import { useTheme, useThemedStyles } from "../../../../lib/theme-context";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const NAVBAR_HEIGHT = 100;

const SendIcon = ({ color }: { color?: string }) => {
  const { colors } = useTheme();
  return (
    <Svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <Path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke={color ?? colors.bg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
};

const FeatherIcon = () => {
  const { colors } = useTheme();
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h3.5l6.74-6.74z" />
      <Path d="M16 8L2 22" />
      <Path d="M17.5 15H9" />
    </Svg>
  );
};

const CloseIcon = () => {
  const { colors } = useTheme();
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 6L6 18M6 6l12 12" />
    </Svg>
  );
};

export default function PreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { startUpload } = useUpload();
  const insets = useSafeAreaInsets();
  const { colors, mode } = useTheme();
  const styles = useThemedStyles(makeStyles);

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
      <View style={[styles.previewContainer, { paddingTop: Math.max(insets.top, 12) + 12, paddingBottom: NAVBAR_HEIGHT + 12, paddingHorizontal: 12 }]}>
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

          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <TouchableOpacity
              style={[styles.backCaptureBtnInside, { top: 16 }]}
              onPress={handleDiscard}
              disabled={uploading}
            >
              <CloseIcon />
            </TouchableOpacity>

            <View style={[styles.previewContent, { bottom: 120 }]}>
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

            <View style={[styles.postCaptureActions, { bottom: 20 }]}>
              <TouchableOpacity
                style={styles.sendCaptureBtn}
                onPress={handleSend}
                disabled={uploading}
              >
                <View style={styles.sendCaptureInner}>
                  {uploading ? <ActivityIndicator color={colors.bg} /> : <SendIcon color={colors.bg} />}
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      <Modal visible={isEditingNote} transparent animationType="fade">
        <BlurView intensity={100} tint={mode === "Dark" ? "dark" : "light"} style={StyleSheet.absoluteFill}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.noteEditorContainer}>
            <TextInput style={styles.largeNoteInput} placeholder="Note..." placeholderTextColor={colors.textTertiary} value={note} onChangeText={setNote} maxLength={140} multiline autoFocus={false} />
            <TouchableOpacity style={styles.doneNoteBtn} onPress={() => setIsEditingNote(false)}><Text style={styles.doneNoteText}>Terminé</Text></TouchableOpacity>
          </KeyboardAvoidingView>
        </BlurView>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  previewContainer: { flex: 1, backgroundColor: colors.bg, alignItems: "center" },
  previewImageWrapper: { flex: 1, width: '100%', borderRadius: radii.xl, overflow: "hidden", backgroundColor: colors.card },
  previewImage: { width: "100%", height: "100%" },
  previewContent: { position: "absolute", left: 24, right: 24 },
  previewNoteBox: { backgroundColor: colors.opacityLight, padding: 16, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.cardBorder },
  previewNoteText: { color: colors.text, fontSize: typography.size.md, fontFamily: typography.family.semibold, textAlign: "center" },
  addNoteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 16, borderRadius: radii.lg, backgroundColor: colors.opacityLight, borderStyle: "dashed", borderWidth: 1, borderColor: colors.borderSecondary },
  addNoteBtnText: { color: colors.secondary, fontSize: typography.size.sm, fontFamily: typography.family.semibold },
  backCaptureBtnInside: { position: "absolute", left: 16, width: 44, height: 44, borderRadius: radii.xl, backgroundColor: colors.opacityLight, justifyContent: "center", alignItems: "center" },
  postCaptureActions: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  sendCaptureBtn: { width: 84, height: 84, borderRadius: radii.full, borderWidth: 5, borderColor: colors.text, justifyContent: "center", alignItems: "center" },
  sendCaptureInner: { width: 66, height: 66, borderRadius: radii.full, backgroundColor: colors.text, justifyContent: "center", alignItems: "center" },
  noteEditorContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  largeNoteInput: { width: "100%", color: colors.text, fontSize: typography.size.xxl, fontFamily: typography.family.bold, textAlign: "center", marginBottom: 40 },
  doneNoteBtn: { backgroundColor: colors.text, paddingHorizontal: 32, paddingVertical: 14, borderRadius: radii.xl },
  doneNoteText: { color: colors.bg, fontFamily: typography.family.bold, fontSize: typography.size.md },
});
