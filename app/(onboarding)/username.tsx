import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  SafeAreaView,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";
import { useToast } from "../../lib/toast-context";
import { spacing, radii, typography, textStyles, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import Loader from "../../components/Loader";
import { TextSticker } from "../../components/atoms/TextSticker";
import Icon from "../../components/Icon";

export default function OnboardingUsernameScreen() {
  const router = useRouter();
  const { user, checkProfileStatus } = useAuth();
  const { showToast } = useToast();
  const { colors, theme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const isValidUsername = username.trim().length >= 3;

  const handleRegisterUsername = async () => {
    if (!isValidUsername) {
      return showToast("Attention", "Le pseudo doit contenir au moins 3 caractères.");
    }
    if (!user?.id) {
      return showToast("Erreur", "Session utilisateur introuvable.");
    }

    setLoading(true);
    try {
      const trimmedUsername = username.trim();

      // 1. Check for uniqueness
      const { data: existing, error: checkError } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", trimmedUsername)
        .maybeSingle();

      if (checkError) throw checkError;
      if (existing) {
        setLoading(false);
        return showToast("Indisponible", "Ce nom d'utilisateur est déjà pris.");
      }

      // 2. Upsert the profile. A brand-new OTP user has no `profiles` row yet,
      //    so a plain update would silently affect 0 rows and the username would
      //    never persist — profileComplete stays false and the app layout bounces
      //    the user back to onboarding (the carousel ↔ username loop).
      const { error: upsertError } = await supabase
        .from("profiles")
        .upsert({ id: user.id, username: trimmedUsername }, { onConflict: "id" });

      if (upsertError) throw upsertError;

      showToast("Bienvenue !", "Ton compte a été configuré.");

      // 3. Refresh profile status in AuthContext (profileComplete → true).
      await checkProfileStatus(user.id);

      // 4. L'onboarding se poursuit sur l'écran « rejoindre un groupe ».
      router.replace("/(app)/groups/join");
    } catch (e: any) {
      showToast("Erreur", e.message || "Une erreur est survenue lors de la création du pseudo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* Top Header Back Button — ramène à l'intro principale (le carousel) */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <Icon name="chevron-left" size={20} color={colors.iconNeutral} />
          </TouchableOpacity>
        </View>

        {/* Main Content */}
        <View style={styles.centerContainer}>
          {/* Title Header */}
          <View style={styles.headerBlock}>
            <View style={styles.titleWrapper}>
              <Text style={styles.subtitleStrongText}>Choisis ton </Text>
              <TextSticker text="PSEUDO" fontSize={16} />
            </View>
            <Text style={styles.description}>
              C'est le nom sous lequel tes amis te verront dans l'application.
            </Text>
          </View>

          {/* Input and Button Form */}
          <View style={styles.formBlock}>
            <TextInput
              style={[
                theme.glassInput,
                styles.input,
                { borderColor: colors.cardBorder },
                isFocused && { borderColor: colors.borderBrandSecondary }
              ]}
              placeholder="Ex: axel_g"
              placeholderTextColor={colors.secondary}
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
              maxLength={10}
              editable={!loading}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
            />

            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: isValidUsername ? colors.brand : colors.bgNeutralTertiary }
              ]}
              onPress={handleRegisterUsername}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <Loader size={20} />
              ) : (
                <Text style={[
                  styles.buttonText,
                  { color: isValidUsername ? colors.textBrandOnBrandSecondary : colors.textOnDisabled }
                ]}>
                  Continuer
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    height: 48,
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    justifyContent: "center",
    alignItems: "center",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    marginTop: -40,
    gap: spacing.xl3, // space/1200
  },
  headerBlock: {
    alignItems: "center",
    width: "100%",
  },
  titleWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    marginTop: 8,
    marginBottom: 8,
  },
  subtitleStrongText: {
    ...textStyles.subtitleStrong,
    color: colors.text,
    textAlign: "center",
  },
  description: {
    ...textStyles.bodyBase,
    color: colors.secondary,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  formBlock: {
    width: "100%",
    gap: spacing.lg, // space/400
  },
  input: {
    height: 56,
  },
  button: {
    height: 56,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: radii.lg,
    width: "100%",
  },
  buttonText: {
    ...textStyles.singleLineSubheadingStrong,
    lineHeight: undefined,
  },
});
