import { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, KeyboardAvoidingView, Platform, TextInput, ActivityIndicator, Alert,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { decode } from "base64-arraybuffer";
import Svg, { Path, Circle } from "react-native-svg";
import { supabase } from "../../lib/supabase";
import { r2Storage } from "../../lib/r2";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";

type Props = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  email: string;
  onAvatarUpdate: (url: string) => void;
  onUsernameUpdate: (name: string) => void;
};

export default function ProfilePage({ userId, username, avatarUrl, email, onAvatarUpdate, onUsernameUpdate }: Props) {
  const insets = useSafeAreaInsets();
  const { logout, user } = useAuth();
  const { showToast } = useToast();

  const [uploading, setUploading] = useState(false);
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);

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
        const filePath = `avatars/${userId}_${Date.now()}.jpg`;
        await r2Storage.upload(filePath, decode(manipResult.base64), "image/jpeg");
        const urlData = r2Storage.getPublicUrl(filePath);
        await supabase.from("profiles").update({ avatar_url: urlData }).eq("id", userId);
        onAvatarUpdate(urlData);
      } catch (e: any) {
        Alert.alert("Erreur", e.message);
      } finally {
        setUploading(false);
      }
    }
  };

  const saveUsername = async () => {
    const trimmed = newUsername.trim();
    if (!trimmed || trimmed === username) { setIsEditingUsername(false); return; }
    setSavingUsername(true);
    const { error } = await supabase.from("profiles").update({ username: trimmed }).eq("id", userId);
    if (!error) {
      onUsernameUpdate(trimmed);
      showToast("Pseudo mis à jour", undefined, "success");
    } else {
      showToast("Erreur", "Impossible de modifier le pseudo", "error");
    }
    setSavingUsername(false);
    setIsEditingUsername(false);
  };

  return (
    <>
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={["rgba(255,255,255,0.07)", "transparent"]}
          style={[styles.profileHeader, { paddingTop: insets.top + 36 }]}
        >
          <LinearGradient
            colors={["rgba(255,255,255,0.35)", "rgba(255,255,255,0.06)"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.avatarRing}
          >
            <TouchableOpacity onPress={updateAvatar} style={styles.avatarWrap} disabled={uploading}>
              {avatarUrl
                ? <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
                : <Text style={styles.avatarInitial}>{(username?.[0] ?? "?").toUpperCase()}</Text>}
              <View style={styles.avatarOverlay}>
                {uploading
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <Circle cx="12" cy="13" r="4" />
                    </Svg>}
              </View>
            </TouchableOpacity>
          </LinearGradient>

          <Text style={styles.profileName}>{username || "—"}</Text>
          <TouchableOpacity
            style={styles.editUsernameChip}
            onPress={() => { setNewUsername(username); setIsEditingUsername(true); }}
          >
            <Svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </Svg>
            <Text style={styles.editUsernameChipText}>Modifier le pseudo</Text>
          </TouchableOpacity>
        </LinearGradient>

        <View style={styles.settingsSection}>
          <Text style={styles.settingsSectionLabel}>Compte</Text>
          <View style={styles.settingsCard}>
            <View style={styles.settingsRow}>
              <View style={[styles.settingsIconWrap, { backgroundColor: "rgba(251,191,36,0.12)" }]}>
                <Svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FBB824" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <Path d="M22 6l-10 7L2 6" />
                </Svg>
              </View>
              <View style={styles.settingsTextCol}>
                <Text style={styles.settingsLabel}>Email</Text>
                <Text style={styles.settingsSubValue}>{email || user?.email}</Text>
              </View>
            </View>
          </View>

          <Text style={[styles.settingsSectionLabel, { marginTop: 28 }]}>Session</Text>
          <View style={styles.settingsCard}>
            <TouchableOpacity style={styles.settingsRow} onPress={() => logout()}>
              <View style={[styles.settingsIconWrap, { backgroundColor: "rgba(255,59,48,0.12)" }]}>
                <Svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FF3B30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <Path d="M16 17l5-5-5-5" />
                  <Path d="M21 12H9" />
                </Svg>
              </View>
              <Text style={[styles.settingsLabel, { color: "#FF3B30" }]}>Se déconnecter</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <Modal visible={isEditingUsername} transparent animationType="slide" onRequestClose={() => setIsEditingUsername(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setIsEditingUsername(false)} />
          <View style={styles.editSheet}>
            <View style={styles.editSheetHandle} />
            <Text style={styles.editSheetTitle}>Modifier le pseudo</Text>
            <TextInput
              style={styles.editSheetInput}
              value={newUsername}
              onChangeText={setNewUsername}
              autoFocus
              maxLength={30}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={saveUsername}
              placeholder="Ton pseudo..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              editable={!savingUsername}
            />
            <TouchableOpacity style={styles.editSheetBtn} onPress={saveUsername} disabled={savingUsername}>
              {savingUsername ? <ActivityIndicator color="#000" /> : <Text style={styles.editSheetBtnText}>Valider</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.editSheetCancel} onPress={() => setIsEditingUsername(false)}>
              <Text style={styles.editSheetCancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
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
  editSheet: { backgroundColor: "#161616", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44 },
  editSheetHandle: { width: 36, height: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2, alignSelf: "center", marginBottom: 24 },
  editSheetTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#FFF", marginBottom: 20 },
  editSheetInput: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 15, fontSize: 17, color: "#FFF", fontFamily: "Inter_400Regular", marginBottom: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  editSheetBtn: { backgroundColor: "#FFF", borderRadius: 16, paddingVertical: 15, alignItems: "center", marginBottom: 10 },
  editSheetBtnText: { color: "#000", fontSize: 16, fontFamily: "Inter_700Bold" },
  editSheetCancel: { paddingVertical: 12, alignItems: "center" },
  editSheetCancelText: { color: "rgba(255,255,255,0.35)", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
