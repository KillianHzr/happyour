import { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { decode } from "base64-arraybuffer";
import { Image } from "expo-image";
import { useAuth } from "../../../../lib/auth-context";
import { supabase } from "../../../../lib/supabase";
import { notifyNewPhoto } from "../../../../lib/notifications";
import BlurredCamera from "../../../../components/BlurredCamera";
import { CameraView } from "expo-camera";

export default function CameraScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const cameraRef = useRef<CameraView>(null);
  const [capturing, setCapturing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const handleCapture = async () => {
    if (!cameraRef.current || !user) return;
    setCapturing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: true });
      if (!photo || !photo.base64) throw new Error("Pas de photo capturée.");

      setCapturedBase64(photo.base64);
      setCapturedUri(photo.uri);
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setCapturing(false);
    }
  };

  const handleUpload = async (withNote: boolean) => {
    if (!capturedBase64 || !user) return;
    setUploading(true);

    try {
      const fileName = `${id}/${user.id}_${Date.now()}.jpg`;

      const { error: uploadErr } = await supabase.storage
        .from("moments")
        .upload(fileName, decode(capturedBase64), { contentType: "image/jpeg" });

      if (uploadErr) throw uploadErr;

      const { error: insertErr } = await supabase.from("photos").insert({
        group_id: id,
        user_id: user.id,
        image_path: fileName,
        note: withNote ? note.trim() || null : null,
      });

      if (insertErr) throw insertErr;

      // Send push notification to group members
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .single();
        const { data: group } = await supabase
          .from("groups")
          .select("name")
          .eq("id", id)
          .single();
        if (profile?.username && group?.name) {
          await notifyNewPhoto(id!, group.name, profile.username, user.id);
        }
      } catch {}

      Alert.alert("Moment capturé !", "Ta photo a été ajoutée au coffre.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setUploading(false);
    }
  };

  // ── Écran de confirmation avec note ──
  if (capturedBase64) {
    return (
      <KeyboardAvoidingView
        style={styles.confirmContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {capturedUri && (
          <Image
            source={{ uri: capturedUri }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            blurRadius={20}
          />
        )}
        <View style={styles.confirmOverlay}>
          <Text style={styles.confirmTitle}>Ajouter une note ?</Text>

          <TextInput
            style={styles.noteInput}
            placeholder="Ajouter une note..."
            placeholderTextColor="#888"
            value={note}
            onChangeText={setNote}
            maxLength={140}
            multiline
            returnKeyType="done"
          />

          <Text style={styles.charCount}>{note.length}/140</Text>

          <View style={styles.confirmActions}>
            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={() => handleUpload(true)}
              disabled={uploading}
            >
              <Text style={styles.confirmBtnText}>
                {uploading ? "Envoi..." : "Envoyer"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipBtn}
              onPress={() => handleUpload(false)}
              disabled={uploading}
            >
              <Text style={styles.skipBtnText}>Passer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── Écran caméra ──
  return (
    <View style={styles.container}>
      <BlurredCamera ref={cameraRef} />

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.captureBtn}
          onPress={handleCapture}
          disabled={capturing}
        >
          <View style={styles.captureInner} />
        </TouchableOpacity>
        <Text style={styles.hint}>
          {capturing ? "Capture en cours..." : "Tu ne vois rien ? C'est normal !"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 50,
    paddingTop: 20,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  captureBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  captureInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#fff",
  },
  hint: {
    fontFamily: "Inter_400Regular",
    color: "#fff",
    marginTop: 12,
    fontSize: 14,
  },

  // ── Confirmation screen ──
  confirmContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  confirmTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: "#fff",
    marginBottom: 24,
  },
  noteInput: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    padding: 16,
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: "#fff",
    minHeight: 80,
    textAlignVertical: "top",
  },
  charCount: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#888",
    alignSelf: "flex-end",
    marginTop: 6,
  },
  confirmActions: {
    width: "100%",
    marginTop: 32,
    gap: 12,
  },
  confirmBtn: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  confirmBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#000",
  },
  skipBtn: {
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  skipBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#888",
  },
});
