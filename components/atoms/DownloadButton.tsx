import React, { useState } from "react";
import { TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { DownloadIcon } from "./DownloadIcon";
import { handleDownloadMedia } from "../../lib/media-utils";
import { colors, radii } from "../../lib/theme";

interface DownloadButtonProps {
  url: string;
  filename: string;
  style?: any;
}

export const DownloadButton = ({ url, filename, style }: DownloadButtonProps) => {
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
        <ActivityIndicator size="small" color={colors.white} />
      ) : (
        <DownloadIcon />
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  downloadBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.lg,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
});
