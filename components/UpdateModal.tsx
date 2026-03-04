import { useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import * as IntentLauncher from "expo-intent-launcher";

interface UpdateModalProps {
  visible: boolean;
  apkUrl: string;
}

export default function UpdateModal({ visible, apkUrl }: UpdateModalProps) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const handleDownload = async () => {
    if (!apkUrl) return;
    setDownloading(true);
    setError("");
    setProgress(0);

    try {
      const fileUri = FileSystem.cacheDirectory + "happyour-update.apk";

      const downloadResumable = FileSystem.createDownloadResumable(
        apkUrl,
        fileUri,
        {},
        (downloadProgress) => {
          const pct = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          setProgress(Math.round(pct * 100));
        }
      );

      const result = await downloadResumable.downloadAsync();
      if (!result) throw new Error("Échec du téléchargement");

      // Open APK with Android installer
      if (Platform.OS === "android") {
        const contentUri = await FileSystem.getContentUriAsync(result.uri);
        await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
          data: contentUri,
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
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
        <View style={styles.card}>
          <Text style={styles.title}>Mise à jour requise</Text>
          <Text style={styles.message}>
            Une nouvelle version de l'application est disponible. Veuillez la
            télécharger pour continuer à utiliser HappyOur.
          </Text>

          {downloading ? (
            <View style={styles.progressContainer}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.progressText}>Téléchargement… {progress}%</Text>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.button} onPress={handleDownload}>
              <Text style={styles.buttonText}>Télécharger la mise à jour</Text>
            </TouchableOpacity>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 28,
    width: "100%",
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginBottom: 12,
    color: "#1a1a1a",
  },
  message: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#555",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  button: {
    backgroundColor: "#3B82F6",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  progressContainer: {
    alignItems: "center",
    width: "100%",
  },
  progressText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#3B82F6",
  },
  progressBarBg: {
    width: "100%",
    height: 8,
    backgroundColor: "#E5E7EB",
    borderRadius: 4,
    marginTop: 12,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#3B82F6",
    borderRadius: 4,
  },
  errorText: {
    marginTop: 16,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#EF4444",
    textAlign: "center",
  },
});
