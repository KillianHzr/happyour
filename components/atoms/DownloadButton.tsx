import React, { useState } from "react";
import { TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { DownloadIcon } from "./DownloadIcon";
import { handleDownloadMedia } from "../../lib/media-utils";
import { radii, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";

interface DownloadButtonProps {
  url: string;
  filename: string;
  style?: any;
}

export const DownloadButton = ({ url, filename, style }: DownloadButtonProps) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [isDownloading, setIsDownloading] = useState(false);

  const onDownload = async () => {
    setIsDownloading(true);
    await handleDownloadMedia(url, filename);
    setIsDownloading(false);
  };

  return (
    <TouchableOpacity
      style={[styles.downloadBtn, style]}
      onPress={onDownload}
      disabled={isDownloading}
      activeOpacity={0.7}
    >
      {isDownloading ? (
        <ActivityIndicator size="small" color={colors.text} />
      ) : (
        <DownloadIcon />
      )}
    </TouchableOpacity>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  downloadBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.lg,
    backgroundColor: colors.card,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
});
