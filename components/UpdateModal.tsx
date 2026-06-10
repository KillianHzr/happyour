import { useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { radii, typography, type ThemeColors } from "../lib/theme";
import { useTheme, useThemedStyles } from "../lib/theme-context";

interface UpdateModalProps {
  visible: boolean;
  apkUrl: string;
}

export default function UpdateModal({ visible, apkUrl }: UpdateModalProps) {
  const { colors, theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const handleDownload = async () => {
    if (!apkUrl) return;
    setDownloading(true);
    setError("");
    setProgress(0);

    try {
      const fileUri = FileSystem.cacheDirectory + "disclose-update.apk";
      const downloadResumable = FileSystem.createDownloadResumable(
        apkUrl, fileUri, {},
        (downloadProgress) => {
          const { totalBytesWritten, totalBytesExpectedToWrite } = downloadProgress;
          if (totalBytesExpectedToWrite > 0) {
            setProgress(Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100));
          }
        }
      );
      const result = await downloadResumable.downloadAsync();
      if (!result) throw new Error("Échec du téléchargement");

      if (Platform.OS === "android") {
        const contentUri = await FileSystem.getContentUriAsync(result.uri);
        await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
          data: contentUri,
          flags: 1,
          type: "application/vnd.android.package-archive",
        });
      }
    } catch (e) {
      setError("Erreur lors du téléchargement. Réessayez.");
      setDownloading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[theme.glassCard, styles.card]}>
          <Text style={styles.title}>Mise à jour requise</Text>
          <Text style={styles.message}>
            Une nouvelle version de l'application est disponible. Veuillez la
            télécharger pour continuer à utiliser Disclose.
          </Text>
          {downloading ? (
            <View style={styles.progressContainer}>
              <ActivityIndicator size="large" color={colors.text} />
              <Text style={styles.progressText}>Téléchargement… {progress}%</Text>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
              </View>
            </View>
          ) : (
            <TouchableOpacity style={theme.accentButton} onPress={handleDownload}>
              <Text style={theme.accentButtonText}>Télécharger la mise à jour</Text>
            </TouchableOpacity>
          )}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.opacityLight, justifyContent: "center", alignItems: "center", padding: 24 },
  card: { padding: 28, width: "100%", alignItems: "center" },
  title: { fontSize: typography.size.xl, fontFamily: typography.family.bold, marginBottom: 12, color: colors.text },
  message: { fontSize: typography.size.sm, fontFamily: typography.family.regular, color: colors.secondary, textAlign: "center", lineHeight: 22, marginBottom: 24 },
  progressContainer: { alignItems: "center", width: "100%" },
  progressText: { marginTop: 12, fontSize: typography.size.sm, fontFamily: typography.family.semibold, color: colors.text },
  progressBarBg: { width: "100%", height: 8, backgroundColor: colors.cardBorder, borderRadius: radii.xs, marginTop: 12, overflow: "hidden" },
  progressBarFill: { height: "100%", backgroundColor: colors.text, borderRadius: radii.xs },
  errorText: { marginTop: 16, fontSize: typography.size.sm, fontFamily: typography.family.regular, color: "#EF4444", textAlign: "center" },
});
