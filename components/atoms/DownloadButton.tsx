import React, { useState } from "react";
import { TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { DownloadIcon } from "./DownloadIcon";
import { handleDownloadMedia } from "../../lib/media-utils";

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
        <ActivityIndicator size="small" color="#FFF" />
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
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
});
