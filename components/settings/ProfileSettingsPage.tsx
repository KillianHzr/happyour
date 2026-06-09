import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { decode } from "base64-arraybuffer";
import { useSettingsNav } from "../SettingsSheet";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";
import { r2Storage } from "../../lib/r2";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { spacing, radii, textStyles, typography, type ThemeColors } from "../../lib/theme";

const USERNAME_MAX = 10;
const USERNAME_MIN = 2;

type Props = {
  username: string;
  avatarUrl: string | null;
  email: string | null;
  onUsernameUpdate?: (name: string) => void;
  onAvatarUpdate?: (url: string) => void;
  onEmailUpdate?: (email: string) => void;
};

export default function ProfileSettingsPage({ username, avatarUrl, email, onUsernameUpdate, onAvatarUpdate, onEmailUpdate }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const { updateTopConfig, showToast, settingsData } = useSettingsNav();
  const insets = useSafeAreaInsets();

  // ── Form state ──
  const [localUsername, setLocalUsername] = useState(username);
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(avatarUrl);
  const [localEmail, setLocalEmail] = useState(email ?? "");
  const [localRecoveryEmail, setLocalRecoveryEmail] = useState(settingsData?.recovery_email ?? "");
  const [saving, setSaving] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Initial values to track dirty state after save (props don't update inside the nav stack)
  const [initialUsername, setInitialUsername] = useState(username);
  const [initialEmail, setInitialEmail] = useState(email ?? "");
  const [initialRecoveryEmail, setInitialRecoveryEmail] = useState(settingsData?.recovery_email ?? "");

  // Snapshot for background verification comparison
  const settingsSnapshot = useRef(settingsData);

  // Background verification — only update recovery_email if it differs from the pre-fetched snapshot
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("recovery_email")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        const fresh = data?.recovery_email ?? "";
        if (fresh !== (settingsSnapshot.current?.recovery_email ?? "")) {
          setLocalRecoveryEmail(fresh);
          setInitialRecoveryEmail(fresh);
        }
      });
  }, [user]);

  // ── Dirty check ──
  const isDirty =
    localUsername.trim() !== initialUsername ||
    localAvatarUri !== null ||
    localEmail !== initialEmail ||
    localRecoveryEmail !== initialRecoveryEmail;

  // ── Save ──
  const handleSave = useCallback(async () => {
    if (!user) return;
    const trimmedUsername = localUsername.trim();
    if (trimmedUsername.length < USERNAME_MIN || trimmedUsername.length > USERNAME_MAX) {
      showToast(`Surnom invalide (${USERNAME_MIN}–${USERNAME_MAX} caractères)`, "error");
      return;
    }
    setSaving(true);
    try {
      const updates: Record<string, string> = {};
      let newAvatarUrl: string | null = null;

      if (localAvatarUri) {
        const m = await manipulateAsync(
          localAvatarUri,
          [{ resize: { width: 200, height: 200 } }],
          { compress: 0.7, format: SaveFormat.JPEG, base64: true },
        );
        if (!m.base64) throw new Error("Erreur manipulation image");
        const filePath = `avatars/${user.id}_${Date.now()}.jpg`;
        await r2Storage.upload(filePath, decode(m.base64), "image/jpeg");
        newAvatarUrl = r2Storage.getPublicUrl(filePath);
        updates.avatar_url = newAvatarUrl;
      }

      if (trimmedUsername !== initialUsername) updates.username = trimmedUsername;
      if (localRecoveryEmail !== initialRecoveryEmail) updates.recovery_email = localRecoveryEmail;

      const emailChanged = localEmail !== initialEmail;
      if (emailChanged) updates.email = localEmail;

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.from("profiles").update(updates).eq("id", user.id);
        if (error) throw error;
      }

      // Propagate changes up to parent state
      if (newAvatarUrl) {
        onAvatarUpdate?.(newAvatarUrl);
        setCurrentAvatarUrl(newAvatarUrl);
      }
      if (trimmedUsername !== initialUsername) onUsernameUpdate?.(trimmedUsername);
      if (emailChanged) onEmailUpdate?.(localEmail);

      if (emailChanged) {
        const { error } = await supabase.auth.updateUser({ email: localEmail });
        if (error) throw error;
        showToast("Vérifie ta nouvelle boîte mail pour confirmer.", "success");
      } else {
        showToast("Profil mis à jour", "success");
      }

      // Reset initial values so dirty check is accurate after save
      setLocalAvatarUri(null);
      setInitialUsername(trimmedUsername);
      setInitialEmail(localEmail);
      setInitialRecoveryEmail(localRecoveryEmail);

    } catch (e: any) {
      showToast(e.message ?? "Impossible de sauvegarder", "error");
    } finally {
      setSaving(false);
    }
  }, [user, localUsername, localAvatarUri, localEmail, localRecoveryEmail, initialUsername, initialEmail, initialRecoveryEmail, onAvatarUpdate, onUsernameUpdate, onEmailUpdate]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  // ── Sync header trailing button ──
  useEffect(() => {
    updateTopConfig({
      trailingButton: {
        label: "Enregistrer",
        disabled: !isDirty || saving,
        onPress: () => handleSaveRef.current(),
      },
    });
  }, [isDirty, saving, updateTopConfig]);

  // ── Avatar picker ──
  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled) setLocalAvatarUri(result.assets[0].uri);
  };

  const displayAvatar = localAvatarUri ?? currentAvatarUrl;

  const borderFor = (field: string) =>
    focusedField === field ? colors.borderBrandSecondary : colors.cardBorder;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── I. Avatar ── */}
      <View style={styles.inputField}>
        <View style={styles.containerEdit}>
          <View style={[styles.avatar, { backgroundColor: colors.accentMuted }]}>
            {displayAvatar
              ? <Image source={{ uri: displayAvatar }} style={StyleSheet.absoluteFill} contentFit="cover" />
              : <Text style={[textStyles.subtitleStrong, { color: colors.text }]}>
                  {(initialUsername?.[0] ?? "?").toUpperCase()}
                </Text>
            }
          </View>
          <TouchableOpacity style={styles.modifierBtn} onPress={pickAvatar} activeOpacity={0.7}>
            <Text style={[styles.modifierText, { color: colors.textSecondary }]}>Modifier</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── II. Surnom ── */}
      <View style={styles.inputField}>
        <View style={styles.fieldText}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Surnom</Text>
        </View>
        <View style={[styles.input, { borderColor: borderFor("username"), backgroundColor: colors.bg }]}>
          <TextInput
            style={[styles.inputText, { color: colors.text }]}
            value={localUsername}
            onChangeText={t => setLocalUsername(t.slice(0, USERNAME_MAX))}
            placeholder="ex. Cam"
            placeholderTextColor={colors.textSecondary}
            maxLength={USERNAME_MAX}
            returnKeyType="done"
            onFocus={() => setFocusedField("username")}
            onBlur={() => setFocusedField(null)}
          />
          <Text style={[styles.counter, { color: colors.textSecondary }]}>
            {localUsername.length}/{USERNAME_MAX}
          </Text>
        </View>
      </View>

      {/* ── III. Email ── */}
      <View style={styles.inputField}>
        <View style={styles.fieldText}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Email</Text>
        </View>
        <View style={[styles.input, { borderColor: borderFor("email"), backgroundColor: colors.bg }]}>
          <TextInput
            style={[styles.inputText, { color: colors.text }]}
            value={localEmail}
            onChangeText={setLocalEmail}
            placeholder="ex. hello@disclose.com"
            placeholderTextColor={colors.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onFocus={() => setFocusedField("email")}
            onBlur={() => setFocusedField(null)}
          />
        </View>
      </View>

      {/* ── IV. Email de récupération ── */}
      <View style={styles.inputField}>
        <View style={styles.fieldText}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Email de récupération</Text>
        </View>
        <View style={[styles.input, { borderColor: borderFor("recovery"), backgroundColor: colors.bg }]}>
          <TextInput
            style={[styles.inputText, { color: colors.text }]}
            value={localRecoveryEmail}
            onChangeText={setLocalRecoveryEmail}
            placeholder="ex. hello@disclose.com"
            placeholderTextColor={colors.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onFocus={() => setFocusedField("recovery")}
            onBlur={() => setFocusedField(null)}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const makeStyles = (_colors: ThemeColors) => StyleSheet.create({
  content: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xl,              // space/600 = 24px
    marginHorizontal: spacing.lg,
    marginTop: spacing.xxl,
  },

  inputField: {
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,              // space/200 = 8px
    alignSelf: "stretch",
  },

  // ── Avatar
  containerEdit: {
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
  },
  avatar: {
    width: 160,
    height: 160,
    aspectRatio: 1,
    borderRadius: radii.xl,       // radius/600 = 24px
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  modifierBtn: {
    padding: spacing.sm,          // space/200 = 8px
    justifyContent: "center",
    alignItems: "center",
  },
  modifierText: {
    ...textStyles.singleLineBodyBaseStrong,
  },

  // ── Label
  fieldText: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xs,              // space/100 = 4px (reserved for future desc)
    alignSelf: "stretch",
  },
  fieldLabel: {
    ...textStyles.bodyBase,
  },

  // ── Input row
  input: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 120,
    paddingVertical: spacing.md,    // space/300 = 12px
    paddingHorizontal: spacing.lg,  // space/400 = 16px
    gap: spacing.sm,                // space/200 = 8px
    alignSelf: "stretch",
    borderRadius: radii.sm,         // radius/200 = 8px
    borderWidth: 1,
  },
  inputText: {
    flex: 1,
    fontFamily: textStyles.bodyBase.fontFamily,
    fontSize: typography.size.md,  // 16px
    includeFontPadding: false,     // Android : retire le padding interne du font
    padding: 0,                    // retire le padding par défaut du TextInput (Android)
  },
  counter: {
    fontFamily: textStyles.bodyBase.fontFamily,
    fontSize: typography.size.md,
    includeFontPadding: false,
  },
});
