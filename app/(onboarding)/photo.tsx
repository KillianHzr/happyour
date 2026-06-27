import { useState } from "react";
import { View, StyleSheet, TouchableOpacity, ActionSheetIOS, Alert, Platform, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { decode } from "base64-arraybuffer";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { supabase } from "../../lib/supabase";
import { r2Storage } from "../../lib/r2";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { radii, type ThemeColors } from "../../lib/theme";
import { CameraIcon } from "../../components/atoms/CameraIcon";
import {
  OnboardingSlideLayout,
  OnboardingStickerText,
  OnboardingButton,
  OnboardingDevButton,
} from "../../components/onboarding/OnboardingKit";

export default function OnboardingPhotoScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Une fois la photo choisie : on l'affiche, on l'upload sur R2 et on enregistre
  // `avatar_url` en BDD, PUIS on passe à l'étape suivante (surnom).
  const onPicked = async (uri: string) => {
    if (uploading) return;
    setAvatarUri(uri);
    if (!user) {
      router.replace("/(onboarding)/username");
      return;
    }
    setUploading(true);
    try {
      const m = await manipulateAsync(
        uri,
        [{ resize: { width: 200, height: 200 } }],
        { compress: 0.7, format: SaveFormat.JPEG, base64: true },
      );
      if (!m.base64) throw new Error("Erreur image");
      const filePath = `avatars/${user.id}_${Date.now()}.jpg`;
      await r2Storage.upload(filePath, decode(m.base64), "image/jpeg");
      const url = r2Storage.getPublicUrl(filePath);
      const { error } = await supabase.from("profiles").upsert({ id: user.id, avatar_url: url }, { onConflict: "id" });
      if (error) throw error;
      router.replace("/(onboarding)/username");
    } catch (e: any) {
      showToast("Impossible d'enregistrer la photo, réessaie.", undefined, "error");
    } finally {
      setUploading(false);
    }
  };

  const launchPicker = async (source: "camera" | "library") => {
    if (uploading) return;
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    };
    if (source === "camera") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission refusée", "L'accès à la caméra est requis pour prendre une photo.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync(opts);
      if (!result.canceled) onPicked(result.assets[0].uri);
    } else {
      const result = await ImagePicker.launchImageLibraryAsync(opts);
      if (!result.canceled) onPicked(result.assets[0].uri);
    }
  };

  // Tap sur le carré → choix de la source (comme l'édition du profil).
  const pickAvatar = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Annuler", "Prendre une photo", "Choisir dans la galerie"], cancelButtonIndex: 0 },
        (i) => {
          if (i === 1) launchPicker("camera");
          else if (i === 2) launchPicker("library");
        },
      );
    } else {
      Alert.alert("Photo de profil", "Choisis une source", [
        { text: "Prendre une photo", onPress: () => launchPicker("camera") },
        { text: "Choisir dans la galerie", onPress: () => launchPicker("library") },
        { text: "Annuler", style: "cancel" },
      ]);
    }
  };

  return (
    <OnboardingSlideLayout
      top={
        <>
          <OnboardingStickerText text={"Si une [photo] devait\nte représenter ce\nserait..."} rotate="-2deg" stickerY={0} />

          <TouchableOpacity
            style={[styles.avatar, { backgroundColor: colors.bgNeutralTertiary }]}
            onPress={pickAvatar}
            activeOpacity={0.8}
          >
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <CameraIcon size={32} color={colors.iconBrandTertiary} />
            )}
            {uploading && (
              <View style={styles.uploadOverlay}>
                <ActivityIndicator color={colors.iconBrandOnBrand} />
              </View>
            )}
          </TouchableOpacity>
        </>
      }
      footer={
        <View style={styles.buttons}>
          <OnboardingButton label="Prends-toi en photo" onPress={() => launchPicker("camera")} active />
          <OnboardingButton
            label="Importe depuis la galerie"
            onPress={() => launchPicker("library")}
            variant="secondary"
          />
          {__DEV__ && (
            <OnboardingDevButton
              label="[DEV] Passer"
              onPress={() => router.replace({ pathname: "/(onboarding)/username", params: { avatar: "" } })}
            />
          )}
        </View>
      }
    />
  );
}

const makeStyles = (_colors: ThemeColors) =>
  StyleSheet.create({
    avatar: {
      width: 160,
      height: 160,
      aspectRatio: 1,
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      borderRadius: radii.xl3, // radius/1000 = 40px
      overflow: "hidden",
      marginTop: 80, // 80px sous le texte
    },
    buttons: {
      width: "100%",
      gap: 12,
    },
    uploadOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "rgba(0,0,0,0.35)",
    },
  });
